import { useCallback, useEffect, useRef, useState } from "react";
import { asset } from "../../shared/assets.js";
import {
  BrandHeader,
  EmptyState,
  Icon,
  PixelButton,
  ScreenHeader,
} from "../../shared/ui/components.jsx";
import * as chatApi from "./api.js";
import { connectChatSocket } from "./socket.js";

const CHAT_TIME_ZONE = "Asia/Seoul";
const CHAT_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const CHAT_CLOCK_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: CHAT_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h12",
});
const CHAT_DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: CHAT_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});
const CHAT_ACTIVITY_DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: CHAT_TIME_ZONE,
  month: "numeric",
  day: "numeric",
});
const CHAT_DATE_PARTS_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: CHAT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function formatChatActivity(value) {
  const date = parseChatDate(value);
  if (!date) return "";

  const dateKey = chatDateKey(date);
  const todayKey = chatDateKey(new Date());
  if (dateKey === todayKey) return CHAT_CLOCK_FORMATTER.format(date);

  const [year, month, day] = todayKey.split("-").map(Number);
  const yesterday = new Date(Date.UTC(year, month - 1, day - 1));
  if (dateKey === yesterday.toISOString().slice(0, 10)) return "어제";

  return dateKey.startsWith(`${todayKey.slice(0, 4)}-`)
    ? CHAT_ACTIVITY_DATE_FORMATTER.format(date)
    : CHAT_DATE_FORMATTER.format(date);
}

export function formatChatMessageTime(value) {
  const date = parseChatDate(value);
  return date ? CHAT_CLOCK_FORMATTER.format(date) : "";
}

export function parseChatDate(value) {
  if (!value) return null;

  const source = String(value).trim();
  const localDateTime = source.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?$/,
  );
  let date;
  if (localDateTime) {
    const [
      ,
      year,
      month,
      day,
      hour = "0",
      minute = "0",
      second = "0",
      fraction = "",
    ] = localDateTime;
    const milliseconds = Number(`${fraction}000`.slice(0, 3));
    date = new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour) - 9,
        Number(minute),
        Number(second),
        milliseconds,
      ),
    );
  } else {
    date = new Date(source);
  }

  return Number.isNaN(date.getTime()) ? null : date;
}

