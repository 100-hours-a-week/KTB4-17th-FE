// Dummy sentence-judgment cards for demos while the real card data is not loaded.
// Each card shows a tagged sentence and asks whether it is about that dimension.
// Sentences come from AI data/사람검수표_csv/02_태깅검수_60문항.csv; the dimensions
// are hand-picked dummy tags (labels follow AI persona Dimension.label).
// Answers stay in this tab's memory and are never sent to the server,
// so dummy answers can't end up in the training data.
// Choices and their order follow the AI sentence-card AXIS question.
export const DUMMY_SENTENCE_CHOICES = [
  { choiceId: "direct", label: "직접 말하고 있어요" },
  { choiceId: "inferred", label: "짐작할 수 있어요" },
  { choiceId: "none", label: "관련 없어요" },
  { choiceId: "unsure", label: "판단하기 어려워요" },
];

export const DUMMY_SENTENCE_ITEMS = [
  {
    sentence: "휴일에도 제 작업실에서 혼자 보내는 시간을 꼭 남겨 두고 싶어요.",
    dimension: "거리 두기",
  },
  {
    sentence: "답이 오지 않으면 제가 싫어진 건가 싶어 대화창을 계속 확인해요.",
    dimension: "관계 불안",
  },
  {
    sentence: "답이 늦으면 바쁜가 보다 하고 제 할 일을 하며 기다려요.",
    dimension: "관계 불안",
  },
  {
    sentence: "기쁘거나 속상한 일이 생기면 어떤 기분인지 바로 말로 전해요.",
    dimension: "자기·감정 표현",
  },
  {
    sentence: "기분이 어땠는지는 말하지 않고 혼자 일기에만 적어 둬요.",
    dimension: "자기·감정 표현",
  },
  {
    sentence: "사소한 얘기에도 웃으며 반갑다고 하고 다정한 말을 자주 건네요.",
    dimension: "긍정적 상호작용",
  },
  {
    sentence: "다음 계절에도 함께하고 싶다고 제 마음을 먼저 자주 말해요.",
    dimension: "관계 확신 표현",
  },
  {
    sentence: "식사할 때나 이동할 때마다 짧게라도 종일 소식을 나누고 싶어요.",
    dimension: "연락 빈도",
  },
  {
    sentence: "용건이 생겼을 때만 연락하고 일상 보고는 안 하는 게 편해요.",
    dimension: "연락 빈도",
  },
  {
    sentence: "서로 이유를 적어 보고 둘 다 받아들일 수 있는 해결책을 정해요.",
    dimension: "문제 해결",
  },
  {
    sentence:
      "서랍에서 예전에 둘이 적은 종이를 찾았어요. 서로 불편했던 점 옆에 바꿀 수 있는 것들이 화살표로 이어져 있더라고요.",
    dimension: "문제 해결",
  },
  {
    sentence: "화가 나면 목소리가 커지고 상대 말에 날카롭게 받아치게 돼요.",
    dimension: "감정적 맞대응",
  },
  {
    sentence: "제 생각이 달라도 다툼을 끝내려고 상대 말이 전부 맞다고 해요.",
    dimension: "일방적 수용",
  },
  {
    sentence: "아무리 끌려도 약속을 어기고 남을 함부로 대하면 만나기 어려워요.",
    dimension: "신뢰·배려",
  },
  {
    sentence: "밝게 웃고 에너지 넘치는 분위기에 가장 먼저 끌려요.",
    dimension: "매력·활발함",
  },
  {
    sentence: "처음부터 오래 함께할 사람을 찾고 있고 장기적인 관계를 원해요.",
    dimension: "관계 진지도",
  },
  {
    sentence: "작은 종이로 새 모양을 접는 데 푹 빠졌어요.",
    dimension: "관심사",
  },
  {
    sentence: "저녁 식사 뒤에는 식물에 물을 주고 책을 읽어요.",
    dimension: "일상",
  },
  {
    sentence: "도자기 공방에서 함께 컵을 만들어 보고 싶어요.",
    dimension: "선호 데이트",
  },
  {
    sentence: "주중 개인 일정은 지키고 싶지만 중요한 고민은 꼭 말로 나눠요.",
    dimension: "거리 두기",
  },
];

export function dummySentenceCards(now = Date.now()) {
  return DUMMY_SENTENCE_ITEMS.map((item, index) => ({
    cardId: `demo_sentence_${index + 1}`,
    sentence: item.sentence,
    question: `보여드린 문장, '${item.dimension}' 이야기가 맞나요?`,
    choices: DUMMY_SENTENCE_CHOICES,
    expiresAt: new Date(now + 86_400_000).toISOString(),
  }));
}

// Same flow as the card API: the same card until it is answered, then null (204).
export function createDummyCardStore(now = () => Date.now()) {
  const cards = dummySentenceCards(now());
  const answered = new Set();
  return {
    next: () => cards.find((card) => !answered.has(card.cardId)) ?? null,
    answer(cardId, choiceId) {
      const card = cards.find((item) => item.cardId === cardId);
      if (!card?.choices.some((c) => c.choiceId === choiceId)) {
        const error = new Error("이 질문은 더 이상 답할 수 없어요.");
        error.code = "FEEDBACK_CARD_NOT_AVAILABLE";
        throw error;
      }
      answered.add(cardId);
      return { cardId, status: "ANSWERED" };
    },
  };
}
