import type { ContactChannel, Product, Variant } from './snapshot';

const vnd = new Intl.NumberFormat('vi-VN');

export function formatPrice(value: number | null): string | null {
  return value === null ? null : `${vnd.format(value)}đ`;
}

/** What a row costs today: its sale price while one applies, else its price. */
export type Priced = Pick<Variant, 'price' | 'salePrice'>;

const payable = (row: Priced): number | null => row.salePrice ?? row.price;

const isDiscounted = (row: Priced): boolean =>
  row.salePrice !== null && row.price !== null && row.salePrice < row.price;

function range(values: (number | null)[]): string | null {
  const known = values.filter((v): v is number => v !== null);
  if (known.length === 0) return null;
  const low = Math.min(...known);
  const high = Math.max(...known);
  return low === high ? formatPrice(low)! : `${formatPrice(low)} - ${formatPrice(high)}`;
}

export interface PriceDisplay {
  /** What the customer pays — one price, or a range across the variants. */
  now: string;
  /** The undiscounted range, to strike through. Null when nothing is on sale. */
  was: string | null;
  /** The deepest discount among the variants, for the corner badge. */
  discount: number | null;
}

/**
 * The price as the customer should read it, whether the product has variants
 * or not.
 *
 * A product with no variants is treated as a single row, so one function
 * answers for both shapes and the templates never branch on which kind of
 * product they are drawing.
 *
 * `was` is dropped when it would print the same text as `now` — that happens
 * when only a mid-range variant is discounted, and showing an identical
 * struck-through range reads as a bug rather than a saving.
 */
export function priceDisplay(product: Product): PriceDisplay {
  const rows: Priced[] = product.variants.length
    ? product.variants
    : [{ price: product.price, salePrice: product.salePrice }];

  const now = range(rows.map(payable));
  const discounted = rows.filter(isDiscounted);
  const was = discounted.length ? range(rows.map((r) => r.price)) : null;

  return {
    now: now ?? 'Liên hệ',
    was: was && was !== now ? was : null,
    discount: discounted.length
      ? Math.max(...discounted.map((r) => Math.round((1 - r.salePrice! / r.price!) * 100)))
      : null,
  };
}

/** The same reading for one chosen combination, used once a variant is picked. */
export function variantPrice(row: Priced): PriceDisplay {
  return {
    now: formatPrice(payable(row)) ?? 'Liên hệ',
    was: isDiscounted(row) ? formatPrice(row.price) : null,
    discount: isDiscounted(row) ? Math.round((1 - row.salePrice! / row.price!) * 100) : null,
  };
}

// Primary conversion path for this shop: every product hands off to a private
// 1-1 Zalo chat rather than an on-site checkout.
export function zaloLink(channel: ContactChannel, message?: string): string {
  const raw = channel.value.trim();
  const base = raw.startsWith('http') ? raw : `https://zalo.me/${raw.replace(/[^0-9]/g, '')}`;
  if (!message) return base;
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}text=${encodeURIComponent(message)}`;
}

export function findChannel(channels: ContactChannel[], type: string): ContactChannel | undefined {
  return channels.find((c) => c.type === type);
}

export function channelHref(channel: ContactChannel): string {
  const value = channel.value.trim();
  if (value.startsWith('http')) return value;
  switch (channel.type) {
    case 'phone':
      return `tel:${value.replace(/\s/g, '')}`;
    case 'email':
      return `mailto:${value}`;
    case 'zalo':
      return `https://zalo.me/${value.replace(/[^0-9]/g, '')}`;
    case 'telegram':
      return `https://t.me/${value.replace(/^@/, '')}`;
    case 'messenger':
      return `https://m.me/${value}`;
    default:
      return value;
  }
}

export const CHANNEL_LABELS: Record<string, string> = {
  zalo: 'Zalo',
  phone: 'Điện thoại',
  messenger: 'Messenger',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  telegram: 'Telegram',
  email: 'Email',
};
