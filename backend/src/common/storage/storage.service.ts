import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import {
  DEFAULT_PART_SIZE,
  MAX_PARTS,
  MIN_PART_SIZE,
} from '../../modules/media/upload.constants';

export interface PresignResult {
  uploadUrl: string;
  key: string;
  publicUrl: string;
  mediaType: 'image' | 'video';
  filename: string;
}

export interface MultipartStart {
  key: string;
  uploadId: string;
  publicUrl: string;
  mediaType: 'image' | 'video';
  filename: string;
  /** Every part is exactly this many bytes, except the last. */
  partSize: number;
  /** One presigned PUT per part, in order. */
  partUrls: string[];
}

interface LegacyStore {
  client: S3Client;
  bucket: string;
  publicBaseUrl: string;
}

/*
  Since v3.729 the SDK computes a CRC32 checksum for uploads by default and
  signs the header into the URL. The browser doing the PUT knows nothing about
  that header and never sends it, so the signature stops matching — R2 rejects
  the request outright, and the error names a checksum rather than the
  presigning that caused it. Requesting checksums only where the API requires
  them is also how Cloudflare's own SDK example configures the client.
*/
const CHECKSUMS_OFF = {
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
} as const;

// Provider-agnostic on purpose: anything S3-compatible (AWS S3, Cloudflare R2,
// DigitalOcean Spaces, MinIO) works by pointing S3_ENDPOINT at it. File bytes
// never pass through this process — we only ever hand out presigned PUT URLs
// and later record metadata, which is what keeps the API container's memory
// flat regardless of how many/large the uploads are.
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;
  private readonly presignExpiresIn: number;
  private readonly multipartExpiresIn: number;
  private readonly legacy: LegacyStore | null;

  constructor(private readonly config: ConfigService) {
    const region = this.config.get<string>('S3_REGION', 'auto');
    const endpoint = this.config.get<string>('S3_ENDPOINT');
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY_ID', '');
    const secretAccessKey = this.config.get<string>('S3_SECRET_ACCESS_KEY', '');

    this.bucket = this.config.get<string>('S3_BUCKET', '');
    this.publicBaseUrl = this.config.get<string>('S3_PUBLIC_BASE_URL', '').replace(/\/+$/, '');
    this.presignExpiresIn = Number(this.config.get<string>('S3_PRESIGN_EXPIRES_IN', '3600'));
    // Part URLs are all signed up front, so this has to outlast the whole
    // upload — an hour is not enough for several GB on a home connection.
    this.multipartExpiresIn = Number(
      this.config.get<string>('S3_MULTIPART_PRESIGN_EXPIRES_IN', '86400'),
    );

    this.client = new S3Client({
      region,
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      credentials: { accessKeyId, secretAccessKey },
      ...CHECKSUMS_OFF,
    });

    this.legacy = this.buildLegacy();
  }

  /**
   * The bucket uploads used to go to, kept readable but never written to
   * again. Media rows store an absolute URL, so every file uploaded before the
   * move keeps serving itself from wherever it already lives — this exists
   * only so that deleting such a file from the admin still reaches the object,
   * instead of firing a delete at the new bucket, hitting nothing, and leaving
   * a file nobody can see but everybody pays for.
   *
   * Optional by design: drop the LEGACY_S3_* variables once the old bucket is
   * emptied and this disappears with them, no code change.
   */
  private buildLegacy(): LegacyStore | null {
    const publicBaseUrl = this.config.get<string>('LEGACY_S3_PUBLIC_BASE_URL', '').replace(
      /\/+$/,
      '',
    );
    const bucket = this.config.get<string>('LEGACY_S3_BUCKET', '');
    if (!publicBaseUrl || !bucket) return null;

    const endpoint = this.config.get<string>('LEGACY_S3_ENDPOINT');
    const client = new S3Client({
      region: this.config.get<string>('LEGACY_S3_REGION', 'auto'),
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      credentials: {
        accessKeyId: this.config.get<string>('LEGACY_S3_ACCESS_KEY_ID', ''),
        secretAccessKey: this.config.get<string>('LEGACY_S3_SECRET_ACCESS_KEY', ''),
      },
      ...CHECKSUMS_OFF,
    });

    this.logger.log(`Legacy store readable at ${publicBaseUrl} (deletes only)`);
    return { client, bucket, publicBaseUrl };
  }

  async presignUpload(filename: string, contentType: string): Promise<PresignResult> {
    const mediaType: 'image' | 'video' = contentType.startsWith('video') ? 'video' : 'image';
    const key = this.buildKey(filename, mediaType);

    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: this.presignExpiresIn },
    );

    return { uploadUrl, key, publicUrl: this.buildPublicUrl(key), mediaType, filename };
  }

  /**
   * Starts a multipart upload and hands back one presigned PUT per part. The
   * browser slices the file and uploads the parts; this process still never
   * sees a byte.
   */
  async startMultipart(
    filename: string,
    contentType: string,
    size: number,
  ): Promise<MultipartStart> {
    const mediaType: 'image' | 'video' = contentType.startsWith('video') ? 'video' : 'image';
    const key = this.buildKey(filename, mediaType);

    const created = await this.client.send(
      new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
    );
    const uploadId = created.UploadId;
    if (!uploadId) {
      throw new InternalServerErrorException('Kho lưu trữ không mở được phiên tải lên');
    }

    const partSize = choosePartSize(size);
    const partCount = Math.max(1, Math.ceil(size / partSize));

    const partUrls = await Promise.all(
      Array.from({ length: partCount }, (_, index) =>
        getSignedUrl(
          this.client,
          new UploadPartCommand({
            Bucket: this.bucket,
            Key: key,
            UploadId: uploadId,
            PartNumber: index + 1,
          }),
          { expiresIn: this.multipartExpiresIn },
        ),
      ),
    );

    return {
      key,
      uploadId,
      publicUrl: this.buildPublicUrl(key),
      mediaType,
      filename,
      partSize,
      partUrls,
    };
  }

  /**
   * Assembles the parts into the finished object.
   *
   * The part ETags are read back from storage rather than collected by the
   * browser. That is the usual way it is done, but it needs the bucket's CORS
   * policy to expose the ETag header — ours does not, and the R2 token the API
   * holds has no permission to change that. Listing server-side avoids the
   * question, and describes what storage actually received rather than what
   * the browser believes it sent.
   */
  async completeMultipart(key: string, uploadId: string): Promise<void> {
    const parts: { PartNumber: number; ETag: string }[] = [];
    let marker: string | undefined;

    do {
      const page = await this.client.send(
        new ListPartsCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumberMarker: marker,
        }),
      );
      for (const part of page.Parts ?? []) {
        if (part.PartNumber !== undefined && part.ETag) {
          parts.push({ PartNumber: part.PartNumber, ETag: part.ETag });
        }
      }
      marker = page.IsTruncated ? page.NextPartNumberMarker : undefined;
    } while (marker);

    if (parts.length === 0) {
      throw new BadRequestException('Chưa có phần nào của tệp được tải lên');
    }

    parts.sort((a, b) => a.PartNumber - b.PartNumber);

    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      }),
    );
  }

  /**
   * Parts that were uploaded and never assembled keep occupying — and being
   * billed as — storage, while being invisible as objects. Abandoning an
   * upload has to say so explicitly.
   *
   * Never throws: this runs on the failure path, and a second error on top of
   * the first one only buries what actually went wrong.
   */
  async abortMultipart(key: string, uploadId: string): Promise<void> {
    try {
      await this.client.send(
        new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId }),
      );
    } catch (err) {
      this.logger.error(
        `Failed to abort multipart upload ${uploadId} for ${key}: ${(err as Error).message}`,
      );
    }
  }

  private buildKey(filename: string, mediaType: 'image' | 'video'): string {
    const folder = mediaType === 'video' ? 'videos' : 'images';
    return `${folder}/${randomUUID()}${extname(filename).toLowerCase()}`;
  }

  buildPublicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }

  /**
   * Deletes a file the media library already knows about, sending the request
   * to whichever bucket that file actually lives in.
   *
   * The stored URL is the only thing that can tell them apart: keys carry no
   * bucket in them, and a file uploaded last year sits under the same
   * `images/` prefix as one uploaded today. Routing on the key instead would
   * aim every delete at the current bucket, where the old object does not
   * exist — and a delete for a missing key succeeds, so nothing would look
   * wrong while the file quietly survived.
   */
  async deleteStoredObject(key: string, url: string): Promise<void> {
    if (this.legacy && url.startsWith(`${this.legacy.publicBaseUrl}/`)) {
      return this.sendDelete(this.legacy.client, this.legacy.bucket, key);
    }

    // Belongs to neither: something rewrote the URL by hand, or the file was
    // on a bucket that has since been dropped from the configuration. Deleting
    // is not ours to do, but the row still goes — saying so is all we can
    // usefully do about the object left behind.
    if (this.publicBaseUrl && !url.startsWith(`${this.publicBaseUrl}/`)) {
      this.logger.warn(`No configured bucket owns ${url} — leaving the object in place`);
      return;
    }

    return this.sendDelete(this.client, this.bucket, key);
  }

  async deleteObject(key: string): Promise<void> {
    return this.sendDelete(this.client, this.bucket, key);
  }

  private async sendDelete(client: S3Client, bucket: string, key: string): Promise<void> {
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch (err) {
      // Surfaced rather than swallowed: if the object survives but we drop the
      // DB row, the file becomes unreachable garbage nobody can clean up from
      // the admin UI.
      this.logger.error(`Failed to delete ${key} from storage: ${(err as Error).message}`);
      throw new InternalServerErrorException('Không xoá được tệp trên kho lưu trữ');
    }
  }
}

/**
 * Picks the part size. Storage requires every part but the last to be exactly
 * the same size and at least MIN_PART_SIZE, and caps the number of parts — so
 * the size only grows above the default once a file is big enough to otherwise
 * exceed that cap.
 */
function choosePartSize(size: number): number {
  const MIB = 1024 * 1024;
  const needed = Math.ceil(size / MAX_PARTS);
  const chosen = Math.max(DEFAULT_PART_SIZE, MIN_PART_SIZE, needed);
  // Whole MiB, so the browser's slice boundaries are exact numbers.
  return Math.ceil(chosen / MIB) * MIB;
}
