import { useCallback, useEffect, useRef, useState } from "react";
import { AUTH_SESSION_CLEARED_EVENT } from "../../shared/api/authToken.js";
import { apiErrorMessage } from "../../shared/api/errorMessages.js";
import { answerSentenceCard, getNextSentenceCard } from "./api.js";
import { isSentenceCardExpired } from "./model.js";

const initialState = {
  card: null,
  status: "idle",
  selectedChoice: "",
  submitting: false,
  loadingNext: false,
  error: "",
  skippedCardId: null,
};

// Owned by AppRouter so navigating between the feed and Q&A retains the card.
export function useSentenceCards({ enabled }) {
  const [state, setState] = useState(initialState);
  const stateRef = useRef(state);
  const generation = useRef(0);
  const pending = useRef(null);
  const controller = useRef(null);
  const submission = useRef(null);
  const deferred = useRef(new Map());

  const update = useCallback((change) => {
    stateRef.current = { ...stateRef.current, ...change };
    setState(stateRef.current);
  }, []);

  useEffect(() => {
    function clear() {
      generation.current += 1;
      controller.current?.abort();
      pending.current = null;
      submission.current = null;
      deferred.current.clear();
      stateRef.current = initialState;
      setState(initialState);
    }
    if (!enabled) clear();
    window.addEventListener(AUTH_SESSION_CLEARED_EVENT, clear);
    return () => {
      window.removeEventListener(AUTH_SESSION_CLEARED_EVENT, clear);
      generation.current += 1;
      controller.current?.abort();
      pending.current = null;
      submission.current = null;
    };
  }, [enabled]);

  const takeDeferred = useCallback(() => {
    for (const [id, card] of deferred.current) {
      deferred.current.delete(id);
      if (!isSentenceCardExpired(card)) return card;
    }
    return null;
  }, []);

  const load = useCallback(
    (retry = false) => {
      if (!enabled) return Promise.resolve(null);
      if (pending.current) return pending.current;
      const current = stateRef.current;
      if (current.submitting) return Promise.resolve(current.card);
      if (current.card && !isSentenceCardExpired(current.card))
        return Promise.resolve(current.card);
      if (!retry && (current.status === "empty" || current.status === "error"))
        return Promise.resolve(null);

      const requestGeneration = generation.current;
      controller.current = new AbortController();
      update({ card: null, status: "loading", selectedChoice: "", error: "" });
      const request = getNextSentenceCard({
        signal: controller.current.signal,
        excludeCardIds: [...deferred.current.keys()],
      })
        .then((card) => {
          if (requestGeneration !== generation.current) return null;
          const available =
            card && !isSentenceCardExpired(card) ? card : takeDeferred();
          if (available) deferred.current.delete(available.cardId);
          update({ card: available, status: available ? "ready" : "empty" });
          return available;
        })
        .catch((error) => {
          if (requestGeneration !== generation.current) return null;
          update({
            status: "error",
            error: apiErrorMessage(
              error,
              "질문을 불러오지 못했어요. 다시 시도해 주세요.",
            ),
          });
          return null;
        })
        .finally(() => {
          if (pending.current === request) pending.current = null;
        });
      pending.current = request;
      return request;
    },
    [enabled, takeDeferred, update],
  );

  const skipQuestion = useCallback(() => {
    const current = stateRef.current;
    if (!enabled || !current.card || current.submitting || pending.current)
      return Promise.resolve(false);
    const previous = current.card;
    const requestGeneration = generation.current;
    controller.current = new AbortController();
    update({ loadingNext: true, error: "" });
    const request = getNextSentenceCard({
      signal: controller.current.signal,
      excludeCardIds: [...deferred.current.keys(), previous.cardId],
    })
      .then((card) => {
        if (requestGeneration !== generation.current) return false;
        if (card?.cardId === previous.cardId) throw new Error("Repeated card");
        const next =
          card && !isSentenceCardExpired(card) ? card : takeDeferred();
        if (!next) {
          update({
            loadingNext: false,
            error:
              "지금은 다른 질문이 없어요. 이 질문에 답하거나 나중에 다시 참여해 주세요.",
          });
          return false;
        }
        deferred.current.delete(next.cardId);
        if (!isSentenceCardExpired(previous))
          deferred.current.set(previous.cardId, previous);
        update({
          card: next,
          status: "ready",
          selectedChoice: "",
          loadingNext: false,
        });
        return true;
      })
      .catch((error) => {
        if (requestGeneration !== generation.current) return false;
        update({
          loadingNext: false,
          error: apiErrorMessage(
            error,
            "다음 질문을 불러오지 못했어요. 다시 넘겨 주세요.",
          ),
        });
        return false;
      })
      .finally(() => {
        if (pending.current === request) pending.current = null;
      });
    pending.current = request;
    return request;
  }, [enabled, takeDeferred, update]);

  const select = useCallback(
    (choiceId) => {
      const { card, submitting, loadingNext } = stateRef.current;
      if (
        submitting ||
        loadingNext ||
        isSentenceCardExpired(card) ||
        !card.choices.some((choice) => choice.choiceId === choiceId)
      )
        return;
      update({ selectedChoice: choiceId, error: "" });
    },
    [update],
  );

  const answer = useCallback(() => {
    if (submission.current) return submission.current;
    const { card, selectedChoice } = stateRef.current;
    if (!enabled || !card || !selectedChoice || stateRef.current.loadingNext)
      return Promise.resolve(false);
    if (isSentenceCardExpired(card)) {
      update({
        card: null,
        status: "idle",
        selectedChoice: "",
        error: "질문이 만료됐어요. 새 질문을 받아 주세요.",
      });
      return Promise.resolve(false);
    }

    const requestGeneration = generation.current;
    controller.current = new AbortController();
    update({ submitting: true, error: "" });
    const request = answerSentenceCard(card.cardId, selectedChoice, {
      signal: controller.current.signal,
    })
      .then(() => {
        if (requestGeneration !== generation.current) return false;
        deferred.current.delete(card.cardId);
        update({
          card: null,
          status: "idle",
          selectedChoice: "",
          submitting: false,
          skippedCardId: null,
        });
        return true;
      })
      .catch((error) => {
        if (requestGeneration !== generation.current) return false;
        const unavailable = [
          "SENTENCE_CARD_EXPIRED",
          "SENTENCE_CARD_ALREADY_ANSWERED",
          "SENTENCE_CARD_NOT_FOUND",
          "NOT_SENTENCE_CARD_OWNER",
        ].includes(error?.code);
        update({
          submitting: false,
          ...(unavailable
            ? { card: null, status: "idle", selectedChoice: "" }
            : {}),
          error: unavailable
            ? "이 질문은 더 이상 답할 수 없어요. 새 질문을 받아 주세요."
            : apiErrorMessage(
                error,
                "답변을 저장하지 못했어요. 다시 시도해 주세요.",
              ),
        });
        return false;
      })
      .finally(() => {
        if (submission.current === request) submission.current = null;
      });
    submission.current = request;
    return request;
  }, [enabled, update]);

  const skipInFeed = useCallback(() => {
    if (stateRef.current.submitting || stateRef.current.loadingNext) return;
    update({ skippedCardId: stateRef.current.card?.cardId ?? null });
  }, [update]);

  useEffect(() => {
    if (!state.card || state.submitting) return;
    const expire = () => {
      if (!isSentenceCardExpired(stateRef.current.card)) return;
      update({
        card: null,
        status: "idle",
        selectedChoice: "",
        error: "질문이 만료됐어요. 새 질문을 받아 주세요.",
      });
    };
    const timer = window.setTimeout(
      expire,
      Math.min(
        Math.max(0, Date.parse(state.card.expiresAt) - Date.now()),
        2_147_483_647,
      ),
    );
    window.addEventListener("focus", expire);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", expire);
    };
  }, [state.card, state.submitting, update]);

  return { ...state, load, select, answer, skipInFeed, skipQuestion };
}
