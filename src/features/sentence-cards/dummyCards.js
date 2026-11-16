// Dummy feedback cards for demos while the persona utterance data is not loaded.
// Answers stay in this tab's memory and are never sent to the server,
// so dummy answers can't end up in the training data.
export const DUMMY_FEEDBACK_QUESTION =
  "내 페르소나가 다른 유저에게 한 말이에요. 나다운 대답인가요?";

export const DUMMY_FEEDBACK_ITEMS = [
  {
    contextQuestion: "연인과 집에서 쉬는 날, 주로 뭘 하고 싶으세요?",
    utterance: "각자 하고 싶은 일을 하다가 저녁에 같이 영화를 보면 좋겠어요.",
  },
  {
    contextQuestion: "좋아하는 사람에게 마음을 어떻게 전하시나요?",
    utterance:
      "고맙거나 서운한 게 있으면 혼자 담아두기보다 말로 전하는 편이에요.",
  },
  {
    contextQuestion: "연인과 연락은 얼마나 자주 하는 게 좋으세요?",
    utterance:
      "점심에 뭘 먹었는지, 퇴근길에 뭘 봤는지 소소한 얘기를 자주 나누고 싶어요.",
  },
  {
    contextQuestion: "연인과 의견이 다를 때 어떻게 하시나요?",
    utterance: "왜 생각이 다른지 들어보고, 둘 다 괜찮은 방법을 찾아봐요.",
  },
  {
    contextQuestion: "지금 어떤 만남을 기대하고 계세요?",
    utterance: "서로의 일상에 오래 함께할 사람을 만나고 싶어요.",
  },
  {
    contextQuestion: "연인의 답장이 늦으면 어떤 생각이 드시나요?",
    utterance: "바쁜 일이 있나 보다 하고, 제 할 일을 하면서 기다려요.",
  },
  {
    contextQuestion: "주말에는 보통 어떻게 시간을 보내세요?",
    utterance:
      "토요일엔 밖에서 사람들 만나고, 일요일엔 집에서 푹 쉬는 편이에요.",
  },
  {
    contextQuestion: "첫 데이트로 어디가 좋으세요?",
    utterance:
      "조용한 카페에서 이야기 나누다가 근처 공원을 같이 걸으면 좋겠어요.",
  },
  {
    contextQuestion: "연인에게 서운할 때는 어떻게 하세요?",
    utterance:
      "바로 말하기보다는 조금 생각을 정리한 다음에 차분하게 얘기하는 편이에요.",
  },
  {
    contextQuestion: "좋아하는 음식이 뭐예요?",
    utterance: "매운 걸 좋아해서 떡볶이 맛집 찾아다니는 게 취미예요.",
  },
  {
    contextQuestion: "연애할 때 가장 중요하게 생각하는 게 뭐예요?",
    utterance: "서로 믿을 수 있는 게 제일 중요하다고 생각해요.",
  },
  {
    contextQuestion: "연인과 여행 계획은 어떻게 세우세요?",
    utterance:
      "숙소랑 큰 일정만 정해 두고 나머지는 가서 즉흥적으로 정하는 게 좋아요.",
  },
  {
    contextQuestion: "힘든 일이 있을 때 연인에게 기대는 편이세요?",
    utterance: "혼자 해결해 보다가 도저히 안 될 때 털어놓는 편이에요.",
  },
  {
    contextQuestion: "연인의 친구들과도 친해지고 싶으세요?",
    utterance: "자연스럽게 기회가 되면 같이 어울리고 싶어요.",
  },
  {
    contextQuestion: "기념일은 챙기는 편이세요?",
    utterance: "큰 이벤트보다는 손편지 같은 작은 선물로 챙기는 걸 좋아해요.",
  },
  {
    contextQuestion: "연인과 다툰 뒤에는 먼저 연락하는 편이세요?",
    utterance: "누가 잘못했든 오래 끌기 싫어서 제가 먼저 연락하는 편이에요.",
  },
  {
    contextQuestion: "요즘 빠져 있는 취미가 있나요?",
    utterance:
      "퇴근하고 러닝하는 재미에 빠졌어요. 같이 뛸 사람이면 더 좋겠어요.",
  },
  {
    contextQuestion: "연인과 데이트 비용은 어떻게 나누는 게 좋으세요?",
    utterance: "번갈아 가면서 내거나 데이트 통장을 만드는 게 편할 것 같아요.",
  },
  {
    contextQuestion: "연인이 이성 친구와 단둘이 만나면 어떠세요?",
    utterance: "미리 말해 주기만 하면 크게 신경 쓰지 않아요.",
  },
  {
    contextQuestion: "10년 뒤 어떤 모습으로 살고 싶으세요?",
    utterance:
      "좋아하는 사람과 작은 집에서 강아지 키우면서 평범하게 살고 싶어요.",
  },
];

export function dummyFeedbackCards(now = Date.now()) {
  return DUMMY_FEEDBACK_ITEMS.map((item, index) => ({
    cardId: `demo_feedback_${index + 1}`,
    ...item,
    question: DUMMY_FEEDBACK_QUESTION,
    expiresAt: new Date(now + 86_400_000).toISOString(),
  }));
}

// Mirrors the BE contract: the same card until it is answered, then null (204).
export function createDummyFeedbackStore(now = () => Date.now()) {
  const cards = dummyFeedbackCards(now());
  const answered = new Set();
  return {
    next: () => cards.find((card) => !answered.has(card.cardId)) ?? null,
    answer(cardId) {
      if (!cards.some((card) => card.cardId === cardId)) {
        const error = new Error("이 질문은 더 이상 답할 수 없어요.");
        error.code = "FEEDBACK_CARD_NOT_AVAILABLE";
        throw error;
      }
      answered.add(cardId);
      return { cardId, status: "ANSWERED" };
    },
  };
}
