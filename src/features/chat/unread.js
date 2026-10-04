function abortIfNeeded(signal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

export function unreadBoundary(messages, count) {
  if (!Number.isSafeInteger(count) || count <= 0) return null;
  const incoming = [
    ...new Map(
      messages
        .filter((message) => !message.mine && Number(message.messageId) > 0)
        .map((message) => [Number(message.messageId), message]),
    ).keys(),
  ].sort((left, right) => left - right);
  return incoming.length >= count ? incoming[incoming.length - count] : null;
}

async function roomSnapshot(roomId, fetchRooms, signal) {
  const cursors = new Set();
  let cursor;
  while (true) {
    abortIfNeeded(signal);
    const page = await fetchRooms({ cursor, size: 20, signal });
    const room = (page.items || []).find(
      (item) => Number(item.chatRoomId) === roomId,
    );
    if (room) {
      const count = Number(room.unreadCount);
      if (!Number.isSafeInteger(count) || count < 0)
        throw new Error("Invalid unread count");
      return {
        count,
        stamp: JSON.stringify([count, room.activityAt, room.preview]),
      };
    }
    const next = page.pageInfo?.nextCursor;
    if (!page.pageInfo?.hasNext || !next) {
      const error = new Error("Chat room not found");
      error.code = "CHAT_ROOM_NOT_FOUND";
      throw error;
    }
    if (cursors.has(String(next))) throw new Error("Repeated room cursor");
    cursors.add(String(next));
    cursor = next;
  }
}

// Only fresh HTTP pages participate in the entry boundary. Cached history and
// socket arrivals are merged afterwards and cannot move this visit's divider.
export async function loadChatVisit(
  roomId,
  { fetchRooms, fetchMessages, signal },
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = await roomSnapshot(roomId, fetchRooms, signal);
    const latest = await fetchMessages(roomId, { size: 20, signal });
    const after = await roomSnapshot(roomId, fetchRooms, signal);
    abortIfNeeded(signal);
    if (before.stamp !== after.stamp) continue;

    const pages = [latest];
    const cursors = new Set();
    let boundary = null;
    while (after.count > 0) {
      const messages = pages.flatMap((page) => page.messages || []);
      boundary = unreadBoundary(messages, after.count);
      const oldestId = Math.min(
        ...messages.map((message) => Number(message.messageId)),
      );
      const info = pages[pages.length - 1].pageInfo;
      if (boundary && (boundary > oldestId || !info?.hasNext)) break;
      if (!info?.hasNext || !info.nextCursor) break;
      const cursor = String(info.nextCursor);
      if (cursors.has(cursor)) throw new Error("Repeated message cursor");
      cursors.add(cursor);
      pages.push(
        await fetchMessages(roomId, {
          cursor: info.nextCursor,
          size: 20,
          signal,
        }),
      );
      abortIfNeeded(signal);
    }
    if (after.count > 0 && !boundary) continue;
    return {
      pages,
      unreadCount: after.count,
      unreadBoundaryId: boundary,
      readThroughId: Math.max(
        0,
        ...(latest.messages || []).map(
          (message) => Number(message.messageId) || 0,
        ),
      ),
    };
  }
  throw new Error("Unread state changed while opening the chat room");
}
