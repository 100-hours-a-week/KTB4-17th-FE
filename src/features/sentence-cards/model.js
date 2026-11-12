export const PROFILES_BETWEEN_QUESTIONS = 5;
export const FEEDBACK_ANSWERS = ["YES", "NO"];
export const CORRECTION_MAX_LENGTH = 200;

export function isSentenceCardExpired(card, now = Date.now()) {
  return !card || Date.parse(card.expiresAt) <= now;
}

const text = (value, max) =>
  typeof value === "string" && value.trim() !== "" && value.length <= max;

export function parseFeedbackCard(card) {
  if (
    !text(card?.cardId, 64) ||
    !text(card.utterance, 300) ||
    !text(card.question, 200) ||
    (card.contextQuestion != null && !text(card.contextQuestion, 200)) ||
    !Number.isFinite(Date.parse(card.expiresAt))
  ) {
    throw new Error("질문을 불러오지 못했어요. 다시 시도해 주세요.");
  }
  return card;
}

// Whitespace-only corrections are sent as null, per the feedback-card spec.
export function normalizeCorrection(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed.slice(0, CORRECTION_MAX_LENGTH) : null;
}

export function shouldShowFeedQuestion(profileCount, card, skippedCardId) {
  return (
    profileCount >= PROFILES_BETWEEN_QUESTIONS &&
    Boolean(card) &&
    card.cardId !== skippedCardId &&
    !isSentenceCardExpired(card)
  );
}
