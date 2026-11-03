import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Writing a saved row straight into the cached list, instead of throwing the
 * list away and asking the API for it again.
 *
 * Every create and update here already answers with the complete row — the
 * same shape the list endpoint returns — so the refetch that used to follow
 * fetched nothing the browser was not already holding. On a catalogue of a
 * couple of hundred products that is a few hundred kilobytes and a full
 * re-render of the table per save, which is what made the admin crawl after
 * the owner added several products in a row.
 *
 * The cost of doing it this way is that the cache now has to agree with the
 * API about **where a new row lands**. Get that wrong and the row sits in the
 * wrong place until something refetches, then jumps. So the caller says which
 * rule applies rather than this file guessing one.
 */
export type Row = { id: string };

/**
 * Where the API puts a row that has just been created.
 *
 * - `head` — products. They are ordered `sortOrder asc, createdAt desc` and a
 *   new one keeps the default `sortOrder` of 0, so the newest is first.
 * - `tail` — categories, collections and contact channels. Each asks the table
 *   for `max(sortOrder) + 1`, so a new one goes last.
 * - a comparator — banners, whose `sortOrder` the owner types in. The position
 *   depends on the number they chose, so the list is sorted after inserting.
 */
export type Placement<T> = 'head' | 'tail' | ((a: T, b: T) => number);

/** Inserts a created row, or replaces an existing one in place. */
export function upsertRow<T extends Row>(
  queryClient: QueryClient,
  key: QueryKey,
  saved: T,
  placement: Placement<T>,
) {
  queryClient.setQueryData<T[]>(key, (rows) => {
    // Nothing cached means nothing is on screen to keep in step; the next
    // mount will fetch the list including this row.
    if (!rows) return rows;

    const at = rows.findIndex((row) => row.id === saved.id);
    if (at !== -1) {
      const next = rows.slice();
      next[at] = saved;
      return typeof placement === 'function' ? next.sort(placement) : next;
    }

    if (placement === 'head') return [saved, ...rows];
    if (placement === 'tail') return [...rows, saved];
    return [...rows, saved].sort(placement);
  });
}

/** Takes a row out of the cached list and hands back how to put it back. */
export function removeRow<T extends Row>(queryClient: QueryClient, key: QueryKey, id: string) {
  const previous = queryClient.getQueryData<T[]>(key);
  queryClient.setQueryData<T[]>(key, (rows) => rows?.filter((row) => row.id !== id));
  return previous;
}

/** Puts a list back exactly as it was, after a write the API refused. */
export function restoreList<T>(queryClient: QueryClient, key: QueryKey, previous: T[] | undefined) {
  if (previous) queryClient.setQueryData<T[]>(key, previous);
}

/** Sorts banners the way the API does: by the number the owner typed. */
export const bySortOrder = <T extends { sortOrder: number }>(a: T, b: T) => a.sortOrder - b.sortOrder;
