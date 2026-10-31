-- AlterTable
ALTER TABLE "collections" ADD COLUMN     "coverMediaId" TEXT;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_coverMediaId_fkey" FOREIGN KEY ("coverMediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
