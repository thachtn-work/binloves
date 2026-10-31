-- Sinh từ Prisma migration 20261024185759_add_collection_cover
-- Thứ tự áp dụng là thứ tự tên file; đừng đổi tên hay chèn số đã dùng.

-- AlterTable
ALTER TABLE "collections" ADD COLUMN     "coverMediaId" TEXT;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_coverMediaId_fkey" FOREIGN KEY ("coverMediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
