-- Sinh từ Prisma migration 20261024174141_add_sale_window
-- Thứ tự áp dụng là thứ tự tên file; đừng đổi tên hay chèn số đã dùng.

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "saleEndsAt" TIMESTAMP(3),
ADD COLUMN     "saleStartsAt" TIMESTAMP(3);
