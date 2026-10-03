import assert from "node:assert/strict";
import test from "node:test";
import { createLikeRequestGuard } from "./requestGuard.js";

test("a burst and a later repeat of the same like send only one request", async () => {
  const guard = createLikeRequestGuard();
  let sends = 0;
  let complete;
  const send = () => {
    sends += 1;
    return new Promise((resolve) => {
      complete = resolve;
    });
  };
  const requests = Array.from({ length: 100 }, () =>
    guard.run("member-1:send:2", send),
  );
  await Promise.resolve();
  assert.equal(sends, 1);
  complete({ matched: true });
  const results = await Promise.all(requests);
  assert.equal(results.length, 100);
  await guard.run("member-1:send:2", send);
  assert.equal(sends, 1);
});

test("failed likes can be retried and different recipients are independent", async () => {
  const guard = createLikeRequestGuard();
  let sends = 0;
  await assert.rejects(
    guard.run("member-1:send:2", () => {
      sends += 1;
      throw new Error("offline");
    }),
    /offline/,
  );
  const send = async () => ++sends;
  await guard.run("member-1:send:2", send);
  await guard.run("member-1:send:3", send);
  assert.equal(sends, 3);
});

test("clearing a session allows new requests even when an old request fails later", async () => {
  const guard = createLikeRequestGuard();
  let fail;
  const oldRequest = guard.run(
    "member-1:send:2",
    () =>
      new Promise((_, reject) => {
        fail = reject;
      }),
  );
  await Promise.resolve();
  guard.clear();
  const currentRequest = guard.run("member-1:send:2", async () => "success");
  fail(new Error("old request"));
  await assert.rejects(oldRequest, /old request/);
  assert.equal(
    await guard.run("member-1:send:2", () => assert.fail("duplicate request")),
    "success",
  );
  assert.equal(await currentRequest, "success");
});
