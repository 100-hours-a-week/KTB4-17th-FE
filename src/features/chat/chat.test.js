import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createMessageId } from "../../shared/messageId.js";
import {
  mapChatMessage,
  mergeChatMessages,
  messagesAreGrouped,
  messageTimesAreGrouped,
} from "./model.js";

const storage = new Map();
globalThis.window = new EventTarget();
window.sessionStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
};
const { setAccessToken, clearAccessToken } = await import(
  "../../shared/api/authToken.js"
);
const {
  clearChatSessions,
  endRoomAfterBlock,
  getRoomSession,
  updateRoomSession,
} = await import("./session.js");
const { blockUser } = await import("./api.js");
const { enqueueMessages, retryMessage } = await import("./outbox.js");
const { applyMessagePage, fetchMessageGap } = await import("./roomData.js");
const { loadChatVisit, unreadBoundary } = await import("./unread.js");

function token(subject, signature = "first") {
  return `header.${Buffer.from(JSON.stringify({ sub: subject })).toString("base64url")}.${signature}`;
}

beforeEach(() => {
  clearChatSessions();
  setAccessToken(token("member-1"));
});

function message(id, extras = {}) {
  return mapChatMessage({
    messageId: id,
    mine: false,
    messageType: "TEXT",
    textContent: `대화 ${id}`,
    createdAt: "2026-10-01T06:00:00Z",
    unreadCount: 1,
    ...extras,
  });
}

function page(first, last, hasNext = true) {
  return {
    chatRoom: {
      chatRoomId: 7,
      status: "ACTIVE",
      otherParticipant: { memberId: 2, nickname: "테스트" },
    },
    messages: Array.from({ length: last - first + 1 }, (_, index) => ({
      messageId: first + index,
      mine: false,
      messageType: "TEXT",
      textContent: `대화 ${first + index}`,
    })),
    pageInfo: { nextCursor: hasNext ? first : null, hasNext },
  };
}

function activeEntry() {
  const entry = getRoomSession(7);
  updateRoomSession(entry, {
    loaded: true,
    room: { id: 7, status: "ACTIVE", name: "테스트" },
  });
  return entry;
}

test("member block sends PUT and accepts created or existing responses", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    const status = calls.length === 1 ? 201 : 200;
    return new Response(
      JSON.stringify({
        data: { targetUserId: 23, blockedAt: "2026-10-10T12:30:00" },
      }),
      {
        status,
        headers: { "content-type": "application/json" },
      },
    );
  };

  try {
    assert.equal((await blockUser(23)).targetUserId, 23);
    assert.equal((await blockUser(23)).targetUserId, 23);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.url, "/api/v1/users/me/blocks/23");
    assert.equal(call.options.method, "PUT");
  }
});

test("successful block ends the room without removing message history", () => {
  const entry = activeEntry();
  updateRoomSession(entry, {
    messages: [message(1), message(2)],
    draft: "작성 중인 메시지",
    attachment: { file: new Blob(["photo"]), previewUrl: "" },
  });

  endRoomAfterBlock(entry);

  assert.equal(entry.snapshot.room.status, "ENDED");
  assert.equal(entry.snapshot.attachment, null);
  assert.equal(entry.snapshot.draft, "작성 중인 메시지");
  assert.deepEqual(
    entry.snapshot.messages.map((item) => item.id),
    [1, 2],
  );
});

function apiFixture() {
  let id = 100;
  const calls = [];
  const api = {
    uploadChatImage: async () => {
      calls.push({ kind: "upload" });
      return { fileId: 25 };
    },
    sendImageMessage: async (roomId, fileId, clientMessageId) => {
      calls.push({ kind: "image", roomId, fileId, clientMessageId });
      return {
        messageId: ++id,
        imageFileId: fileId,
        createdAt: "2026-10-01T06:00:00Z",
      };
    },
    sendMessage: async (roomId, text, clientMessageId) => {
      calls.push({ kind: "text", roomId, text, clientMessageId });
      return { messageId: ++id, createdAt: "2026-10-01T06:00:01Z" };
    },
  };
  return { api, calls };
}

async function settled(entry) {
  for (let attempts = 0; entry.running; attempts += 1) {
    assert.ok(attempts < 100, "outbox did not settle");
    await new Promise((resolve) => setImmediate(resolve));
  }
}

