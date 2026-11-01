export interface Category {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  /** Null means the website picks one from the products inside. */
  coverMediaId: string | null;
  cover?: Media | null;
}

export interface Media {
  id: string;
  key: string;
  url: string;
  mediaType: 'image' | 'video';
  filename: string;
  /** "16:9" | "9:16" | "1:1", or null for the square frame the gallery draws. */
  displayRatio: string | null;
  createdAt: string;
  /** How many products, banners and categories point at this file. Only the list sends it. */
  _count?: { products: number; banners: number; categories: number; collections: number };
}

export interface ProductMedia {
  productId: string;
  mediaId: string;
  sortOrder: number;
  media: Media;
}

/** One sellable combination. Prices arrive as Decimal strings, like Product's. */
export interface ProductVariant {
  id: string;
  productId: string;
  option1Value: string;
  option2Value: string | null;
  price: string | null;
  salePrice: string | null;
  stockLabel: string | null;
  isActive: boolean;
  sortOrder: number;
}

/** The photo standing for one option value — always one of the product's own. */
export interface ProductOptionImage {
  productId: string;
  value: string;
  mediaId: string;
  media: Media;
}
export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  /** Prisma Decimal arrives as a string over JSON. */
  price: string | null;
  salePrice: string | null;
  /** ISO instants. Null at either end means that end is open. */
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  stockLabel: string | null;
  isActive: boolean;
  sortOrder: number;
  categoryId: string | null;
  category: Category | null;
  /** Owner's own names for the two axes — "Dung tích", "Màu". */
  option1Name: string | null;
  option2Name: string | null;
  variants: ProductVariant[];
  media: ProductMedia[];
  /** Which group's values carry a photo — 1, 2, or null for none. */
  optionImageGroup: number | null;
  optionImages: ProductOptionImage[];
}

export interface Collection {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  /** Null means the website picks one from the products inside. */
  coverMediaId: string | null;
  cover?: Media | null;
  _count?: { products: number };
  products?: { productId: string; sortOrder: number; product: Product }[];
}

export interface Banner {
  id: string;
  title: string | null;
  linkUrl: string | null;
  mediaId: string;
  media: Media;
  isActive: boolean;
  sortOrder: number;
}

export interface ContactChannel {
  id: string;
  type: string;
  label: string | null;
  value: string;
  isActive: boolean;
  sortOrder: number;
}

export interface SiteSettings {
  shopName: string | null;
  tagline: string | null;
  /** Shown in the corner of the home hero. */
  intro: string | null;
  seoDescription: string | null;
  address: string | null;
  businessHours: string | null;
}

export interface PublishStatus {
  reachable: boolean;
  isBuilding?: boolean;
  pendingRebuild?: boolean;
  lastBuild?: {
    at: string;
    finishedAt?: string;
    status: 'success' | 'failed';
    error?: string;
    release?: string;
  } | null;
  error?: string;
}

export const CONTACT_CHANNEL_TYPES = [
  { value: 'zalo', label: 'Zalo', hint: 'Số điện thoại Zalo, ví dụ 0901234567' },
  { value: 'phone', label: 'Điện thoại', hint: 'Số gọi trực tiếp' },
  { value: 'messenger', label: 'Messenger', hint: 'Tên người dùng m.me' },
  { value: 'facebook', label: 'Facebook', hint: 'Đường dẫn trang Facebook' },
  { value: 'instagram', label: 'Instagram', hint: 'Đường dẫn trang Instagram' },
  { value: 'tiktok', label: 'TikTok', hint: 'Đường dẫn trang TikTok' },
  { value: 'telegram', label: 'Telegram', hint: 'Tên người dùng, ví dụ @tiemkin' },
  { value: 'email', label: 'Email', hint: 'Địa chỉ email nhận liên hệ' },
] as const;
