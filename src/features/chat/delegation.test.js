import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { setAccessToken } from "../../shared/api/authToken.js";
import {
  confirmDelegationDraft,
  createDelegationDraft,
  delegationProgress,
  regenerateDelegationDraft,
  retryDelegation,
} from "./api.js";
import {
  delegationPathForRoom,
  isDelegationActionRestricted,
  normalizeDelegationProgress,
} from "./delegation.js";
import {
  clearDelegationDraft,
  loadDelegationDraft,
  saveDelegationDraft,
} from "./delegationDraftStorage.js";
import {
  applyRoomMessageEvent,
  mapChatRoom,
  mergeRefreshedChatRoom,
} from "./model.js";

const storage = new Map();
globalThis.window = new EventTarget();
window.sessionStorage = {
  get length() {
    return storage.size;
  },
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
  key: (index) => [...storage.keys()][index] || null,
};

function token(subject) {
  return `header.${Buffer.from(JSON.stringify({ sub: subject })).toString("base64url")}.signature`;
}

beforeEach(() => {
  storage.clear();
  setAccessToken(token("delegation-user"));
});

function roomFixture(status = "IN_PROGRESS", delegationId = 20) {
  return {
    chatRoomId: 10,
    status: "ACTIVE",
    activityAt: "2026-10-23T10:00:00",
    preview: { type: "TEXT", text: "서버 미리보기" },
    otherParticipant: { userId: 200, nickname: "민민" },
    delegation: { delegationId, status, endType: "GENTLE" },
  };
}

test("room responses map delegation metadata and route every server status", () => {
  for (const status of [
    "DRAFT_GENERATING",
    "AWAITING_CONFIRMATION",
    "DRAFT_FAILED",
    "IN_PROGRESS",
    "RETRY_REQUIRED",
    "FAILED",
    "COMPLETED",
    "INTERRUPTED",
  ]) {
    const room = mapChatRoom(roomFixture(status));
    assert.deepEqual(room.delegation, {
      delegationId: 20,
      status,
      endType: "GENTLE",
    });
    assert.equal(
      delegationPathForRoom(room),
      status.startsWith("DRAFT") || status === "AWAITING_CONFIRMATION"
        ? "/chats/10/delegations/20/draft"
        : "/chats/10/delegations/20",
    );
  }
});

test("server delegation wins over local cache and protected previews survive sockets", () => {
  const server = mapChatRoom(roomFixture("IN_PROGRESS", 30));
  const local = {
    ...server,
    delegation: {
      delegationId: 20,
      status: "AWAITING_CONFIRMATION",
      endType: "DIRECT",
    },
    activityTimestamp: server.activityTimestamp + 10,
    last: "로컬 메시지",
  };
  assert.equal(
    mergeRefreshedChatRoom(server, local).delegation.delegationId,
    30,
  );

  const socketUpdated = applyRoomMessageEvent(server, {
    mine: false,
    messageType: "TEXT",
    textContent: "숨겨야 하는 AI 답장",
    createdAt: "2026-10-23T10:01:00",
  });
  assert.equal(socketUpdated.last, "서버 미리보기");
  assert.equal(socketUpdated.unread, 1);

  const retryRoom = mapChatRoom(roomFixture("RETRY_REQUIRED"));
  assert.equal(
    applyRoomMessageEvent(retryRoom, {
      mine: false,
      messageType: "TEXT",
      textContent: "일반 새 메시지",
      createdAt: "2026-10-23T10:01:00",
    }).last,
    "일반 새 메시지",
  );
});

test("progress normalization always returns three turns and validates URL identity", () => {
  assert.deepEqual(
    normalizeDelegationProgress(
      {
        delegationId: 20,
        status: "COMPLETED",
        isBlockPromptRequired: true,
        targetUserId: 200,
        turns: [{ turn: 1, completed: true, sentAt: "2026-10-23T10:00:00" }],
      },
      20,
    ).turns,
    [
      { turn: 1, completed: true, sentAt: "2026-10-23T10:00:00" },
      { turn: 2, completed: false, sentAt: null },
      { turn: 3, completed: false, sentAt: null },
    ],
  );
  assert.throws(
    () =>
      normalizeDelegationProgress(
        { delegationId: 21, status: "IN_PROGRESS" },
        20,
      ),
    { code: "CHAT_DELEGATION_RESPONSE_INVALID" },
  );
});

test("only active and retry delegation states restrict direct chat actions", () => {
  for (const status of ["IN_PROGRESS", "RETRY_REQUIRED", "FAILED"])
    assert.equal(isDelegationActionRestricted(status), true);
  for (const status of [
    "DRAFT_GENERATING",
    "AWAITING_CONFIRMATION",
    "DRAFT_FAILED",
    "COMPLETED",
    "INTERRUPTED",
  ])
    assert.equal(isDelegationActionRestricted(status), false);
});

test("draft cache is user and delegation scoped and can be removed", () => {
  const draft = {
    delegationId: 20,
    draftId: "draft-1",
    turns: [{ turn: 1, message: "첫 번째 초안" }],
  };
  saveDelegationDraft(10, draft, "GENTLE");
  assert.equal(loadDelegationDraft(10, 20).draftId, "draft-1");
  assert.equal(loadDelegationDraft(10, 21), null);

  setAccessToken(token("other-user"));
  assert.equal(loadDelegationDraft(10, 20), null);
  setAccessToken(token("delegation-user"));
  clearDelegationDraft(10);
  assert.equal(loadDelegationDraft(10, 20), null);
});

test("delegation API uses IDs, payloads, signals and an empty retry body", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ data: { delegationId: 20 } }), {
      status: url.endsWith("/retry") ? 202 : 200,
      headers: { "content-type": "application/json" },
    });
  };
  const controller = new AbortController();
  try {
    await createDelegationDraft(10, "GENTLE", { signal: controller.signal });
    await regenerateDelegationDraft(10, 20, "DIRECT", {
      signal: controller.signal,
    });
    await confirmDelegationDraft(10, 20, "draft-1", {
      signal: controller.signal,
    });
    await delegationProgress(10, 20, { signal: controller.signal });
    await retryDelegation(10, 20, { signal: controller.signal });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(
    calls.map(({ url, options }) => [url, options.method || "GET"]),
    [
      ["/api/v1/chat-rooms/10/delegations", "POST"],
      ["/api/v1/chat-rooms/10/delegations/20/drafts", "POST"],
      ["/api/v1/chat-rooms/10/delegations/20/confirm", "POST"],
      ["/api/v1/chat-rooms/10/delegations/20", "GET"],
      ["/api/v1/chat-rooms/10/delegations/20/retry", "POST"],
    ],
  );
  assert.equal(calls[0].options.body, JSON.stringify({ endType: "GENTLE" }));
  assert.equal(calls[1].options.body, JSON.stringify({ endType: "DIRECT" }));
  assert.equal(calls[2].options.body, JSON.stringify({ draftId: "draft-1" }));
  assert.equal(calls[4].options.body, undefined);
  assert.ok(calls.every(({ options }) => options.signal === controller.signal));
});
