import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { apiErrorMessage } from "../../shared/api/errorMessages.js";
import * as recommendationApi from "./api.js";
import { mapRecommendationItem } from "./mapRecommendationItem.js";
import {
  initialRecommendationFeedState,
  recommendationFeedReducer,
} from "./recommendationFeedState.js";
import {
  IMAGE_REFRESH_FALLBACK_MS,
  nextRecommendationImageRefreshAt,
} from "./recommendationRefresh.js";

const emptyPage = () => ({
  batchId: null,
  nextCursor: null,
  hasNext: false,
});

function mapItems(result, excludedUserIds) {
  const receivedAt = Date.now();
  return (Array.isArray(result?.items) ? result.items : [])
    .map((item) => mapRecommendationItem(item, receivedAt))
    .filter((item) => item && !excludedUserIds?.has(item.id));
}

function rememberItems(seenUserIds, items) {
  for (const item of items) {
    if (item?.id != null) seenUserIds.add(item.id);
  }
}

function createHiddenUserIds(excludedUserIds, seenUserIds) {
  return new Set([...excludedUserIds, ...seenUserIds]);
}

function pageFromResult(batchId, result) {
  return {
    batchId,
    nextCursor: result?.pageInfo?.nextCursor || null,
    hasNext: Boolean(result?.pageInfo?.hasNext),
  };
}

