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

function anchorPosition(container, anchor) {
  const message =
    anchor &&
    messageElements(container).find(
      (element) => element.dataset.messageKey === anchor.key,
    );
  return message
    ? container.scrollTop +
        message.getBoundingClientRect().top -
        container.getBoundingClientRect().top -
        anchor.offset
    : container.scrollTop;
}

function nearLatest(container) {
  return (
    container.scrollHeight - container.scrollTop - container.clientHeight < 48
  );
}

export function useChatScroll({
  entry,
  state,
  visit,
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
  const follow = useRef(true);
  const anchor = useRef(null);
  const programmaticTop = useRef(null);
  const previousIds = useRef(new Set());
  const previousMaximum = useRef(0);
  const current = useRef({ state, visit, syncing, viewingImage });
  current.current = { state, visit, syncing, viewingImage };
  const [atBottom, setAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [readError, setReadError] = useState(false);
  const readTimer = useRef(null);
  const readInFlight = useRef(false);
  const readRetries = useRef(0);
  const alive = useRef(true);
  const generation = useRef(0);

  const setPosition = useCallback((container, top) => {
    const target = Math.max(
      0,
      Math.min(container.scrollHeight - container.clientHeight, top),
    );
    if (Math.abs(container.scrollTop - target) < 1) return;
    container.scrollTop = target;
    programmaticTop.current = container.scrollTop;
  }, []);

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

  const readTarget = useCallback(() => {
    const container = containerRef.current;
    const {
      state: snapshot,
      visit: activeVisit,
      syncing: isSyncing,
      viewingImage: hasViewer,
    } = current.current;
    if (
      !alive.current ||
      !initialized.current ||
      !isSessionActive(entry) ||
      !activeVisit ||
      !snapshot.loaded ||
      isSyncing ||
      hasViewer ||
      document.visibilityState === "hidden" ||
      !container?.clientHeight
    )
      return 0;

    // Opening a room acknowledges the captured entry snapshot after positioning.
    // Its divider stays in this visit even when everything fits a desktop screen.
    if (activeVisit.readThroughId > entry.snapshot.readCursor)
      return activeVisit.readThroughId;
    if (!follow.current) return 0;
    const latest = [...snapshot.messages].reverse().find(serverMessageId);
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
    const id = readTarget();
    if (!id || id <= entry.snapshot.readCursor || readInFlight.current) return;
    const startedGeneration = generation.current;
    const isCurrent = () =>
      alive.current &&
      startedGeneration === generation.current &&
      isSessionActive(entry);
    readInFlight.current = true;
    try {
      const result = await chatApi.markAsRead(entry.roomId, id);
      if (!isCurrent()) return;
      updateRoomSession(entry, (snapshot) => {
        const cursor = Math.max(
          snapshot.readCursor,
          Number(result?.lastReadMessageId) || id,
        );
        const unread = snapshot.messages.filter(
          (message) => !message.mine && serverMessageId(message) > cursor,
        ).length;
        return {
          ...snapshot,
          readCursor: cursor,
          room: snapshot.room ? { ...snapshot.room, unread } : null,
        };
      });
      readRetries.current = 0;
      setReadError(false);
    } catch {
      if (!isCurrent()) return;
      readRetries.current += 1;
      if (readRetries.current < 3) {
        readTimer.current = window.setTimeout(
          () => void attemptRead(),
          readRetries.current * 1000,
        );
      } else setReadError(true);
    } finally {
      if (isCurrent()) {
        readInFlight.current = false;
        if (
          !readTimer.current &&
          readRetries.current < 3 &&
          readTarget() > entry.snapshot.readCursor
        )
          readTimer.current = window.setTimeout(() => void attemptRead(), 300);
      }
    }
  }, [entry, readTarget]);

  const scheduleRead = useCallback(() => {
    if (readTimer.current) window.clearTimeout(readTimer.current);
    readTimer.current = null;
    if (
      readRetries.current < 3 &&
      !readInFlight.current &&
      readTarget() > entry.snapshot.readCursor
    )
      readTimer.current = window.setTimeout(() => void attemptRead(), 250);
  }, [attemptRead, entry, readTarget]);

  const retryRead = useCallback(() => {
    readRetries.current = 0;
    setReadError(false);
    scheduleRead();
  }, [scheduleRead]);

  const preservePosition = useCallback(() => {
    const container = containerRef.current;
    if (!container || !initialized.current) return;
    setPosition(
      container,
      follow.current
        ? container.scrollHeight
        : anchorPosition(container, anchor.current),
    );
    savePosition();
    scheduleRead();
  }, [savePosition, scheduleRead, setPosition]);

  const scrollToLatest = useCallback(() => {
    follow.current = true;
    setAtBottom(true);
    setNewCount(0);
    const container = containerRef.current;
    if (container) setPosition(container, container.scrollHeight);
    savePosition();
    scheduleRead();
  }, [savePosition, scheduleRead, setPosition]);

  const onScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || !initialized.current) return;
    const expected = programmaticTop.current;
    programmaticTop.current = null;
    if (expected != null && Math.abs(container.scrollTop - expected) < 1) {
      savePosition();
      return;
    }
    const nearBottom = nearLatest(container);
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
    if (!visit || !state.loaded || syncing || !containerRef.current) return;
    const container = containerRef.current;
    if (!initialized.current) {
      const divider = container.querySelector("[data-unread-message-id]");
      if (visit.unreadBoundaryId && !divider) return;
      const dividerBounds = divider?.getBoundingClientRect();
      const entryTop = dividerBounds
        ? container.scrollTop +
          dividerBounds.top -
          container.getBoundingClientRect().top -
          container.clientHeight / 2 +
          dividerBounds.height / 2
        : container.scrollHeight;
      // Load enough read history above the boundary to show its context.
      if (divider && entryTop < 0 && state.pageInfo.hasNext && !olderError) {
        if (!loadingOlder) void loadOlder();
        return;
      }
      initialized.current = true;
      if (divider) {
        setPosition(container, entryTop);
        follow.current = nearLatest(container);
      } else {
        follow.current = true;
        setPosition(container, container.scrollHeight);
      }
      setAtBottom(follow.current);
      setNewCount(
        follow.current
          ? 0
          : state.messages.filter(
              (message) =>
                !message.mine && serverMessageId(message) > visit.readThroughId,
            ).length,
      );
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
    visit,
    state.loaded,
    state.messages,
    state.pageInfo.hasNext,
    syncing,
    loadingOlder,
    olderError,
    loadOlder,
    preservePosition,
    savePosition,
    scheduleRead,
    setPosition,
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
    generation.current += 1;
    document.addEventListener("visibilitychange", scheduleRead);
    window.addEventListener("focus", scheduleRead);
    return () => {
      alive.current = false;
      generation.current += 1;
      readInFlight.current = false;
      savePosition();
      if (readTimer.current) window.clearTimeout(readTimer.current);
      readTimer.current = null;
      document.removeEventListener("visibilitychange", scheduleRead);
      window.removeEventListener("focus", scheduleRead);
    };
  }, [savePosition, scheduleRead]);

  useEffect(() => {
    if (!visit) return undefined;
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(preservePosition);
    if (listRef.current) observer?.observe(listRef.current);
    if (containerRef.current) observer?.observe(containerRef.current);
    window.addEventListener("resize", preservePosition);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", preservePosition);
    };
  }, [visit, preservePosition]);

  useEffect(() => {
    if (
      !visit ||
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
    visit,
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
    readError,
    retryRead,
  };
}
