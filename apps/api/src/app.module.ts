import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AlertsModule } from "./alerts/alerts.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { HealthController } from "./health/health.controller";
import { InventoryModule } from "./inventory/inventory.module";
import { MedicinesModule } from "./medicines/medicines.module";
import { PrismaModule } from "./prisma/prisma.module";
import { PrescriptionsModule } from "./prescriptions/prescriptions.module";
import { PurchaseOrdersModule } from "./purchase-orders/purchase-orders.module";
import { ReportsModule } from "./reports/reports.module";
import { SalesModule } from "./sales/sales.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AlertsModule,
    AuditModule,
    AuthModule,
    UsersModule,
    MedicinesModule,
    InventoryModule,
    DashboardModule,
    SalesModule,
    PrescriptionsModule,
    PurchaseOrdersModule,
    ReportsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