test("mobile HTTP origins can generate unique UUID v4 message identifiers", () => {
  const cryptoApi = {
    getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto),
  };
  const ids = Array.from({ length: 100 }, () => createMessageId(cryptoApi));
  assert.equal(new Set(ids).size, 100);
  for (const id of ids)
    assert.match(
      id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
});

test("image messages upload and send without crypto.randomUUID", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  const cryptoApi = {
    getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto),
  };
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: cryptoApi,
  });
  try {
    const entry = activeEntry();
    const { api, calls } = apiFixture();
    enqueueMessages(
      entry,
      "사진이에요",
      {
        file: new File(["photo"], "phone.jpg"),
        previewUrl: "blob:phone-photo",
      },
      api,
    );
    await settled(entry);
    assert.deepEqual(
      calls.map((call) => call.kind),
      ["upload", "image", "text"],
    );
    assert.equal(entry.snapshot.messages.length, 2);
    assert.ok(
      entry.snapshot.messages.every((message) => message.status === "SENT"),
    );
  } finally {
    Object.defineProperty(globalThis, "crypto", original);
  }
});

test("message mapping retains reconciliation and read fields", () => {
  const mapped = message(9, {
    mine: true,
    clientMessageId: "logical-message",
    unreadCount: 0,
  });
  assert.equal(mapped.clientMessageId, "logical-message");
  assert.equal(mapped.unreadCount, 0);
  assert.equal(mapped.status, "SENT");
});

test("socket confirmation before HTTP ack produces one stable bubble", () => {
  const pending = message("local:one", {
    clientMessageId: "one",
    mine: true,
    status: "SENDING",
  });
  const confirmed = message(101, { clientMessageId: "one", mine: true });
  const merged = mergeChatMessages([pending], [confirmed, confirmed]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 101);
  assert.equal(merged[0].renderKey, pending.renderKey);
});

test("HTTP acknowledgement bridges a local item and history without a client ID", () => {
  const pending = message("local:one", {
    clientMessageId: "one",
    mine: true,
    status: "SENDING",
  });
  const history = message(101, { mine: true });
  const ack = message(101, { clientMessageId: "one", mine: true });
  const merged = mergeChatMessages([pending, history], [ack]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].renderKey, pending.renderKey);
});

test("stale snapshots cannot reverse a read receipt", () => {
  const read = message(100, { mine: true, unreadCount: 0 });
  const unread = message(100, { mine: true, unreadCount: 1 });
  assert.equal(mergeChatMessages([read], [unread])[0].unreadCount, 0);
  assert.equal(mergeChatMessages([], [unread], 100)[0].unreadCount, 0);
});

test("failed local updates cannot reverse a server confirmation", () => {
  const sent = message(100, { mine: true, clientMessageId: "one" });
  const failed = message("local:one", {
    mine: true,
    clientMessageId: "one",
    status: "FAILED",
  });
  const merged = mergeChatMessages([sent], [failed]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, "SENT");
  assert.equal(merged[0].id, 100);
});

test("confirmed messages are ordered by server ID, pending messages by queue order", () => {
  const local = {
    ...message("local:two", { status: "QUEUED" }),
    localSequence: 2,
  };
  const first = {
    ...message("local:one", { status: "QUEUED" }),
    localSequence: 1,
  };
  assert.deepEqual(
    mergeChatMessages([], [local, message(20), first, message(10)]).map(
      (item) => item.id,
    ),
    [10, 20, "local:one", "local:two"],
  );
});

test("message grouping stops at sender, date, time, or pending boundaries", () => {
  const first = message(1);
  assert.equal(messagesAreGrouped(first, message(2)), true);
  assert.equal(messagesAreGrouped(first, message(2, { mine: true })), false);
  assert.equal(
    messagesAreGrouped(
      first,
      message(2, { createdAt: "2026-10-01T06:06:00Z" }),
    ),
    false,
  );
  assert.equal(
    messagesAreGrouped(first, message(2, { status: "SENDING" })),
    false,
  );
  assert.equal(messagesAreGrouped(first, undefined), false);
});

test("consecutive messages in the same minute share avatars and timestamps", () => {
  const first = message(1, { createdAt: "2026-10-01T06:20:05Z" });
  const last = message(2, { createdAt: "2026-10-01T06:20:59Z" });
  assert.equal(messagesAreGrouped(first, last), true);
  assert.equal(messageTimesAreGrouped(first, last), true);
  assert.equal(messageTimesAreGrouped(last, undefined), false);
});

