const CHAT_TIME_ZONE = "Asia/Seoul";
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
const CHAT_DATE_DIVIDER_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: CHAT_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  weekday: "long",
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

function formatChatDateDivider(date) {
  if (!date) return "";

  const parts = Object.fromEntries(
    CHAT_DATE_DIVIDER_FORMATTER.formatToParts(date).map(({ type, value }) => [
      type,
      value,
    ]),
  );
  return (
    String(parts.year) +
    "년 " +
    Number(parts.month) +
    "월 " +
    Number(parts.day) +
    "일 " +
    parts.weekday
  );
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
    // The API sends these offset-free chat timestamps as UTC.
    date = new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
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
  if (error?.code === "CHAT_ROOM_NOT_ACTIVE")
    return "종료된 대화에는 메시지를 보낼 수 없어요.";
  if (error?.code === "CHAT_ACCESS_DENIED")
    return "이 채팅방에 메시지를 보낼 수 없어요.";
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
    status: item.status || "ACTIVE",
    memberId: item.otherParticipant?.memberId || null,
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

export function applyRoomMessageEvent(room, event) {
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

export function sortChatRooms(rooms) {
  return [...rooms].sort(
    (left, right) =>
      right.activityTimestamp - left.activityTimestamp ||
      Number(right.id) - Number(left.id),
  );
}

export function mapChatMessage(item) {
  const image = item.messageType === "IMAGE" || item.type === "IMAGE";
  const date = parseChatDate(item.createdAt);
  return {
    id: item.messageId ?? item.id,
    clientMessageId: item.clientMessageId || null,
    renderKey: item.clientMessageId || String(item.messageId ?? item.id),
    mine: Boolean(item.mine),
    status: item.status || "SENT",
    unreadCount: item.unreadCount == null ? null : Number(item.unreadCount),
    type: image ? "IMAGE" : "TEXT",
    imageFileId: item.imageFileId ?? null,
    imageUrl: item.imageUrl || "",
    previewUrl: item.previewUrl || "",
    text: image ? "" : item.textContent || item.text || "",
    createdAt: item.createdAt || null,
    timestamp: date?.getTime() || 0,
    dateKey: date ? chatDateKey(date) : "",
    dateLabel: formatChatDateDivider(date),
    time: formatChatMessageTime(item.createdAt) || "방금",
  };
}

export function serverMessageId(message) {
  const id = Number(message?.id);
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

function combineMessage(previous, message) {
  if (!previous) return { ...message };
  const confirmed = serverMessageId(previous) && !serverMessageId(message);
  return {
    ...previous,
    ...message,
    id: confirmed ? previous.id : message.id,
    status: confirmed ? previous.status : message.status,
    clientMessageId: message.clientMessageId || previous.clientMessageId,
    renderKey: previous.renderKey,
    imageUrl: message.imageUrl || previous.imageUrl,
    previewUrl: message.previewUrl || previous.previewUrl,
    unreadCount:
      previous.unreadCount == null
        ? message.unreadCount
        : message.unreadCount == null
          ? previous.unreadCount
          : Math.min(previous.unreadCount, message.unreadCount),
  };
}

export function mergeChatMessages(current, incoming, otherReadCursor = 0) {
  const byId = new Map();
  const byClient = new Map();
  const messages = new Set();
  for (const message of [...current, ...incoming]) {
    const idMatch = byId.get(String(message.id));
    const clientMatch = message.clientMessageId
      ? byClient.get(message.clientMessageId)
      : null;
    // A history response without a client ID may arrive before the send ack.
    // The acknowledgement bridges both records into one stable local bubble.
    const record = clientMatch || idMatch || {};
    let merged = messages.has(record) ? { ...record } : null;
    if (idMatch && idMatch !== record) {
      merged = combineMessage(merged, idMatch);
      messages.delete(idMatch);
    }
    merged = combineMessage(merged, message);
    if (serverMessageId(merged)) {
      merged.status = "SENT";
      merged.error = "";
      if (merged.mine && serverMessageId(merged) <= otherReadCursor)
        merged.unreadCount = 0;
    }
    Object.assign(record, merged);
    messages.add(record);
    byId.set(String(message.id), record);
    byId.set(String(record.id), record);
    if (record.clientMessageId) byClient.set(record.clientMessageId, record);
  }
  return [...messages].sort((a, b) => {
    const left = serverMessageId(a);
    const right = serverMessageId(b);
    if (left && right) return left - right;
    if (left || right) return left ? -1 : 1;
    return (a.localSequence || 0) - (b.localSequence || 0);
  });
}

export function messagesAreGrouped(previous, message) {
  return Boolean(
    previous &&
      message &&
      previous.mine === message.mine &&
      previous.dateKey === message.dateKey &&
      previous.timestamp &&
      message.timestamp &&
      Math.abs(message.timestamp - previous.timestamp) < 5 * 60_000 &&
      previous.status === "SENT" &&
      message.status === "SENT",
  );
}

export function chatRoomErrorMessage(error) {
  if (error?.code === "AUTH_REQUIRED")
    return "로그인이 만료됐어요. 다시 로그인해주세요.";
  if (error?.code === "CHAT_ACCESS_DENIED")
    return "이 채팅방에 접근할 수 없어요.";
  if (error?.code === "CHAT_ROOM_NOT_FOUND") return "채팅방을 찾을 수 없어요.";
  return "대화를 불러오지 못했어요. 연결을 확인하고 다시 시도해주세요.";
}

export function normalizePageInfo(pageInfo) {
  return {
    hasNext: Boolean(pageInfo?.hasNext && pageInfo?.nextCursor),
    nextCursor: pageInfo?.nextCursor || null,
  };
}
