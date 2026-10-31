-- AlterTable
ALTER TABLE "products" ADD COLUMN     "optionImageGroup" INTEGER;

-- CreateTable
CREATE TABLE "product_option_images" (
    "productId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,

    CONSTRAINT "product_option_images_pkey" PRIMARY KEY ("productId","value")
);

-- CreateIndex
CREATE INDEX "product_option_images_mediaId_idx" ON "product_option_images"("mediaId");

-- AddForeignKey
ALTER TABLE "product_option_images" ADD CONSTRAINT "product_option_images_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_option_images" ADD CONSTRAINT "product_option_images_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

