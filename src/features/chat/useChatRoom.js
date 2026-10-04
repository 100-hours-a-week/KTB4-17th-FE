import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import * as chatApi from "./api.js";
import {
  chatRoomErrorMessage,
  mapChatMessage,
  mergeChatMessages,
} from "./model.js";
import { applyMessagePage, fetchMessageGap } from "./roomData.js";
import {
  getRoomSession,
  isSessionActive,
  updateRoomSession,
} from "./session.js";
import { connectChatSocket } from "./socket.js";
import { loadChatVisit } from "./unread.js";

export function useChatRoom(roomId) {
  const entry = useMemo(() => getRoomSession(roomId), [roomId]);
  const subscribe = useCallback(
    (listener) => {
      entry.listeners.add(listener);
      return () => entry.listeners.delete(listener);
    },
    [entry],
  );
  const getSnapshot = useCallback(() => entry.snapshot, [entry]);
  const state = useSyncExternalStore(subscribe, getSnapshot);
  const [syncing, setSyncing] = useState(true);
  const [visit, setVisit] = useState(null);
  const visitRef = useRef(null);
  const [error, setError] = useState(null);
  const [olderError, setOlderError] = useState("");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [connection, setConnection] = useState("connecting");
  const socketStatusRef = useRef("connecting");
  const aliveRef = useRef(false);
  const syncRef = useRef(null);
  const syncAgainRef = useRef(false);
  const olderRef = useRef(false);
  const abortRef = useRef(null);

  const sync = useCallback(() => {
    if (!aliveRef.current || !isSessionActive(entry)) return Promise.resolve();
    if (syncRef.current) {
      syncAgainRef.current = true;
      return syncRef.current;
    }
    setSyncing(true);
    setError(null);
    const controller = abortRef.current;
    const isCurrent = () => aliveRef.current && abortRef.current === controller;
    const operation = (async () => {
      do {
        syncAgainRef.current = false;
        try {
          const opening = !visitRef.current;
          const prepared = opening
            ? await loadChatVisit(roomId, {
                signal: controller.signal,
                fetchRooms: chatApi.rooms,
                fetchMessages: chatApi.messages,
              })
            : null;
          const pages =
            prepared?.pages ||
            (await fetchMessageGap(
              roomId,
              entry.snapshot.lastSyncedId,
              controller.signal,
              chatApi.messages,
            ));
          if (!isCurrent() || !isSessionActive(entry)) return;
          applyMessagePage(entry, pages);
          updateRoomSession(entry, (current) => ({
            ...current,
            room:
              prepared && current.room
                ? { ...current.room, unread: prepared.unreadCount }
                : current.room,
            lastSyncedId: Math.max(
              current.lastSyncedId,
              ...(pages[0].messages || []).map(
                (message) => Number(message.messageId) || 0,
              ),
            ),
          }));
          if (prepared) {
            // This belongs to the mounted visit, never to the room cache.
            const nextVisit = {
              unreadBoundaryId: prepared.unreadBoundaryId,
              readThroughId: prepared.readThroughId,
            };
            visitRef.current = nextVisit;
            setVisit(nextVisit);
          }
          setError(null);
        } catch (requestError) {
          if (!isCurrent() || requestError.name === "AbortError") return;
          setError({
            code: requestError.code,
            message: chatRoomErrorMessage(requestError),
          });
          if (requestError.code === "CHAT_ACCESS_DENIED") {
            updateRoomSession(entry, (current) => ({
              ...current,
              room: current.room ? { ...current.room, status: "ENDED" } : null,
            }));
          }
        }
      } while (syncAgainRef.current && isCurrent());
    })();
    syncRef.current = operation;
    void operation.finally(() => {
      if (syncRef.current === operation) {
        syncRef.current = null;
        if (isCurrent()) setSyncing(false);
      }
    });
    return operation;
  }, [entry, roomId]);

  const loadOlder = useCallback(async () => {
    if (
      !aliveRef.current ||
      olderRef.current ||
      !entry.snapshot.pageInfo.hasNext
    )
      return;
    olderRef.current = true;
    setLoadingOlder(true);
    setOlderError("");
    const cursor = entry.snapshot.pageInfo.nextCursor;
    const controller = abortRef.current;
    const isCurrent = () => aliveRef.current && abortRef.current === controller;
    try {
      const page = await chatApi.messages(roomId, {
        cursor,
        size: 20,
        signal: controller.signal,
      });
      if (!isCurrent()) return;
      if (
        page.pageInfo?.hasNext &&
        String(page.pageInfo?.nextCursor) === String(cursor)
      )
        throw new Error("Repeated message cursor");
      applyMessagePage(entry, [page]);
    } catch (requestError) {
      if (isCurrent() && requestError.name !== "AbortError")
        setOlderError(chatRoomErrorMessage(requestError));
    } finally {
      if (isCurrent()) {
        olderRef.current = false;
        setLoadingOlder(false);
      }
    }
  }, [entry, roomId]);

  useEffect(() => {
    aliveRef.current = true;
    visitRef.current = null;
    setVisit(null);
    abortRef.current = new AbortController();
    const controller = abortRef.current;
    const isCurrent = () => aliveRef.current && abortRef.current === controller;
    if (!Number.isSafeInteger(roomId) || roomId <= 0) {
      setError({
        code: "CHAT_ROOM_NOT_FOUND",
        message: "채팅방 주소가 올바르지 않아요.",
      });
      return () => {
        aliveRef.current = false;
      };
    }
    void sync();
    const disconnect = connectChatSocket({
      onStatus: (status) => {
        socketStatusRef.current = status;
        if (isCurrent())
          setConnection(navigator.onLine === false ? "offline" : status);
      },
      onConnected: () => {
        if (isCurrent()) void sync();
      },
      onMessage: (event) => {
        if (
          !isCurrent() ||
          Number(event?.chatRoomId) !== roomId ||
          !event.messageId
        )
          return;
        updateRoomSession(entry, (current) => ({
          ...current,
          messages: mergeChatMessages(
            current.messages,
            [mapChatMessage(event)],
            current.otherReadCursor,
          ),
        }));
      },
      onReadReceipt: (event) => {
        if (!isCurrent() || Number(event?.chatRoomId) !== roomId) return;
        const cursor = Number(event.lastReadMessageId);
        if (!Number.isSafeInteger(cursor) || cursor <= 0) return;
        // This queue receives the other participant's receipts only.
        updateRoomSession(entry, (current) => {
          const otherReadCursor = Math.max(current.otherReadCursor, cursor);
          return {
            ...current,
            otherReadCursor,
            messages: mergeChatMessages(current.messages, [], otherReadCursor),
          };
        });
      },
    });
    const resume = () => {
      if (document.visibilityState !== "hidden" && navigator.onLine !== false) {
        setConnection(socketStatusRef.current);
        void sync();
      }
    };
    const offline = () => setConnection("offline");
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", offline);
    window.addEventListener("pageshow", resume);
    return () => {
      aliveRef.current = false;
      controller.abort();
      syncRef.current = null;
      olderRef.current = false;
      syncAgainRef.current = false;
      disconnect();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", offline);
      window.removeEventListener("pageshow", resume);
    };
  }, [entry, roomId, sync]);

  return {
    entry,
    state,
    visit,
    syncing,
    error,
    connection,
    loadingOlder,
    olderError,
    loadOlder,
    sync,
  };
}
