import {
  mapChatMessage,
  mapChatRoom,
  mergeChatMessages,
  normalizePageInfo,
  serverMessageId,
} from "./model.js";
import { updateRoomSession } from "./session.js";

export function applyMessagePage(entry, pages) {
  updateRoomSession(entry, (state) => {
    const incoming = pages.flatMap((page) =>
      (page.messages || []).map(mapChatMessage),
    );
    const existingIds = state.messages.map(serverMessageId).filter(Boolean);
    const incomingIds = incoming.map(serverMessageId).filter(Boolean);
    const extendsHistory =
      !state.loaded ||
      (incomingIds.length &&
        Math.min(...incomingIds) <= Math.min(...existingIds));
    const info = pages[0]?.chatRoom;
    const room = info
      ? {
          ...mapChatRoom(info),
          unread: state.room?.unread ?? 0,
          status: state.room?.status === "ENDED" ? "ENDED" : info.status,
          image:
            info.otherParticipant?.profileImageUrl || state.room?.image || "",
        }
      : state.room;
    const otherReadCursor = Math.max(
      state.otherReadCursor,
      ...incoming
        .filter((message) => message.mine && message.unreadCount === 0)
        .map(serverMessageId),
    );
    const messages = mergeChatMessages(
      state.messages,
      incoming,
      otherReadCursor,
    );
    return {
      ...state,
      room,
      loaded: true,
      otherReadCursor,
      messages,
      pageInfo: extendsHistory
        ? normalizePageInfo(pages[pages.length - 1]?.pageInfo)
        : state.pageInfo,
    };
  });
}

// The API paginates backwards. Walk to the last complete snapshot, not just the
// most recent socket event, which could itself have arrived after a gap.
export async function fetchMessageGap(roomId, boundary, signal, fetchPage) {
  const pages = [];
  const cursors = new Set();
  let cursor;
  while (true) {
    const page = await fetchPage(roomId, { cursor, size: 20, signal });
    pages.push(page);
    const ids = (page.messages || [])
      .map((message) => Number(message.messageId))
      .filter((id) => Number.isSafeInteger(id) && id > 0);
    const info = normalizePageInfo(page.pageInfo);
    if (
      !boundary ||
      !info.hasNext ||
      (ids.length && Math.min(...ids) <= boundary)
    )
      return pages;
    if (cursors.has(String(info.nextCursor)))
      throw new Error("Repeated message cursor");
    cursors.add(String(info.nextCursor));
    cursor = info.nextCursor;
  }
}
