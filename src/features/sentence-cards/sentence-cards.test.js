import assert from "node:assert/strict";
import test from "node:test";
import { answerSentenceCard, getNextSentenceCard } from "./api.js";
import {
  isSentenceCardExpired,
  parseSentenceCard,
  shouldShowFeedQuestion,
} from "./model.js";

const card = {
  cardId: "sc_example",
  sentence: "주말엔 거의 집에서 혼자 쉬어요",
  contextQuestion: "주말에는 주로 어떻게 쉬시나요?",
  question: "이런 말을 하는 사람은 어느 쪽일까요?",
  choices: [
    { choiceId: "low", label: "함께 있는 시간을 선호해요" },
    { choiceId: "high", label: "각자의 시간을 중시해요" },
    { choiceId: "unsure", label: "판단하기 어려워요" },
  ],
  expiresAt: "2099-11-12T21:00:00+09:00",
};

test("card rendering retains the server's text and choice order", () => {
  assert.equal(parseSentenceCard(card), card);
  const { contextQuestion, ...legacyCard } = card;
  assert.equal(parseSentenceCard(legacyCard), legacyCard);
  const axis = {
    ...card,
    choices: [
      { choiceId: "direct", label: "직접 말하고 있어요" },
      { choiceId: "inferred", label: "짐작할 수 있어요" },
      { choiceId: "none", label: "관련 없어요" },
      { choiceId: "unsure", label: "판단하기 어려워요" },
    ],
  };
  assert.equal(parseSentenceCard(axis), axis);
});

test("malformed cards cannot expose unusable answer controls", () => {
  for (const change of [
    { cardId: "" },
    { sentence: null },
    { question: " " },
    { contextQuestion: 123 },
    { contextQuestion: " " },
    { expiresAt: "invalid" },
    { choices: [] },
    { choices: [card.choices[0], card.choices[0], card.choices[2]] },
    { choices: [...card.choices.slice(0, 2), { choiceId: "unsure" }] },
  ]) {
    assert.throws(() => parseSentenceCard({ ...card, ...change }));
  }
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

test("card API unwraps responses and treats 204 as no card", async (t) => {
  const responses = [
    Response.json({ data: card }),
    new Response(null, { status: 204 }),
  ];
  t.mock.method(globalThis, "fetch", async (path, options) => {
    assert.equal(path, "/api/v1/users/me/sentence-cards/next");
    assert.equal(options.cache, "no-store");
    assert.equal(options.credentials, "include");
    return responses.shift();
  });
  assert.deepEqual(await getNextSentenceCard(), card);
  assert.equal(await getNextSentenceCard(), null);
});

test("answer API encodes card IDs and sends only the selected choice", async (t) => {
  t.mock.method(globalThis, "fetch", async (path, options) => {
    assert.equal(path, "/api/v1/users/me/sentence-cards/sc%2F1/answer");
    assert.equal(options.method, "POST");
    assert.deepEqual(JSON.parse(options.body), { choiceId: "unsure" });
    return Response.json({ data: { cardId: "sc/1", status: "ANSWERED" } });
  });
  assert.equal((await answerSentenceCard("sc/1", "unsure")).status, "ANSWERED");
});

test("browsing past unanswered cards excludes their IDs through GET without saving an answer", async (t) => {
  t.mock.method(globalThis, "fetch", async (path, options) => {
    const url = new URL(path, "http://localhost");
    assert.equal(url.pathname, "/api/v1/users/me/sentence-cards/next");
    assert.deepEqual(url.searchParams.getAll("excludeCardIds"), [
      "sc/1",
      "sc&2",
    ]);
    assert.equal(options.method, "GET");
    assert.equal(options.body, undefined);
    return Response.json({ data: card });
  });
  assert.deepEqual(
    await getNextSentenceCard({ excludeCardIds: ["sc/1", "sc&2", "sc/1"] }),
    card,
  );
});

test("invalid answer acknowledgements remain failures and server conflicts retain their codes", async (t) => {
  const responses = [
    Response.json({ data: { cardId: "other", status: "ANSWERED" } }),
    Response.json({ errorCode: "SENTENCE_CARD_EXPIRED" }, { status: 409 }),
  ];
  t.mock.method(globalThis, "fetch", async () => responses.shift());
  await assert.rejects(answerSentenceCard(card.cardId, "high"));
  await assert.rejects(answerSentenceCard(card.cardId, "high"), {
    code: "SENTENCE_CARD_EXPIRED",
    status: 409,
  });
});
