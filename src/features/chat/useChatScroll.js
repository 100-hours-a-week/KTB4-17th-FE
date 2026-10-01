import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import * as chatApi from "./api.js";
import { serverMessageId } from "./model.js";
import { isSessionActive, updateRoomSession } from "./session.js";

function messageElements(container) {
  return [...container.querySelectorAll("[data-message-key]")];
}

function captureAnchor(container) {
  const bounds = container.getBoundingClientRect();
  const message = messageElements(container).find(
    (element) => element.getBoundingClientRect().bottom > bounds.top,
  );
  return message
    ? {
        key: message.dataset.messageKey,
        offset: message.getBoundingClientRect().top - bounds.top,
      }
    : null;
}

function restoreAnchor(container, anchor) {
  if (!anchor) return;
  const message = messageElements(container).find(
    (element) => element.dataset.messageKey === anchor.key,
  );
  if (message)
    container.scrollTop +=
      message.getBoundingClientRect().top -
      container.getBoundingClientRect().top -
      anchor.offset;
}

export function useChatScroll({
  entry,
  state,
  syncing,
  viewingImage,
  loadingOlder,
  olderError,
  loadOlder,
}) {
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const topRef = useRef(null);
  const initialized = useRef(false);
  const follow = useRef(entry.scroll?.followLatest ?? true);
  const anchor = useRef(entry.scroll?.anchor || null);
  const previousIds = useRef(
    new Set(state.messages.map(serverMessageId).filter(Boolean)),
  );
  const previousMaximum = useRef(Math.max(0, ...previousIds.current));
  const current = useRef({ state, syncing, viewingImage });
  current.current = { state, syncing, viewingImage };
  const [atBottom, setAtBottom] = useState(follow.current);
  const [newCount, setNewCount] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const readTimer = useRef(null);
  const readInFlight = useRef(false);
  const readRetries = useRef(0);
  const alive = useRef(true);

  const savePosition = useCallback(() => {
    const container = containerRef.current;
    if (!container || !initialized.current) return;
    anchor.current = captureAnchor(container);
    entry.scroll = {
      anchor: anchor.current,
      top: container.scrollTop,
      followLatest: follow.current,
    };
  }, [entry]);

  const visibleReadId = useCallback(() => {
    const container = containerRef.current;
    const {
      state: snapshot,
      syncing: isSyncing,
      viewingImage: hasViewer,
    } = current.current;
    if (
      !alive.current ||
      !initialized.current ||
      !isSessionActive(entry) ||
      !snapshot.loaded ||
      isSyncing ||
      hasViewer ||
      document.visibilityState === "hidden" ||
      !container?.clientHeight ||
      !follow.current
    )
      return 0;
    const latest = [...snapshot.messages]
      .reverse()
      .find((message) => serverMessageId(message));
    if (!latest) return 0;
    const element = messageElements(container).find(
      (item) => item.dataset.messageKey === latest.renderKey,
    );
    if (!element) return 0;
    if (latest.type === "IMAGE") {
      const image = element.querySelector(".chat-image-slot img");
      if (!image?.complete || !image.naturalWidth) return 0;
    }
    const bounds = container.getBoundingClientRect();
    const messageBounds = element.getBoundingClientRect();
    return messageBounds.bottom <= bounds.bottom + 1 &&
      messageBounds.bottom > bounds.top + 1
      ? serverMessageId(latest)
      : 0;
  }, [entry]);

  const attemptRead = useCallback(async () => {
    readTimer.current = null;
    const id = visibleReadId();
    if (!id || id <= entry.snapshot.readCursor || readInFlight.current) return;
    readInFlight.current = true;
    try {
      const result = await chatApi.markAsRead(entry.roomId, id);
      if (!alive.current || !isSessionActive(entry)) return;
      updateRoomSession(entry, (snapshot) => ({
        ...snapshot,
        readCursor: Math.max(
          snapshot.readCursor,
          Number(result?.lastReadMessageId) || id,
        ),
      }));
      readRetries.current = 0;
    } catch {
      if (alive.current && visibleReadId() && readRetries.current < 3) {
        readRetries.current += 1;
        readTimer.current = window.setTimeout(
          () => void attemptRead(),
          readRetries.current * 1000,
        );
      }
    } finally {
      readInFlight.current = false;
      if (
        alive.current &&
        !readTimer.current &&
        visibleReadId() > entry.snapshot.readCursor
      ) {
        if (readRetries.current < 3)
          readTimer.current = window.setTimeout(() => void attemptRead(), 300);
      }
    }
  }, [entry, visibleReadId]);

  const scheduleRead = useCallback(() => {
    if (readTimer.current) window.clearTimeout(readTimer.current);
    readTimer.current = null;
    if (visibleReadId() > entry.snapshot.readCursor && !readInFlight.current)
      readTimer.current = window.setTimeout(() => void attemptRead(), 250);
  }, [attemptRead, entry, visibleReadId]);

  const preservePosition = useCallback(() => {
    const container = containerRef.current;
    if (!container || !initialized.current) return;
    if (follow.current) container.scrollTop = container.scrollHeight;
    else restoreAnchor(container, anchor.current);
    savePosition();
    scheduleRead();
  }, [savePosition, scheduleRead]);

  const scrollToLatest = useCallback(() => {
    follow.current = true;
    setAtBottom(true);
    setNewCount(0);
    const container = containerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
    savePosition();
    scheduleRead();
  }, [savePosition, scheduleRead]);

  const onScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || !initialized.current) return;
    const nearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      48;
    follow.current = nearBottom;
    setAtBottom(nearBottom);
    if (nearBottom) setNewCount(0);
    savePosition();
    scheduleRead();
    if (
      !nearBottom &&
      container.scrollTop < 100 &&
      !loadingOlder &&
      !olderError &&
      entry.snapshot.pageInfo.hasNext
    )
      void loadOlder();
  }, [entry, loadOlder, loadingOlder, olderError, savePosition, scheduleRead]);

  useLayoutEffect(() => {
    if (!state.loaded || !containerRef.current) return;
    const container = containerRef.current;
    if (!initialized.current) {
      initialized.current = true;
      if (follow.current) container.scrollTop = container.scrollHeight;
      else if (entry.scroll?.anchor)
        restoreAnchor(container, entry.scroll.anchor);
      else container.scrollTop = entry.scroll?.top || 0;
    } else {
      const arrivals = state.messages.filter(
        (message) =>
          serverMessageId(message) > previousMaximum.current &&
          !previousIds.current.has(serverMessageId(message)) &&
          !message.mine,
      );
      if (arrivals.length) {
        if (!follow.current) setNewCount((count) => count + arrivals.length);
        const latest = arrivals[arrivals.length - 1];
        setAnnouncement(
          latest.type === "IMAGE"
            ? "새 사진 메시지가 도착했어요."
            : `새 메시지: ${latest.text}`,
        );
      }
      preservePosition();
    }
    previousIds.current = new Set(
      state.messages.map(serverMessageId).filter(Boolean),
    );
    previousMaximum.current = Math.max(
      previousMaximum.current,
      0,
      ...previousIds.current,
    );
    savePosition();
    scheduleRead();
  }, [
    entry,
    state.loaded,
    state.messages,
    preservePosition,
    savePosition,
    scheduleRead,
  ]);

  useLayoutEffect(() => {
    if (loadingOlder || olderError) preservePosition();
  }, [loadingOlder, olderError, preservePosition]);

  useEffect(() => {
    if (!syncing && !viewingImage) scheduleRead();
    else if (readTimer.current) {
      window.clearTimeout(readTimer.current);
      readTimer.current = null;
    }
  }, [syncing, viewingImage, scheduleRead]);

  useEffect(() => {
    alive.current = true;
    document.addEventListener("visibilitychange", scheduleRead);
    window.addEventListener("focus", scheduleRead);
    return () => {
      alive.current = false;
      savePosition();
      if (readTimer.current) window.clearTimeout(readTimer.current);
      document.removeEventListener("visibilitychange", scheduleRead);
      window.removeEventListener("focus", scheduleRead);
    };
  }, [savePosition, scheduleRead]);

  useEffect(() => {
    if (!state.loaded) return undefined;
    const list = listRef.current;
    const container = containerRef.current;
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(preservePosition);
    if (list) observer?.observe(list);
    if (container) observer?.observe(container);
    window.addEventListener("resize", preservePosition);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", preservePosition);
    };
  }, [state.loaded, preservePosition]);

  useEffect(() => {
    if (
      !state.loaded ||
      !state.pageInfo.hasNext ||
      !state.pageInfo.nextCursor ||
      loadingOlder ||
      olderError ||
      typeof IntersectionObserver === "undefined"
    )
      return undefined;
    const container = containerRef.current;
    const top = topRef.current;
    if (!container || !top) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (initialized.current && entries.some((item) => item.isIntersecting))
          void loadOlder();
      },
      { root: container, rootMargin: "60px 0px 0px", threshold: 0 },
    );
    observer.observe(top);
    return () => observer.disconnect();
  }, [
    state.loaded,
    state.pageInfo.hasNext,
    state.pageInfo.nextCursor,
    loadingOlder,
    olderError,
    loadOlder,
  ]);

  return {
    containerRef,
    listRef,
    topRef,
    onScroll,
    preservePosition,
    scrollToLatest,
    atBottom,
    newCount,
    announcement,
  };
}
