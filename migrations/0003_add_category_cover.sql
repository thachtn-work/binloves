-- Sinh từ Prisma migration 20261024162754_add_category_cover
-- Thứ tự áp dụng là thứ tự tên file; đừng đổi tên hay chèn số đã dùng.

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "coverMediaId" TEXT;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_coverMediaId_fkey" FOREIGN KEY ("coverMediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
