import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiErrorMessage } from "../../shared/api/errorMessages.js";
import {
  BrandHeader,
  EmptyState,
  PixelButton,
} from "../../shared/ui/components.jsx";
import { PixelIcon } from "../../shared/ui/pixel.jsx";
import { useNotifications } from "./context.jsx";
import {
  mergeNotifications,
  NOTIFICATION_CATEGORIES,
  notificationCopy,
  notificationDay,
  notificationTime,
  sortNotificationsUnreadFirst,
} from "./model.js";
import {
  NotificationIllustration,
  PagerIcon,
} from "./NotificationControls.jsx";
import {
  notificationCategory as categoryForType,
  emptyUnreadCategories,
} from "./unread.js";
import { useNotificationInbox } from "./useNotificationInbox.js";
import { useUnreadNotificationCatalog } from "./useUnreadNotificationCatalog.js";

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
  const unreadCatalog = useUnreadNotificationCatalog(
    notifications.subject,
    notifications.count,
  );
  const unreadCategories = useMemo(() => {
    const flags = emptyUnreadCategories();
    for (const item of unreadCatalog.items) {
      if (!item.readAt) {
        flags.ALL = true;
        flags[categoryForType(item.type)] = true;
      }
    }
    flags.ALL = notifications.count > 0 || flags.ALL;
    return flags;
  }, [notifications.count, unreadCatalog.items]);
  const page = useNotificationInbox(
    category,
    notifications.revision,
    notifications.subject,
  );
  const [pending, setPending] = useState(new Set());
  const [locallyRead, setLocallyRead] = useState(new Map());
  const [deletedIds, setDeletedIds] = useState(new Set());
  const inFlight = useRef(new Set());

  const readInFlight = useRef(new Set());
  const visibilityTimers = useRef(new Map());
  const readRefreshTimer = useRef(null);
  const readRefreshPending = useRef(false);
  const mainRef = useRef(null);
  const subjectRef = useRef(notifications.subject);

  const displayItems = useMemo(() => {
    const catalogItems = unreadCatalog.items.filter(
      (item) => category === "ALL" || categoryForType(item.type) === category,
    );
    const merged = mergeNotifications(
      mergeNotifications(catalogItems, page.items),
      [...locallyRead.values()],
    )
      .filter((item) => !deletedIds.has(String(item.notificationId)))
      .map((item) => {
        const local = locallyRead.get(String(item.notificationId));
        return local ? { ...item, readAt: local.readAt } : item;
      });
    return sortNotificationsUnreadFirst(merged);
  }, [category, deletedIds, locallyRead, page.items, unreadCatalog.items]);

  useEffect(() => {
    if (subjectRef.current === notifications.subject) return;
    subjectRef.current = notifications.subject;
    if (readRefreshTimer.current) {
      window.clearTimeout(readRefreshTimer.current);
      readRefreshTimer.current = null;
    }
    readRefreshPending.current = false;
    setLocallyRead(new Map());
    setDeletedIds(new Set());
    readInFlight.current.clear();
    for (const entry of visibilityTimers.current.values())
      window.clearTimeout(entry.timer);
    visibilityTimers.current.clear();
  }, [notifications.subject]);

  const scheduleReadRefresh = useCallback(() => {
    readRefreshPending.current = true;
    if (unreadCatalog.loading) return;
    if (readRefreshTimer.current) window.clearTimeout(readRefreshTimer.current);
    readRefreshTimer.current = window.setTimeout(() => {
      readRefreshTimer.current = null;
      readRefreshPending.current = false;
      notifications.refresh();
    }, 300);
  }, [notifications.refresh, unreadCatalog.loading]);

  useEffect(() => {
    if (unreadCatalog.loading && readRefreshTimer.current) {
      window.clearTimeout(readRefreshTimer.current);
      readRefreshTimer.current = null;
    }
    if (!unreadCatalog.loading && readRefreshPending.current)
      scheduleReadRefresh();
  }, [scheduleReadRefresh, unreadCatalog.loading]);

  useEffect(
    () => () => {
      if (readRefreshTimer.current)
        window.clearTimeout(readRefreshTimer.current);
      readRefreshPending.current = false;
      for (const entry of visibilityTimers.current.values())
        window.clearTimeout(entry.timer);
      visibilityTimers.current.clear();
    },
    [],
  );

  useEffect(() => {
    const root = mainRef.current;
    if (
      !root ||
      !notifications.enabled ||
      !displayItems.length ||
      typeof IntersectionObserver === "undefined"
    )
      return undefined;

    const itemsById = new Map(
      displayItems.map((item) => [String(item.notificationId), item]),
    );
    const visibleEnough = (element) => {
      if (document.visibilityState === "hidden") return false;
      const rootBounds = root.getBoundingClientRect();
      const cardBounds = element.getBoundingClientRect();
      const toolbarBounds = root
        .querySelector(".notification-toolbar")
        ?.getBoundingClientRect();
      const top = Math.max(
        rootBounds.top,
        toolbarBounds?.bottom ?? rootBounds.top,
      );
      const bottom = Math.min(rootBounds.bottom, window.innerHeight);
      const left = Math.max(rootBounds.left, 0);
      const right = Math.min(rootBounds.right, window.innerWidth);
      const height = Math.max(
        0,
        Math.min(cardBounds.bottom, bottom) - Math.max(cardBounds.top, top),
      );
      const width = Math.max(
        0,
        Math.min(cardBounds.right, right) - Math.max(cardBounds.left, left),
      );
      const area = cardBounds.width * cardBounds.height;
      return area > 0 && (height * width) / area >= 0.5;
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = String(entry.target.dataset.notificationId || "");
          const requestKey = `${notifications.subject}:${id}`;
          const item = itemsById.get(id);
          const visible =
            entry.isIntersecting && entry.intersectionRatio >= 0.5;
          const existing = visibilityTimers.current.get(id);
          if (
            !visible ||
            !item ||
            item.readAt ||
            readInFlight.current.has(requestKey)
          ) {
            if (existing) {
              window.clearTimeout(existing.timer);
              visibilityTimers.current.delete(id);
            }
            continue;
          }
          if (existing) continue;

          const timer = window.setTimeout(() => {
            visibilityTimers.current.delete(id);
            if (!visibleEnough(entry.target)) return;
            readInFlight.current.add(requestKey);
            void notifications
              .markRead(item, { refreshAfter: false })
              .then((marked) => {
                if (!marked) return;
                const locallyReadItem = {
                  ...item,
                  readAt: new Date().toISOString(),
                };
                setLocallyRead((previous) => {
                  const next = new Map(previous);
                  next.set(id, locallyReadItem);
                  return next;
                });
                unreadCatalog.markRead(locallyReadItem);
                scheduleReadRefresh();
              })
              .catch((error) => {
                toast(
                  apiErrorMessage(
                    error,
                    "알림 읽음 상태를 갱신하지 못했어요. 다시 시도해 주세요.",
                  ),
                );
              })
              .finally(() => readInFlight.current.delete(requestKey));
          }, 700);
          visibilityTimers.current.set(id, { timer, element: entry.target });
        }
      },
      { root, threshold: [0, 0.5] },
    );

    const observeCards = () =>
      root
        .querySelectorAll(".notification-card[data-notification-id]")
        .forEach((element) => {
          observer.observe(element);
        });
    observeCards();
    const resume = () => {
      if (document.visibilityState === "hidden") return;
      observer.disconnect();
      observeCards();
    };
    document.addEventListener("visibilitychange", resume);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", resume);
      for (const [id, entry] of visibilityTimers.current) {
        window.clearTimeout(entry.timer);
        visibilityTimers.current.delete(id);
      }
    };
  }, [
    displayItems,
    notifications.enabled,
    notifications.markRead,
    notifications.subject,
    unreadCatalog.markRead,
    scheduleReadRefresh,
    toast,
  ]);

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
        setDeletedIds((previous) =>
          new Set(previous).add(String(item.notificationId)),
        );
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
  let previousReadState;
  return (
    <>
      <BrandHeader navigate={navigate} notificationAction={false}>
        <span className="notification-count" role="status">
          <PagerIcon />
          {notifications.count == null
            ? "새 소식"
            : `새 알림 ${notifications.count}`}
        </span>
      </BrandHeader>
      <main
        ref={mainRef}
        id="main-content"
        tabIndex={-1}
        className="main-scroll notifications-main"
        aria-busy={
          page.loading || (!displayItems.length && unreadCatalog.loading)
        }
      >
        <div className="notification-toolbar">
          <div className="notification-heading">
            <h1>알림</h1>
            <p className="notification-intro">당신에게 도착한 설레는 소식들</p>
          </div>
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
            소식을 확인하지 못했어요. 잠시 후 다시 확인할게요.
          </p>
        )}
        {notifications.connection !== "reconnecting" &&
          notifications.streamStatus === "reconnecting" && (
            <p className="notification-connection" role="status">
              실시간 연결을 복구하고 있어요. 새 소식이 잠시 늦게 도착할 수
              있어요.
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
        {!displayItems.length &&
          !page.error &&
          (page.loading || unreadCatalog.loading ? (
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
          {displayItems.map((item) => {
            const day = notificationDay(item.createdAt);
            const showDay = day !== previousDay;
            const isUnread = !item.readAt;
            const showGroup = previousReadState !== isUnread;
            previousDay = day;
            previousReadState = isUnread;
            const copy = notificationCopy(item);
            const busy = pending.has(item.notificationId);
            return (
              <div key={item.notificationId}>
                {showGroup && (
                  <h2 className="notification-day">
                    {isUnread ? "읽지 않은 알림" : "읽은 알림"}
                  </h2>
                )}
                {showDay && <h2 className="notification-day">{day}</h2>}
                <article
                  className={`notification-card ${item.readAt ? "read" : "unread"}`}
                  data-notification-id={item.notificationId}
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
        {displayItems.length > 0 && !page.pageInfo.hasNext && (
          <p className="notification-end">
            소중한 신호를 모두 확인했어요 · *23#
          </p>
        )}
      </main>
    </>
  );
}