test("a minute boundary separates both avatars and timestamps", () => {
  const first = message(1, { createdAt: "2026-10-01T06:20:59Z" });
  const next = message(2, { createdAt: "2026-10-01T06:21:00Z" });
  assert.equal(messagesAreGrouped(first, next), false);
  assert.equal(messageTimesAreGrouped(first, next), false);
});

test("timestamps stop grouping at sender, date, or transmission boundaries", () => {
  const first = message(1);
  for (const next of [
    message(2, { mine: true }),
    message(2, { createdAt: "2026-10-02T06:00:00Z" }),
    message(2, { status: "SENDING" }),
    message(2, { status: "FAILED" }),
    message(2, { createdAt: null }),
  ]) {
    assert.equal(messageTimesAreGrouped(first, next), false);
  }
});

test("next draft survives a delayed send response", async () => {
  const entry = activeEntry();
  let resolve;
  const { api } = apiFixture();
  api.sendMessage = () =>
    new Promise((done) => {
      resolve = done;
    });
  updateRoomSession(entry, { draft: "첫 글" });
  enqueueMessages(entry, "첫 글", null, api);
  assert.equal(entry.snapshot.draft, "");
  updateRoomSession(entry, { draft: "다음 글" });
  resolve({ messageId: 101 });
  await settled(entry);
  assert.equal(entry.snapshot.draft, "다음 글");
  assert.equal(entry.snapshot.messages[0].status, "SENT");
});

test("rapid sends preserve request order", async () => {
  const entry = activeEntry();
  const { api, calls } = apiFixture();
  enqueueMessages(entry, "첫 글", null, api);
  enqueueMessages(entry, "다음 글", null, api);
  await settled(entry);
  assert.deepEqual(
    calls.map((call) => call.text),
    ["첫 글", "다음 글"],
  );
  assert.equal(entry.snapshot.messages.length, 2);
});

test("lost response retry reuses the same client ID and creates one server message", async () => {
  const entry = activeEntry();
  const persisted = new Map();
  const ids = [];
  let loseResponse = true;
  const { api } = apiFixture();
  api.sendMessage = async (_room, _text, clientId) => {
    ids.push(clientId);
    if (!persisted.has(clientId)) persisted.set(clientId, { messageId: 101 });
    if (loseResponse) {
      loseResponse = false;
      throw new Error("Response lost");
    }
    return persisted.get(clientId);
  };
  enqueueMessages(entry, "한 번만 저장", null, api);
  await settled(entry);
  assert.equal(entry.snapshot.messages[0].status, "FAILED");
  retryMessage(entry, entry.snapshot.messages[0].clientMessageId, api);
  await settled(entry);
  assert.equal(ids[0], ids[1]);
  assert.equal(persisted.size, 1);
  assert.equal(entry.snapshot.messages.length, 1);
});

test("a socket confirmation wins over a lost HTTP response", async () => {
  const entry = activeEntry();
  const { api } = apiFixture();
  api.sendMessage = async (_room, _text, clientMessageId) => {
    updateRoomSession(entry, (state) => ({
      ...state,
      messages: mergeChatMessages(state.messages, [
        message(101, { mine: true, clientMessageId }),
      ]),
    }));
    throw new Error("Response lost");
  };
  enqueueMessages(entry, "확인됨", null, api);
  await settled(entry);
  assert.equal(entry.snapshot.messages[0].status, "SENT");
  assert.equal(entry.batches.length, 0);
});

test("photo success followed by text failure retries text only", async () => {
  const entry = activeEntry();
  const { api, calls } = apiFixture();
  const sendText = api.sendMessage;
  let fail = true;
  api.sendMessage = async (...args) => {
    if (fail) {
      fail = false;
      calls.push({ kind: "text-failed", clientMessageId: args[2] });
      throw new Error("Network");
    }
    return sendText(...args);
  };
  enqueueMessages(
    entry,
    "설명",
    { file: new Blob(["photo"]), previewUrl: "blob:test" },
    api,
  );
  await settled(entry);
  const failed = entry.snapshot.messages.find(
    (item) => item.status === "FAILED",
  );
  retryMessage(entry, failed.clientMessageId, api);
  await settled(entry);
  assert.equal(calls.filter((call) => call.kind === "upload").length, 1);
  assert.equal(calls.filter((call) => call.kind === "image").length, 1);
  assert.equal(
    calls.find((call) => call.kind === "text-failed").clientMessageId,
    calls.find((call) => call.kind === "text").clientMessageId,
  );
  assert.ok(entry.snapshot.messages.every((item) => item.status === "SENT"));
});

