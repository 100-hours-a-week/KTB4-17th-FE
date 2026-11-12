import assert from "node:assert/strict";
import test from "node:test";
import {
  answerFeedbackCard,
  FEEDBACK_CARD_CONSENT_VERSION,
  getNextFeedbackCard,
} from "./api.js";
import {
  isSentenceCardExpired,
  normalizeCorrection,
  parseFeedbackCard,
  shouldShowFeedQuestion,
} from "./model.js";

const card = {
  cardId: "fc_example",
  contextQuestion: "빵 좋아하세요?",
  utterance: "저는 소금빵을 좋아해요",
  question: "내 페르소나가 다른 유저에게 한 말이에요. 나다운 대답인가요?",
  expiresAt: "2099-11-12T21:00:00+09:00",
};

test("card rendering retains the server's text, with an optional context question", () => {
  assert.equal(parseFeedbackCard(card), card);
  const withoutContext = { ...card, contextQuestion: null };
  assert.equal(parseFeedbackCard(withoutContext), withoutContext);
  const { contextQuestion, ...omitted } = card;
  assert.equal(parseFeedbackCard(omitted), omitted);
});

test("malformed cards are rejected", () => {
  for (const change of [
    { cardId: "" },
    { cardId: "x".repeat(65) },
    { utterance: null },
    { utterance: "x".repeat(301) },
    { question: " " },
    { contextQuestion: 123 },
    { contextQuestion: " " },
    { expiresAt: "invalid" },
  ]) {
    assert.throws(() => parseFeedbackCard({ ...card, ...change }));
  }
});

test("whitespace-only corrections become null", () => {
  assert.equal(normalizeCorrection("   "), null);
  assert.equal(normalizeCorrection(null), null);
  assert.equal(normalizeCorrection("  떡을 더 좋아해요 "), "떡을 더 좋아해요");
});

test("feed inserts after five profiles and excludes skipped or expired cards", () => {
  assert.equal(shouldShowFeedQuestion(4, card, null), false);
  assert.equal(shouldShowFeedQuestion(5, card, null), true);
  assert.equal(shouldShowFeedQuestion(10, card, card.cardId), false);
  assert.equal(shouldShowFeedQuestion(10, null, null), false);
  assert.equal(
    shouldShowFeedQuestion(
      10,
      { ...card, expiresAt: "2000-01-01T00:00:00Z" },
      null,
    ),
    false,
  );
  assert.equal(isSentenceCardExpired(card, Date.parse(card.expiresAt)), true);
});

test("next card is a POST to the persona feedback-card API and 204 means no card", async (t) => {
  const responses = [
    Response.json({ data: card }),
    new Response(null, { status: 204 }),
  ];
  t.mock.method(globalThis, "fetch", async (path, options) => {
    assert.equal(path, "/api/v1/persona/feedback-cards/next");
    assert.equal(options.method, "POST");
    assert.equal(options.cache, "no-store");
    assert.equal(options.credentials, "include");
    assert.equal(options.body, undefined);
    return responses.shift();
  });
  assert.deepEqual(await getNextFeedbackCard(), card);
  assert.equal(await getNextFeedbackCard(), null);
});

test("answer API encodes card IDs and sends the BE answer contract", async (t) => {
  const bodies = [];
  t.mock.method(globalThis, "fetch", async (path, options) => {
    assert.equal(path, "/api/v1/persona/feedback-cards/fc%2F1/answer");
    assert.equal(options.method, "POST");
    bodies.push(JSON.parse(options.body));
    return Response.json({ data: { cardId: "fc/1", status: "ANSWERED" } });
  });
  const answeredAt = "2026-11-12T09:00:00.000Z";
  await answerFeedbackCard("fc/1", {
    answer: "NO",
    correctionText: "떡을 더 좋아해요",
    answeredAt,
  });
  // A stray correction on YES is never sent: BE rejects it with 400.
  await answerFeedbackCard("fc/1", {
    answer: "YES",
    correctionText: "무시",
    answeredAt,
  });
  assert.deepEqual(bodies, [
    {
      answer: "NO",
      correctionText: "떡을 더 좋아해요",
      answeredAt,
      consentVersion: FEEDBACK_CARD_CONSENT_VERSION,
    },
    {
      answer: "YES",
      correctionText: null,
      answeredAt,
      consentVersion: FEEDBACK_CARD_CONSENT_VERSION,
    },
  ]);
});

test("invalid answer acknowledgements remain failures and server conflicts retain their codes", async (t) => {
  const responses = [
    Response.json({ data: { cardId: "other", status: "ANSWERED" } }),
    Response.json({ errorCode: "FEEDBACK_CARD_EXPIRED" }, { status: 409 }),
  ];
  t.mock.method(globalThis, "fetch", async () => responses.shift());
  const body = { answer: "YES", answeredAt: "2026-11-12T09:00:00.000Z" };
  await assert.rejects(answerFeedbackCard(card.cardId, body));
  await assert.rejects(answerFeedbackCard(card.cardId, body), {
    code: "FEEDBACK_CARD_EXPIRED",
    status: 409,
  });
});
