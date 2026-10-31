-- Sinh từ Prisma migration 20261016085501_add_shop_identity_to_site_settings
-- Thứ tự áp dụng là thứ tự tên file; đừng đổi tên hay chèn số đã dùng.

-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "seoDescription" TEXT,
ADD COLUMN     "shopName" TEXT,
ADD COLUMN     "tagline" TEXT;
