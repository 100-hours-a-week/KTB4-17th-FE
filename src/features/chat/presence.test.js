import assert from "node:assert/strict";
import { test } from "node:test";
import { watchChatPresence } from "./presence.js";
import { createChatSocketSubscriptions } from "./socketSubscriptions.js";

test("visible room renews presence, hides/leaves, resumes after TTL, and cleans up", () => {
  const documentTarget = new EventTarget();
  documentTarget.visibilityState = "visible";
  const windowTarget = new EventTarget();
  windowTarget.navigator = { onLine: true };
  let heartbeat;
  let cleared = false;
  windowTarget.setInterval = (callback, delay) => {
    assert.ok(delay < 60000);
    heartbeat = callback;
    return 1;
  };
  windowTarget.clearInterval = () => {
    cleared = true;
  };
  const sent = [];
  const stop = watchChatPresence({
    roomId: 9,
    send: (...args) => {
      sent.push(args);
      return true;
    },
    documentTarget,
    windowTarget,
  });
  assert.deepEqual(sent, [[9, "ENTER"]]);
  heartbeat();
  assert.deepEqual(sent.at(-1), [9, "ENTER"]);
  documentTarget.visibilityState = "hidden";
  documentTarget.dispatchEvent(new Event("visibilitychange"));
  assert.deepEqual(sent.at(-1), [9, "LEAVE"]);
  const hiddenLength = sent.length;
  heartbeat();
  assert.equal(sent.length, hiddenLength);
  documentTarget.visibilityState = "visible";
  documentTarget.dispatchEvent(new Event("visibilitychange"));
  assert.deepEqual(sent.at(-1), [9, "ENTER"]);
  windowTarget.dispatchEvent(new Event("pagehide"));
  assert.deepEqual(sent.at(-1), [9, "LEAVE"]);
  windowTarget.dispatchEvent(new Event("pageshow"));
  assert.deepEqual(sent.at(-1), [9, "ENTER"]);
  stop();
  assert.ok(cleared);
  assert.deepEqual(sent.at(-1), [9, "LEAVE"]);
  const stoppedLength = sent.length;
  documentTarget.dispatchEvent(new Event("visibilitychange"));
  assert.equal(sent.length, stoppedLength);
});

test("presence shares the existing socket and is unavailable after disconnect", () => {
  let transports = 0;
  const sent = [];
  const socket = createChatSocketSubscriptions(() => {
    transports += 1;
    const disconnect = () => {};
    disconnect.sendPresence = (...args) => {
      sent.push(args);
      return true;
    };
    return disconnect;
  });
  assert.equal(socket.sendPresence(1, "ENTER"), false);
  const stopBadge = socket.subscribe({});
  const stopRoom = socket.subscribe({});
  assert.equal(transports, 1);
  assert.equal(socket.sendPresence(1, "ENTER"), true);
  assert.deepEqual(sent, [[1, "ENTER"]]);
  stopRoom();
  stopBadge();
  assert.equal(socket.sendPresence(1, "LEAVE"), false);
});
