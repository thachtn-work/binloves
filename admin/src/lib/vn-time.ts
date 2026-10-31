/**
 * Everything this shop shows and types is Vietnam time.
 *
 * `<input type="datetime-local">` hands back a bare wall clock — `2026-12-11T00:00:00`
 * with no zone — and `new Date(...)` on that reads it in *the browser's* zone.
 * On the owner's laptop that is usually right, which is exactly what makes it
 * dangerous: it stays right until someone opens the admin from a different
 * machine, a phone that picked up a carrier's zone, or abroad, and then a sale
 * silently starts hours early or late with nothing on screen to show why.
 *
 * So the offset is written down rather than inherited. Vietnam has been UTC+7
 * with no daylight saving since 1975, so a fixed offset is exact for every
 * date this will ever be asked about — no timezone database needed, and no
 * dependency on how the server or the browser is configured.
 */
const VN_OFFSET = '+07:00';
const VN_OFFSET_MINUTES = 7 * 60;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * `2026-12-11T00:00:00` (what the owner typed, meant as Vietnam time)
 * → `2026-12-11T00:00:00+07:00` (an unambiguous instant for the API).
 */
export function vnInputToIso(value: string): string | null {
  if (!value) return null;
  // The control omits seconds when they are zero; the API wants a full time.
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  return `${withSeconds}${VN_OFFSET}`;
}

/**
 * An instant from the API → the Vietnam wall clock to put back in the input.
 * Shifting by the offset and reading the UTC parts avoids going through the
 * browser's own zone, which is the whole point.
 */
export function isoToVnInput(iso: string | null): string {
  if (!iso) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const vn = new Date(at.getTime() + VN_OFFSET_MINUTES * 60_000);
  return (
    `${vn.getUTCFullYear()}-${pad(vn.getUTCMonth() + 1)}-${pad(vn.getUTCDate())}` +
    `T${pad(vn.getUTCHours())}:${pad(vn.getUTCMinutes())}:${pad(vn.getUTCSeconds())}`
  );
}

/** For reading, not editing: `00:00:00 11/12/2026`, the order the shop writes. */
export function formatVn(iso: string | null): string {
  const input = isoToVnInput(iso);
  if (!input) return '';
  const [date, time] = input.split('T');
  const [y, m, d] = date.split('-');
  return `${time} ${d}/${m}/${y}`;
}

export type SaleState = 'none' | 'scheduled' | 'live' | 'expired';

/**
 * What the window is doing right now. The list needs this because two date
 * fields on a form tell the owner when a sale was meant to run, not whether
 * any of their products is actually discounted at this moment.
 */
export function saleState(product: {
  salePrice: string | null;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
}): SaleState {
  if (product.salePrice === null) return 'none';
  const now = Date.now();
  if (product.saleEndsAt && new Date(product.saleEndsAt).getTime() <= now) return 'expired';
  if (product.saleStartsAt && new Date(product.saleStartsAt).getTime() > now) return 'scheduled';
  return 'live';
}

/**
 * Minutes and hours round down, so neither ever claims more time than is left.
 * Days round to nearest instead: a sale set to run three days would otherwise
 * read "còn 2 ngày" the moment it was saved, because 71h59m floors to two —
 * and an owner who has just typed the end date reading it back wrong is worse
 * than being a few hours optimistic on a figure already this coarse.
 */
export function countdown(iso: string | null): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return '';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} giờ`;
  return `${Math.round(hours / 24)} ngày`;
}