export function chatDateKey(date) {
  const parts = Object.fromEntries(
    CHAT_DATE_PARTS_FORMATTER.formatToParts(date).map(({ type, value }) => [
      type,
      value,
    ]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function chatListErrorMessage(error) {
  if (error?.code === "AUTH_REQUIRED")
    return "로그인이 만료됐어요. 다시 로그인한 뒤 이용해주세요.";
  return "채팅 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.";
}

export function chatSendErrorMessage(error) {
  if (error?.code === "AUTH_REQUIRED")
    return "로그인이 만료됐어요. 다시 로그인한 뒤 이용해주세요.";
  if (error?.code === "FILE_TOO_LARGE")
    return "사진은 10MB 이하로 첨부할 수 있어요.";
  if (error?.code === "FILE_TYPE_NOT_ALLOWED")
    return "JPG, PNG, WebP 이미지만 첨부할 수 있어요.";
  if (
    [
      "FILE_UPLOAD_FAILED",
      "FILE_UPLOAD_NOT_COMPLETE",
      "FILE_INVALID_CONTENT",
    ].includes(error?.code)
  )
    return "사진 업로드에 실패했어요. 잠시 후 다시 시도해주세요.";
  return "메시지를 보내지 못했어요. 잠시 후 다시 시도해주세요.";
}

export function getChatImageAccessUrl(cache, roomId, fileId) {
  const key = `${roomId}:${fileId}`;
  const cached = cache.get(key);
  if (cached?.url && cached.expiresAt > Date.now() + 30_000)
    return Promise.resolve(cached.url);
  if (cached?.pending) return cached.pending;

  const pending = chatApi
    .chatImageAccessUrl(roomId, fileId)
    .then((result) => {
      const url = result?.accessUrl || "";
      const expiration = Date.parse(result?.expiresAt || "");
      cache.set(key, {
        url,
        expiresAt: Number.isFinite(expiration)
          ? expiration
          : Date.now() + 4 * 60_000,
      });
      return url;
    })
    .catch(() => {
      cache.delete(key);
      return "";
    });
  cache.set(key, { pending, expiresAt: 0 });
  return pending;
}

export function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function mapChatRoom(item) {
  const previewType = item.preview?.type;
  const previewText =
    previewType === "IMAGE"
      ? "사진"
      : item.preview?.text || "아직 대화가 없어요.";
  const activityTimestamp = parseChatDate(item.activityAt)?.getTime() || 0;

  return {
    id: item.chatRoomId,
    name: item.otherParticipant?.nickname || "상대 회원",
    image: item.otherParticipant?.profileImageUrl || "",
    last: previewText,
    time: formatChatActivity(item.activityAt),
    activityAt: item.activityAt || null,
    activityTimestamp,
    syncedActivityTimestamp: activityTimestamp,
    chatNotification: item.chatNotification,
    unread: Number(item.unreadCount) || 0,
  };
}

function applyRoomMessageEvent(room, event) {
  const eventTimestamp = parseChatDate(event.createdAt)?.getTime() || 0;
  const isNewerPreview = eventTimestamp > room.activityTimestamp;
  const isBeyondServerSnapshot =
    eventTimestamp > (room.syncedActivityTimestamp || 0);
  const preview =
    event.messageType === "IMAGE"
      ? "사진"
      : event.textContent || "아직 대화가 없어요.";

  return {
    ...room,
    last: isNewerPreview ? preview : room.last,
    time: isNewerPreview ? formatChatActivity(event.createdAt) : room.time,
    activityAt: isNewerPreview ? event.createdAt : room.activityAt,
    activityTimestamp: Math.max(room.activityTimestamp, eventTimestamp),
    unread: room.unread + (!event.mine && isBeyondServerSnapshot ? 1 : 0),
  };
}

function sortChatRooms(rooms) {
  return [...rooms].sort(
    (left, right) =>
      right.activityTimestamp - left.activityTimestamp ||
      Number(right.id) - Number(left.id),
  );
}

export function mapChatMessage(item) {
  const image = item.messageType === "IMAGE" || item.type === "IMAGE";
  return {
    id: item.messageId ?? item.id,
    mine: Boolean(item.mine),
    type: image ? "IMAGE" : "TEXT",
    imageFileId: item.imageFileId ?? null,
    imageUrl: item.imageUrl || "",
    text: image ? "" : item.textContent || item.text || "",
    time: formatChatMessageTime(item.createdAt) || "방금",
  };
}

export function mergeChatMessages(current, incoming) {
  const messagesById = new Map();
  for (const message of [...current, ...incoming]) {
    messagesById.set(String(message.id), message);
  }
  return [...messagesById.values()].sort((a, b) => Number(a.id) - Number(b.id));
}

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
    navigate(`/chats/${room.id}`);
  }

  return (
    <>
      <BrandHeader />
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
              src={asset("chat-empty-illustration.svg")}
              alt=""
            />
            <strong>좋아요를 수락하면 여기서 대화할 수 있어요</strong>
            <PixelButton onClick={() => navigate("/likes")}>
              받은 좋아요 보기
            </PixelButton>
          </div>
        )}
      </main>
    </>
  );
}

