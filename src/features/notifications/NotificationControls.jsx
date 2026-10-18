import { useNotifications } from "./context.jsx";
import { notificationBadge } from "./model.js";

export function PagerIcon() {
  return (
    <img
      src="/assets/notifications/pager.svg"
      width="36"
      height="30"
      alt=""
      aria-hidden="true"
    />
  );
}

export function NotificationButton({ className = "" }) {
  const notifications = useNotifications();
  if (!notifications?.enabled) return null;
  const badge = notificationBadge(notifications.count);
  return (
    <button
      type="button"
      className={`pager-button ${className}`}
      aria-label={
        badge ? `알림, 읽지 않은 알림 ${notifications.count}개` : "알림"
      }
      aria-current={
        notifications.path === "/notifications" ? "page" : undefined
      }
      onClick={notifications.openInbox}
      title="알림"
    >
      <PagerIcon />
      {badge && (
        <span className="pager-badge" aria-hidden="true">
          {badge}
        </span>
      )}
    </button>
  );
}

export function NotificationIllustration({ kind }) {
  return (
    <span
      className={`notification-art notification-art-${kind}`}
      aria-hidden="true"
    >
      {kind === "system" && <PagerIcon />}
    </span>
  );
}
