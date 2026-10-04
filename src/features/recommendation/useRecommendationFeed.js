import { useCallback, useEffect, useRef, useState } from "react";
import { apiErrorMessage } from "../../shared/api/errorMessages.js";
import * as recommendationApi from "./api.js";
import { mapRecommendationItem } from "./mapRecommendationItem.js";

export function useRecommendationFeed({ enabled }) {
  const [recommendations, setRecommendations] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [page, setPage] = useState({
    batchId: null,
    nextCursor: null,
    hasNext: false,
  });
  const [currentIndex, setCurrentIndex] = useState(0);
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
          setRecommendations([]);
          setPage({ batchId: null, nextCursor: null, hasNext: false });
          setCurrentIndex(0);
        }
        return;
      }
      const result = await recommendationApi.recommendationItems(batchId);
      const items = (Array.isArray(result?.items) ? result.items : [])
        .map(mapRecommendationItem)
        .filter(Boolean);
      if (requestId === requestRef.current) {
        setRecommendations(items);
        setPage({
          batchId,
          nextCursor: result?.pageInfo?.nextCursor || null,
          hasNext: Boolean(result?.pageInfo?.hasNext),
        });
        setCurrentIndex(0);
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
        setRecommendations((current) => [...current, ...items]);
        setPage((current) => ({
          ...current,
          nextCursor: result?.pageInfo?.nextCursor || null,
          hasNext: Boolean(result?.pageInfo?.hasNext),
        }));
      }
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
          setRecommendations([]);
          setPage({ batchId: null, nextCursor: null, hasNext: false });
          setCurrentIndex(0);
        }
        return 0;
      }

      const result = await recommendationApi.recommendationItems(batchId);
      const items = (Array.isArray(result?.items) ? result.items : [])
        .map(mapRecommendationItem)
        .filter(Boolean);
      if (requestId === requestRef.current) {
        setRecommendations(items);
        setPage({
          batchId,
          nextCursor: result?.pageInfo?.nextCursor || null,
          hasNext: Boolean(result?.pageInfo?.hasNext),
        });
        setCurrentIndex(0);
      }
      return items.length;
    } finally {
      if (requestId === requestRef.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setRecommendations([]);
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
    setCurrentIndex((current) => current + 1);
  }, []);

  const retreat = useCallback(() => {
    setCurrentIndex((current) => Math.max(current - 1, 0));
  }, []);

  const dismiss = useCallback(() => {
    setRecommendations((current) =>
      current.filter((_, index) => index !== currentIndex),
    );
  }, [currentIndex]);

  return {
    recommendations,
    currentIndex,
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
