import assert from "node:assert/strict";
import test from "node:test";
import { isProfileAccessUnavailable } from "../profile/access.js";
import { withdrawUser } from "./api.js";
import { executeUserWithdrawal } from "./withdrawal.js";

test("user withdrawal sends an empty no-store DELETE request and accepts 204", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(null, { status: 204 });
  };

  try {
    assert.equal(await withdrawUser(), null);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(request.url, "/api/v1/users/me");
  assert.equal(request.options.method, "DELETE");
  assert.equal(request.options.cache, "no-store");
  assert.equal(request.options.body, undefined);
  assert.equal(request.options.headers.has("Content-Type"), false);
});

test("a missing user profile is treated as permanently unavailable", () => {
  assert.equal(isProfileAccessUnavailable({ status: 404 }), true);
  assert.equal(isProfileAccessUnavailable({ code: "PROFILE_NOT_FOUND" }), true);
  assert.equal(isProfileAccessUnavailable({ status: 500 }), false);
});

test("successful user withdrawal clears user state before replacing the route", async () => {
  const calls = [];
  const completed = await executeUserWithdrawal({
    withdrawUser: async () => calls.push("request"),
    clearSession: () => calls.push("clear-session"),
    resetAppState: () => calls.push("reset-state"),
    navigateToLogin: () => calls.push("replace-login"),
    notifySuccess: () => calls.push("success"),
    notifyFailure: () => calls.push("failure"),
  });

  assert.equal(completed, true);
  assert.deepEqual(calls, [
    "request",
    "clear-session",
    "reset-state",
    "replace-login",
    "success",
  ]);
});

test("failed user withdrawal keeps the current session and reports the error", async () => {
  const failure = Object.assign(new Error("network"), { status: 503 });
  const calls = [];
  const completed = await executeUserWithdrawal({
    withdrawUser: async () => {
      calls.push("request");
      throw failure;
    },
    clearSession: () => calls.push("clear-session"),
    resetAppState: () => calls.push("reset-state"),
    navigateToLogin: () => calls.push("replace-login"),
    notifySuccess: () => calls.push("success"),
    notifyFailure: (error) => calls.push(error),
  });

  assert.equal(completed, false);
  assert.deepEqual(calls, ["request", failure]);
});
