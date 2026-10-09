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

function mapItems(result, excludedMemberIds) {
  const receivedAt = Date.now();
  return (Array.isArray(result?.items) ? result.items : [])
    .map((item) => mapRecommendationItem(item, receivedAt))
    .filter((item) => item && !excludedMemberIds?.has(item.id));
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
  const [revalidationRetryAt, setRevalidationRetryAt] = useState(null);
  const requestRef = useRef(0);
  const moreRequestRef = useRef(null);
  const revalidationRequestRef = useRef(null);
  const feedStateRef = useRef(feedState);
  const enabledRef = useRef(enabled);
  const wasHomeRef = useRef(isHome);
  const passedMemberIdsRef = useRef(new Set());
  const sessionRef = useRef(0);
  feedStateRef.current = feedState;
  enabledRef.current = enabled;

  const load = useCallback(async ({ createIfMissing = true } = {}) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    revalidationRequestRef.current = null;
    moreRequestRef.current = null;
    dispatch({ type: "replace", items: [] });
    setPage(emptyPage());
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
          dispatch({ type: "replace", items: [] });
          setPage(emptyPage());
          setRevalidationRetryAt(null);
        }
        return;
      }
      const result = await recommendationApi.recommendationItems(batchId);
      const items = mapItems(result, passedMemberIdsRef.current);
      if (requestId === requestRef.current) {
        dispatch({ type: "replace", items });
        setPage(pageFromResult(batchId, result));
        setRevalidationRetryAt(null);
      }
    } catch (requestError) {
      if (requestId === requestRef.current)
        setError(
          apiErrorMessage(
            requestError,
            "추천 목록을 불러오지 못했어요. 연결을 확인한 뒤 다시 시도해주세요.",
          ),
        );
    } finally {
      if (requestId === requestRef.current) setStatus("ready");
    }
  }, []);

  const reloadAfterPreferences = useCallback(
    () => load({ createIfMissing: false }),
    [load],
  );

  const loadMore = useCallback(async () => {
    if (
      moreRequestRef.current !== null ||
      !page.batchId ||
      !page.hasNext ||
      !page.nextCursor
    )
      return false;
    const requestId = requestRef.current;
    moreRequestRef.current = requestId;
    try {
      const result = await recommendationApi.recommendationItems(
        page.batchId,
        page.nextCursor,
      );
      if (requestId !== requestRef.current || !enabledRef.current) return false;
      const items = mapItems(result, passedMemberIdsRef.current);
      dispatch({ type: "append", items });
      setPage(pageFromResult(page.batchId, result));
      return items.length > 0;
    } catch (requestError) {
      if (requestId === requestRef.current)
        setError(
          apiErrorMessage(
            requestError,
            "추천 목록을 불러오지 못했어요. 연결을 확인한 뒤 다시 시도해주세요.",
          ),
        );
      return false;
    } finally {
      if (moreRequestRef.current === requestId) moreRequestRef.current = null;
    }
  }, [page]);

  const refresh = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    revalidationRequestRef.current = null;
    moreRequestRef.current = null;
    setRefreshing(true);
    setError("");
    try {
      const created = await recommendationApi.createRecommendationBatch();
      const batchId = created?.batchId;
      if (!batchId) {
        if (requestId === requestRef.current) {
          dispatch({ type: "replace", items: [] });
          setPage(emptyPage());
          setRevalidationRetryAt(null);
        }
        return 0;
      }

      const result = await recommendationApi.recommendationItems(batchId);
      const items = mapItems(result, passedMemberIdsRef.current);
      if (requestId === requestRef.current) {
        dispatch({ type: "replace", items });
        setPage(pageFromResult(batchId, result));
        setRevalidationRetryAt(null);
      }
      return items.length;
    } finally {
      if (requestId === requestRef.current) setRefreshing(false);
    }
  }, []);

  const revalidate = useCallback(() => {
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
        dispatch({ type: "replace", items: [] });
        setPage(emptyPage());
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
        items.push(...mapItems(result, passedMemberIdsRef.current));
        const nextCursor = result?.pageInfo?.nextCursor || null;
        if (!result?.pageInfo?.hasNext) break;
        if (!nextCursor || seenCursors.has(nextCursor))
          throw new Error("Invalid recommendation pagination cursor");
        seenCursors.add(nextCursor);
        cursor = nextCursor;
      }

      if (requestId !== requestRef.current || !enabledRef.current) return false;
      dispatch({
        type: "revalidate",
        items: items.filter((item) => !passedMemberIdsRef.current.has(item.id)),
      });
      setPage(pageFromResult(batchId, result));
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
  }, []);

  useEffect(() => {
    if (!enabled) {
      passedMemberIdsRef.current.clear();
      dispatch({ type: "replace", items: [] });
      setPage(emptyPage());
      setError("");
      setStatus("idle");
      setRevalidationRetryAt(null);
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

  const dismiss = useCallback((memberId) => {
    dispatch({ type: "dismiss", memberId });
  }, []);

  const pass = useCallback(async (memberId) => {
    const session = sessionRef.current;
    await recommendationApi.saveRecommendationPass(memberId);
    if (!enabledRef.current || session !== sessionRef.current) return false;
    passedMemberIdsRef.current.add(memberId);
    dispatch({ type: "dismiss", memberId });
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
    revalidate,
    advance,
    retreat,
    dismiss,
    pass,
  };
}
