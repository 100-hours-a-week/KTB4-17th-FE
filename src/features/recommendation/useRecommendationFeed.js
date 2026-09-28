import { useCallback, useEffect, useRef, useState } from "react";
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
    moreRequestRef.current = true;
    try {
      const result = await recommendationApi.recommendationItems(
        page.batchId,
        page.nextCursor,
      );
      const items = (result?.items || [])
        .map(mapRecommendationItem)
        .filter(Boolean);
      setRecommendations((current) => [...current, ...items]);
      setPage((current) => ({
        ...current,
        nextCursor: result?.pageInfo?.nextCursor || null,
        hasNext: Boolean(result?.pageInfo?.hasNext),
      }));
      return items.length > 0;
    } catch (requestError) {
      setError(requestError?.code || "RECOMMENDATIONS_UNAVAILABLE");
      return false;
    } finally {
      moreRequestRef.current = false;
    }
  }, [page]);

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

  return {
    recommendations,
    currentIndex,
    hasNext: page.hasNext,
    status,
    error,
    load,
    loadMore,
    advance,
  };
}
