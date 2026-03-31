import assert from "node:assert/strict";
import { createTestApp, requestJson } from "./support/test-context";

async function main() {
  const context = await createTestApp();

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

    console.log("Auth foundation e2e checks passed.");
  } finally {
    await context.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
