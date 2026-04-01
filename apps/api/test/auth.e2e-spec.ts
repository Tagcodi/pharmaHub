import assert from "node:assert/strict";
import { createTestApp, requestJson } from "./support/test-context";

async function main() {
  const context = await createTestApp();
  const receivedAt = new Date();
  receivedAt.setUTCSeconds(0, 0);
  const expiryDate = new Date(receivedAt);
  expiryDate.setUTCDate(expiryDate.getUTCDate() + 10);
  const purchaseExpiryDate = new Date(receivedAt);
  purchaseExpiryDate.setUTCDate(purchaseExpiryDate.getUTCDate() + 120);

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

    console.log("29. Reading the cycle count catalog");
    const cycleCountCatalogResponse = await requestJson<{
      metrics: {
        totalBatches: number;
        totalUnitsOnHand: number;
        expiringSoonBatchCount: number;
        lowStockMedicineCount: number;
      };
      batches: Array<{
        stockBatchId: string;
        medicineId: string;
        medicineName: string;
        batchNumber: string;
        systemQuantity: number;
        totalMedicineQuantity: number;
        isLowStock: boolean;
        isExpiringSoon: boolean;
      }>;
    }>(context.baseUrl, "/inventory/count-catalog", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(cycleCountCatalogResponse.status, 200);
    assert.equal(cycleCountCatalogResponse.body.metrics.totalBatches, 1);
    assert.equal(cycleCountCatalogResponse.body.metrics.totalUnitsOnHand, 10);
    assert.equal(cycleCountCatalogResponse.body.metrics.expiringSoonBatchCount, 1);
    assert.equal(cycleCountCatalogResponse.body.metrics.lowStockMedicineCount, 1);
    assert.equal(cycleCountCatalogResponse.body.batches[0]?.medicineName, "Paracetamol");
    assert.equal(cycleCountCatalogResponse.body.batches[0]?.batchNumber, "B-2026-001");
    assert.equal(cycleCountCatalogResponse.body.batches[0]?.systemQuantity, 10);
    assert.equal(cycleCountCatalogResponse.body.batches[0]?.totalMedicineQuantity, 10);
    assert.equal(cycleCountCatalogResponse.body.batches[0]?.isLowStock, true);
    assert.equal(cycleCountCatalogResponse.body.batches[0]?.isExpiringSoon, true);

    const cycleCountBatchId = cycleCountCatalogResponse.body.batches[0]?.stockBatchId;
    assert.ok(cycleCountBatchId);

    console.log("30. Recording a physical stock count with a shortage");
    const createCycleCountResponse = await requestJson<{
      medicine: {
        name: string;
      };
      batchNumber: string;
      previousQuantity: number;
      countedQuantity: number;
      quantityDelta: number;
      varianceType: string;
      notes: string | null;
    }>(context.baseUrl, "/inventory/cycle-counts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        stockBatchId: cycleCountBatchId,
        countedQuantity: 8,
        notes: "Manual shelf count after shift handover",
      }),
    });

    assert.equal(createCycleCountResponse.status, 201);
    assert.equal(createCycleCountResponse.body.medicine.name, "Paracetamol");
    assert.equal(createCycleCountResponse.body.batchNumber, "B-2026-001");
    assert.equal(createCycleCountResponse.body.previousQuantity, 10);
    assert.equal(createCycleCountResponse.body.countedQuantity, 8);
    assert.equal(createCycleCountResponse.body.quantityDelta, -2);
    assert.equal(createCycleCountResponse.body.varianceType, "SHORTAGE");
    assert.equal(
      createCycleCountResponse.body.notes,
      "Manual shelf count after shift handover"
    );

    console.log("31. Verifying inventory reflects the cycle count");
    const inventoryAfterCycleCountResponse = await requestJson<{
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

    assert.equal(inventoryAfterCycleCountResponse.status, 200);
    assert.equal(inventoryAfterCycleCountResponse.body.totals.totalUnitsOnHand, 8);
    assert.equal(inventoryAfterCycleCountResponse.body.totals.totalStockValue, 120);
    assert.equal(
      inventoryAfterCycleCountResponse.body.medicines[0]?.totalQuantityOnHand,
      8
    );

    console.log("32. Reading cycle count history and metrics");
    const cycleCountsResponse = await requestJson<{
      metrics: {
        countEvents: number;
        matchedCount: number;
        varianceCount: number;
        shortageEvents: number;
        overageEvents: number;
        netVarianceUnits: number;
      };
      counts: Array<{
        medicineName: string;
        batchNumber: string;
        previousQuantity: number;
        countedQuantity: number;
        quantityDelta: number;
        varianceType: string;
        notes: string | null;
      }>;
    }>(context.baseUrl, "/inventory/cycle-counts", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(cycleCountsResponse.status, 200);
    assert.equal(cycleCountsResponse.body.metrics.countEvents, 1);
    assert.equal(cycleCountsResponse.body.metrics.matchedCount, 0);
    assert.equal(cycleCountsResponse.body.metrics.varianceCount, 1);
    assert.equal(cycleCountsResponse.body.metrics.shortageEvents, 1);
    assert.equal(cycleCountsResponse.body.metrics.overageEvents, 0);
    assert.equal(cycleCountsResponse.body.metrics.netVarianceUnits, -2);
    assert.equal(cycleCountsResponse.body.counts[0]?.medicineName, "Paracetamol");
    assert.equal(cycleCountsResponse.body.counts[0]?.batchNumber, "B-2026-001");
    assert.equal(cycleCountsResponse.body.counts[0]?.previousQuantity, 10);
    assert.equal(cycleCountsResponse.body.counts[0]?.countedQuantity, 8);
    assert.equal(cycleCountsResponse.body.counts[0]?.quantityDelta, -2);
    assert.equal(cycleCountsResponse.body.counts[0]?.varianceType, "SHORTAGE");
    assert.equal(
      cycleCountsResponse.body.counts[0]?.notes,
      "Manual shelf count after shift handover"
    );

    console.log("33. Verifying the audit feed records the completed cycle count");
    const auditLogsAfterCycleCountResponse = await requestJson<{
      items: Array<{
        title: string;
        category: string;
      }>;
    }>(context.baseUrl, "/audit/logs", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(auditLogsAfterCycleCountResponse.status, 200);
    assert.equal(auditLogsAfterCycleCountResponse.body.items[0]?.category, "Inventory");
    assert.equal(
      auditLogsAfterCycleCountResponse.body.items[0]?.title,
      "Cycle count completed"
    );

    console.log("34. Reading the alerts overview");
    const alertsOverviewResponse = await requestJson<{
      metrics: {
        totalAlerts: number;
        criticalAlerts: number;
        warningAlerts: number;
        lowStockCount: number;
        expiringSoonCount: number;
        expiredCount: number;
        suspectedLossCount: number;
        cycleCountShortageCount: number;
        voidedSaleCount: number;
      };
      lowStockMedicines: Array<{
        name: string;
        totalQuantityOnHand: number;
        status: string;
      }>;
      expiryBatches: Array<{
        batchNumber: string;
        quantityOnHand: number;
        status: string;
      }>;
      inventorySignals: Array<{
        type: string;
        medicineName: string;
      }>;
      salesSignals: Array<{
        saleNumber: string;
        reason: string | null;
      }>;
    }>(context.baseUrl, "/alerts/overview", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(alertsOverviewResponse.status, 200);
    assert.equal(alertsOverviewResponse.body.metrics.totalAlerts, 5);
    assert.equal(alertsOverviewResponse.body.metrics.lowStockCount, 1);
    assert.equal(alertsOverviewResponse.body.metrics.expiringSoonCount, 1);
    assert.equal(alertsOverviewResponse.body.metrics.expiredCount, 0);
    assert.equal(alertsOverviewResponse.body.metrics.suspectedLossCount, 1);
    assert.equal(alertsOverviewResponse.body.metrics.cycleCountShortageCount, 1);
    assert.equal(alertsOverviewResponse.body.metrics.voidedSaleCount, 1);
    assert.equal(alertsOverviewResponse.body.lowStockMedicines[0]?.name, "Paracetamol");
    assert.equal(
      alertsOverviewResponse.body.lowStockMedicines[0]?.totalQuantityOnHand,
      8
    );
    assert.equal(alertsOverviewResponse.body.lowStockMedicines[0]?.status, "WARNING");
    assert.equal(alertsOverviewResponse.body.expiryBatches[0]?.batchNumber, "B-2026-001");
    assert.equal(alertsOverviewResponse.body.expiryBatches[0]?.quantityOnHand, 8);
    assert.equal(alertsOverviewResponse.body.expiryBatches[0]?.status, "WARNING");
    assert.ok(
      alertsOverviewResponse.body.inventorySignals.some(
        (signal) =>
          signal.type === "THEFT_SUSPECTED" && signal.medicineName === "Paracetamol"
      )
    );
    assert.ok(
      alertsOverviewResponse.body.inventorySignals.some(
        (signal) =>
          signal.type === "COUNT_SHORTAGE" && signal.medicineName === "Paracetamol"
      )
    );
    assert.equal(
      alertsOverviewResponse.body.salesSignals[0]?.saleNumber,
      createSaleResponse.body.saleNumber
    );
    assert.equal(
      alertsOverviewResponse.body.salesSignals[0]?.reason,
      "Dispensing mistake"
    );

    console.log("35. Reading the purchase order catalog");
    const purchaseOrderCatalogResponse = await requestJson<{
      metrics: {
        totalMedicines: number;
        lowStockCount: number;
        recommendedOrderUnits: number;
        openOrderCount: number;
        outstandingOrderUnits: number;
      };
      lowStockMedicines: Array<{
        id: string;
        name: string;
        recommendedOrderQuantity: number;
        lastSupplierName: string | null;
      }>;
      medicines: Array<{
        id: string;
        name: string;
      }>;
    }>(context.baseUrl, "/purchase-orders/catalog", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(purchaseOrderCatalogResponse.status, 200);
    assert.equal(purchaseOrderCatalogResponse.body.metrics.totalMedicines, 1);
    assert.equal(purchaseOrderCatalogResponse.body.metrics.lowStockCount, 1);
    assert.equal(purchaseOrderCatalogResponse.body.metrics.recommendedOrderUnits, 32);
    assert.equal(purchaseOrderCatalogResponse.body.metrics.openOrderCount, 0);
    assert.equal(purchaseOrderCatalogResponse.body.metrics.outstandingOrderUnits, 0);
    assert.equal(
      purchaseOrderCatalogResponse.body.lowStockMedicines[0]?.name,
      "Paracetamol"
    );
    assert.equal(
      purchaseOrderCatalogResponse.body.lowStockMedicines[0]?.recommendedOrderQuantity,
      32
    );
    assert.equal(
      purchaseOrderCatalogResponse.body.lowStockMedicines[0]?.lastSupplierName,
      "EPSS"
    );

    console.log("36. Creating a supplier purchase order");
    const createPurchaseOrderResponse = await requestJson<{
      id: string;
      orderNumber: string;
      status: string;
      supplierName: string;
      totalRequestedQuantity: number;
      totalReceivedQuantity: number;
      outstandingQuantity: number;
      totalOrderedValue: number;
      items: Array<{
        requestedQuantity: number;
        receivedQuantity: number;
        unitCost: number;
        medicine: {
          name: string;
        };
      }>;
    }>(context.baseUrl, "/purchase-orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        supplierName: "EPSS",
        notes: "Urgent replenishment after cycle count shortage",
        items: [
          {
            medicineId: createMedicineResponse.body.id,
            quantity: 20,
            unitCost: 11,
          },
        ],
      }),
    });

    assert.equal(createPurchaseOrderResponse.status, 201);
    assert.match(createPurchaseOrderResponse.body.orderNumber, /^MAIN-PO-/);
    assert.equal(createPurchaseOrderResponse.body.status, "OPEN");
    assert.equal(createPurchaseOrderResponse.body.supplierName, "EPSS");
    assert.equal(createPurchaseOrderResponse.body.totalRequestedQuantity, 20);
    assert.equal(createPurchaseOrderResponse.body.totalReceivedQuantity, 0);
    assert.equal(createPurchaseOrderResponse.body.outstandingQuantity, 20);
    assert.equal(createPurchaseOrderResponse.body.totalOrderedValue, 220);
    assert.equal(
      createPurchaseOrderResponse.body.items[0]?.medicine.name,
      "Paracetamol"
    );
    assert.equal(createPurchaseOrderResponse.body.items[0]?.requestedQuantity, 20);
    assert.equal(createPurchaseOrderResponse.body.items[0]?.receivedQuantity, 0);
    assert.equal(createPurchaseOrderResponse.body.items[0]?.unitCost, 11);

    console.log("37. Listing purchase orders after creation");
    const purchaseOrdersAfterCreateResponse = await requestJson<{
      metrics: {
        totalOrders: number;
        openOrders: number;
        receivedOrders: number;
        totalOrderedValue: number;
        outstandingUnits: number;
      };
      orders: Array<{
        id: string;
        orderNumber: string;
        status: string;
        outstandingQuantity: number;
        items: Array<{
          id: string;
          requestedQuantity: number;
          outstandingQuantity: number;
        }>;
      }>;
    }>(context.baseUrl, "/purchase-orders", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(purchaseOrdersAfterCreateResponse.status, 200);
    assert.equal(purchaseOrdersAfterCreateResponse.body.metrics.totalOrders, 1);
    assert.equal(purchaseOrdersAfterCreateResponse.body.metrics.openOrders, 1);
    assert.equal(purchaseOrdersAfterCreateResponse.body.metrics.receivedOrders, 0);
    assert.equal(purchaseOrdersAfterCreateResponse.body.metrics.totalOrderedValue, 220);
    assert.equal(purchaseOrdersAfterCreateResponse.body.metrics.outstandingUnits, 20);
    assert.equal(
      purchaseOrdersAfterCreateResponse.body.orders[0]?.orderNumber,
      createPurchaseOrderResponse.body.orderNumber
    );
    assert.equal(purchaseOrdersAfterCreateResponse.body.orders[0]?.status, "OPEN");
    assert.equal(
      purchaseOrdersAfterCreateResponse.body.orders[0]?.outstandingQuantity,
      20
    );

    const purchaseOrderItemId =
      purchaseOrdersAfterCreateResponse.body.orders[0]?.items[0]?.id;
    assert.ok(purchaseOrderItemId);

    console.log("38. Receiving the supplier order into a new stock batch");
    const receivePurchaseOrderResponse = await requestJson<{
      orderNumber: string;
      status: string;
      totalRequestedQuantity: number;
      totalReceivedQuantity: number;
      outstandingQuantity: number;
      items: Array<{
        receivedQuantity: number;
        outstandingQuantity: number;
      }>;
    }>(
      context.baseUrl,
      `/purchase-orders/${createPurchaseOrderResponse.body.id}/receive`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          items: [
            {
              purchaseOrderItemId,
              batchNumber: "B-2026-002",
              expiryDate: purchaseExpiryDate.toISOString(),
              receivedQuantity: 20,
              costPrice: 11,
              sellingPrice: 16,
            },
          ],
        }),
      }
    );

    assert.equal(receivePurchaseOrderResponse.status, 201);
    assert.equal(
      receivePurchaseOrderResponse.body.orderNumber,
      createPurchaseOrderResponse.body.orderNumber
    );
    assert.equal(receivePurchaseOrderResponse.body.status, "RECEIVED");
    assert.equal(receivePurchaseOrderResponse.body.totalRequestedQuantity, 20);
    assert.equal(receivePurchaseOrderResponse.body.totalReceivedQuantity, 20);
    assert.equal(receivePurchaseOrderResponse.body.outstandingQuantity, 0);
    assert.equal(receivePurchaseOrderResponse.body.items[0]?.receivedQuantity, 20);
    assert.equal(receivePurchaseOrderResponse.body.items[0]?.outstandingQuantity, 0);

    console.log("39. Verifying inventory reflects the received purchase order");
    const inventoryAfterPurchaseOrderResponse = await requestJson<{
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

    assert.equal(inventoryAfterPurchaseOrderResponse.status, 200);
    assert.equal(inventoryAfterPurchaseOrderResponse.body.totals.totalUnitsOnHand, 28);
    assert.equal(inventoryAfterPurchaseOrderResponse.body.totals.totalStockValue, 440);
    assert.equal(inventoryAfterPurchaseOrderResponse.body.totals.lowStockCount, 0);
    assert.equal(
      inventoryAfterPurchaseOrderResponse.body.medicines[0]?.totalQuantityOnHand,
      28
    );
    assert.equal(
      inventoryAfterPurchaseOrderResponse.body.medicines[0]?.latestBatchNumber,
      "B-2026-002"
    );

    console.log("40. Confirming purchase orders and audit history after receipt");
    const purchaseOrdersAfterReceiveResponse = await requestJson<{
      metrics: {
        openOrders: number;
        receivedOrders: number;
        outstandingUnits: number;
      };
      orders: Array<{
        status: string;
        totalReceivedQuantity: number;
      }>;
    }>(context.baseUrl, "/purchase-orders", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(purchaseOrdersAfterReceiveResponse.status, 200);
    assert.equal(purchaseOrdersAfterReceiveResponse.body.metrics.openOrders, 0);
    assert.equal(purchaseOrdersAfterReceiveResponse.body.metrics.receivedOrders, 1);
    assert.equal(purchaseOrdersAfterReceiveResponse.body.metrics.outstandingUnits, 0);
    assert.equal(purchaseOrdersAfterReceiveResponse.body.orders[0]?.status, "RECEIVED");
    assert.equal(
      purchaseOrdersAfterReceiveResponse.body.orders[0]?.totalReceivedQuantity,
      20
    );

    const auditLogsAfterPurchaseOrderResponse = await requestJson<{
      items: Array<{
        title: string;
        category: string;
      }>;
    }>(context.baseUrl, "/audit/logs", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(auditLogsAfterPurchaseOrderResponse.status, 200);
    assert.equal(auditLogsAfterPurchaseOrderResponse.body.items[0]?.category, "Inventory");
    assert.equal(
      auditLogsAfterPurchaseOrderResponse.body.items[0]?.title,
      "Purchase order received"
    );

    console.log("41. Reading the disposal catalog");
    const disposalCatalogResponse = await requestJson<{
      metrics: {
        totalBatches: number;
        totalUnitsOnHand: number;
        expiredBatchCount: number;
        expiringSoonBatchCount: number;
        returnableBatchCount: number;
      };
      batches: Array<{
        stockBatchId: string;
        medicineName: string;
        batchNumber: string;
        quantityOnHand: number;
        canReturnToSupplier: boolean;
        isExpired: boolean;
        isExpiringSoon: boolean;
      }>;
    }>(context.baseUrl, "/inventory/disposal-catalog", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(disposalCatalogResponse.status, 200);
    assert.equal(disposalCatalogResponse.body.metrics.totalBatches, 2);
    assert.equal(disposalCatalogResponse.body.metrics.totalUnitsOnHand, 28);
    assert.equal(disposalCatalogResponse.body.metrics.expiredBatchCount, 0);
    assert.equal(disposalCatalogResponse.body.metrics.expiringSoonBatchCount, 1);
    assert.equal(disposalCatalogResponse.body.metrics.returnableBatchCount, 2);
    assert.equal(disposalCatalogResponse.body.batches[0]?.medicineName, "Paracetamol");
    assert.equal(disposalCatalogResponse.body.batches[0]?.isExpiringSoon, true);
    assert.equal(disposalCatalogResponse.body.batches[1]?.batchNumber, "B-2026-002");
    assert.equal(disposalCatalogResponse.body.batches[1]?.canReturnToSupplier, true);

    const returnableBatchId = disposalCatalogResponse.body.batches.find(
      (batch) => batch.batchNumber === "B-2026-002"
    )?.stockBatchId;
    assert.ok(returnableBatchId);

    console.log("42. Returning part of a supplier batch upstream");
    const createDisposalResponse = await requestJson<{
      reason: string;
      quantityRemoved: number;
      quantityAfter: number;
      supplierName: string | null;
      batch: {
        batchNumber: string;
      };
      medicine: {
        name: string;
      };
    }>(context.baseUrl, "/inventory/disposals", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        stockBatchId: returnableBatchId,
        quantity: 4,
        reason: "RETURN_TO_SUPPLIER",
        notes: "Returned overstocks after supplier review",
      }),
    });

    assert.equal(createDisposalResponse.status, 201);
    assert.equal(createDisposalResponse.body.reason, "RETURN_TO_SUPPLIER");
    assert.equal(createDisposalResponse.body.quantityRemoved, 4);
    assert.equal(createDisposalResponse.body.quantityAfter, 16);
    assert.equal(createDisposalResponse.body.supplierName, "EPSS");
    assert.equal(createDisposalResponse.body.batch.batchNumber, "B-2026-002");
    assert.equal(createDisposalResponse.body.medicine.name, "Paracetamol");

    console.log("43. Verifying disposal history and updated inventory");
    const disposalsResponse = await requestJson<{
      metrics: {
        totalDisposals: number;
        damagedCount: number;
        expiredCount: number;
        returnedCount: number;
        totalUnitsRemoved: number;
        totalRetailValueRemoved: number;
      };
      disposals: Array<{
        reason: string;
        quantityRemoved: number;
        quantityAfter: number;
        batch: {
          batchNumber: string;
          supplierName: string | null;
        };
      }>;
    }>(context.baseUrl, "/inventory/disposals", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(disposalsResponse.status, 200);
    assert.equal(disposalsResponse.body.metrics.totalDisposals, 1);
    assert.equal(disposalsResponse.body.metrics.damagedCount, 0);
    assert.equal(disposalsResponse.body.metrics.expiredCount, 0);
    assert.equal(disposalsResponse.body.metrics.returnedCount, 1);
    assert.equal(disposalsResponse.body.metrics.totalUnitsRemoved, 4);
    assert.equal(disposalsResponse.body.metrics.totalRetailValueRemoved, 64);
    assert.equal(disposalsResponse.body.disposals[0]?.reason, "RETURN_TO_SUPPLIER");
    assert.equal(disposalsResponse.body.disposals[0]?.quantityRemoved, 4);
    assert.equal(disposalsResponse.body.disposals[0]?.quantityAfter, 16);
    assert.equal(disposalsResponse.body.disposals[0]?.batch.batchNumber, "B-2026-002");
    assert.equal(disposalsResponse.body.disposals[0]?.batch.supplierName, "EPSS");

    const inventoryAfterDisposalResponse = await requestJson<{
      totals: {
        totalUnitsOnHand: number;
        totalStockValue: number;
        lowStockCount: number;
      };
      medicines: Array<{
        totalQuantityOnHand: number;
      }>;
    }>(context.baseUrl, "/inventory/summary", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(inventoryAfterDisposalResponse.status, 200);
    assert.equal(inventoryAfterDisposalResponse.body.totals.totalUnitsOnHand, 24);
    assert.equal(inventoryAfterDisposalResponse.body.totals.totalStockValue, 376);
    assert.equal(inventoryAfterDisposalResponse.body.totals.lowStockCount, 0);
    assert.equal(
      inventoryAfterDisposalResponse.body.medicines[0]?.totalQuantityOnHand,
      24
    );

    console.log("44. Reading the prescription catalog");
    const prescriptionCatalogResponse = await requestJson<{
      metrics: {
        totalMedicines: number;
        stockedMedicines: number;
        lowStockCount: number;
      };
      medicines: Array<{
        id: string;
        name: string;
        totalQuantityOnHand: number;
      }>;
    }>(context.baseUrl, "/prescriptions/catalog", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(prescriptionCatalogResponse.status, 200);
    assert.equal(prescriptionCatalogResponse.body.metrics.totalMedicines, 1);
    assert.equal(prescriptionCatalogResponse.body.metrics.stockedMedicines, 1);
    assert.equal(prescriptionCatalogResponse.body.metrics.lowStockCount, 0);
    assert.equal(prescriptionCatalogResponse.body.medicines[0]?.name, "Paracetamol");
    assert.equal(
      prescriptionCatalogResponse.body.medicines[0]?.totalQuantityOnHand,
      24
    );

    console.log("45. Creating a prescription intake");
    const promisedAt = new Date(receivedAt);
    promisedAt.setUTCHours(promisedAt.getUTCHours() + 2);

    const createPrescriptionResponse = await requestJson<{
      id: string;
      prescriptionNumber: string;
      patientName: string;
      status: string;
      itemCount: number;
      totalRequestedUnits: number;
      items: Array<{
        medicineName: string;
        quantity: number;
        instructions: string | null;
      }>;
    }>(context.baseUrl, "/prescriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        patientName: "Selamawit Bekele",
        patientPhone: "+251911223344",
        prescriberName: "Dr. Meron Alemu",
        promisedAt: promisedAt.toISOString(),
        notes: "Customer will return after lunch",
        items: [
          {
            medicineId: createMedicineResponse.body.id,
            quantity: 2,
            instructions: "1 tablet twice daily after meals",
          },
        ],
      }),
    });

    assert.equal(createPrescriptionResponse.status, 201);
    assert.match(createPrescriptionResponse.body.prescriptionNumber, /^MAIN-RX-/);
    assert.equal(createPrescriptionResponse.body.patientName, "Selamawit Bekele");
    assert.equal(createPrescriptionResponse.body.status, "RECEIVED");
    assert.equal(createPrescriptionResponse.body.itemCount, 1);
    assert.equal(createPrescriptionResponse.body.totalRequestedUnits, 2);
    assert.equal(createPrescriptionResponse.body.items[0]?.medicineName, "Paracetamol");
    assert.equal(createPrescriptionResponse.body.items[0]?.quantity, 2);

    console.log("46. Reading the prescription queue and updating status");
    const prescriptionsQueueResponse = await requestJson<{
      metrics: {
        totalPrescriptions: number;
        activeQueueCount: number;
        receivedCount: number;
        inReviewCount: number;
        readyCount: number;
        dispensedTodayCount: number;
      };
      prescriptions: Array<{
        id: string;
        prescriptionNumber: string;
        status: string;
        patientName: string;
      }>;
    }>(context.baseUrl, "/prescriptions", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(prescriptionsQueueResponse.status, 200);
    assert.equal(prescriptionsQueueResponse.body.metrics.totalPrescriptions, 1);
    assert.equal(prescriptionsQueueResponse.body.metrics.activeQueueCount, 1);
    assert.equal(prescriptionsQueueResponse.body.metrics.receivedCount, 1);
    assert.equal(prescriptionsQueueResponse.body.metrics.inReviewCount, 0);
    assert.equal(prescriptionsQueueResponse.body.metrics.readyCount, 0);
    assert.equal(prescriptionsQueueResponse.body.metrics.dispensedTodayCount, 0);
    assert.equal(
      prescriptionsQueueResponse.body.prescriptions[0]?.prescriptionNumber,
      createPrescriptionResponse.body.prescriptionNumber
    );

    const updatePrescriptionStatusResponse = await requestJson<{
      prescriptionNumber: string;
      status: string;
      preparedAt: string | null;
    }>(
      context.baseUrl,
      `/prescriptions/${createPrescriptionResponse.body.id}/status`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          status: "READY",
          notes: "Packed and ready for pickup",
        }),
      }
    );

    assert.equal(updatePrescriptionStatusResponse.status, 200);
    assert.equal(
      updatePrescriptionStatusResponse.body.prescriptionNumber,
      createPrescriptionResponse.body.prescriptionNumber
    );
    assert.equal(updatePrescriptionStatusResponse.body.status, "READY");
    assert.match(updatePrescriptionStatusResponse.body.preparedAt ?? "", /\d{4}-\d{2}-\d{2}T/);

    const prescriptionsAfterUpdateResponse = await requestJson<{
      metrics: {
        receivedCount: number;
        readyCount: number;
      };
      prescriptions: Array<{
        status: string;
        stockReadiness: {
          canDispense: boolean;
          issueCount: number;
          totalShortageUnits: number;
          lines: Array<{
            issueCode: string | null;
            shortageQuantity: number;
          }>;
        };
      }>;
    }>(context.baseUrl, "/prescriptions", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(prescriptionsAfterUpdateResponse.status, 200);
    assert.equal(prescriptionsAfterUpdateResponse.body.metrics.receivedCount, 0);
    assert.equal(prescriptionsAfterUpdateResponse.body.metrics.readyCount, 1);
    assert.equal(prescriptionsAfterUpdateResponse.body.prescriptions[0]?.status, "READY");
    assert.equal(
      prescriptionsAfterUpdateResponse.body.prescriptions[0]?.stockReadiness.canDispense,
      true
    );
    assert.equal(
      prescriptionsAfterUpdateResponse.body.prescriptions[0]?.stockReadiness.issueCount,
      0
    );
    assert.equal(
      prescriptionsAfterUpdateResponse.body.prescriptions[0]?.stockReadiness.totalShortageUnits,
      0
    );

    console.log("47. Dispensing the ready prescription into a live sale");
    const dispensePrescriptionResponse = await requestJson<{
      prescription: {
        prescriptionNumber: string;
        status: string;
        dispensedAt: string | null;
        sale: {
          saleNumber: string;
          totalAmount: number;
          paymentMethod: string;
        } | null;
      };
      sale: {
        id: string;
        saleNumber: string;
        totalAmount: number;
        paymentMethod: string;
        items: Array<{
          medicineName: string;
          quantity: number;
          batchNumber: string;
        }>;
      };
    }>(
      context.baseUrl,
      `/prescriptions/${createPrescriptionResponse.body.id}/dispense`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          paymentMethod: "MOBILE_MONEY",
        }),
      }
    );

    assert.equal(dispensePrescriptionResponse.status, 201);
    assert.equal(
      dispensePrescriptionResponse.body.prescription.prescriptionNumber,
      createPrescriptionResponse.body.prescriptionNumber
    );
    assert.equal(dispensePrescriptionResponse.body.prescription.status, "DISPENSED");
    assert.match(
      dispensePrescriptionResponse.body.prescription.dispensedAt ?? "",
      /\d{4}-\d{2}-\d{2}T/
    );
    assert.equal(dispensePrescriptionResponse.body.sale.paymentMethod, "MOBILE_MONEY");
    assert.equal(dispensePrescriptionResponse.body.sale.totalAmount, 30);
    assert.equal(
      dispensePrescriptionResponse.body.sale.items[0]?.medicineName,
      "Paracetamol"
    );
    assert.equal(dispensePrescriptionResponse.body.sale.items[0]?.quantity, 2);
    assert.equal(
      dispensePrescriptionResponse.body.prescription.sale?.saleNumber,
      dispensePrescriptionResponse.body.sale.saleNumber
    );

    console.log("48. Verifying the dispensed prescription and linked sale in the queue");
    const prescriptionsAfterDispenseResponse = await requestJson<{
      metrics: {
        activeQueueCount: number;
        readyCount: number;
        dispensedTodayCount: number;
      };
      prescriptions: Array<{
        status: string;
        sale: {
          saleNumber: string;
          paymentMethod: string;
          totalAmount: number;
        } | null;
      }>;
    }>(context.baseUrl, "/prescriptions", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(prescriptionsAfterDispenseResponse.status, 200);
    assert.equal(prescriptionsAfterDispenseResponse.body.metrics.activeQueueCount, 0);
    assert.equal(prescriptionsAfterDispenseResponse.body.metrics.readyCount, 0);
    assert.equal(prescriptionsAfterDispenseResponse.body.metrics.dispensedTodayCount, 1);
    assert.equal(
      prescriptionsAfterDispenseResponse.body.prescriptions[0]?.status,
      "DISPENSED"
    );
    assert.equal(
      prescriptionsAfterDispenseResponse.body.prescriptions[0]?.sale?.saleNumber,
      dispensePrescriptionResponse.body.sale.saleNumber
    );
    assert.equal(
      prescriptionsAfterDispenseResponse.body.prescriptions[0]?.sale?.paymentMethod,
      "MOBILE_MONEY"
    );
    assert.equal(
      prescriptionsAfterDispenseResponse.body.prescriptions[0]?.sale?.totalAmount,
      30
    );

    console.log("49. Verifying stock and sales reflect the dispensed prescription");
    const inventoryAfterPrescriptionDispenseResponse = await requestJson<{
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

    assert.equal(inventoryAfterPrescriptionDispenseResponse.status, 200);
    assert.equal(inventoryAfterPrescriptionDispenseResponse.body.totals.totalUnitsOnHand, 22);
    assert.equal(inventoryAfterPrescriptionDispenseResponse.body.totals.totalStockValue, 346);
    assert.equal(
      inventoryAfterPrescriptionDispenseResponse.body.medicines[0]?.totalQuantityOnHand,
      22
    );

    const salesOverviewAfterPrescriptionDispenseResponse = await requestJson<{
      metrics: {
        todaySalesAmount: number;
        todaySalesCount: number;
        averageTicket: number;
      };
      recentSales: Array<{
        saleNumber: string;
        totalAmount: number;
        paymentMethod: string;
        status: string;
      }>;
    }>(context.baseUrl, "/sales/overview", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(salesOverviewAfterPrescriptionDispenseResponse.status, 200);
    assert.equal(salesOverviewAfterPrescriptionDispenseResponse.body.metrics.todaySalesAmount, 30);
    assert.equal(salesOverviewAfterPrescriptionDispenseResponse.body.metrics.todaySalesCount, 1);
    assert.equal(salesOverviewAfterPrescriptionDispenseResponse.body.metrics.averageTicket, 30);
    assert.equal(
      salesOverviewAfterPrescriptionDispenseResponse.body.recentSales[0]?.saleNumber,
      dispensePrescriptionResponse.body.sale.saleNumber
    );
    assert.equal(
      salesOverviewAfterPrescriptionDispenseResponse.body.recentSales[0]?.paymentMethod,
      "MOBILE_MONEY"
    );
    assert.equal(
      salesOverviewAfterPrescriptionDispenseResponse.body.recentSales[0]?.status,
      "COMPLETED"
    );

    console.log("50. Auto-generating unique SKUs for similar medicines");
    const createAutoSkuMedicineOneResponse = await requestJson<{
      id: string;
      name: string;
      sku: string | null;
    }>(context.baseUrl, "/medicines", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        name: "Amoxicillin",
        strength: "500 mg",
        form: "Capsule",
        category: "Antibiotic",
        unit: "Capsule",
      }),
    });

    assert.equal(createAutoSkuMedicineOneResponse.status, 201);
    assert.equal(createAutoSkuMedicineOneResponse.body.name, "Amoxicillin");
    assert.match(
      createAutoSkuMedicineOneResponse.body.sku ?? "",
      /^AMOXIC-500MG-CAPS-001$/
    );

    const createAutoSkuMedicineTwoResponse = await requestJson<{
      id: string;
      name: string;
      sku: string | null;
    }>(context.baseUrl, "/medicines", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        name: "Amoxiclav",
        strength: "500 mg",
        form: "Capsule",
        category: "Antibiotic",
        unit: "Capsule",
      }),
    });

    assert.equal(createAutoSkuMedicineTwoResponse.status, 201);
    assert.equal(createAutoSkuMedicineTwoResponse.body.name, "Amoxiclav");
    assert.match(
      createAutoSkuMedicineTwoResponse.body.sku ?? "",
      /^AMOXIC-500MG-CAPS-002$/
    );
    assert.notEqual(
      createAutoSkuMedicineOneResponse.body.sku,
      createAutoSkuMedicineTwoResponse.body.sku
    );

    console.log("51. Auto-generating unique batch numbers during stock intake");
    const autoBatchExpiryDate = new Date(purchaseExpiryDate);
    autoBatchExpiryDate.setUTCDate(autoBatchExpiryDate.getUTCDate() + 30);

    const autoBatchStockInOneResponse = await requestJson<{
      medicine: {
        id: string;
        name: string;
        sku: string | null;
      };
      batch: {
        batchNumber: string;
        quantityOnHand: number;
      };
    }>(context.baseUrl, "/inventory/stock-in", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        medicineId: createAutoSkuMedicineOneResponse.body.id,
        receivedAt: receivedAt.toISOString(),
        expiryDate: autoBatchExpiryDate.toISOString(),
        quantity: 4,
        costPrice: 7,
        sellingPrice: 11,
        supplierName: "St. Gabriel Supplier",
      }),
    });

    assert.equal(autoBatchStockInOneResponse.status, 201);
    assert.equal(autoBatchStockInOneResponse.body.medicine.name, "Amoxicillin");
    assert.equal(
      autoBatchStockInOneResponse.body.medicine.sku,
      createAutoSkuMedicineOneResponse.body.sku
    );
    assert.match(
      autoBatchStockInOneResponse.body.batch.batchNumber,
      /^AMOX-\d{8}-001$/
    );
    assert.equal(autoBatchStockInOneResponse.body.batch.quantityOnHand, 4);

    const autoBatchStockInTwoResponse = await requestJson<{
      medicine: {
        id: string;
        name: string;
      };
      batch: {
        batchNumber: string;
        quantityOnHand: number;
      };
    }>(context.baseUrl, "/inventory/stock-in", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        medicineId: createAutoSkuMedicineOneResponse.body.id,
        receivedAt: receivedAt.toISOString(),
        expiryDate: autoBatchExpiryDate.toISOString(),
        quantity: 3,
        costPrice: 7.25,
        sellingPrice: 11.5,
        supplierName: "St. Gabriel Supplier",
      }),
    });

    assert.equal(autoBatchStockInTwoResponse.status, 201);
    assert.equal(autoBatchStockInTwoResponse.body.medicine.name, "Amoxicillin");
    assert.match(
      autoBatchStockInTwoResponse.body.batch.batchNumber,
      /^AMOX-\d{8}-002$/
    );
    assert.equal(autoBatchStockInTwoResponse.body.batch.quantityOnHand, 3);
    assert.notEqual(
      autoBatchStockInOneResponse.body.batch.batchNumber,
      autoBatchStockInTwoResponse.body.batch.batchNumber
    );

    console.log("52. Voiding the prescription-linked sale and reopening the prescription");
    const voidPrescriptionSaleResponse = await requestJson<{
      saleNumber: string;
      status: string;
      reason: string;
      prescription: {
        id: string;
        prescriptionNumber: string;
        status: string;
      } | null;
    }>(
      context.baseUrl,
      `/sales/${dispensePrescriptionResponse.body.sale.id}/void`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          reason: "Prescription correction",
          notes: "Patient requested re-check before final dispense",
        }),
      }
    );

    assert.equal(voidPrescriptionSaleResponse.status, 200);
    assert.equal(
      voidPrescriptionSaleResponse.body.saleNumber,
      dispensePrescriptionResponse.body.sale.saleNumber
    );
    assert.equal(voidPrescriptionSaleResponse.body.status, "VOIDED");
    assert.equal(voidPrescriptionSaleResponse.body.reason, "Prescription correction");
    assert.equal(
      voidPrescriptionSaleResponse.body.prescription?.prescriptionNumber,
      createPrescriptionResponse.body.prescriptionNumber
    );
    assert.equal(voidPrescriptionSaleResponse.body.prescription?.status, "READY");

    console.log("53. Verifying the prescription is back to READY");
    const prescriptionsAfterVoidResponse = await requestJson<{
      metrics: {
        activeQueueCount: number;
        readyCount: number;
        dispensedTodayCount: number;
      };
      prescriptions: Array<{
        id: string;
        status: string;
        stockReadiness: {
          canDispense: boolean;
          issueCount: number;
          totalShortageUnits: number;
        };
        sale: {
          saleNumber: string;
        } | null;
      }>;
    }>(context.baseUrl, "/prescriptions", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(prescriptionsAfterVoidResponse.status, 200);
    assert.equal(prescriptionsAfterVoidResponse.body.metrics.activeQueueCount, 1);
    assert.equal(prescriptionsAfterVoidResponse.body.metrics.readyCount, 1);
    assert.equal(prescriptionsAfterVoidResponse.body.metrics.dispensedTodayCount, 0);
    assert.equal(
      prescriptionsAfterVoidResponse.body.prescriptions[0]?.status,
      "READY"
    );
    assert.equal(
      prescriptionsAfterVoidResponse.body.prescriptions[0]?.stockReadiness.canDispense,
      true
    );
    assert.equal(
      prescriptionsAfterVoidResponse.body.prescriptions[0]?.stockReadiness.issueCount,
      0
    );
    assert.equal(prescriptionsAfterVoidResponse.body.prescriptions[0]?.sale, null);

    console.log("54. Re-dispensing the reopened prescription");
    const redispensePrescriptionResponse = await requestJson<{
      prescription: {
        status: string;
      };
      sale: {
        saleNumber: string;
        paymentMethod: string;
        totalAmount: number;
      };
    }>(
      context.baseUrl,
      `/prescriptions/${createPrescriptionResponse.body.id}/dispense`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          paymentMethod: "CASH",
        }),
      }
    );

    assert.equal(redispensePrescriptionResponse.status, 201);
    assert.equal(redispensePrescriptionResponse.body.prescription.status, "DISPENSED");
    assert.equal(redispensePrescriptionResponse.body.sale.paymentMethod, "CASH");
    assert.equal(redispensePrescriptionResponse.body.sale.totalAmount, 30);
    assert.notEqual(
      redispensePrescriptionResponse.body.sale.saleNumber,
      dispensePrescriptionResponse.body.sale.saleNumber
    );

    console.log(
      "55. Creating an over-requested ready prescription and checking stock readiness blocks dispense"
    );
    const createOverRequestedPrescriptionResponse = await requestJson<{
      id: string;
      prescriptionNumber: string;
      status: string;
    }>(context.baseUrl, "/prescriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        patientName: "Hana Tesfaye",
        patientPhone: "+251922334455",
        prescriberName: "Dr. Abiy",
        items: [
          {
            medicineId: createMedicineResponse.body.id,
            quantity: 30,
            instructions: "Take once daily",
          },
        ],
      }),
    });

    assert.equal(createOverRequestedPrescriptionResponse.status, 201);
    assert.equal(createOverRequestedPrescriptionResponse.body.status, "RECEIVED");

    const setOverRequestedReadyResponse = await requestJson<{
      status: string;
    }>(
      context.baseUrl,
      `/prescriptions/${createOverRequestedPrescriptionResponse.body.id}/status`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          status: "READY",
        }),
      }
    );

    assert.equal(setOverRequestedReadyResponse.status, 200);
    assert.equal(setOverRequestedReadyResponse.body.status, "READY");

    const queueWithOverRequestedResponse = await requestJson<{
      prescriptions: Array<{
        id: string;
        status: string;
        stockReadiness: {
          canDispense: boolean;
          issueCount: number;
          totalShortageUnits: number;
          lines: Array<{
            medicineName: string;
            requestedQuantity: number;
            availableQuantity: number;
            shortageQuantity: number;
            issueCode: string | null;
          }>;
        };
      }>;
    }>(context.baseUrl, "/prescriptions", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(queueWithOverRequestedResponse.status, 200);

    const overRequestedPrescription = queueWithOverRequestedResponse.body.prescriptions.find(
      (prescription) =>
        prescription.id === createOverRequestedPrescriptionResponse.body.id
    );

    assert.ok(overRequestedPrescription);
    assert.equal(overRequestedPrescription?.status, "READY");
    assert.equal(overRequestedPrescription?.stockReadiness.canDispense, false);
    assert.equal(overRequestedPrescription?.stockReadiness.issueCount, 1);
    assert.equal(overRequestedPrescription?.stockReadiness.totalShortageUnits, 8);
    assert.equal(
      overRequestedPrescription?.stockReadiness.lines[0]?.issueCode,
      "INSUFFICIENT_STOCK"
    );
    assert.equal(
      overRequestedPrescription?.stockReadiness.lines[0]?.requestedQuantity,
      30
    );
    assert.equal(
      overRequestedPrescription?.stockReadiness.lines[0]?.availableQuantity,
      22
    );
    assert.equal(
      overRequestedPrescription?.stockReadiness.lines[0]?.shortageQuantity,
      8
    );

    console.log("Prescription queue e2e checks passed.");
  } finally {
    await context.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