export function MessageBubble({
  message,
  ai = false,
  avatar = "",
  senderName = "",
  chatRoom = false,
  onViewImage,
  onImageLoaded,
}) {
  const isImage = message.type === "IMAGE";
  return (
    <div
      className={`message-row ${message.mine ? "mine" : "theirs"} ${chatRoom ? "chat-message-row" : ""}`}
    >
      {ai && !message.mine && (
        <Icon name="ai-avatar.svg" className="bubble-avatar" />
      )}
      {!ai && !message.mine && (
        <img
          className="bubble-avatar profile-bubble-avatar"
          src={avatar || asset("chat-avatar-heart-terminal.svg")}
          alt=""
          onError={(event) => {
            event.currentTarget.src = asset("chat-avatar-heart-terminal.svg");
          }}
        />
      )}
      <div className={`bubble-group ${chatRoom ? "chat-bubble-group" : ""}`}>
        {chatRoom && !message.mine && !ai && senderName && (
          <span className="message-sender-name">{senderName}</span>
        )}
        <div className={chatRoom ? "chat-bubble-content" : undefined}>
          <div className={`message-bubble ${isImage ? "is-image" : ""}`}>
            <span className="message-bubble-tail" aria-hidden="true" />
            {isImage ? (
              message.imageUrl ? (
                <button
                  type="button"
                  className="message-image-button"
                  aria-label="사진 크게 보기"
                  onClick={() => onViewImage?.(message.imageUrl)}
                >
                  <img
                    src={message.imageUrl}
                    alt="채팅 첨부 사진"
                    onLoad={onImageLoaded}
                  />
                </button>
              ) : (
                <span className="message-image-placeholder" role="status">
                  사진을 불러오고 있어요.
                </span>
              )
            ) : (
              <span className="message-bubble-text">{message.text}</span>
            )}
          </div>
          {message.time && <small>{message.time}</small>}
        </div>
      </div>
    </div>
  );
}

