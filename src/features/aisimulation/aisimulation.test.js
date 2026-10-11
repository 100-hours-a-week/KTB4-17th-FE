import assert from "node:assert/strict";
import test from "node:test";
import { createAiSimulation } from "./api.js";
import { createSimulationLaunchCoordinator } from "./launchCoordinator.js";

test("simulation creation forwards its abort signal", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let requestOptions;
  globalThis.fetch = async (_url, options) => {
    requestOptions = options;
    return new Response(JSON.stringify({ data: { simulationId: 17 } }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    assert.equal(
      (await createAiSimulation(23, { signal: controller.signal }))
        .simulationId,
      17,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requestOptions.signal, controller.signal);
  assert.equal(requestOptions.method, "POST");
});

test("cancelling a matching simulation invalidates every late result", () => {
  const coordinator = createSimulationLaunchCoordinator();
  const request = coordinator.begin(23);

  assert.ok(request);
  assert.equal(coordinator.isCurrent(request), true);
  assert.equal(coordinator.cancel(99), null);
  assert.equal(coordinator.isCurrent(request), true);

  const cancelled = coordinator.cancel(23);
  assert.equal(cancelled, request);
  assert.equal(request.controller.signal.aborted, true);
  assert.equal(coordinator.isCurrent(request), false);
  assert.equal(coordinator.finish(request), false);

  const nextRequest = coordinator.begin(24);
  assert.ok(nextRequest);
  assert.equal(coordinator.isCurrent(nextRequest), true);
});
