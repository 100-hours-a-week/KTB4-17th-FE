import { markAsRead, notifications } from "./api.js";

export const emptyUnreadCategories = () => ({
  ALL: false,
  INTEREST: false,
  CHAT: false,
  SYSTEM: false,
});

export function notificationCategory(type) {
  if (type === "LIKE" || type === "MATCH") return "INTEREST";
  if (type === "CHAT_MESSAGE") return "CHAT";
  return "SYSTEM";
}

function assertActive(signal, isCurrent = () => true) {
  if (signal?.aborted || !isCurrent())
    throw new DOMException("Aborted", "AbortError");
}

// The API has no unread-by-category or target filter. Walk cursors so older
// unread records cannot disappear behind the first twenty read records.
async function visitPages(category, { signal, fetchPage, isCurrent }, visit) {
  let cursor;
  const seen = new Set();
  while (true) {
    assertActive(signal, isCurrent);
    const page = await fetchPage(category, { cursor, signal });
    assertActive(signal, isCurrent);
    if ((await visit(page.items || [])) === false) return;
    if (!page.pageInfo?.hasNext) return;
    const next = page.pageInfo.nextCursor;
    if (!next || seen.has(String(next)))
      throw new Error("Repeated notification cursor");
    seen.add(String(next));
    cursor = next;
  }
}

export async function loadUnreadCategories({
  signal,
  fetchPage = notifications,
  isCurrent,
} = {}) {
  const flags = emptyUnreadCategories();
  await visitPages("ALL", { signal, fetchPage, isCurrent }, (items) => {
    for (const item of items) {
      if (!item.readAt) {
        flags.ALL = true;
        flags[notificationCategory(item.type)] = true;
      }
    }
    // Once every category has a dot, older pages cannot change the result.
    return !(flags.INTEREST && flags.CHAT && flags.SYSTEM);
  });
  return flags;
}

export async function readRoomMatchNotifications(
  roomId,
  {
    signal,
    fetchPage = notifications,
    readNotification = markAsRead,
    onRead = () => {},
    isCurrent,
  } = {},
) {
  const seen = new Set();
  await visitPages(
    "INTEREST",
    { signal, fetchPage, isCurrent },
    async (items) => {
      for (const item of items) {
        const id = String(item.notificationId);
        if (
          item.type !== "MATCH" ||
          item.readAt ||
          item.targetType !== "CHAT_ROOM" ||
          String(item.targetId) !== String(roomId) ||
          seen.has(id)
        )
          continue;
        assertActive(signal, isCurrent);
        seen.add(id);
        await readNotification(item.notificationId, { signal });
        onRead(item);
      }
    },
  );
}
