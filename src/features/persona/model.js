export const PERSONA_AREAS = {
  intimacy: { label: "친밀감과 거리", icon: "heart" },
  communication: { label: "마음을 나누는 방식", icon: "chat" },
  conflict: { label: "의견이 다를 때", icon: "alert" },
  ideal: { label: "내가 끌리는 사람", icon: "spark" },
  orientation: { label: "바라는 관계", icon: "send" },
};

export const STYLE_LIST_LABELS = {
  frequentPhrases: "자주 쓰는 표현",
  endings: "말끝 습관",
  interjections: "감탄사와 추임새",
  slang: "줄임말과 신조어",
};

export const STYLE_DETAIL_LABELS = {
  messageLength: "메시지 길이",
  reaction: "반응하는 방식",
  laughter: "웃음 표현",
  questionRate: "질문하는 방식",
  punctuation: "문장부호",
  selfTalk: "내 이야기 나누기",
  humor: "유머와 장난",
  initiative: "대화 이끌기",
};

function invalidPersona() {
  return Object.assign(new Error("PERSONA_RESPONSE_INVALID"), {
    code: "PERSONA_RESPONSE_INVALID",
  });
}

function texts(value) {
  if (value == null) return [];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !item.trim())
  )
    throw invalidPersona();
  return value;
}

function readConversationStyle(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw invalidPersona();
  const style = {};
  for (const field of Object.keys(STYLE_LIST_LABELS))
    style[field] = texts(value[field]);
  for (const field of ["summary", ...Object.keys(STYLE_DETAIL_LABELS)]) {
    if (value[field] != null && typeof value[field] !== "string")
      throw invalidPersona();
    style[field] = value[field]?.trim() || null;
  }
  return Object.values(style).some((item) =>
    Array.isArray(item) ? item.length > 0 : Boolean(item),
  )
    ? style
    : null;
}

export function readPersona(value) {
  if (
    !value ||
    typeof value.personaId !== "string" ||
    !value.personaId.trim() ||
    !Array.isArray(value.summaries) ||
    (value.mbti != null && typeof value.mbti !== "string")
  )
    throw invalidPersona();
  const categories = new Set();
  for (const summary of value.summaries) {
    if (
      !summary ||
      !Object.hasOwn(PERSONA_AREAS, summary.category) ||
      categories.has(summary.category) ||
      typeof summary.title !== "string" ||
      !summary.title.trim() ||
      typeof summary.content !== "string" ||
      !summary.content.trim()
    )
      throw invalidPersona();
    categories.add(summary.category);
  }
  const narrative = value.narrative;
  if (
    narrative != null &&
    (typeof narrative.headline !== "string" ||
      !narrative.headline.trim() ||
      typeof narrative.body !== "string" ||
      !narrative.body.trim())
  )
    throw invalidPersona();
  return {
    ...value,
    narrative: narrative
      ? { ...narrative, traits: texts(narrative.traits) }
      : null,
    interests: texts(value.interests),
    routine: texts(value.routine),
    datePrefer: texts(value.datePrefer),
    dateAvoid: texts(value.dateAvoid),
    conversationStyle: readConversationStyle(value.conversationStyle),
  };
}