test("failed photo blocks its paired text and retry keeps the image ID", async () => {
  const entry = activeEntry();
  const { api, calls } = apiFixture();
  const sendImage = api.sendImageMessage;
  let fail = true;
  api.sendImageMessage = async (...args) => {
    if (fail) {
      fail = false;
      calls.push({ kind: "image-failed", clientMessageId: args[2] });
      throw new Error("Response lost");
    }
    return sendImage(...args);
  };
  enqueueMessages(
    entry,
    "설명",
    { file: new Blob(["photo"]), previewUrl: "blob:test" },
    api,
  );
  await settled(entry);
  assert.equal(calls.filter((call) => call.kind === "text").length, 0);
  retryMessage(entry, entry.snapshot.messages[1].clientMessageId, api);
  await settled(entry);
  assert.equal(calls.filter((call) => call.kind === "upload").length, 1);
  assert.equal(
    calls.find((call) => call.kind === "image-failed").clientMessageId,
    calls.find((call) => call.kind === "image").clientMessageId,
  );
  assert.deepEqual(
    calls.slice(-2).map((call) => call.kind),
    ["image", "text"],
  );
});

test("pending transmission completes even after navigating away", async () => {
  const entry = activeEntry();
  const { api } = apiFixture();
  enqueueMessages(entry, "전송", null, api);
  await settled(entry);
  assert.equal(getRoomSession(7).snapshot.messages[0].status, "SENT");
});

test("room closure stops later queued transmissions and retains the next draft", async () => {
  const entry = activeEntry();
  const { api, calls } = apiFixture();
  api.sendMessage = async () => {
    calls.push({ kind: "text" });
    const error = new Error("Ended");
    error.code = "CHAT_ROOM_NOT_ACTIVE";
    throw error;
  };
  enqueueMessages(entry, "첫 글", null, api);
  enqueueMessages(entry, "다음 글", null, api);
  updateRoomSession(entry, { draft: "작성 중" });
  await settled(entry);
  assert.equal(calls.length, 1);
  assert.equal(entry.snapshot.room.status, "ENDED");
  assert.equal(entry.snapshot.draft, "작성 중");
  assert.ok(entry.snapshot.messages.every((item) => item.status === "FAILED"));
});

test("logout clears cache and prevents an upload from sending under another account", async () => {
  const entry = activeEntry();
  let resolve;
  const { api, calls } = apiFixture();
  api.uploadChatImage = () =>
    new Promise((done) => {
      resolve = done;
    });
  enqueueMessages(
    entry,
    "",
    { file: new Blob(["photo"]), previewUrl: "blob:test" },
    api,
  );
  clearAccessToken();
  setAccessToken(token("member-2"));
  resolve({ fileId: 25 });
  await settled(entry);
  assert.equal(entry.active, false);
  assert.equal(calls.length, 0);
  assert.equal(getRoomSession(7).snapshot.messages.length, 0);
});

test("refreshing a token for the same account preserves a draft", () => {
  const entry = activeEntry();
  updateRoomSession(entry, { draft: "보존할 글" });
  setAccessToken(token("member-1", "refreshed"));
  assert.equal(getRoomSession(7).snapshot.draft, "보존할 글");
});

test("temporarily clearing a token during refresh preserves the session cache", () => {
  const entry = activeEntry();
  updateRoomSession(entry, { draft: "갱신 중에도 보존" });
  clearAccessToken({ preserveSession: true });
  assert.equal(getRoomSession(7), entry);
  assert.equal(entry.active, true);
  setAccessToken(token("member-1", "refreshed"));
  assert.equal(getRoomSession(7).snapshot.draft, "갱신 중에도 보존");
});

test("account change clears another account's draft", () => {
  const previous = activeEntry();
  updateRoomSession(previous, { draft: "다른 계정의 글" });
  setAccessToken(token("member-2"));
  assert.equal(previous.active, false);
  assert.equal(getRoomSession(7).snapshot.draft, "");
});

test("reconnect fills a forty-message gap using backward cursors", async () => {
  const calls = [];
  const fetchPage = async (_room, { cursor }) => {
    calls.push(cursor);
    return cursor
      ? cursor === 121
        ? page(101, 120)
        : page(81, 100)
      : page(121, 140);
  };
  const pages = await fetchMessageGap(7, 100, undefined, fetchPage);
  assert.deepEqual(calls, [undefined, 121, 101]);
  const entry = activeEntry();
  applyMessagePage(entry, [page(81, 100)]);
  applyMessagePage(entry, pages);
  assert.deepEqual(
    entry.snapshot.messages.map((item) => item.id),
    Array.from({ length: 60 }, (_, index) => 81 + index),
  );
});

