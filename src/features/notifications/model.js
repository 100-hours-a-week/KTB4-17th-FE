export const NOTIFICATION_CATEGORIES = [
  ["ALL", "전체"],
  ["INTEREST", "관심"],
  ["CHAT", "채팅"],
  ["SYSTEM", "AI · 소식"],
];

export function notificationCopy(item) {
  switch (item.type) {
    case "LIKE":
      return {
        title: "새로운 인연이 도착했어요",
        body: "누군가 회원님에게 좋아요를 보냈어요",
        illustration: "like",
      };
    case "MATCH":
      return {
        title: "두근두근, 서로 좋아요를 주고받았어요!",
        body: "매칭된 인연과 대화를 시작해보세요",
        illustration: "match",
      };
    case "CHAT_MESSAGE":
      return {
        title: "답장이 도착했어요",
        // The server supplies the sender's name, never the message contents.
        body: item.body || "새로운 메시지가 도착했어요.",
        illustration: "chat",
      };
    default:
      return {
        title: item.title || "새로운 소식이 도착했어요",
        body: item.body || "",
        illustration: "system",
      };
  }
}

function positiveId(value) {
  return /^\d+$/.test(String(value)) && Number(value) > 0
    ? String(value)
    : null;
}

export function notificationDestination(item) {
  const id = positiveId(item.targetId);
  if (id && item.targetType === "PROFILE")
    return `/profiles/${id}?returnTo=%2Fnotifications`;
  if (id && item.targetType === "CHAT_ROOM") return `/chats/${id}`;
  if (id && item.targetType === "AI_SIMULATION") return `/ai/simulations/${id}`;
  if (item.type === "PERSONA_TRAINING_COMPLETED") return "/my/persona";
  if (item.type === "FACE_ANALYSIS_COMPLETED") return "/my/profile";
  // Notice and future types stay in the inbox until a supported target exists.
  return null;
}

export function isCurrentChatNotification(item, path) {
  return (
    item.type === "CHAT_MESSAGE" &&
    item.targetType === "CHAT_ROOM" &&
    path === `/chats/${item.targetId}`
  );
}

export function notificationBadge(count) {
  return Number.isSafeInteger(count) && count > 0
    ? count > 99
      ? "99+"
      : String(count)
    : "";
}

export function notificationDate(value) {
  // Match the existing chat API convention: offset-free server timestamps are UTC.
  if (typeof value !== "string") return new Date(Number.NaN);
  return new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`);
}

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function notificationDay(value, now = new Date()) {
  const date = notificationDate(value);
  if (Number.isNaN(date.getTime())) return "이전 소식";
  const day = dayFormatter.format(date);
  if (day === dayFormatter.format(now)) return "오늘";
  if (day === dayFormatter.format(new Date(now.getTime() - 86400000)))
    return "어제";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function notificationTime(value) {
  const date = notificationDate(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
}

export function mergeNotifications(current, incoming) {
  const byId = new Map(
    current.map((item) => [String(item.notificationId), item]),
  );
  for (const item of incoming) {
    if (positiveId(item?.notificationId))
      byId.set(String(item.notificationId), item);
  }
  return [...byId.values()].sort((a, b) => {
    const left = BigInt(a.notificationId);
    const right = BigInt(b.notificationId);
    return left > right ? -1 : left < right ? 1 : 0;
  });
}
