import { useEffect, useRef, useState } from "react";
import { apiErrorMessage } from "../../shared/api/errorMessages.js";
import {
  EmptyState,
  PixelButton,
  ScreenHeader,
} from "../../shared/ui/components.jsx";
import { PixelIcon } from "../../shared/ui/pixel.jsx";
import { useNotifications } from "./context.jsx";
import {
  NOTIFICATION_CATEGORIES,
  notificationCopy,
  notificationDay,
  notificationTime,
} from "./model.js";
import {
  NotificationIllustration,
  PagerIcon,
} from "./NotificationControls.jsx";
import { useNotificationInbox } from "./useNotificationInbox.js";
import { useUnreadCategories } from "./useUnreadCategories.js";

const notificationCategory = (value) =>
  NOTIFICATION_CATEGORIES.some(([key]) => key === value) ? value : "ALL";

export function Notifications({ navigate, toast, initialCategory = "ALL" }) {
  const notifications = useNotifications();
  const [category, setCategory] = useState(() =>
    notificationCategory(initialCategory),
  );
  useEffect(() => {
    setCategory(notificationCategory(initialCategory));
  }, [initialCategory]);
  const unreadCategories = useUnreadCategories(notifications);
  const page = useNotificationInbox(
    category,
    notifications.revision,
    notifications.subject,
  );
  const [pending, setPending] = useState(new Set());
  const inFlight = useRef(new Set());
  function selectCategory(nextCategory) {
    if (nextCategory === category) return;
    setCategory(nextCategory);
    const params = new URLSearchParams(window.location.search);
    if (nextCategory === "ALL") params.delete("category");
    else params.set("category", nextCategory);
    const query = params.toString();
    navigate(`/notifications${query ? `?${query}` : ""}`);
  }
  async function act(item, action) {
    if (inFlight.current.has(item.notificationId)) return;
    inFlight.current.add(item.notificationId);
    setPending(new Set(inFlight.current));
    try {
      if (action === "delete") {
        await notifications.remove(item);
        page.removeLocal(item.notificationId);
        toast("알림을 삭제했어요.");
      } else await notifications.open(item);
    } catch (error) {
      toast(
        apiErrorMessage(error, "알림을 삭제하지 못했어요. 다시 시도해 주세요."),
      );
    } finally {
      inFlight.current.delete(item.notificationId);
      setPending(new Set(inFlight.current));
    }
  }
  let previousDay;
  return (
    <>
      <ScreenHeader
        className="account-header"
        title="알림"
        onBack={() => navigate("/home")}
      />
      <main
        id="main-content"
        tabIndex={-1}
        className="main-scroll notifications-main"
        aria-busy={page.loading}
      >
        <div className="notification-toolbar">
          <div className="notification-heading">
            <h2>나에게 온 소식</h2>
            <span className="notification-count" role="status">
              <PagerIcon />
              {notifications.count == null
                ? "새 소식"
                : `새 알림 ${notifications.count}`}
            </span>
          </div>
          <p className="notification-intro">당신에게 도착한 설레는 소식들</p>
          <nav className="notification-tabs" aria-label="알림 종류">
            {NOTIFICATION_CATEGORIES.map(([key, label]) => (
              <button
                type="button"
                key={key}
                aria-pressed={category === key}
                className={category === key ? "active" : ""}
                aria-label={
                  unreadCategories[key]
                    ? `${label}, 읽지 않은 알림 있음`
                    : label
                }
                onClick={() => selectCategory(key)}
              >
                {label}
                {unreadCategories[key] && (
                  <i className="notification-tab-dot" aria-hidden="true" />
                )}
              </button>
            ))}
          </nav>
        </div>
        {notifications.connection === "reconnecting" && (
          <p className="notification-connection" role="status">
            실시간 연결을 복구하고 있어요… 소식은 주기적으로 확인하고 있어요.
          </p>
        )}
        {page.error && (
          <div className="notification-error" role="alert">
            <p>{page.error}</p>
            <PixelButton secondary onClick={page.retry}>
              다시 불러오기
            </PixelButton>
          </div>
        )}
        {!page.items.length &&
          !page.error &&
          (page.loading ? (
            <div className="notification-loading" role="status">
              <PagerIcon />
              <p>도착한 소식을 확인하고 있어요…</p>
            </div>
          ) : (
            <EmptyState
              icon={<PagerIcon />}
              title="아직 도착한 소식이 없어요"
              description="새로운 인연의 신호가 오면 이곳에 모아둘게요."
            />
          ))}
        <div className="notification-list">
          {page.items.map((item) => {
            const day = notificationDay(item.createdAt);
            const showDay = day !== previousDay;
            previousDay = day;
            const copy = notificationCopy(item);
            const busy = pending.has(item.notificationId);
            return (
              <div key={item.notificationId}>
                {showDay && <h2 className="notification-day">{day}</h2>}
                <article
                  className={`notification-card ${item.readAt ? "read" : "unread"}`}
                >
                  <button
                    type="button"
                    className="notification-open"
                    disabled={busy}
                    onClick={() => void act(item, "open")}
                    aria-label={`${item.readAt ? "" : "읽지 않음. "}${copy.title}. ${copy.body}`}
                  >
                    <NotificationIllustration kind={copy.illustration} />
                    <span className="notification-copy">
                      <strong>{copy.title}</strong>
                      <span>{copy.body}</span>
                      <time dateTime={item.createdAt}>
                        {notificationTime(item.createdAt)}
                      </time>
                    </span>
                    {!item.readAt && (
                      <i
                        className="notification-unread-dot"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                  <button
                    type="button"
                    className="notification-delete"
                    disabled={busy}
                    onClick={() => void act(item, "delete")}
                    aria-label={`${copy.title} 알림 삭제`}
                  >
                    <PixelIcon name="x" scale={2} />
                  </button>
                </article>
              </div>
            );
          })}
        </div>
        {page.pageInfo.hasNext && (
          <button
            type="button"
            className="notification-load-more"
            disabled={page.loading}
            onClick={() => void page.loadMore()}
          >
            {page.loading ? "소식을 불러오고 있어요…" : "이전 소식 더 보기"}
          </button>
        )}
        {page.items.length > 0 && !page.pageInfo.hasNext && (
          <p className="notification-end">
            소중한 신호를 모두 확인했어요 · *23#
          </p>
        )}
      </main>
    </>
  );
}