test("first entry requests only the latest page", async () => {
  let calls = 0;
  const pages = await fetchMessageGap(7, 0, undefined, async () => {
    calls += 1;
    return page(81, 100);
  });
  assert.equal(calls, 1);
  assert.equal(pages.length, 1);
});

test("repeated pagination cursors fail instead of looping forever", async () => {
  await assert.rejects(
    fetchMessageGap(7, 10, undefined, async () => page(81, 100)),
    /Repeated message cursor/,
  );
});

test("latest synchronization retains the cursor for already-loaded older history", () => {
  const entry = activeEntry();
  applyMessagePage(entry, [page(81, 100)]);
  applyMessagePage(entry, [page(61, 80)]);
  applyMessagePage(entry, [page(101, 120)]);
  assert.equal(entry.snapshot.pageInfo.nextCursor, 61);
  assert.equal(entry.snapshot.messages.length, 60);
});

function unreadFixture(count, first = 1, last = 4) {
  const current = { count, first, last };
  const calls = [];
  return {
    current,
    calls,
    fetchRooms: async () => ({
      items: [
        {
          chatRoomId: 7,
          unreadCount: current.count,
          activityAt: String(current.last),
        },
      ],
    }),
    fetchMessages: async (_room, { cursor, size }) => {
      calls.push(cursor || null);
      const end = cursor
        ? Math.min(current.last, Number(cursor) - 1)
        : current.last;
      const start = Math.max(current.first, end - size + 1);
      return page(start, end, start > current.first);
    },
  };
}

test("entry boundary counts incoming messages only, ignoring my read badges", () => {
  const latest = page(1, 4, false).messages;
  latest[1].mine = true;
  latest.forEach((item) => {
    item.unreadCount = 0;
  });
  assert.equal(unreadBoundary(latest, 2), 3);
  assert.equal(unreadBoundary(latest, 0), null);
  assert.equal(unreadBoundary(latest, 4), null);
});

test("a cached room reopens without its old divider once the server says read", async () => {
  const fixture = unreadFixture(1);
  const firstVisit = await loadChatVisit(7, fixture);
  assert.equal(firstVisit.unreadBoundaryId, 4);
  const entry = activeEntry();
  applyMessagePage(entry, firstVisit.pages);
  updateRoomSession(entry, { readCursor: firstVisit.readThroughId });
  fixture.current.count = 0;
  const secondVisit = await loadChatVisit(7, fixture);
  assert.equal(secondVisit.unreadBoundaryId, null);
  assert.equal(firstVisit.unreadBoundaryId, 4);
  assert.equal(entry.snapshot.unreadBoundaryId, undefined);
});

test("new unread messages after leaving replace the previous entry boundary", async () => {
  const fixture = unreadFixture(2);
  const first = await loadChatVisit(7, fixture);
  fixture.current.count = 0;
  assert.equal((await loadChatVisit(7, fixture)).unreadBoundaryId, null);
  fixture.current.last = 6;
  fixture.current.count = 2;
  const third = await loadChatVisit(7, fixture);
  assert.equal(first.unreadBoundaryId, 3);
  assert.equal(third.unreadBoundaryId, 5);
  assert.equal(third.readThroughId, 6);
});

test("socket arrivals and older cached pages cannot move the current visit divider", async () => {
  const fixture = unreadFixture(2, 81, 100);
  const visit = await loadChatVisit(7, fixture);
  const entry = activeEntry();
  applyMessagePage(entry, visit.pages);
  updateRoomSession(entry, (state) => ({
    ...state,
    messages: mergeChatMessages(state.messages, [message(101)]),
  }));
  applyMessagePage(entry, [page(61, 80)]);
  assert.equal(visit.unreadBoundaryId, 99);
  assert.equal(visit.readThroughId, 100);
  assert.equal(entry.snapshot.messages.at(-1).id, 101);
});

test("entry loads older pages until the oldest of 25 unread messages is available", async () => {
  const fixture = unreadFixture(25, 1, 55);
  const visit = await loadChatVisit(7, fixture);
  assert.equal(visit.unreadBoundaryId, 31);
  assert.deepEqual(fixture.calls, [null, 36]);
});

