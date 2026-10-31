import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api';
import type { Media } from '../lib/types';

interface PresignResult {
  uploadUrl: string;
  key: string;
  publicUrl: string;
  mediaType: 'image' | 'video';
  filename: string;
}

interface MultipartStart {
  key: string;
  uploadId: string;
  mediaType: 'image' | 'video';
  filename: string;
  partSize: number;
  partUrls: string[];
}

export interface UploadProgress {
  done: number;
  total: number;
  bytes: number;
  totalBytes: number;
  label: string;
}

const MIB = 1024 * 1024;
const GB = 1024 ** 3;

/*
  Storage refuses a single PUT above ~5 GiB, so anything big has to go up in
  parts. The line is drawn well below that at 500 MiB, because by then one
  unbroken PUT has already stopped being a good idea on a phone connection: a
  part that fails can be retried on its own, a 2 GB PUT cannot.

  Must match MULTIPART_THRESHOLD on the server, which sizes the parts.
*/
const MULTIPART_OVER = 500 * MIB;

const PART_CONCURRENCY = 3;
const PART_ATTEMPTS = 3;

/*
  A presigned PUT carries no size condition — only a POST policy can, and by
  design the bytes never reach our server — so the browser is where the owner
  gets told. The server enforces the ceiling again when it signs.

  Above ASK_OVER the owner is told how heavy the file actually is and decides
  for themselves; above REFUSE_OVER there is nothing to decide.
*/
const ASK_OVER = 1 * GB;
const REFUSE_OVER = 10 * GB;

// Sizes are the whole point of the question being asked, so they are shown the
// way a file manager shows them rather than rounded to something tidier.
function formatSize(bytes: number): string {
  const gb = bytes / GB;
  if (gb >= 1) return `${gb.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} GB`;
  const mb = bytes / MIB;
  return `${mb.toLocaleString('vi-VN', { maximumFractionDigits: mb < 10 ? 1 : 0 })} MB`;
}

const describe = (file: File) => `"${file.name}" (${formatSize(file.size)})`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs tasks a few at a time, so one upload cannot monopolise the connection. */
async function pooled<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
  signal: AbortSignal,
): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      // In-flight requests are cancelled by the signal; this stops the queued
      // ones from starting in their place.
      if (signal.aborted) throw new DOMException('Đã huỷ', 'AbortError');
      const index = next++;
      results[index] = await tasks[index]();
    }
  });
  await Promise.all(workers);
  return results;
}

const wasCancelled = (err: unknown, signal: AbortSignal) =>
  signal.aborted || axios.isCancel(err) || (err as Error)?.name === 'AbortError';

/**
 * Three steps, and the middle one never touches our server: ask the API for
 * presigned URLs, PUT the bytes straight to storage, then tell the API which
 * uploads landed. Large files therefore cost the backend no memory at all —
 * and, past MULTIPART_OVER, go up in parts rather than one request.
 */
