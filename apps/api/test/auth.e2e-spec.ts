import assert from "node:assert/strict";
import { createTestApp, requestJson } from "./support/test-context";

async function main() {
  const context = await createTestApp();
  const receivedAt = new Date();
  receivedAt.setUTCSeconds(0, 0);
  const expiryDate = new Date(receivedAt);
  expiryDate.setUTCDate(expiryDate.getUTCDate() + 10);

  try {
    console.log("1. Verifying setup status before initial setup");
    const setupBeforeResponse = await requestJson<{ isSetupComplete: boolean }>(
      context.baseUrl,
      "/auth/setup-status"
    );

    assert.equal(setupBeforeResponse.status, 200);
    assert.equal(setupBeforeResponse.body.isSetupComplete, false);

    console.log("2. Verifying unauthenticated access is blocked");
    const unauthenticatedUsersResponse = await requestJson<{ message: string }>(
      context.baseUrl,
      "/users"
    );

    assert.equal(unauthenticatedUsersResponse.status, 401);
    assert.equal(
      unauthenticatedUsersResponse.body.message,
      "Missing bearer token."
    );

    console.log("3. Setting up the first pharmacy owner");
    const setupResponse = await requestJson<{
      accessToken: string;
      pharmacy: { name: string; slug: string };
      branch: { name: string; code: string } | null;
      user: { email: string; role: string };
    }>(context.baseUrl, "/auth/setup", {
      method: "POST",
      body: JSON.stringify({
        pharmacyName: "PharmaHub Addis",
        pharmacySlug: "pharmahub-addis",
        branchName: "Main Branch",
        branchAddress: "Addis Ababa",
        ownerFullName: "Abel Tadesse",
        ownerEmail: "owner@pharmahub.et",
        ownerPassword: "SecurePass123"
      })
    });

    assert.equal(setupResponse.status, 201);
    assert.match(setupResponse.body.accessToken, /\S+/);
    assert.equal(setupResponse.body.pharmacy.slug, "pharmahub-addis");
    assert.equal(setupResponse.body.branch?.code, "MAIN");
    assert.equal(setupResponse.body.user.role, "OWNER");

    console.log("4. Verifying the system now reports as set up");
    const setupAfterResponse = await requestJson<{ isSetupComplete: boolean }>(
      context.baseUrl,
      "/auth/setup-status"
    );

    assert.equal(setupAfterResponse.status, 200);
    assert.equal(setupAfterResponse.body.isSetupComplete, true);

    console.log("5. Blocking a second setup attempt");
    const duplicateSetupResponse = await requestJson<{ message: string }>(
      context.baseUrl,
      "/auth/setup",
      {
        method: "POST",
        body: JSON.stringify({
          pharmacyName: "Another Pharmacy",
          pharmacySlug: "another-pharmacy",
          branchName: "Main Branch",
          ownerFullName: "Second Owner",
          ownerEmail: "owner2@pharmahub.et",
          ownerPassword: "SecurePass123"
        })
      }
    );

    assert.equal(duplicateSetupResponse.status, 400);
    assert.equal(
      duplicateSetupResponse.body.message,
      "The system has already been set up."
    );

    console.log("6. Rejecting invalid login attempts");
    const invalidLoginResponse = await requestJson<{ message: string }>(
      context.baseUrl,
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({
          email: "owner@pharmahub.et",
          password: "WrongPass123"
        })
      }
    );

    assert.equal(invalidLoginResponse.status, 401);
    assert.equal(
      invalidLoginResponse.body.message,
      "Invalid email or password."
    );

    console.log("7. Logging in and checking the current session");
    const loginResponse = await requestJson<{
      accessToken: string;
      user: { email: string; role: string };
      pharmacy: { slug: string };
    }>(context.baseUrl, "/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: "owner@pharmahub.et",
        password: "SecurePass123"
      })
    });

    assert.equal(loginResponse.status, 201);
    assert.equal(loginResponse.body.user.email, "owner@pharmahub.et");
    assert.equal(loginResponse.body.pharmacy.slug, "pharmahub-addis");

    const accessToken = loginResponse.body.accessToken;

    const meResponse = await requestJson<{
      user: { email: string; role: string };
      pharmacy: { slug: string };
      branch: { code: string } | null;
    }>(context.baseUrl, "/auth/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    assert.equal(meResponse.status, 200);
    assert.equal(meResponse.body.user.role, "OWNER");
    assert.equal(meResponse.body.pharmacy.slug, "pharmahub-addis");
    assert.equal(meResponse.body.branch?.code, "MAIN");

    console.log("8. Creating and listing pharmacy staff as the owner");
    const createUserResponse = await requestJson<{
      id: string;
      email: string;
      role: string;
      branch: { code: string } | null;
    }>(context.baseUrl, "/users", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        fullName: "Saron Bekele",
        email: "pharmacist@pharmahub.et",
        password: "SecurePass123",
        role: "PHARMACIST"
      })
    });

    assert.equal(createUserResponse.status, 201);
    assert.equal(createUserResponse.body.email, "pharmacist@pharmahub.et");
    assert.equal(createUserResponse.body.role, "PHARMACIST");
    assert.equal(createUserResponse.body.branch?.code, "MAIN");

    const listUsersResponse = await requestJson<
      Array<{ email: string; role: string; branch: { code: string } | null }>
    >(context.baseUrl, "/users", {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    assert.equal(listUsersResponse.status, 200);
    assert.equal(listUsersResponse.body.length, 2);
    assert.deepEqual(
      listUsersResponse.body.map((user) => user.email),
      ["owner@pharmahub.et", "pharmacist@pharmahub.et"]
    );

    console.log("9. Deactivating the pharmacist account");
    const deactivateByIdResponse = await requestJson<{
      email: string;
      isActive: boolean;
    }>(context.baseUrl, `/users/${createUserResponse.body.id}/status`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        isActive: false,
      }),
    });

    assert.equal(deactivateByIdResponse.status, 200);
    assert.equal(deactivateByIdResponse.body.email, "pharmacist@pharmahub.et");
    assert.equal(deactivateByIdResponse.body.isActive, false);

    const inactiveLoginResponse = await requestJson<{ message: string }>(
      context.baseUrl,
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({
          email: "pharmacist@pharmahub.et",
          password: "SecurePass123",
        }),
      }
    );

    assert.equal(inactiveLoginResponse.status, 401);
    assert.equal(inactiveLoginResponse.body.message, "This user account is inactive.");

    console.log("10. Reactivating the pharmacist account");
    const reactivateUserResponse = await requestJson<{
      email: string;
      isActive: boolean;
    }>(context.baseUrl, `/users/${createUserResponse.body.id}/status`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        isActive: true,
      }),
    });

    assert.equal(reactivateUserResponse.status, 200);
    assert.equal(reactivateUserResponse.body.isActive, true);

    const pharmacistLoginResponse = await requestJson<{
      user: { email: string; role: string };
    }>(context.baseUrl, "/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: "pharmacist@pharmahub.et",
        password: "SecurePass123",
      }),
    });

    assert.equal(pharmacistLoginResponse.status, 201);
    assert.equal(pharmacistLoginResponse.body.user.role, "PHARMACIST");

    console.log("11. Creating and listing medicines in the catalog");
    const createMedicineResponse = await requestJson<{
      id: string;
      name: string;
      strength: string | null;
      form: string | null;
      category: string | null;
    }>(context.baseUrl, "/medicines", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        name: "Paracetamol",
        genericName: "Acetaminophen",
        strength: "500 mg",
        form: "Tablet",
        category: "Pain relief",
        unit: "Tablet",
        sku: "MED-001",
      }),
    });

    assert.equal(createMedicineResponse.status, 201);
    assert.equal(createMedicineResponse.body.name, "Paracetamol");
    assert.equal(createMedicineResponse.body.strength, "500 mg");
    assert.equal(createMedicineResponse.body.form, "Tablet");

    const listMedicinesResponse = await requestJson<
      Array<{
        name: string;
        genericName: string | null;
        strength: string | null;
        form: string | null;
      }>
    >(context.baseUrl, "/medicines", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(listMedicinesResponse.status, 200);
    assert.equal(listMedicinesResponse.body.length, 1);
    assert.equal(listMedicinesResponse.body[0]?.name, "Paracetamol");
    assert.equal(listMedicinesResponse.body[0]?.genericName, "Acetaminophen");

    console.log("12. Receiving a live stock batch into inventory");
    const stockInResponse = await requestJson<{
      medicine: {
        id: string;
        name: string;
      };
      batch: {
        batchNumber: string;
        quantityOnHand: number;
        sellingPrice: number;
      };
    }>(context.baseUrl, "/inventory/stock-in", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        medicineId: createMedicineResponse.body.id,
        batchNumber: "B-2026-001",
        receivedAt: receivedAt.toISOString(),
        expiryDate: expiryDate.toISOString(),
        quantity: 12,
        costPrice: 10,
        sellingPrice: 15,
        supplierName: "EPSS",
      }),
    });

    assert.equal(stockInResponse.status, 201);
    assert.equal(stockInResponse.body.medicine.name, "Paracetamol");
    assert.equal(stockInResponse.body.batch.batchNumber, "B-2026-001");
    assert.equal(stockInResponse.body.batch.quantityOnHand, 12);
    assert.equal(stockInResponse.body.batch.sellingPrice, 15);

    console.log("13. Reading live inventory summaries");
    const inventorySummaryResponse = await requestJson<{
      totals: {
        activeBatchCount: number;
        registeredMedicineCount: number;
        lowStockCount: number;
        nearExpiryBatchCount: number;
        totalUnitsOnHand: number;
        totalStockValue: number;
      };
      medicines: Array<{
        id: string;
        latestBatchNumber: string | null;
        totalQuantityOnHand: number;
        isLowStock: boolean;
        isExpiringSoon: boolean;
      }>;
    }>(context.baseUrl, "/inventory/summary", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(inventorySummaryResponse.status, 200);
    assert.equal(inventorySummaryResponse.body.totals.activeBatchCount, 1);
    assert.equal(inventorySummaryResponse.body.totals.registeredMedicineCount, 1);
    assert.equal(inventorySummaryResponse.body.totals.lowStockCount, 1);
    assert.equal(inventorySummaryResponse.body.totals.nearExpiryBatchCount, 1);
    assert.equal(inventorySummaryResponse.body.totals.totalUnitsOnHand, 12);
    assert.equal(inventorySummaryResponse.body.totals.totalStockValue, 180);
    assert.equal(inventorySummaryResponse.body.medicines[0]?.latestBatchNumber, "B-2026-001");
    assert.equal(inventorySummaryResponse.body.medicines[0]?.totalQuantityOnHand, 12);
    assert.equal(inventorySummaryResponse.body.medicines[0]?.isLowStock, true);
    assert.equal(inventorySummaryResponse.body.medicines[0]?.isExpiringSoon, true);

    console.log("14. Reading live dashboard analytics");
    const dashboardOverviewResponse = await requestJson<{
      metrics: {
        registeredMedicines: number;
        activeBatches: number;
        lowStockCount: number;
        nearExpiryBatchCount: number;
        criticalAlertCount: number;
        totalUnitsOnHand: number;
      };
      expiryItems: Array<{
        batchNumber: string;
      }>;
      weeklyInventoryValue: Array<{
        value: number;
      }>;
      recentActivity: Array<{
        title: string;
      }>;
    }>(context.baseUrl, "/dashboard/overview", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(dashboardOverviewResponse.status, 200);
    assert.equal(dashboardOverviewResponse.body.metrics.registeredMedicines, 1);
    assert.equal(dashboardOverviewResponse.body.metrics.activeBatches, 1);
    assert.equal(dashboardOverviewResponse.body.metrics.lowStockCount, 1);
    assert.equal(dashboardOverviewResponse.body.metrics.nearExpiryBatchCount, 1);
    assert.equal(dashboardOverviewResponse.body.metrics.criticalAlertCount, 2);
    assert.equal(dashboardOverviewResponse.body.metrics.totalUnitsOnHand, 12);
    assert.equal(dashboardOverviewResponse.body.expiryItems[0]?.batchNumber, "B-2026-001");
    assert.equal(
      dashboardOverviewResponse.body.weeklyInventoryValue.reduce(
        (sum, item) => sum + item.value,
        0
      ),
      180
    );
    assert.ok(dashboardOverviewResponse.body.recentActivity.length >= 1);

    console.log("15. Reading the live POS catalog");
    const salesCatalogResponse = await requestJson<{
      medicines: Array<{
        id: string;
        name: string;
        totalQuantityOnHand: number;
        currentSellingPrice: number;
      }>;
    }>(context.baseUrl, "/sales/catalog", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(salesCatalogResponse.status, 200);
    assert.equal(salesCatalogResponse.body.medicines.length, 1);
    assert.equal(salesCatalogResponse.body.medicines[0]?.name, "Paracetamol");
    assert.equal(salesCatalogResponse.body.medicines[0]?.totalQuantityOnHand, 12);
    assert.equal(salesCatalogResponse.body.medicines[0]?.currentSellingPrice, 15);

    console.log("16. Completing a sale through the POS flow");
    const createSaleResponse = await requestJson<{
      id: string;
      saleNumber: string;
      totalAmount: number;
      paymentMethod: string;
      items: Array<{
        medicineName: string;
        quantity: number;
        batchNumber: string;
      }>;
    }>(context.baseUrl, "/sales", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        paymentMethod: "CASH",
        items: [
          {
            medicineId: createMedicineResponse.body.id,
            quantity: 5,
          },
        ],
      }),
    });

    assert.equal(createSaleResponse.status, 201);
    assert.match(createSaleResponse.body.saleNumber, /^MAIN-/);
    assert.equal(createSaleResponse.body.totalAmount, 75);
    assert.equal(createSaleResponse.body.paymentMethod, "CASH");
    assert.equal(createSaleResponse.body.items[0]?.medicineName, "Paracetamol");
    assert.equal(createSaleResponse.body.items[0]?.quantity, 5);
    assert.equal(createSaleResponse.body.items[0]?.batchNumber, "B-2026-001");

    console.log("17. Verifying inventory decreased after the sale");
    const inventoryAfterSaleResponse = await requestJson<{
      totals: {
        totalUnitsOnHand: number;
        totalStockValue: number;
        lowStockCount: number;
      };
      medicines: Array<{
        totalQuantityOnHand: number;
        latestBatchNumber: string | null;
      }>;
    }>(context.baseUrl, "/inventory/summary", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(inventoryAfterSaleResponse.status, 200);
    assert.equal(inventoryAfterSaleResponse.body.totals.totalUnitsOnHand, 7);
    assert.equal(inventoryAfterSaleResponse.body.totals.totalStockValue, 105);
    assert.equal(inventoryAfterSaleResponse.body.totals.lowStockCount, 1);
    assert.equal(
      inventoryAfterSaleResponse.body.medicines[0]?.totalQuantityOnHand,
      7
    );
    assert.equal(
      inventoryAfterSaleResponse.body.medicines[0]?.latestBatchNumber,
      "B-2026-001"
    );

    console.log("18. Reading POS overview with the completed sale");
    const salesOverviewResponse = await requestJson<{
      metrics: {
        todaySalesAmount: number;
        todaySalesCount: number;
        averageTicket: number;
      };
      recentSales: Array<{
        saleNumber: string;
        totalAmount: number;
        itemCount: number;
      }>;
    }>(context.baseUrl, "/sales/overview", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(salesOverviewResponse.status, 200);
    assert.equal(salesOverviewResponse.body.metrics.todaySalesAmount, 75);
    assert.equal(salesOverviewResponse.body.metrics.todaySalesCount, 1);
    assert.equal(salesOverviewResponse.body.metrics.averageTicket, 75);
    assert.equal(salesOverviewResponse.body.recentSales.length, 1);
    assert.equal(salesOverviewResponse.body.recentSales[0]?.totalAmount, 75);
    assert.equal(salesOverviewResponse.body.recentSales[0]?.itemCount, 5);

    console.log("19. Reading the stock adjustment catalog");
    const adjustmentCatalogResponse = await requestJson<{
      medicines: Array<{
        id: string;
        name: string;
        batches: Array<{
          id: string;
          batchNumber: string;
          quantityOnHand: number;
        }>;
      }>;
    }>(context.baseUrl, "/inventory/adjustment-catalog", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(adjustmentCatalogResponse.status, 200);
    assert.equal(adjustmentCatalogResponse.body.medicines.length, 1);
    assert.equal(adjustmentCatalogResponse.body.medicines[0]?.name, "Paracetamol");
    assert.equal(
      adjustmentCatalogResponse.body.medicines[0]?.batches[0]?.quantityOnHand,
      7
    );

    const adjustmentBatchId = adjustmentCatalogResponse.body.medicines[0]?.batches[0]?.id;
    assert.ok(adjustmentBatchId);

    console.log("20. Recording a theft-suspected stock adjustment");
    const adjustStockResponse = await requestJson<{
      reason: string;
      quantityDelta: number;
      quantityAfter: number;
      batch: {
        batchNumber: string;
      };
      medicine: {
        name: string;
      };
    }>(context.baseUrl, "/inventory/adjustments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        stockBatchId: adjustmentBatchId,
        quantityDelta: -2,
        reason: "THEFT_SUSPECTED",
        notes: "Mismatch after shelf count",
      }),
    });

    assert.equal(adjustStockResponse.status, 201);
    assert.equal(adjustStockResponse.body.reason, "THEFT_SUSPECTED");
    assert.equal(adjustStockResponse.body.quantityDelta, -2);
    assert.equal(adjustStockResponse.body.quantityAfter, 5);
    assert.equal(adjustStockResponse.body.batch.batchNumber, "B-2026-001");
    assert.equal(adjustStockResponse.body.medicine.name, "Paracetamol");

    console.log("21. Verifying inventory and adjustment history after the loss event");
    const inventoryAfterAdjustmentResponse = await requestJson<{
      totals: {
        totalUnitsOnHand: number;
        totalStockValue: number;
      };
      medicines: Array<{
        totalQuantityOnHand: number;
      }>;
    }>(context.baseUrl, "/inventory/summary", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(inventoryAfterAdjustmentResponse.status, 200);
    assert.equal(inventoryAfterAdjustmentResponse.body.totals.totalUnitsOnHand, 5);
    assert.equal(inventoryAfterAdjustmentResponse.body.totals.totalStockValue, 75);
    assert.equal(
      inventoryAfterAdjustmentResponse.body.medicines[0]?.totalQuantityOnHand,
      5
    );

    const adjustmentsResponse = await requestJson<{
      metrics: {
        totalAdjustments: number;
        negativeAdjustments: number;
        suspectedLossCount: number;
        netUnitsDelta: number;
      };
      adjustments: Array<{
        reason: string;
        quantityDelta: number;
        quantityAfter: number;
      }>;
    }>(context.baseUrl, "/inventory/adjustments", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(adjustmentsResponse.status, 200);
    assert.equal(adjustmentsResponse.body.metrics.totalAdjustments, 1);
    assert.equal(adjustmentsResponse.body.metrics.negativeAdjustments, 1);
    assert.equal(adjustmentsResponse.body.metrics.suspectedLossCount, 1);
    assert.equal(adjustmentsResponse.body.metrics.netUnitsDelta, -2);
    assert.equal(adjustmentsResponse.body.adjustments[0]?.reason, "THEFT_SUSPECTED");
    assert.equal(adjustmentsResponse.body.adjustments[0]?.quantityDelta, -2);
    assert.equal(adjustmentsResponse.body.adjustments[0]?.quantityAfter, 5);

    console.log("22. Reading the dedicated audit log feed");
    const auditLogsResponse = await requestJson<{
      metrics: {
        totalEvents: number;
        stockAdjustments: number;
        suspectedLossEvents: number;
      };
      items: Array<{
        title: string;
        category: string;
      }>;
    }>(context.baseUrl, "/audit/logs", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(auditLogsResponse.status, 200);
    assert.ok(auditLogsResponse.body.metrics.totalEvents >= 1);
    assert.equal(auditLogsResponse.body.metrics.stockAdjustments, 1);
    assert.equal(auditLogsResponse.body.metrics.suspectedLossEvents, 1);
    assert.equal(auditLogsResponse.body.items[0]?.category, "Inventory");
    assert.equal(auditLogsResponse.body.items[0]?.title, "Stock loss recorded");

    console.log("23. Reading the owner reports summary");
    const reportsSummaryResponse = await requestJson<{
      range: {
        days: number;
      };
      sales: {
        totalSalesAmount: number;
        completedSalesCount: number;
        totalUnitsSold: number;
        topMedicines: Array<{
          name: string;
          quantitySold: number;
          revenue: number;
        }>;
      };
      inventory: {
        totalInventoryValue: number;
        lowStockCount: number;
      };
      adjustments: {
        totalAdjustments: number;
        suspectedLossCount: number;
        recentLossEvents: Array<{
          medicineName: string;
          quantityDelta: number;
        }>;
      };
    }>(context.baseUrl, "/reports/summary?rangeDays=30", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(reportsSummaryResponse.status, 200);
    assert.equal(reportsSummaryResponse.body.range.days, 30);
    assert.equal(reportsSummaryResponse.body.sales.totalSalesAmount, 75);
    assert.equal(reportsSummaryResponse.body.sales.completedSalesCount, 1);
    assert.equal(reportsSummaryResponse.body.sales.totalUnitsSold, 5);
    assert.equal(reportsSummaryResponse.body.sales.topMedicines[0]?.name, "Paracetamol");
    assert.equal(reportsSummaryResponse.body.sales.topMedicines[0]?.quantitySold, 5);
    assert.equal(reportsSummaryResponse.body.sales.topMedicines[0]?.revenue, 75);
    assert.equal(reportsSummaryResponse.body.inventory.totalInventoryValue, 75);
    assert.equal(reportsSummaryResponse.body.inventory.lowStockCount, 1);
    assert.equal(reportsSummaryResponse.body.adjustments.totalAdjustments, 1);
    assert.equal(reportsSummaryResponse.body.adjustments.suspectedLossCount, 1);
    assert.equal(
      reportsSummaryResponse.body.adjustments.recentLossEvents[0]?.medicineName,
      "Paracetamol"
    );
    assert.equal(
      reportsSummaryResponse.body.adjustments.recentLossEvents[0]?.quantityDelta,
      -2
    );

    console.log("24. Exporting the reports CSV");
    const csvExportResponse = await fetch(
      new URL("/reports/export.csv?rangeDays=30", `${context.baseUrl}/`),
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    assert.equal(csvExportResponse.status, 200);
    assert.match(
      csvExportResponse.headers.get("content-type") ?? "",
      /^text\/csv/
    );
    assert.match(
      csvExportResponse.headers.get("content-disposition") ?? "",
      /pharmahub-report-30d\.csv/
    );

    const csvText = await csvExportResponse.text();

    assert.match(csvText, /PharmaHub Report/);
    assert.match(csvText, /Paracetamol/);
    assert.match(csvText, /THEFT_SUSPECTED/);

    console.log("25. Voiding the completed sale");
    const voidSaleResponse = await requestJson<{
      saleNumber: string;
      status: string;
      totalAmount: number;
      reason: string;
      items: Array<{
        quantity: number;
      }>;
    }>(context.baseUrl, `/sales/${createSaleResponse.body.id}/void`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        reason: "Dispensing mistake",
        notes: "Wrong medicine picked at the counter",
      }),
    });

    assert.equal(voidSaleResponse.status, 200);
    assert.equal(voidSaleResponse.body.saleNumber, createSaleResponse.body.saleNumber);
    assert.equal(voidSaleResponse.body.status, "VOIDED");
    assert.equal(voidSaleResponse.body.totalAmount, 75);
    assert.equal(voidSaleResponse.body.reason, "Dispensing mistake");
    assert.equal(voidSaleResponse.body.items[0]?.quantity, 5);

    console.log("26. Verifying stock is restored after the sale void");
    const inventoryAfterVoidResponse = await requestJson<{
      totals: {
        totalUnitsOnHand: number;
        totalStockValue: number;
      };
      medicines: Array<{
        totalQuantityOnHand: number;
      }>;
    }>(context.baseUrl, "/inventory/summary", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(inventoryAfterVoidResponse.status, 200);
    assert.equal(inventoryAfterVoidResponse.body.totals.totalUnitsOnHand, 10);
    assert.equal(inventoryAfterVoidResponse.body.totals.totalStockValue, 150);
    assert.equal(inventoryAfterVoidResponse.body.medicines[0]?.totalQuantityOnHand, 10);

    console.log("27. Reading sales overview after the reversal");
    const salesOverviewAfterVoidResponse = await requestJson<{
      metrics: {
        todaySalesAmount: number;
        todaySalesCount: number;
        averageTicket: number;
      };
      recentSales: Array<{
        saleNumber: string;
        status: string;
        voidReason: string | null;
      }>;
    }>(context.baseUrl, "/sales/overview", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(salesOverviewAfterVoidResponse.status, 200);
    assert.equal(salesOverviewAfterVoidResponse.body.metrics.todaySalesAmount, 0);
    assert.equal(salesOverviewAfterVoidResponse.body.metrics.todaySalesCount, 0);
    assert.equal(salesOverviewAfterVoidResponse.body.metrics.averageTicket, 0);
    assert.equal(
      salesOverviewAfterVoidResponse.body.recentSales[0]?.saleNumber,
      createSaleResponse.body.saleNumber
    );
    assert.equal(salesOverviewAfterVoidResponse.body.recentSales[0]?.status, "VOIDED");
    assert.equal(
      salesOverviewAfterVoidResponse.body.recentSales[0]?.voidReason,
      "Dispensing mistake"
    );

    console.log("28. Reading reconciliation after the reversal");
    const reconciliationResponse = await requestJson<{
      totals: {
        openingUnitsOnHand: number;
        closingUnitsOnHand: number;
        movementNetUnits: number;
        stockInUnits: number;
        saleUnits: number;
        voidRestorationUnits: number;
        grossSalesCount: number;
        completedSalesCount: number;
        voidedSalesCount: number;
        netSalesAmount: number;
        voidedSalesAmount: number;
        suspectedLossCount: number;
      };
      recentVoids: Array<{
        saleNumber: string;
        reason: string;
      }>;
    }>(context.baseUrl, "/sales/reconciliation?rangeDays=1", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(reconciliationResponse.status, 200);
    assert.equal(reconciliationResponse.body.totals.openingUnitsOnHand, 0);
    assert.equal(reconciliationResponse.body.totals.closingUnitsOnHand, 10);
    assert.equal(reconciliationResponse.body.totals.movementNetUnits, 10);
    assert.equal(reconciliationResponse.body.totals.stockInUnits, 12);
    assert.equal(reconciliationResponse.body.totals.saleUnits, 5);
    assert.equal(reconciliationResponse.body.totals.voidRestorationUnits, 5);
    assert.equal(reconciliationResponse.body.totals.grossSalesCount, 1);
    assert.equal(reconciliationResponse.body.totals.completedSalesCount, 0);
    assert.equal(reconciliationResponse.body.totals.voidedSalesCount, 1);
    assert.equal(reconciliationResponse.body.totals.netSalesAmount, 0);
    assert.equal(reconciliationResponse.body.totals.voidedSalesAmount, 75);
    assert.equal(reconciliationResponse.body.totals.suspectedLossCount, 1);
    assert.equal(
      reconciliationResponse.body.recentVoids[0]?.saleNumber,
      createSaleResponse.body.saleNumber
    );
    assert.equal(
      reconciliationResponse.body.recentVoids[0]?.reason,
      "Dispensing mistake"
    );

    console.log("Sale voiding and reconciliation e2e checks passed.");
  } finally {
    await context.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
