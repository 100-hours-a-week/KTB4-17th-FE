import { useState } from "react";
import { useAppState } from "../../shared/appState.jsx";
import { EmptyState, ScreenHeader } from "../../shared/ui/components.jsx";

export function Notifications({ navigate, toast }) {
  const { data, setData } = useAppState();
  const [category, setCategory] = useState("ALL");
  const types = {
    ALL: "전체",
    LIKE: "관심",
    CHAT_MESSAGE: "채팅",
    SYSTEM: "시스템",
  };
  const matches = (item) =>
    category === "ALL" ||
    (category === "SYSTEM"
      ? !["LIKE", "CHAT_MESSAGE"].includes(item.type)
      : item.type === category);
  const items = data.notifications.filter(matches);
  function open(item) {
    setData((old) => ({
      ...old,
      notifications: old.notifications.map((v) =>
        v.id === item.id ? { ...v, read: true } : v,
      ),
    }));
    navigate(item.target || "/my");
  }
  return (
    <>
      <ScreenHeader
        title="알림"
        onBack={() => navigate("/my")}
        right={
          <button
            type="button"
            className="text-action"
            onClick={() => {
              setData((old) => ({
                ...old,
                notifications: old.notifications.filter(
                  (item) => !matches(item),
                ),
              }));
              toast("알림을 삭제했어요.");
            }}
          >
            전체 삭제
          </button>
        }
      />
      <div className="notification-tabs">
        {Object.entries(types).map(([key, label]) => (
          <button
            type="button"
            key={key}
            className={category === key ? "active" : ""}
            onClick={() => setCategory(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <main className="main-scroll notifications-main">
        {items.length ? (
          items.map((item) => (
            <div
              className={`notification-card ${item.read ? "read" : ""}`}
              key={item.id}
            >
              <button
                type="button"
                className="notification-open"
                onClick={() => open(item)}
              >
                <span className="notification-glyph">
                  {item.type === "LIKE"
                    ? "♥"
                    : item.type === "CHAT_MESSAGE"
                      ? "▣"
                      : "✦"}
                </span>
                <span>
                  <strong>
                    {item.title}
                    {!item.read && <i />}
                  </strong>
                  <small>{item.body}</small>
                  <em>{item.when}</em>
                </span>
              </button>
              <button
                type="button"
                className="notification-delete"
                onClick={() =>
                  setData((old) => ({
                    ...old,
                    notifications: old.notifications.filter(
                      (v) => v.id !== item.id,
                    ),
                  }))
                }
                aria-label={`${item.title} 삭제`}
              >
                ×
              </button>
            </div>
          ))
        ) : (
          <EmptyState
            icon="♧"
            title="알림이 없어요"
            description="새로운 소식이 생기면 이곳에 알려드릴게요."
          />
        )}
      </main>
    </>
  );
}
