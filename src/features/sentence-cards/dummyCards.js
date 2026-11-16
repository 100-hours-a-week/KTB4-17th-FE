// Dummy sentence-judgment cards for demos while the real card data is not loaded.
// Each card shows a sentence the tagging model tagged and asks whether it is
// about that dimension. Answers stay in this tab's memory and are never sent
// to the server, so dummy answers can't end up in the training data.
// Dimension labels follow AI app/features/persona (Dimension.label).
export const DUMMY_SENTENCE_CHOICES = [
  { choiceId: "inferred", label: "짐작할 수 있어요" },
  { choiceId: "none", label: "관련 없어요" },
  { choiceId: "unsure", label: "판단하기 어려워요" },
];

export const DUMMY_SENTENCE_ITEMS = [
  {
    sentence: "답장은 생각날 때 몰아서 하는 편이에요.",
    dimension: "연락 빈도",
  },
  {
    sentence: "점심에 뭘 먹었는지 같은 소소한 얘기도 자주 나누고 싶어요.",
    dimension: "연락 빈도",
  },
  {
    sentence: "주말 중 하루는 꼭 혼자 보내는 시간이 필요해요.",
    dimension: "거리 두기",
  },
  {
    sentence: "연인이 제 일상을 다 알 필요는 없다고 생각해요.",
    dimension: "거리 두기",
  },
  {
    sentence: "답장이 늦으면 혹시 제가 뭘 잘못했나 생각하게 돼요.",
    dimension: "관계 불안",
  },
  {
    sentence: "바쁜가 보다 하고 제 할 일 하면서 기다리는 편이에요.",
    dimension: "관계 불안",
  },
  {
    sentence: "고맙거나 서운한 게 있으면 그때그때 말로 표현해요.",
    dimension: "자기·감정 표현",
  },
  {
    sentence: "힘든 일은 혼자 정리한 다음에 털어놓는 편이에요.",
    dimension: "자기·감정 표현",
  },
  {
    sentence: "우리 관계에서 아쉬운 점이 있으면 솔직하게 얘기 나누고 싶어요.",
    dimension: "솔직한 관계 대화",
  },
  {
    sentence: "같이 있으면 사소한 일에도 많이 웃는 편이에요.",
    dimension: "긍정적 상호작용",
  },
  {
    sentence: "좋아하는 마음은 자주 말해 줘야 한다고 생각해요.",
    dimension: "관계 확신 표현",
  },
  {
    sentence: "의견이 다르면 왜 그런지 들어보고 중간 지점을 찾아요.",
    dimension: "문제 해결",
  },
  {
    sentence: "다투면 일단 그 자리를 피하고 혼자 생각할 시간을 가져요.",
    dimension: "회피·철수",
  },
  {
    sentence: "화가 나면 목소리가 커지는 편이라 조심하려고 해요.",
    dimension: "감정적 맞대응",
  },
  {
    sentence: "싸우기 싫어서 웬만하면 상대 말에 맞춰 주는 편이에요.",
    dimension: "일방적 수용",
  },
  {
    sentence: "서로 믿을 수 있는 사람이 제일 중요해요.",
    dimension: "신뢰·배려",
  },
  {
    sentence: "같이 있으면 에너지가 넘치는 사람이 좋아요.",
    dimension: "매력·활발함",
  },
  {
    sentence: "자기 일을 꾸준히 해 나가는 사람에게 끌려요.",
    dimension: "능력·안정성",
  },
  {
    sentence: "서로의 일상에 오래 함께할 사람을 만나고 싶어요.",
    dimension: "관계 진지도",
  },
  {
    sentence: "요즘 퇴근하고 러닝하는 재미에 빠졌어요.",
    dimension: "연락 빈도",
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
