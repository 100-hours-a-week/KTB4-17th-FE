import { apiRequest } from "../../shared/api/client.js";
import { parseSentenceCard } from "./model.js";

export async function getNextSentenceCard({
  signal,
  excludeCardIds = [],
} = {}) {
  const params = new URLSearchParams();
  for (const cardId of new Set(excludeCardIds))
    params.append("excludeCardIds", cardId);
  const query = params.size ? `?${params}` : "";
  const card = await apiRequest(
    `/api/v1/users/me/sentence-cards/next${query}`,
    {
      cache: "no-store",
      signal,
    },
  );
  return card == null ? null : parseSentenceCard(card);
}

export async function answerSentenceCard(cardId, choiceId, { signal } = {}) {
  const result = await apiRequest(
    `/api/v1/users/me/sentence-cards/${encodeURIComponent(cardId)}/answer`,
    { method: "POST", body: { choiceId }, signal },
  );
  if (result?.cardId !== cardId || result.status !== "ANSWERED") {
    throw new Error("답변 저장 결과를 확인하지 못했어요. 다시 시도해 주세요.");
  }
  return result;
}
