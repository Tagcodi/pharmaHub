ALTER TABLE "sales"
ADD COLUMN "prescriptionId" TEXT;

CREATE UNIQUE INDEX "sales_prescriptionId_key" ON "sales"("prescriptionId");

ALTER TABLE "sales"
ADD CONSTRAINT "sales_prescriptionId_fkey"
FOREIGN KEY ("prescriptionId") REFERENCES "prescriptions"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
