import { useCallback, useEffect, useRef, useState } from "react";
import { asset } from "../../shared/assets.js";
import { BrandHeader, PixelButton } from "../../shared/ui/components.jsx";
import * as chatApi from "./api.js";
import {
  applyRoomMessageEvent,
  chatListErrorMessage,
  mapChatRoom,
  parseChatDate,
  sortChatRooms,
} from "./model.js";
import { rememberRoom } from "./session.js";
import { connectChatSocket } from "./socket.js";

export { ChatRoom } from "./ChatRoom.jsx";
export { MessageBubble } from "./MessageBubble.jsx";
export {
  chatDateKey,
  formatChatActivity,
  formatChatMessageTime,
  mapChatMessage,
  mergeChatMessages,
  parseChatDate,
} from "./model.js";

export function ChatList({ navigate }) {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nextCursor, setNextCursor] = useState(null);
  const [hasNext, setHasNext] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState(false);
  const mainRef = useRef(null);
  const sentinelRef = useRef(null);
  const pagingRef = useRef(false);
  const roomRequestRef = useRef(0);
  const roomEventSequenceRef = useRef(0);
  const roomEventsRef = useRef([]);
  const seenMessageIdsRef = useRef(new Set());
  const roomsLoadedRef = useRef(false);

  const loadRooms = useCallback(async ({ silent = false } = {}) => {
    const requestId = roomRequestRef.current + 1;
    roomRequestRef.current = requestId;
    const eventSequenceAtStart = roomEventSequenceRef.current;
    if (!silent) setLoading(true);
    setError("");
    setPageError(false);
    if (!silent) {
      setNextCursor(null);
      setHasNext(false);
    }
    try {
      const page = await chatApi.rooms({ size: 20 });
      if (requestId !== roomRequestRef.current) return;
      const refreshedRooms = (page?.items || []).map(mapChatRoom);
      const eventsSinceRequest = roomEventsRef.current.filter(
        (entry) => entry.sequence > eventSequenceAtStart,
      );
      for (const { event } of eventsSinceRequest) {
        const roomIndex = refreshedRooms.findIndex(
          (room) => String(room.id) === String(event.chatRoomId),
        );
        if (roomIndex < 0) continue;
        const eventTimestamp = parseChatDate(event.createdAt)?.getTime() || 0;
        if (
          eventTimestamp > refreshedRooms[roomIndex].syncedActivityTimestamp
        ) {
          refreshedRooms[roomIndex] = applyRoomMessageEvent(
            refreshedRooms[roomIndex],
            event,
          );
        }
      }

      setRooms((current) => {
        const currentById = new Map(
          current.map((room) => [String(room.id), room]),
        );
        const merged = refreshedRooms.map((room) => {
          const localRoom = currentById.get(String(room.id));
          if (
            localRoom &&
            localRoom.activityTimestamp > room.activityTimestamp
          ) {
            return {
              ...room,
              ...localRoom,
              syncedActivityTimestamp: room.syncedActivityTimestamp,
            };
          }
          return room;
        });
        if (silent) {
          const refreshedIds = new Set(
            refreshedRooms.map((room) => String(room.id)),
          );
          merged.push(
            ...current.filter((room) => !refreshedIds.has(String(room.id))),
          );
        }
        return sortChatRooms(merged);
      });

      setNextCursor(page?.pageInfo?.nextCursor || null);
      setHasNext(Boolean(page?.pageInfo?.hasNext));
      roomsLoadedRef.current = true;
      roomEventsRef.current = roomEventsRef.current.filter(
        (entry) => entry.sequence > roomEventSequenceRef.current,
      );
    } catch (requestError) {
      if (requestId === roomRequestRef.current && !silent)
        setError(chatListErrorMessage(requestError));
    } finally {
      if (requestId === roomRequestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRooms();
    return () => {
      roomRequestRef.current += 1;
    };
  }, [loadRooms]);

  useEffect(() => {
    let active = true;
    const disconnect = connectChatSocket({
      onMessage: (event) => {
        if (!active || !event?.chatRoomId || !event?.messageId) return;
        const eventKey = `${event.chatRoomId}:${event.messageId}`;
        if (seenMessageIdsRef.current.has(eventKey)) return;
        seenMessageIdsRef.current.add(eventKey);
        if (seenMessageIdsRef.current.size > 1000) {
          const oldest = seenMessageIdsRef.current.values().next().value;
          seenMessageIdsRef.current.delete(oldest);
        }

        const sequence = roomEventSequenceRef.current + 1;
        roomEventSequenceRef.current = sequence;
        roomEventsRef.current.push({ sequence, event });
        if (roomEventsRef.current.length > 500) roomEventsRef.current.shift();

        setRooms((current) => {
          const roomIndex = current.findIndex(
            (room) => String(room.id) === String(event.chatRoomId),
          );
          if (roomIndex < 0) return current;
          const updated = [...current];
          updated[roomIndex] = applyRoomMessageEvent(updated[roomIndex], event);
          return sortChatRooms(updated);
        });
      },
      onConnected: () => {
        if (active) void loadRooms({ silent: roomsLoadedRef.current });
      },
    });
    return () => {
      active = false;
      disconnect();
    };
  }, [loadRooms]);

  const loadNextPage = useCallback(async () => {
    if (!hasNext || !nextCursor || loadingMore || pagingRef.current) return;
    pagingRef.current = true;
    setLoadingMore(true);
    setPageError(false);
    try {
      const page = await chatApi.rooms({ cursor: nextCursor, size: 20 });
      setRooms((current) => [
        ...current,
        ...(page?.items || []).map(mapChatRoom),
      ]);
      setNextCursor(page?.pageInfo?.nextCursor || null);
      setHasNext(Boolean(page?.pageInfo?.hasNext));
    } catch {
      setPageError(true);
    } finally {
      pagingRef.current = false;
      setLoadingMore(false);
    }
  }, [hasNext, loadingMore, nextCursor]);

  useEffect(() => {
    const main = mainRef.current;
    const sentinel = sentinelRef.current;
    if (
      !main ||
      !sentinel ||
      !hasNext ||
      loadingMore ||
      pageError ||
      typeof IntersectionObserver === "undefined"
    )
      return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadNextPage();
      },
      { root: main, rootMargin: "120px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNext, loadNextPage, loadingMore, pageError]);

  function openRoom(room) {
    rememberRoom(room);
    navigate(`/chats/${room.id}`);
  }

  return (
    <>
      <BrandHeader navigate={navigate} />
      <main ref={mainRef} className="main-scroll chat-list-main">
        {loading ? (
          <div className="chat-list-loading" role="status">
            채팅 목록을 불러오고 있어요.
          </div>
        ) : error ? (
          <div className="chat-list-error" role="alert">
            <p>{error}</p>
            {error.includes("로그인") ? (
              <PixelButton onClick={() => navigate("/login")}>
                로그인하기
              </PixelButton>
            ) : (
              <PixelButton onClick={loadRooms}>다시 시도</PixelButton>
            )}
          </div>
        ) : rooms.length ? (
          <>
            <div className="chat-list-items">
              {rooms.map((room) => (
                <button
                  type="button"
                  key={room.id}
                  className="chat-list-item"
                  onClick={() => openRoom(room)}
                  aria-label={`${room.name}, ${room.last}, ${room.time}`}
                >
                  <img
                    className={`chat-room-avatar ${room.image ? "has-photo" : ""}`}
                    src={room.image || asset("chat-avatar-heart-terminal.svg")}
                    alt=""
                  />
                  <span className="chat-room-copy">
                    <span className="chat-room-name">
                      <strong>{room.name}</strong>
                      {room.chatNotification === false && (
                        <img
                          className="chat-notification-muted"
                          src={asset("chat-notification-muted.svg")}
                          alt="알림 끔"
                        />
                      )}
                    </span>
                    <small>{room.last}</small>
                  </span>
                  <span className="chat-room-meta">
                    {room.time && <small>{room.time}</small>}
                    {room.unread > 0 && (
                      <b
                        role="status"
                        aria-label={`읽지 않은 메시지 ${room.unread}개`}
                      >
                        {room.unread > 99 ? "99+" : room.unread}
                      </b>
                    )}
                  </span>
                </button>
              ))}
            </div>
            {hasNext && (
              <div ref={sentinelRef} className="chat-list-pagination">
                {loadingMore && (
                  <small role="status">이전 대화를 불러오는 중…</small>
                )}
                {pageError && (
                  <PixelButton quiet onClick={loadNextPage}>
                    이전 대화 다시 불러오기
                  </PixelButton>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="chat-empty-state">
            <img
              className="chat-empty-illustration"
              src={asset("illust/chat.svg")}
              alt=""
            />
            <strong>
              좋아요를 수락하면
              <br />
              여기서 대화할 수 있어요
            </strong>
            <PixelButton
              className="empty-action pink"
              onClick={() => navigate("/likes")}
            >
              받은 좋아요 보기
            </PixelButton>
          </div>
        )}
      </main>
    </>
  );
}
