-- CreateIndex
CREATE UNIQUE INDEX "medicines_pharmacyId_sku_key" ON "medicines"("pharmacyId", "sku");
