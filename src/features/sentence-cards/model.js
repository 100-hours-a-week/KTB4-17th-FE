export const PROFILES_BETWEEN_QUESTIONS = 5;

export function isSentenceCardExpired(card, now = Date.now()) {
  return !card || Date.parse(card.expiresAt) <= now;
}

export function parseSentenceCard(card) {
  const choices = card?.choices;
  if (
    typeof card?.cardId !== "string" ||
    !card.cardId.trim() ||
    typeof card.sentence !== "string" ||
    !card.sentence.trim() ||
    typeof card.question !== "string" ||
    !card.question.trim() ||
    (card.contextQuestion != null &&
      (typeof card.contextQuestion !== "string" ||
        !card.contextQuestion.trim())) ||
    !Number.isFinite(Date.parse(card.expiresAt)) ||
    !Array.isArray(choices) ||
    choices.length < 3 ||
    choices.length > 4 ||
    choices.some(
      (choice) =>
        typeof choice?.choiceId !== "string" ||
        !choice.choiceId.trim() ||
        typeof choice.label !== "string" ||
        !choice.label.trim(),
    ) ||
    new Set(choices.map((choice) => choice.choiceId)).size !== choices.length
  ) {
    throw new Error("질문을 불러오지 못했어요. 다시 시도해 주세요.");
  }
  return card;
}

export function shouldShowFeedQuestion(profileCount, card, skippedCardId) {
  return (
    profileCount >= PROFILES_BETWEEN_QUESTIONS &&
    Boolean(card) &&
    card.cardId !== skippedCardId &&
    !isSentenceCardExpired(card)
  );
}
