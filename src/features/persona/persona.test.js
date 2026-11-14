import assert from "node:assert/strict";
import test from "node:test";
import { getMyPersona } from "./api.js";
import { hasPersonaContent, readPersona } from "./model.js";

const saved = {
  userId: "7",
  personaId: "persona-1",
  version: 3,
  nickname: "하루",
  mbti: "INFJ",
  confirmedAt: "2026-11-10T12:34:56Z",
  narrative: {
    headline: "천천히 깊어지는 사람",
    body: "각자의 시간을 존중해요.",
    traits: ["솔직한 대화"],
  },
  summaries: [
    {
      category: "intimacy",
      title: "천천히 가까워져요",
      content: "시간을 두고 알아가는 편이에요.",
    },
  ],
  interests: ["산책"],
  routine: [],
  datePrefer: ["조용한 카페"],
  dateAvoid: [],
};

test("saved onboarding narrative, summaries and preferences retain the AI content", () => {
  const result = readPersona(saved);
  assert.deepEqual(result.narrative, saved.narrative);
  assert.deepEqual(result.summaries, saved.summaries);
  assert.deepEqual(result.interests, ["산책"]);
  assert.deepEqual(result.datePrefer, ["조용한 카페"]);
  assert.deepEqual(result.routine, []);
  assert.deepEqual(result.dateAvoid, []);
});

test("missing narrative and empty extracted lists never create example traits", () => {
  const result = readPersona({
    ...saved,
    narrative: null,
    summaries: [],
    interests: [],
    datePrefer: [],
  });
  assert.equal(result.narrative, null);
  assert.deepEqual(result.interests, []);
  assert.deepEqual(result.summaries, []);
  assert.equal(result.conversationStyle, null);
});

test("MBTI remains displayable when the other persona sections are empty", () => {
  const result = readPersona({
    ...saved,
    narrative: null,
    summaries: [],
    interests: [],
    routine: [],
    datePrefer: [],
    dateAvoid: [],
    conversationStyle: null,
  });

  assert.equal(hasPersonaContent(result), true);
});

test("Kakao conversation style preserves extracted phrases and normalizes optional observations", () => {
  const result = readPersona({
    ...saved,
    source: "kakao",
    conversationStyle: {
      frequentPhrases: ["그랬구나", "ㅋㅋ"],
      endings: ["~용"],
      messageLength: "짧게 나누어 보내요",
      summary: "짧고 다정하게 반응해요.",
      phrase_weights: { ㅋㅋ: 0.9 },
    },
  });
  assert.deepEqual(result.conversationStyle.frequentPhrases, [
    "그랬구나",
    "ㅋㅋ",
  ]);
  assert.equal(result.conversationStyle.messageLength, "짧게 나누어 보내요");
  assert.deepEqual(result.conversationStyle.interjections, []);
  assert.equal(result.conversationStyle.questionRate, null);
  assert.equal(
    Object.hasOwn(result.conversationStyle, "phrase_weights"),
    false,
  );
});

test("partial style is usable and empty style does not invent conversation habits", () => {
  assert.equal(
    readPersona({ ...saved, conversationStyle: { laughter: "ㅋㅋ로 웃어요" } })
      .conversationStyle.laughter,
    "ㅋㅋ로 웃어요",
  );
  assert.equal(
    readPersona({ ...saved, conversationStyle: {} }).conversationStyle,
    null,
  );
  assert.equal(
    readPersona({
      ...saved,
      conversationStyle: { summary: "   ", frequentPhrases: [] },
    }).conversationStyle,
    null,
  );
});

test("invalid style fields fail without rendering arbitrary objects", () => {
  for (const conversationStyle of [
    [],
    "style",
    { summary: {} },
    { frequentPhrases: [null] },
    { messageLength: 3 },
  ]) {
    assert.throws(() => readPersona({ ...saved, conversationStyle }), {
      code: "PERSONA_RESPONSE_INVALID",
    });
  }
});

test("invalid narrative, summary categories and text lists fail instead of crashing the UI", () => {
  for (const value of [
    null,
    {},
    { ...saved, narrative: { headline: "제목", body: {} } },
    { ...saved, interests: [{}] },
    { ...saved, summaries: [{ ...saved.summaries[0], category: "__proto__" }] },
    { ...saved, summaries: [saved.summaries[0], saved.summaries[0]] },
  ]) {
    assert.throws(() => readPersona(value), {
      code: "PERSONA_RESPONSE_INVALID",
    });
  }
});

test("my persona uses an authenticated GET without a selectable user ID and supports cancellation", async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ data: saved }), {
      headers: { "content-type": "application/json" },
    });
  };
  try {
    assert.equal(
      (await getMyPersona({ signal: controller.signal })).personaId,
      "persona-1",
    );
    assert.equal(request.url, "/api/v1/persona/me");
    assert.equal(request.options.method, "GET");
    assert.equal(request.options.cache, "no-store");
    assert.equal(request.options.signal, controller.signal);
  } finally {
    globalThis.fetch = original;
  }
});
