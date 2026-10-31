const MIB = 1024 * 1024;

/**
 * Anything larger than this is uploaded in parts rather than one PUT.
 *
 * The hard ceiling is the storage provider's, not ours: S3-compatible services
 * — R2 included — refuse a single PUT above ~5 GiB and require the multipart
 * API beyond that. 500 MiB sits well under that line, and is also roughly
 * where one unbroken upload stops being survivable on a phone connection: a
 * part that fails can be retried on its own, a 2 GB PUT cannot.
 */
export const MULTIPART_THRESHOLD = 500 * MIB;

/**
 * Enforced here as well as in the browser. The browser check exists to tell
 * the owner early; this one is what actually holds, since a presigned URL is
 * handed out before any byte is sent.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * MIB;

/** R2 requires every part but the last to be identical in size, and at least this. */
export const MIN_PART_SIZE = 5 * MIB;
export const DEFAULT_PART_SIZE = 50 * MIB;
export const MAX_PARTS = 10_000;