test("an unread page boundary includes preceding read messages for context", async () => {
  const fixture = unreadFixture(20, 1, 55);
  const visit = await loadChatVisit(7, fixture);
  assert.equal(visit.unreadBoundaryId, 36);
  assert.equal(visit.pages.length, 2);
  assert.ok(visit.pages[1].messages.some((item) => item.messageId < 36));
});

test("read rooms load only the latest page even with extensive cached history", async () => {
  const fixture = unreadFixture(0, 1, 100);
  const visit = await loadChatVisit(7, fixture);
  assert.equal(visit.unreadBoundaryId, null);
  assert.equal(visit.readThroughId, 100);
  assert.deepEqual(fixture.calls, [null]);
});

test("failed unread lookup rejects instead of displaying an old cached divider", async () => {
  const fixture = unreadFixture(1);
  const first = await loadChatVisit(7, fixture);
  fixture.fetchRooms = async () => {
    throw new Error("network unavailable");
  };
  await assert.rejects(loadChatVisit(7, fixture), /network unavailable/);
  assert.equal(first.unreadBoundaryId, 4);
});

test("a room missing from the server list is an error rather than zero unread", async () => {
  const fixture = unreadFixture(1);
  fixture.fetchRooms = async () => ({
    items: [],
    pageInfo: { hasNext: false },
  });
  await assert.rejects(loadChatVisit(7, fixture), {
    code: "CHAT_ROOM_NOT_FOUND",
  });
});

test("unread lookup follows room pagination and rejects repeated room cursors", async () => {
  const fixture = unreadFixture(1);
  const original = fixture.fetchRooms;
  fixture.fetchRooms = async ({ cursor }) =>
    cursor
      ? original()
      : { items: [], pageInfo: { hasNext: true, nextCursor: "next" } };
  assert.equal((await loadChatVisit(7, fixture)).unreadBoundaryId, 4);
  fixture.fetchRooms = async () => ({
    items: [],
    pageInfo: { hasNext: true, nextCursor: "next" },
  });
  await assert.rejects(loadChatVisit(7, fixture), /Repeated room cursor/);
});

test("an arrival during snapshot loading retries before choosing the entry boundary", async () => {
  const fixture = unreadFixture(1);
  const fetchMessages = fixture.fetchMessages;
  let arrive = true;
  fixture.fetchMessages = async (...args) => {
    const result = await fetchMessages(...args);
    if (arrive) {
      fixture.current.last = 5;
      fixture.current.count = 2;
      arrive = false;
    }
    return result;
  };
  const visit = await loadChatVisit(7, fixture);
  assert.equal(visit.unreadBoundaryId, 4);
  assert.equal(visit.readThroughId, 5);
  assert.deepEqual(fixture.calls, [null, null]);
});

test("a cancelled entry cannot complete with a stale boundary", async () => {
  const fixture = unreadFixture(1);
  const controller = new AbortController();
  const original = fixture.fetchMessages;
  fixture.fetchMessages = async (...args) => {
    const result = await original(...args);
    controller.abort();
    return result;
  };
  await assert.rejects(
    loadChatVisit(7, { ...fixture, signal: controller.signal }),
    { name: "AbortError" },
  );
});

test("rapidly changing entry snapshots fail after bounded retries", async () => {
  const fixture = unreadFixture(1);
  const original = fixture.fetchMessages;
  fixture.fetchMessages = async (...args) => {
    const result = await original(...args);
    fixture.current.last += 1;
    return result;
  };
  await assert.rejects(loadChatVisit(7, fixture), /Unread state changed/);
  assert.equal(fixture.calls.length, 3);
});

test("repeated unread history cursors fail instead of looping", async () => {
  const fixture = unreadFixture(100, 1, 100);
  fixture.fetchMessages = async () => page(81, 100, true);
  await assert.rejects(loadChatVisit(7, fixture), /Repeated message cursor/);
});

test("message metadata permits entry without a room-list lookup", () => {
  const entry = getRoomSession(7);
  applyMessagePage(entry, [page(81, 100)]);
  assert.equal(entry.snapshot.loaded, true);
  assert.equal(entry.snapshot.room.name, "테스트");
  assert.equal(entry.snapshot.room.memberId, 2);
});

test("a late active-room response cannot reopen an ended conversation", () => {
  const entry = activeEntry();
  updateRoomSession(entry, {
    room: { ...entry.snapshot.room, status: "ENDED" },
  });
  applyMessagePage(entry, [page(81, 100)]);
  assert.equal(entry.snapshot.room.status, "ENDED");
});
