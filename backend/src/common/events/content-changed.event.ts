// Every write-side service emits this single event after a successful write.
// Nothing downstream of the write (debouncing, locking, triggering the Astro
// rebuild) lives in the write services themselves — see PublishService.
export const CONTENT_CHANGED_EVENT = 'content.changed';