export function useUpload() {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Cancelling is a deliberate act, not a failure, so it gets its own channel
  // rather than being reported in red alongside things that went wrong.
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Holds the question's resolver while the dialog is on screen, so upload()
  // can simply await the owner's answer instead of the callers having to
  // sequence a dialog around it.
  const [pending, setPending] = useState<{ files: File[]; answer: (ok: boolean) => void } | null>(
    null,
  );

  const askBeforeUploading = (files: File[]) =>
    new Promise<boolean>((resolve) => setPending({ files, answer: resolve }));

  const settle = (ok: boolean) => {
    pending?.answer(ok);
    setPending(null);
  };

  const cancel = () => abortRef.current?.abort();

  // Closing the tab is the one way out of an upload that this hook cannot
  // clean up after: no abort or discard call would ever be sent. The browser's
  // own prompt is the only thing that can intervene in time.
  useEffect(() => {
    if (!uploading) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [uploading]);

  async function upload(files: File[]): Promise<Media[]> {
    if (files.length === 0) return [];
    setError(null);
    setNotice(null);

    // Both checks run before anything is signed: a file found to be a problem
    // afterwards has already cost the owner the wait.
    const refused = files.filter((f) => f.size > REFUSE_OVER);
    if (refused.length > 0) {
      setError(
        `${refused.map(describe).join(', ')} vượt mức tối đa ${formatSize(REFUSE_OVER)}. ` +
          'Hãy cắt ngắn hoặc giảm chất lượng rồi tải lại.',
      );
      return [];
    }

    const heavy = files.filter((f) => f.size > ASK_OVER);
    if (heavy.length > 0 && !(await askBeforeUploading(heavy))) return [];

    setUploading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    // Progress is counted in bytes, not files: one 2 GB clip would otherwise
    // show "0/1" for twenty minutes and look like nothing was happening.
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    const sent = new Map<File, number>();
    let done = 0;

    const report = () => {
      const bytes = [...sent.values()].reduce((a, b) => a + b, 0);
      const percent = totalBytes > 0 ? Math.min(100, Math.round((bytes / totalBytes) * 100)) : 0;
      setProgress({
        done,
        total: files.length,
        bytes,
        totalBytes,
        label:
          files.length > 1
            ? `${percent}% · ${done}/${files.length} tệp`
            : `${percent}% · ${formatSize(bytes)}/${formatSize(totalBytes)}`,
      });
    };

    report();

    try {
      const small = files.filter((f) => f.size <= MULTIPART_OVER);
      const large = files.filter((f) => f.size > MULTIPART_OVER);
      const created: Media[] = [];

      // Keys whose bytes reached storage but which were never confirmed. If
      // the batch is cancelled partway, these are already paid for and would
      // otherwise be invisible to the library — and so undeletable.
      const unconfirmed: string[] = [];

      if (small.length > 0) {
        const { data: presigned } = await api.post<PresignResult[]>('/media/presign', {
          files: small.map((f) => ({ filename: f.name, contentType: f.type })),
        });

        try {
          await Promise.all(
            presigned.map(async (target, index) => {
              const file = small[index];
              await axios.put(target.uploadUrl, file, {
                headers: { 'Content-Type': file.type },
                // The presigned URL already carries its own auth; sending our
                // JWT to the storage provider would be both useless and leaky.
                transformRequest: [(data) => data],
                signal,
                onUploadProgress: (event) => {
                  sent.set(file, event.loaded);
                  report();
                },
              });
              unconfirmed.push(target.key);
              sent.set(file, file.size);
              done += 1;
              report();
            }),
          );
        } catch (err) {
          await discard(unconfirmed);
          throw err;
        }

        const { data } = await api.post<Media[]>('/media/confirm', {
          files: presigned.map((p) => ({
            key: p.key,
            filename: p.filename,
            mediaType: p.mediaType,
          })),
        });
        created.push(...data);
        unconfirmed.length = 0;
      }

      // One at a time: two multi-gigabyte uploads racing each other finish no
      // sooner and make the progress figure meaningless.
      for (const file of large) {
        created.push(await uploadInParts(file, sent, report, signal));
        done += 1;
        report();
      }

      await queryClient.invalidateQueries({ queryKey: ['media'] });
      return created;
    } catch (err) {
      if (wasCancelled(err, signal)) setNotice('Đã huỷ tải lên.');
      else setError(errorMessage(err, 'Tải tệp lên không thành công.'));
      return [];
    } finally {
      abortRef.current = null;
      setUploading(false);
      setProgress(null);
    }
  }

  const confirmation = pending
    ? {
        title: pending.files.length > 1 ? 'Các tệp này khá nặng' : 'Tệp này khá nặng',
        body:
          `${pending.files.map(describe).join(', ')} — nặng hơn ${formatSize(ASK_OVER)}. ` +
          'Tải lên sẽ mất nhiều thời gian và khách xem trên 3G/4G cũng tốn dung lượng theo. ' +
          'Bạn vẫn muốn tải lên?',
        confirmLabel: 'Vẫn tải lên',
        onConfirm: () => settle(true),
        onCancel: () => settle(false),
      }
    : null;

  return { upload, cancel, uploading, progress, error, notice, confirmation };
}

async function uploadInParts(
  file: File,
  sent: Map<File, number>,
  report: () => void,
  signal: AbortSignal,
): Promise<Media> {
  const { data: start } = await api.post<MultipartStart>('/media/multipart/start', {
    filename: file.name,
    contentType: file.type,
    size: file.size,
  });

  const perPart = new Array<number>(start.partUrls.length).fill(0);
  const sync = () => {
    sent.set(
      file,
      perPart.reduce((a, b) => a + b, 0),
    );
    report();
  };

  try {
    await pooled(
      start.partUrls.map((url, index) => async () => {
        const from = index * start.partSize;
        const slice = file.slice(from, Math.min(from + start.partSize, file.size));

        // Retried per part, which is the reason for splitting the file in the
        // first place: one dropped connection costs a part, not the upload.
        for (let attempt = 1; ; attempt += 1) {
          try {
            await axios.put(url, slice, {
              headers: { 'Content-Type': file.type },
              transformRequest: [(data) => data],
              signal,
              onUploadProgress: (event) => {
                perPart[index] = event.loaded;
                sync();
              },
            });
            perPart[index] = slice.size;
            sync();
            return;
          } catch (err) {
            // A cancel is not a flaky connection; retrying it would just keep
            // the upload alive after the owner asked for it to stop.
            if (wasCancelled(err, signal)) throw err;
            if (attempt >= PART_ATTEMPTS) throw err;
            perPart[index] = 0;
            sync();
            await sleep(attempt * 1000);
          }
        }
      }),
      PART_CONCURRENCY,
      signal,
    );

    const { data } = await api.post<Media>('/media/multipart/complete', {
      key: start.key,
      uploadId: start.uploadId,
      filename: start.filename,
      mediaType: start.mediaType,
    });
    return data;
  } catch (err) {
    // Parts already stored keep being billed until the upload is abandoned
    // explicitly, and never become an object anyone can see or delete. This is
    // cleanup, not error handling, so its own failure must not mask the error
    // that got us here.
    await api
      .post('/media/multipart/abort', { key: start.key, uploadId: start.uploadId })
      .catch(() => undefined);
    throw err;
  }
}

/** Removes objects that reached storage but were never claimed by a Media row. */
async function discard(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  // Deliberately not carrying the cancelled signal: this is the cleanup that
  // the cancel itself made necessary.
  await api.post('/media/discard', { keys }).catch(() => undefined);
}
