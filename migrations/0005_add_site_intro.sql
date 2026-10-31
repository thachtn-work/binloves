-- Sinh từ Prisma migration 20261024184421_add_site_intro
-- Thứ tự áp dụng là thứ tự tên file; đừng đổi tên hay chèn số đã dùng.

-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "intro" TEXT;
