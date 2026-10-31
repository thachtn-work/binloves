-- AlterTable
ALTER TABLE "products" ADD COLUMN     "option1Name" TEXT,
ADD COLUMN     "option2Name" TEXT;

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "option1Value" TEXT NOT NULL,
    "option2Value" TEXT,
    "price" DECIMAL(12,0),
    "salePrice" DECIMAL(12,0),
    "stockLabel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_variants_productId_idx" ON "product_variants"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_productId_option1Value_option2Value_key" ON "product_variants"("productId", "option1Value", "option2Value");

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