export function useRecommendationFeed({ enabled, isHome }) {
  const [feedState, dispatch] = useReducer(
    recommendationFeedReducer,
    initialRecommendationFeedState,
  );
  const { recommendations, currentIndex, exhausted } = feedState;
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [page, setPage] = useState(emptyPage);
  const [refreshing, setRefreshing] = useState(false);
  const [nextBatchReady, setNextBatchReady] = useState(false);
  const [revalidationRetryAt, setRevalidationRetryAt] = useState(null);
  const requestRef = useRef(0);
  const moreRequestRef = useRef(null);
  const moreRequestPromiseRef = useRef(null);
  const revalidationRequestRef = useRef(null);
  const preparedBatchRef = useRef(null);
  const prepareBatchRequestRef = useRef(null);
  const knownEligibleUsersRef = useRef(new Map());
  const feedStateRef = useRef(feedState);
  const pageRef = useRef(page);
  const enabledRef = useRef(enabled);
  const wasHomeRef = useRef(isHome);
  const excludedUserIdsRef = useRef(new Set());
  const seenUserIdsRef = useRef(new Set());
  const sessionRef = useRef(0);
  feedStateRef.current = feedState;
  pageRef.current = page;
  enabledRef.current = enabled;

  const rememberKnownUsers = useCallback((items) => {
    for (const item of items) {
      if (item?.id != null) knownEligibleUsersRef.current.set(item.id, item);
    }
  }, []);

  const load = useCallback(
    async ({ createIfMissing = true } = {}) => {
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      revalidationRequestRef.current = null;
      moreRequestRef.current = null;
      moreRequestPromiseRef.current = null;
      preparedBatchRef.current = null;
      prepareBatchRequestRef.current = null;
      setNextBatchReady(false);
      dispatch({ type: "replace", items: [] });
      pageRef.current = emptyPage();
      setPage(pageRef.current);
      setRefreshing(false);
      setRevalidationRetryAt(null);
      setStatus("loading");
      setError("");
      try {
        let batch = await recommendationApi.activeBatch();
        let batchId = batch?.batchId;
        if (requestId !== requestRef.current || !enabledRef.current) return;
        if (!batchId && createIfMissing) {
          const created = await recommendationApi.createRecommendationBatch();
          batchId = created?.batchId;
          if (requestId !== requestRef.current || !enabledRef.current) return;
          if (!batchId) {
            batch = await recommendationApi.activeBatch();
            batchId = batch?.batchId;
          }
        }
        if (!batchId) {
          if (requestId === requestRef.current) {
            dispatch({ type: "replace", items: [], exhausted: true });
            pageRef.current = emptyPage();
            setPage(pageRef.current);
            setRevalidationRetryAt(null);
          }
          return;
        }
        const result = await recommendationApi.recommendationItems(batchId);
        const items = mapItems(result, excludedUserIdsRef.current);
        if (requestId === requestRef.current) {
          rememberItems(seenUserIdsRef.current, items);
          rememberKnownUsers(items);
          dispatch({
            type: "replace",
            items,
            exhausted: items.length === 0 && !result?.pageInfo?.hasNext,
          });
          pageRef.current = pageFromResult(batchId, result);
          setPage(pageRef.current);
          setRevalidationRetryAt(null);
        }
      } catch (requestError) {
        if (requestId === requestRef.current)
          setError(
            apiErrorMessage(
              requestError,
              "추천 목록을 불러오지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.",
            ),
          );
      } finally {
        if (requestId === requestRef.current) setStatus("ready");
      }
    },
    [rememberKnownUsers],
  );

  const reloadAfterPreferences = useCallback(() => {
    knownEligibleUsersRef.current.clear();
    return load({ createIfMissing: false });
  }, [load]);

  const loadMore = useCallback(() => {
    if (moreRequestPromiseRef.current) return moreRequestPromiseRef.current;
    const currentPage = pageRef.current;
    if (!currentPage.batchId || !currentPage.hasNext || !currentPage.nextCursor)
      return Promise.resolve(false);
    const requestId = requestRef.current;
    moreRequestRef.current = requestId;
    let request;
    request = (async () => {
      try {
        const seenCursors = new Set();
        let cursor = currentPage.nextCursor;
        let result;
        let items;
        while (true) {
          const cursorKey = String(cursor);
          if (seenCursors.has(cursorKey)) break;
          seenCursors.add(cursorKey);
          result = await recommendationApi.recommendationItems(
            currentPage.batchId,
            cursor,
          );
          if (requestId !== requestRef.current || !enabledRef.current)
            return false;
          items = mapItems(result, excludedUserIdsRef.current);
          const nextCursor = result?.pageInfo?.nextCursor;
          if (
            items.length > 0 ||
            !result?.pageInfo?.hasNext ||
            nextCursor == null ||
            seenCursors.has(String(nextCursor))
          )
            break;
          cursor = nextCursor;
        }
        rememberItems(seenUserIdsRef.current, items);
        rememberKnownUsers(items);
        pageRef.current = pageFromResult(currentPage.batchId, result);
        setPage(pageRef.current);
        if (items.length > 0) {
          dispatch({ type: "append", items });
        } else if (
          feedStateRef.current.recommendations.length === 0 &&
          !pageRef.current.hasNext
        ) {
          dispatch({ type: "replace", items: [], exhausted: true });
        }
        return items.length > 0;
      } catch (requestError) {
        if (requestId === requestRef.current)
          setError(
            apiErrorMessage(
              requestError,
              "추천 목록을 불러오지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.",
            ),
          );
        return false;
      } finally {
        if (moreRequestRef.current === requestId) moreRequestRef.current = null;
        if (moreRequestPromiseRef.current === request)
          moreRequestPromiseRef.current = null;
      }
    })();
    moreRequestPromiseRef.current = request;
    return request;
  }, [rememberKnownUsers]);

  const prepareNextBatch = useCallback(() => {
    if (preparedBatchRef.current) return Promise.resolve(true);
    if (prepareBatchRequestRef.current) return prepareBatchRequestRef.current;

    const currentPage = pageRef.current;
    if (!currentPage.batchId) return Promise.resolve(false);

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    revalidationRequestRef.current = null;
    moreRequestRef.current = null;
    moreRequestPromiseRef.current = null;

    let request;
    request = (async () => {
      try {
        const created = await recommendationApi.createRecommendationBatch();
        if (requestId !== requestRef.current || !enabledRef.current)
          return false;

        const batchId = created?.batchId;
        if (!batchId) {
          const currentRecommendations = feedStateRef.current.recommendations;
          rememberKnownUsers(currentRecommendations);
          const currentUserId =
            currentRecommendations[feedStateRef.current.currentIndex]?.id;
          const alternatives = Array.from(
            knownEligibleUsersRef.current.values(),
          ).filter(
            (item) =>
              item.id !== currentUserId &&
              !excludedUserIdsRef.current.has(item.id),
          );
          preparedBatchRef.current = {
            items: alternatives,
            page: currentPage,
          };
          setNextBatchReady(true);
          return true;
        }

        const currentUserId =
          feedStateRef.current.recommendations[
            feedStateRef.current.currentIndex
          ]?.id;
        const seenCursors = new Set();
        let cursor = null;
        let fallback = null;
        let lastResort = null;
        let result = null;

        while (true) {
          result = await recommendationApi.recommendationItems(batchId, cursor);
          if (requestId !== requestRef.current || !enabledRef.current)
            return false;

          const items = mapItems(result, excludedUserIdsRef.current);
          rememberKnownUsers(items);
          const unseenItems = items.filter(
            (item) => !seenUserIdsRef.current.has(item.id),
          );

          if (unseenItems.length > 0) {
            preparedBatchRef.current = {
              items: unseenItems,
              page: pageFromResult(batchId, result),
            };
            setNextBatchReady(true);
            return true;
          }

          if (!lastResort && items.length > 0) {
            lastResort = {
              items,
              page: pageFromResult(batchId, result),
            };
          }
          if (!fallback && items.length > 0) {
            const alternatives = items.filter(
              (item) => item.id !== currentUserId,
            );
            if (alternatives.length > 0)
              fallback = {
                items: alternatives,
                page: pageFromResult(batchId, result),
              };
          }

          const nextCursor = result?.pageInfo?.nextCursor;
          if (!result?.pageInfo?.hasNext || nextCursor == null) break;
          const cursorKey = String(nextCursor);
          if (seenCursors.has(cursorKey)) break;
          seenCursors.add(cursorKey);
          cursor = nextCursor;
        }

        // The backend can return the same eligible users in every newly
        // generated batch. Keep the feed moving by cycling through those
        // users after preferring every not-yet-seen candidate.
        preparedBatchRef.current = fallback ||
          lastResort || {
            items: [],
            page: pageFromResult(batchId, result),
          };
        setNextBatchReady(true);
        return true;
      } catch {
        return false;
      } finally {
        if (prepareBatchRequestRef.current === request)
          prepareBatchRequestRef.current = null;
      }
    })();
    prepareBatchRequestRef.current = request;
    return request;
  }, [rememberKnownUsers]);

  const activatePreparedBatch = useCallback(() => {
    const prepared = preparedBatchRef.current;
    if (!prepared) return false;

    preparedBatchRef.current = null;
    setNextBatchReady(false);
    const items = prepared.items.filter(
      (item) => !excludedUserIdsRef.current.has(item.id),
    );
    rememberItems(seenUserIdsRef.current, items);
    dispatch({
      type: "replace",
      items,
      exhausted: items.length === 0,
    });
    pageRef.current = prepared.page;
    setPage(prepared.page);
    setError("");
    setRevalidationRetryAt(null);
    return true;
  }, []);

  const refresh = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    revalidationRequestRef.current = null;
    moreRequestRef.current = null;
    moreRequestPromiseRef.current = null;
    preparedBatchRef.current = null;
    prepareBatchRequestRef.current = null;
    setNextBatchReady(false);
    setRefreshing(true);
    setError("");
    try {
      const created = await recommendationApi.createRecommendationBatch();
      const batchId = created?.batchId;
      if (!batchId) {
        if (requestId === requestRef.current) {
          dispatch({ type: "replace", items: [], exhausted: true });
          pageRef.current = emptyPage();
          setPage(pageRef.current);
          setRevalidationRetryAt(null);
        }
        return 0;
      }

      const hiddenUserIds = createHiddenUserIds(
        excludedUserIdsRef.current,
        seenUserIdsRef.current,
      );
      let result = await recommendationApi.recommendationItems(batchId);
      let items = mapItems(result, hiddenUserIds);
      const seenCursors = new Set();
      while (
        items.length === 0 &&
        result?.pageInfo?.hasNext &&
        result?.pageInfo?.nextCursor != null
      ) {
        const cursor = String(result.pageInfo.nextCursor);
        if (seenCursors.has(cursor)) break;
        seenCursors.add(cursor);
        result = await recommendationApi.recommendationItems(batchId, cursor);
        if (requestId !== requestRef.current || !enabledRef.current) return 0;
        items = mapItems(result, hiddenUserIds);
      }
      if (requestId === requestRef.current) {
        rememberItems(seenUserIdsRef.current, items);
        rememberKnownUsers(items);
        dispatch({
          type: "replace",
          items,
          exhausted: items.length === 0 && !result?.pageInfo?.hasNext,
        });
        pageRef.current = pageFromResult(batchId, result);
        setPage(pageRef.current);
        setRevalidationRetryAt(null);
      }
      return items.length;
    } finally {
      if (requestId === requestRef.current) setRefreshing(false);
    }
  }, [rememberKnownUsers]);

  const revalidate = useCallback(() => {
    if (preparedBatchRef.current) return Promise.resolve(true);
    if (prepareBatchRequestRef.current) return prepareBatchRequestRef.current;
    if (revalidationRequestRef.current) return revalidationRequestRef.current;

    const requestId = requestRef.current;
    const request = (async () => {
      const targetCount = Math.max(
        feedStateRef.current.recommendations.length,
        1,
      );
      const batch = await recommendationApi.activeBatch();
      const batchId = batch?.batchId;
      if (requestId !== requestRef.current || !enabledRef.current) return false;
      if (!batchId) {
        dispatch({ type: "replace", items: [], exhausted: true });
        pageRef.current = emptyPage();
        setPage(pageRef.current);
        setError("");
        setRevalidationRetryAt(null);
        return true;
      }

      const items = [];
      const seenCursors = new Set();
      let cursor = null;
      let result = null;
      while (items.length < targetCount) {
        result = await recommendationApi.recommendationItems(batchId, cursor);
        items.push(...mapItems(result, excludedUserIdsRef.current));
        const nextCursor = result?.pageInfo?.nextCursor || null;
        if (!result?.pageInfo?.hasNext) break;
        if (!nextCursor || seenCursors.has(nextCursor))
          throw new Error("Invalid recommendation pagination cursor");
        seenCursors.add(nextCursor);
        cursor = nextCursor;
      }

      if (requestId !== requestRef.current || !enabledRef.current) return false;
      const visibleItems = items.filter(
        (item) => !excludedUserIdsRef.current.has(item.id),
      );
      rememberItems(seenUserIdsRef.current, visibleItems);
      rememberKnownUsers(visibleItems);
      dispatch({
        type: "revalidate",
        items: visibleItems,
      });
      pageRef.current = pageFromResult(batchId, result);
      setPage(pageRef.current);
      setError("");
      setRevalidationRetryAt(null);
      return true;
    })()
      .catch(() => {
        if (requestId === requestRef.current && enabledRef.current)
          setRevalidationRetryAt(Date.now() + IMAGE_REFRESH_FALLBACK_MS);
        return false;
      })
      .finally(() => {
        if (revalidationRequestRef.current === request)
          revalidationRequestRef.current = null;
      });
    revalidationRequestRef.current = request;
    return request;
  }, [rememberKnownUsers]);

  useEffect(() => {
    if (!enabled) {
      excludedUserIdsRef.current.clear();
      seenUserIdsRef.current.clear();
      knownEligibleUsersRef.current.clear();
      dispatch({ type: "replace", items: [] });
      pageRef.current = emptyPage();
      setPage(pageRef.current);
      setError("");
      setStatus("idle");
      setRevalidationRetryAt(null);
      setNextBatchReady(false);
      return undefined;
    }
    void load();
    return () => {
      requestRef.current += 1;
      sessionRef.current += 1;
    };
  }, [enabled, load]);

  useEffect(() => {
    const wasHome = wasHomeRef.current;
    wasHomeRef.current = isHome;
    if (enabled && isHome && !wasHome && status === "ready") void revalidate();
  }, [enabled, isHome, revalidate, status]);

  useEffect(() => {
    if (!enabled || !isHome || status !== "ready") return undefined;
    const refreshAt = nextRecommendationImageRefreshAt(recommendations);
    if (refreshAt == null) return undefined;
    const scheduledAt = Math.max(refreshAt, revalidationRetryAt || 0);
    const timer = window.setTimeout(
      () => void revalidate(),
      Math.max(scheduledAt - Date.now(), 0),
    );
    return () => window.clearTimeout(timer);
  }, [
    enabled,
    isHome,
    recommendations,
    revalidate,
    revalidationRetryAt,
    status,
  ]);

  useEffect(() => {
    if (!enabled || !isHome || status !== "ready") return undefined;
    const refreshIfExpired = () => {
      if (document.visibilityState !== "visible") return;
      const refreshAt = nextRecommendationImageRefreshAt(
        feedStateRef.current.recommendations,
      );
      const retryAt = revalidationRetryAt || 0;
      if (refreshAt != null && refreshAt <= Date.now() && retryAt <= Date.now())
        void revalidate();
    };
    const handlePageShow = (event) => {
      if (event.persisted) void revalidate();
    };
    document.addEventListener("visibilitychange", refreshIfExpired);
    window.addEventListener("focus", refreshIfExpired);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      document.removeEventListener("visibilitychange", refreshIfExpired);
      window.removeEventListener("focus", refreshIfExpired);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [enabled, isHome, revalidate, revalidationRetryAt, status]);

  const advance = useCallback(() => {
    dispatch({ type: "advance" });
  }, []);

  const retreat = useCallback(() => {
    dispatch({ type: "retreat" });
  }, []);

  const dismiss = useCallback((userId) => {
    if (userId != null) excludedUserIdsRef.current.add(userId);
    dispatch({ type: "dismiss", userId });
  }, []);

  const pass = useCallback(async (userId) => {
    const session = sessionRef.current;
    await recommendationApi.saveRecommendationPass(userId);
    if (!enabledRef.current || session !== sessionRef.current) return false;
    excludedUserIdsRef.current.add(userId);
    dispatch({ type: "dismiss", userId });
    return true;
  }, []);

  return {
    recommendations,
    currentIndex,
    exhausted,
    hasNext: page.hasNext,
    status,
    error,
    refreshing,
    load,
    reloadAfterPreferences,
    loadMore,
    refresh,
    prepareNextBatch,
    activatePreparedBatch,
    nextBatchReady,
    revalidate,
    advance,
    retreat,
    dismiss,
    pass,
  };
}
