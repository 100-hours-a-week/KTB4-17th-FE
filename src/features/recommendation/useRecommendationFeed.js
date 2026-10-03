import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import * as recommendationApi from "./api.js";
import { mapRecommendationItem } from "./mapRecommendationItem.js";
import {
  initialRecommendationFeedState,
  recommendationFeedReducer,
} from "./recommendationFeedState.js";

export function useRecommendationFeed({ enabled }) {
  const [feedState, dispatch] = useReducer(
    recommendationFeedReducer,
    initialRecommendationFeedState,
  );
  const { recommendations, currentIndex, exhausted } = feedState;
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [page, setPage] = useState({
    batchId: null,
    nextCursor: null,
    hasNext: false,
  });
  const [refreshing, setRefreshing] = useState(false);
  const requestRef = useRef(0);
  const moreRequestRef = useRef(false);

  const load = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setStatus("loading");
    setError("");
    try {
      let batch = await recommendationApi.activeBatch();
      let batchId = batch?.batchId;
      if (!batchId) {
        const created = await recommendationApi.createRecommendationBatch();
        batchId = created?.batchId;
        if (!batchId) {
          batch = await recommendationApi.activeBatch();
          batchId = batch?.batchId;
        }
      }
      if (!batchId) {
        if (requestId === requestRef.current) {
          dispatch({ type: "replace", items: [] });
          setPage({ batchId: null, nextCursor: null, hasNext: false });
        }
        return;
      }
      const result = await recommendationApi.recommendationItems(batchId);
      const items = (Array.isArray(result?.items) ? result.items : [])
        .map(mapRecommendationItem)
        .filter(Boolean);
      if (requestId === requestRef.current) {
        dispatch({ type: "replace", items });
        setPage({
          batchId,
          nextCursor: result?.pageInfo?.nextCursor || null,
          hasNext: Boolean(result?.pageInfo?.hasNext),
        });
      }
    } catch (requestError) {
      if (requestId === requestRef.current)
        setError(requestError?.code || "RECOMMENDATIONS_UNAVAILABLE");
    } finally {
      if (requestId === requestRef.current) setStatus("ready");
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (
      moreRequestRef.current ||
      !page.batchId ||
      !page.hasNext ||
      !page.nextCursor
    )
      return false;
    const requestId = requestRef.current;
    moreRequestRef.current = true;
    try {
      const result = await recommendationApi.recommendationItems(
        page.batchId,
        page.nextCursor,
      );
      const items = (result?.items || [])
        .map(mapRecommendationItem)
        .filter(Boolean);
      if (requestId === requestRef.current) {
        dispatch({ type: "append", items });
        setPage((current) => ({
          ...current,
          nextCursor: result?.pageInfo?.nextCursor || null,
          hasNext: Boolean(result?.pageInfo?.hasNext),
        }));
      }
      return items.length > 0;
    } catch (requestError) {
      if (requestId === requestRef.current)
        setError(requestError?.code || "RECOMMENDATIONS_UNAVAILABLE");
      return false;
    } finally {
      moreRequestRef.current = false;
    }
  }, [page]);

  const refresh = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setRefreshing(true);
    setError("");
    try {
      const created = await recommendationApi.createRecommendationBatch();
      const batchId = created?.batchId;
      if (!batchId) {
        if (requestId === requestRef.current) {
          dispatch({ type: "replace", items: [] });
          setPage({ batchId: null, nextCursor: null, hasNext: false });
        }
        return 0;
      }

      const result = await recommendationApi.recommendationItems(batchId);
      const items = (Array.isArray(result?.items) ? result.items : [])
        .map(mapRecommendationItem)
        .filter(Boolean);
      if (requestId === requestRef.current) {
        dispatch({ type: "replace", items });
        setPage({
          batchId,
          nextCursor: result?.pageInfo?.nextCursor || null,
          hasNext: Boolean(result?.pageInfo?.hasNext),
        });
      }
      return items.length;
    } finally {
      if (requestId === requestRef.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      dispatch({ type: "replace", items: [] });
      setError("");
      setStatus("idle");
      return undefined;
    }
    void load();
    return () => {
      requestRef.current += 1;
    };
  }, [enabled, load]);

  const advance = useCallback(() => {
    dispatch({ type: "advance" });
  }, []);

  const retreat = useCallback(() => {
    dispatch({ type: "retreat" });
  }, []);

  const dismiss = useCallback(() => {
    dispatch({ type: "dismiss" });
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
    loadMore,
    refresh,
    advance,
    retreat,
    dismiss,
  };
}
