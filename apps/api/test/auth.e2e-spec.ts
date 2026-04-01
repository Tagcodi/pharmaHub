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

    console.log("9. Creating and listing medicines in the catalog");
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

    console.log("10. Receiving a live stock batch into inventory");
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

    console.log("11. Reading live inventory summaries");
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

    console.log("12. Reading live dashboard analytics");
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

    console.log("Auth foundation e2e checks passed.");
  } finally {
    await context.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
