import { apiRequest } from "../../shared/api/client.js";
import { parseFeedbackCard } from "./model.js";

// BE requires the consent version the user agreed to for feedback-card use.
// Replace with the real terms version once the consent flow exists.
export const FEEDBACK_CARD_CONSENT_VERSION = "feedback-card-2026-11";

export async function getNextFeedbackCard({ signal } = {}) {
  const card = await apiRequest("/api/v1/persona/feedback-cards/next", {
    method: "POST",
    cache: "no-store",
    signal,
  });
  return card == null ? null : parseFeedbackCard(card);
}

// Retries must resend the same answer, correctionText and answeredAt:
// the server treats any difference as a conflicting second answer.
export async function answerFeedbackCard(
  cardId,
  { answer, correctionText = null, answeredAt },
  { signal } = {},
) {
  const result = await apiRequest(
    `/api/v1/persona/feedback-cards/${encodeURIComponent(cardId)}/answer`,
    {
      method: "POST",
      body: {
        answer,
        correctionText: answer === "NO" ? correctionText : null,
        answeredAt,
        consentVersion: FEEDBACK_CARD_CONSENT_VERSION,
      },
      signal,
    },
  );
  if (result?.cardId !== cardId || result.status !== "ANSWERED") {
    throw new Error("답변 저장 결과를 확인하지 못했어요. 다시 시도해 주세요.");
  }
  return result;
}
