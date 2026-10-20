import {
  AUTH_SESSION_CLEARED_EVENT,
  getAuthSessionSubject,
} from "../../shared/api/authToken.js";

const sessions = new Map();
let owner = null;
const MAX_CACHED_ROOMS = 20;

export function chatSessionOwner() {
  return getAuthSessionSubject();
}

export function clearChatSessions() {
  for (const entry of sessions.values()) {
    entry.active = false;
    for (const url of entry.urls) URL.revokeObjectURL(url);
    entry.listeners.clear();
  }
  sessions.clear();
  owner = null;
}

if (typeof window !== "undefined") {
  window.addEventListener(AUTH_SESSION_CLEARED_EVENT, clearChatSessions);
}

export function getRoomSession(roomId) {
  const currentOwner = chatSessionOwner();
  if (owner !== currentOwner) {
    clearChatSessions();
    owner = currentOwner;
  }
  const key = String(roomId);
  if (sessions.has(key)) {
    const cached = sessions.get(key);
    sessions.delete(key);
    sessions.set(key, cached);
    return cached;
  }
  for (const [cachedKey, cached] of sessions) {
    if (sessions.size < MAX_CACHED_ROOMS) break;
    if (
      cached.listeners.size ||
      cached.running ||
      cached.batches.some((batch) => !batch.complete)
    )
      continue;
    cached.active = false;
    for (const url of cached.urls) URL.revokeObjectURL(url);
    sessions.delete(cachedKey);
  }
  const entry = {
    roomId,
    owner: currentOwner,
    active: true,
    listeners: new Set(),
    urls: new Set(),
    batches: [],
    running: false,
    sequence: 0,
    snapshot: {
      room: null,
      messages: [],
      loaded: false,
      pageInfo: { hasNext: false, nextCursor: null },
      lastSyncedId: 0,
      otherReadCursor: 0,
      readCursor: 0,
      draft: "",
      attachment: null,
      scroll: null,
    },
  };
  sessions.set(key, entry);
  return entry;
}

export function isSessionActive(entry) {
  return entry.active && entry.owner === chatSessionOwner();
}

export function updateRoomSession(entry, updater) {
  if (!isSessionActive(entry)) return;
  const snapshot =
    typeof updater === "function"
      ? updater(entry.snapshot)
      : { ...entry.snapshot, ...updater };
  if (snapshot === entry.snapshot) return;
  entry.snapshot = snapshot;
  for (const listener of entry.listeners) listener();
}

export function reuserRoom(room) {
  const entry = getRoomSession(room.id);
  updateRoomSession(entry, { room });
}

export function releasePreview(entry, url) {
  if (!url || !entry.urls.delete(url)) return;
  URL.revokeObjectURL(url);
}

export function discardRoomSession(entry) {
  if (!entry || sessions.get(String(entry.roomId)) !== entry) return;
  entry.active = false;
  for (const url of entry.urls) URL.revokeObjectURL(url);
  entry.urls.clear();
  for (const batch of entry.batches) {
    batch.requested = false;
    for (const task of batch.tasks) task.file = null;
  }
  entry.batches = [];
  entry.listeners.clear();
  sessions.delete(String(entry.roomId));
}

export function endRoomAfterBlock(entry) {
  releasePreview(entry, entry.snapshot.attachment?.previewUrl);
  updateRoomSession(entry, (current) => ({
    ...current,
    attachment: null,
    room: current.room
      ? { ...current.room, status: "ENDED", blockedByMe: true }
      : null,
  }));
}

export function canUseAiForRoom(room, pending = false) {
  const userId = Number(room?.userId);
  return (
    !pending &&
    room?.status === "ACTIVE" &&
    !room?.blockedByMe &&
    Number.isSafeInteger(userId) &&
    userId > 0
  );
}
