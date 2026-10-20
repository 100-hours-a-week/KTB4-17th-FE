import { useCallback, useEffect, useRef, useState } from "react";
import { getAuthSessionSubject } from "../../shared/api/authToken.js";
import { apiErrorMessage } from "../../shared/api/errorMessages.js";
import { notifications } from "./api.js";
import { mergeNotifications } from "./model.js";

export function useNotificationInbox(category, revision, subject) {
  const [page, setPage] = useState({
    items: [],
    pageInfo: {},
    loading: true,
    error: "",
  });
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const depth = useRef(1);
  const source = useRef("");
  const pending = useRef(false);
  const request = useRef(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Server changes and manual retry invalidate the pending page snapshot.
  useEffect(() => {
    const identity = `${subject}:${category}`;
    const changed = source.current !== identity;
    if (changed) depth.current = 1;
    source.current = identity;
    const version = ++generation.current;
    const controller = new AbortController();
    request.current = controller;
    pending.current = true;
    const isCurrent = () =>
      !controller.signal.aborted &&
      version === generation.current &&
      getAuthSessionSubject() === subject;
    setPage((old) => ({
      ...(changed ? { items: [], pageInfo: {} } : old),
      loading: true,
      error: "",
    }));
    void (async () => {
      try {
        let items = [];
        let pageInfo = {};
        const cursors = new Set();
        for (let index = 0; index < depth.current; index += 1) {
          const response = await notifications(category, {
            cursor: pageInfo.nextCursor,
            signal: controller.signal,
          });
          if (!isCurrent()) return;
          items = mergeNotifications(items, response.items || []);
          pageInfo = response.pageInfo || {};
          if (!pageInfo.hasNext) break;
          if (!pageInfo.nextCursor || cursors.has(String(pageInfo.nextCursor)))
            throw new Error("Repeated notification cursor");
          cursors.add(String(pageInfo.nextCursor));
        }
        if (isCurrent())
          setPage({ items, pageInfo, loading: false, error: "" });
      } catch (error) {
        if (isCurrent())
          setPage((old) => ({
            ...old,
            loading: false,
            error: apiErrorMessage(
              error,
              "소식을 불러오지 못했어요. 다시 시도해 주세요.",
            ),
          }));
      } finally {
        if (isCurrent()) pending.current = false;
      }
    })();
    return () => controller.abort();
  }, [category, revision, subject, attempt]);

  const loadMore = useCallback(async () => {
    if (pending.current || !page.pageInfo.hasNext || !page.pageInfo.nextCursor)
      return;
    pending.current = true;
    const version = generation.current;
    const controller = request.current;
    const isCurrent = () =>
      !controller.signal.aborted &&
      version === generation.current &&
      getAuthSessionSubject() === subject;
    setPage((old) => ({ ...old, loading: true, error: "" }));
    try {
      const response = await notifications(category, {
        cursor: page.pageInfo.nextCursor,
        signal: controller.signal,
      });
      if (!isCurrent()) return;
      if (
        response.pageInfo?.hasNext &&
        (!response.pageInfo.nextCursor ||
          String(response.pageInfo.nextCursor) ===
            String(page.pageInfo.nextCursor))
      )
        throw new Error("Repeated notification cursor");
      depth.current += 1;
      setPage((old) => ({
        items: mergeNotifications(old.items, response.items || []),
        pageInfo: response.pageInfo || {},
        loading: false,
        error: "",
      }));
    } catch (error) {
      if (isCurrent())
        setPage((old) => ({
          ...old,
          loading: false,
          error: apiErrorMessage(error, "이전 소식을 불러오지 못했어요."),
        }));
    } finally {
      if (isCurrent()) pending.current = false;
    }
  }, [category, page.pageInfo, subject]);

  return {
    ...page,
    loadMore,
    retry: () => setAttempt((value) => value + 1),
    removeLocal: (id) =>
      setPage((old) => ({
        ...old,
        items: old.items.filter((item) => item.notificationId !== id),
      })),
  };
}
