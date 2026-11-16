import { useCallback, useEffect, useRef, useState } from "react";
import { AUTH_SESSION_CLEARED_EVENT } from "../../shared/api/authToken.js";
import { apiErrorMessage } from "../../shared/api/errorMessages.js";
import { answerFeedbackCard, getNextFeedbackCard } from "./api.js";
import {
  FEEDBACK_ANSWERS,
  isSentenceCardExpired,
  normalizeCorrection,
} from "./model.js";

const initialState = {
  card: null,
  status: "idle",
  selectedChoice: "",
  submitting: false,
  error: "",
  skippedCardId: null,
};

const UNAVAILABLE_CODES = [
  "FEEDBACK_CARD_EXPIRED",
  "FEEDBACK_CARD_ALREADY_ANSWERED",
  "FEEDBACK_CARD_NOT_AVAILABLE",
];

// Owned by AppRouter so navigating between the feed and Q&A retains the card.
// The server keeps returning the same card until it is answered or expires,
// so there is no "next card" without answering.
export function useSentenceCards({ enabled }) {
  const [state, setState] = useState(initialState);
  const stateRef = useRef(state);
  const generation = useRef(0);
  const pending = useRef(null);
  const controller = useRef(null);
  const submission = useRef(null);
  // The first attempt's payload, reused verbatim on retry.
  const attempt = useRef(null);

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
      attempt.current = null;
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
      const request = getNextFeedbackCard({ signal: controller.current.signal })
        .then((card) => {
          if (requestGeneration !== generation.current) return null;
          const available = card && !isSentenceCardExpired(card) ? card : null;
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
    [enabled, update],
  );

  const select = useCallback(
    (choice) => {
      const { card, submitting } = stateRef.current;
      if (
        submitting ||
        isSentenceCardExpired(card) ||
        !FEEDBACK_ANSWERS.includes(choice)
      )
        return;
      update({ selectedChoice: choice, error: "" });
    },
    [update],
  );

  const answer = useCallback(
    (correctionText = null) => {
      if (submission.current) return submission.current;
      const { card, selectedChoice } = stateRef.current;
      if (!enabled || !card || !FEEDBACK_ANSWERS.includes(selectedChoice))
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

      const payload = {
        answer: selectedChoice,
        correctionText:
          selectedChoice === "NO" ? normalizeCorrection(correctionText) : null,
      };
      const previous = attempt.current;
      const sameAttempt =
        previous?.cardId === card.cardId &&
        previous.answer === payload.answer &&
        previous.correctionText === payload.correctionText;
      attempt.current = sameAttempt
        ? previous
        : {
            cardId: card.cardId,
            ...payload,
            answeredAt: new Date().toISOString(),
          };
      const { answeredAt } = attempt.current;

      const requestGeneration = generation.current;
      controller.current = new AbortController();
      update({ submitting: true, error: "" });
      const request = answerFeedbackCard(
        card.cardId,
        { ...payload, answeredAt },
        { signal: controller.current.signal },
      )
        .then(() => {
          if (requestGeneration !== generation.current) return false;
          attempt.current = null;
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
          const unavailable = UNAVAILABLE_CODES.includes(error?.code);
          if (unavailable) attempt.current = null;
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
    },
    [enabled, update],
  );

  const skipInFeed = useCallback(() => {
    if (stateRef.current.submitting) return;
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

  return { ...state, load, select, answer, skipInFeed };
}
