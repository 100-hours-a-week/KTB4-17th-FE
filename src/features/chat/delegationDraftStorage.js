import {
  AUTH_SESSION_CLEARED_EVENT,
  getAuthSessionSubject,
} from "../../shared/api/authToken.js";
import { positiveDelegationId } from "./delegation.js";

const PREFIX = "pocket-signal:chat-delegation-draft:";

function storageKey(chatRoomId) {
  const owner = getAuthSessionSubject();
  const roomId = positiveDelegationId(chatRoomId);
  return owner && roomId ? `${PREFIX}${owner}:${roomId}` : null;
}

export function loadDelegationDraft(chatRoomId, delegationId) {
  const key = storageKey(chatRoomId);
  if (!key) return null;
  try {
    const value = JSON.parse(window.sessionStorage.getItem(key) || "null");
    if (
      positiveDelegationId(value?.chatRoomId) !==
        positiveDelegationId(chatRoomId) ||
      positiveDelegationId(value?.delegationId) !==
        positiveDelegationId(delegationId) ||
      typeof value?.draftId !== "string" ||
      !Array.isArray(value?.turns)
    )
      return null;
    return value;
  } catch {
    return null;
  }
}

export function saveDelegationDraft(chatRoomId, draft, endType) {
  const key = storageKey(chatRoomId);
  if (!key) return;
  const value = {
    chatRoomId: positiveDelegationId(chatRoomId),
    delegationId: positiveDelegationId(draft?.delegationId),
    endType,
    draftId: draft?.draftId,
    turns: Array.isArray(draft?.turns) ? draft.turns : [],
  };
  if (!value.delegationId || typeof value.draftId !== "string") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function clearDelegationDraft(chatRoomId) {
  const key = storageKey(chatRoomId);
  if (!key) return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {}
}

function clearAllDelegationDrafts() {
  try {
    const keys = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) window.sessionStorage.removeItem(key);
  } catch {}
}

if (typeof window !== "undefined")
  window.addEventListener(AUTH_SESSION_CLEARED_EVENT, clearAllDelegationDrafts);