export function ChatRoom({
  navigate,
  toast,
  onStartSimulation,
  simulationStartingFor,
}) {
  const roomId = Number(window.location.pathname.split("/").pop());
  const [input, setInput] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [sending, setSending] = useState(false);
  const [viewingImage, setViewingImage] = useState("");
  const [targetMemberId, setTargetMemberId] = useState(null);
  const [serverRoom, setServerRoom] = useState(null);
  const [serverMessages, setServerMessages] = useState([]);
  const [roomLoading, setRoomLoading] = useState(true);
  const [roomError, setRoomError] = useState("");
  const imageInputRef = useRef(null);
  const messagesScrollRef = useRef(null);
  const lastScrolledMessageIdRef = useRef(null);
  const imageUrlCacheRef = useRef(new Map());
  const syncMessagesRef = useRef(null);
  const messagesRoomReadyRef = useRef(false);
  const roomGenerationRef = useRef(0);
  const readCursorRef = useRef(0);
  const readTargetRef = useRef(0);
  const readInFlightRef = useRef(false);
  const readRetryTimerRef = useRef(null);
  const readRetryCountRef = useRef(0);
  const [messagesLoadedRoomId, setMessagesLoadedRoomId] = useState(null);
  const activeRoom = serverRoom;
  const messages = serverMessages;
  const latestMessage = messages[messages.length - 1];
  const latestMessageKey = latestMessage ? String(latestMessage.id) : "";

  const requestReadThrough = useCallback(
    (messageId) => {
      const targetMessageId = Number(messageId);
      if (!Number.isSafeInteger(targetMessageId) || targetMessageId <= 0)
        return;
      readTargetRef.current = Math.max(readTargetRef.current, targetMessageId);
      if (
        document.visibilityState === "hidden" ||
        readInFlightRef.current ||
        readTargetRef.current <= readCursorRef.current
      )
        return;

      if (readRetryTimerRef.current) {
        window.clearTimeout(readRetryTimerRef.current);
        readRetryTimerRef.current = null;
      }
      readInFlightRef.current = true;
      const generation = roomGenerationRef.current;
      const requestedMessageId = readTargetRef.current;
      let succeeded = false;

      void chatApi
        .markAsRead(roomId, requestedMessageId)
        .then((result) => {
          if (generation !== roomGenerationRef.current) return;
          const confirmedMessageId =
            Number(result?.lastReadMessageId) || requestedMessageId;
          readCursorRef.current = Math.max(
            readCursorRef.current,
            confirmedMessageId,
          );
          readRetryCountRef.current = 0;
          succeeded = true;
        })
        .catch(() => {
          if (generation !== roomGenerationRef.current) return;
          readRetryCountRef.current += 1;
          if (
            readRetryCountRef.current <= 3 &&
            document.visibilityState !== "hidden"
          ) {
            readRetryTimerRef.current = window.setTimeout(() => {
              readRetryTimerRef.current = null;
              requestReadThrough(readTargetRef.current);
            }, readRetryCountRef.current * 1000);
          }
        })
        .finally(() => {
          if (generation !== roomGenerationRef.current) return;
          readInFlightRef.current = false;
          if (
            succeeded &&
            readTargetRef.current > readCursorRef.current &&
            document.visibilityState !== "hidden"
          )
            requestReadThrough(readTargetRef.current);
        });
    },
    [roomId],
  );

  useEffect(() => {
    const syncReadCursor = () => {
      if (
        !latestMessageKey ||
        !messagesRoomReadyRef.current ||
        messagesLoadedRoomId !== roomId ||
        document.visibilityState === "hidden"
      )
        return;
      requestReadThrough(latestMessageKey);
    };

    syncReadCursor();
    document.addEventListener("visibilitychange", syncReadCursor);
    return () =>
      document.removeEventListener("visibilitychange", syncReadCursor);
  }, [latestMessageKey, messagesLoadedRoomId, requestReadThrough, roomId]);

  useEffect(() => {
    if (
      !latestMessageKey ||
      latestMessageKey === lastScrolledMessageIdRef.current
    )
      return;

    const container = messagesScrollRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: lastScrolledMessageIdRef.current ? "smooth" : "auto",
    });
    lastScrolledMessageIdRef.current = latestMessageKey;
  }, [latestMessageKey]);

  function scrollToLatestMessage() {
    const container = messagesScrollRef.current;
    container?.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }

  useEffect(() => {
    const previewUrl = selectedImage?.previewUrl;
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [selectedImage?.previewUrl]);

  useEffect(() => {
    if (!viewingImage) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setViewingImage("");
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [viewingImage]);

  useEffect(() => {
    if (!Number.isSafeInteger(roomId) || roomId <= 0) {
      setRoomError("채팅방 주소가 올바르지 않아요.");
      setRoomLoading(false);
      return undefined;
    }
    let active = true;
    setTargetMemberId(null);
    setRoomLoading(true);
    setRoomError("");
    chatApi
      .rooms({ size: 100 })
      .then((page) => {
        if (!active) return;
        const found = (page?.items || [])
          .map(mapChatRoom)
          .find((item) => String(item.id) === String(roomId));
        setServerRoom(found || null);
        if (!found) setRoomError("채팅 목록에서 방을 찾을 수 없어요.");
      })
      .catch((error) => {
        if (!active) return;
        setRoomError(
          error?.code === "AUTH_REQUIRED"
            ? "로그인이 만료됐어요. 다시 로그인한 뒤 이용해주세요."
            : "채팅방을 불러오지 못했어요. 다시 시도해주세요.",
        );
      })
      .finally(() => {
        if (active) setRoomLoading(false);
      });
    return () => {
      active = false;
    };
  }, [roomId]);

  useEffect(() => {
    if (!Number.isSafeInteger(roomId) || roomId <= 0) return undefined;
    let active = true;
    let hasLoaded = false;
    messagesRoomReadyRef.current = false;
    setMessagesLoadedRoomId(null);
    setServerMessages([]);
    readCursorRef.current = 0;
    readTargetRef.current = 0;
    readInFlightRef.current = false;
    readRetryCountRef.current = 0;
    roomGenerationRef.current += 1;
    if (readRetryTimerRef.current) {
      window.clearTimeout(readRetryTimerRef.current);
      readRetryTimerRef.current = null;
    }

    const loadMessages = async () => {
      try {
        const page = await chatApi.messages(roomId);
        if (!active) return;
        setTargetMemberId(page?.chatRoom?.otherParticipant?.memberId || null);
        const incoming = await Promise.all(
          (page?.messages || []).map(async (item) => {
            const message = mapChatMessage(item);
            if (message.type === "IMAGE" && message.imageFileId) {
              message.imageUrl = await getChatImageAccessUrl(
                imageUrlCacheRef.current,
                roomId,
                message.imageFileId,
              );
            }
            return message;
          }),
        );
        if (!active) return;
        setRoomError("");
        messagesRoomReadyRef.current = true;
        setMessagesLoadedRoomId(roomId);
        setServerMessages((current) => mergeChatMessages(current, incoming));
        hasLoaded = true;
      } catch (error) {
        if (!active || hasLoaded) return;
        setRoomError(
          error?.code === "AUTH_REQUIRED"
            ? "로그인이 만료됐어요. 다시 로그인한 뒤 이용해주세요."
            : "메시지를 불러오지 못했어요. 채팅방 접근 권한을 확인해주세요.",
        );
      }
    };

    syncMessagesRef.current = loadMessages;
    void loadMessages();
    return () => {
      active = false;
      if (syncMessagesRef.current === loadMessages)
        syncMessagesRef.current = null;
      messagesRoomReadyRef.current = false;
      if (readRetryTimerRef.current) {
        window.clearTimeout(readRetryTimerRef.current);
        readRetryTimerRef.current = null;
      }
    };
  }, [roomId]);

  useEffect(() => {
    if (!Number.isSafeInteger(roomId) || roomId <= 0) return undefined;
    let active = true;
    const disconnect = connectChatSocket({
      onConnected: () => {
        if (active) void syncMessagesRef.current?.();
      },
      onMessage: async (event) => {
        if (
          !active ||
          Number(event?.chatRoomId) !== roomId ||
          !event?.messageId
        )
          return;
        const message = mapChatMessage(event);
        if (message.type === "IMAGE" && message.imageFileId) {
          message.imageUrl = await getChatImageAccessUrl(
            imageUrlCacheRef.current,
            roomId,
            message.imageFileId,
          );
        }
        if (!active) return;
        setServerMessages((current) => mergeChatMessages(current, [message]));
      },
    });
    return () => {
      active = false;
      disconnect();
    };
  }, [roomId]);

  useEffect(
    () => () => {
      if (readRetryTimerRef.current)
        window.clearTimeout(readRetryTimerRef.current);
    },
    [],
  );

  function selectImage(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!CHAT_IMAGE_MIME_TYPES.has(file.type)) {
      toast("JPG, PNG, WebP 이미지만 첨부할 수 있어요.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast("사진은 10MB 이하로 첨부할 수 있어요.");
      return;
    }
    setSelectedImage({ file, previewUrl: URL.createObjectURL(file) });
  }

  function clearSelectedImage() {
    setSelectedImage(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  async function send() {
    const text = input.trim();
    const image = selectedImage;
    if ((!text && !image) || !activeRoom || sending) return;
    setSending(true);
    try {
      if (image) {
        const uploaded = image.fileId
          ? { fileId: image.fileId }
          : await chatApi.uploadChatImage(image.file);
        if (!image.fileId) {
          setSelectedImage((current) =>
            current ? { ...current, fileId: uploaded.fileId } : current,
          );
        }
        const created = await chatApi.sendImageMessage(roomId, uploaded.fileId);
        const imageMessage = mapChatMessage({
          messageId: created?.messageId ?? `pending-${Date.now()}`,
          mine: true,
          messageType: "IMAGE",
          imageFileId: created?.imageFileId ?? uploaded.fileId,
          createdAt: created?.createdAt,
        });
        imageMessage.imageUrl = await getChatImageAccessUrl(
          imageUrlCacheRef.current,
          roomId,
          imageMessage.imageFileId,
        );
        setServerMessages((current) =>
          mergeChatMessages(current, [imageMessage]),
        );
        clearSelectedImage();
      }

      if (text) {
        const created = await chatApi.sendMessage(roomId, text);
        setServerMessages((current) =>
          mergeChatMessages(current, [
            mapChatMessage({
              messageId: created?.messageId ?? `pending-${Date.now()}`,
              mine: true,
              messageType: "TEXT",
              textContent: text,
              createdAt: created?.createdAt,
            }),
          ]),
        );
      }
      setInput("");
    } catch (e) {
      toast(chatSendErrorMessage(e));
    } finally {
      setSending(false);
    }
  }
  return (
    <>
      <BrandHeader />
      <ScreenHeader
        className="chat-room-header"
        title={activeRoom?.name || "채팅"}
        onBack={() => navigate("/chats")}
        right={
          <button
            type="button"
            className="more-button"
            onClick={() => toast("채팅방 설정은 준비 중이에요.")}
          >
            •••
          </button>
        }
      />
      <div className="mode-tabs">
        <button
          type="button"
          disabled={!targetMemberId || simulationStartingFor != null}
          onClick={() => void onStartSimulation(targetMemberId, roomId)}
        >
          {simulationStartingFor === targetMemberId
            ? "시뮬레이션 생성 중..."
            : "시뮬레이션"}
        </button>
        <button
          type="button"
          disabled={!targetMemberId}
          onClick={() =>
            navigate(`/ai/practice/${targetMemberId}?chatRoomId=${roomId}`)
          }
        >
          연습 대화
        </button>
        <button type="button" className="active">
          채팅
        </button>
      </div>
      <div
        ref={messagesScrollRef}
        className={`chat-messages chat-room-messages ${selectedImage ? "has-composer-preview" : ""} ${sending && selectedImage ? "is-uploading" : ""}`}
      >
        {roomLoading ? (
          <p role="status">채팅방을 불러오고 있어요.</p>
        ) : roomError ? (
          <p role="alert">{roomError}</p>
        ) : !activeRoom ? (
          <EmptyState
            title="채팅방을 찾을 수 없어요"
            description="채팅 목록에서 다시 확인해주세요."
          />
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              avatar={activeRoom?.image || ""}
              senderName={activeRoom?.name || ""}
              chatRoom
              onViewImage={setViewingImage}
              onImageLoaded={
                String(message.id) === latestMessageKey
                  ? scrollToLatestMessage
                  : undefined
              }
            />
          ))
        )}
      </div>
      <form
        className={`message-composer ${selectedImage ? "has-image" : ""} ${sending && selectedImage ? "is-uploading" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        {selectedImage && (
          <div className="image-attachment-preview">
            <img src={selectedImage.previewUrl} alt="첨부할 사진 미리보기" />
            <div className="image-attachment-file-info">
              <strong>{selectedImage.file.name}</strong>
              <small>{formatFileSize(selectedImage.file.size)}</small>
            </div>
            <button
              type="button"
              className="image-attachment-remove"
              aria-label="첨부 사진 삭제"
              disabled={sending}
              onClick={clearSelectedImage}
            >
              ×
            </button>
          </div>
        )}
        <div className="message-composer-controls">
          <button
            type="button"
            className="attach-image-button"
            aria-label="사진 첨부"
            disabled={!activeRoom || sending}
            onClick={() => imageInputRef.current?.click()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 5h16v14H4z" />
              <circle cx="9" cy="10" r="1.5" />
              <path d="m5 17 5-5 3 3 2-2 4 4" />
              <path d="M18 3v5M15.5 5.5h5" />
            </svg>
          </button>
          <input
            ref={imageInputRef}
            className="image-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="첨부할 사진 선택"
            onChange={selectImage}
          />
          <input
            className="message-text-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="메시지를 입력하세요"
            aria-label="메시지"
            maxLength={1000}
            disabled={sending}
          />
          <button
            type="submit"
            disabled={
              (!input.trim() && !selectedImage) || !activeRoom || sending
            }
            aria-label={sending ? "전송 중" : "보내기"}
          >
            {sending ? "…" : "➤"}
          </button>
        </div>
        {sending && selectedImage && (
          <small className="image-upload-status" role="status">
            사진을 전송하고 있어요.
          </small>
        )}
      </form>
      {viewingImage && (
        <div
          className="image-viewer"
          role="dialog"
          aria-modal="true"
          aria-label="사진 크게 보기"
        >
          <button
            type="button"
            className="image-viewer-backdrop"
            aria-label="사진 닫기"
            onClick={() => setViewingImage("")}
          />
          <button
            type="button"
            className="image-viewer-close"
            aria-label="사진 닫기"
            onClick={() => setViewingImage("")}
          >
            ×
          </button>
          <img src={viewingImage} alt="채팅 첨부 사진 크게 보기" />
        </div>
      )}
    </>
  );
}
