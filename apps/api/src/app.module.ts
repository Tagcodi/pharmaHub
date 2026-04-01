import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { HealthController } from "./health/health.controller";
import { InventoryModule } from "./inventory/inventory.module";
import { MedicinesModule } from "./medicines/medicines.module";
import { PrismaModule } from "./prisma/prisma.module";
import { SalesModule } from "./sales/sales.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    MedicinesModule,
    InventoryModule,
    DashboardModule,
    SalesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
