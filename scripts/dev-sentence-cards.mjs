import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
// Dimension keys and polarity follow app/features/persona/schemas.py in AI.
// contextQuestion is the original question. question is the crowd judgement prompt.
const questions = [
  {
    contextQuestion: "연인과 집에서 쉬는 날, 주로 뭘 하고 싶으세요?",
    sentence: "각자 하고 싶은 일을 하다가 저녁에 같이 영화를 보면 좋겠어요.",
    dimension: "avoidance",
    choices: [
      { choiceId: "high", label: "각자의 시간 선호" },
      { choiceId: "low", label: "함께하는 시간 선호" },
    ],
  },
  {
    contextQuestion: "좋아하는 사람에게 마음을 어떻게 전하시나요?",
    sentence:
      "고맙거나 서운한 게 있으면 혼자 담아두기보다 말로 전하는 편이에요.",
    dimension: "disclosure",
    choices: [
      { choiceId: "high", label: "감정을 표현하는 편" },
      { choiceId: "low", label: "속마음을 아끼는 편" },
    ],
  },
  {
    contextQuestion: "연인과 연락은 얼마나 자주 하는 게 좋으세요?",
    sentence:
      "점심에 뭘 먹었는지, 퇴근길에 뭘 봤는지 소소한 얘기를 자주 나누고 싶어요.",
    dimension: "contact_rhythm",
    choices: [
      { choiceId: "high", label: "수시로 연락" },
      { choiceId: "low", label: "필요할 때 연락" },
    ],
  },
  {
    contextQuestion: "연인과 의견이 다를 때 어떻게 하시나요?",
    sentence: "왜 생각이 다른지 들어보고, 둘 다 괜찮은 방법을 찾아봐요.",
    dimension: "problem_solving",
    choices: [
      { choiceId: "high", label: "대화로 해결" },
      { choiceId: "low", label: "갈등을 넘기는 편" },
    ],
  },
  {
    contextQuestion: "지금 어떤 만남을 기대하고 계세요?",
    sentence: "서로의 일상에 오래 함께할 사람을 만나고 싶어요.",
    dimension: "seriousness",
    choices: [
      { choiceId: "high", label: "진지한 만남" },
      { choiceId: "low", label: "가볍게 알아가기" },
    ],
  },
  {
    contextQuestion: "연인의 답장이 늦으면 어떤 생각이 드시나요?",
    sentence: "바쁜 일이 있나 보다 하고, 제 할 일을 하면서 기다려요.",
    dimension: "anxiety",
    choices: [
      { choiceId: "high", label: "답장이 신경 쓰이는 편" },
      { choiceId: "low", label: "느긋이 기다리는 편" },
    ],
  },
];
const names = [
  "서연",
  "지우",
  "민서",
  "하린",
  "수빈",
  "도윤",
  "시우",
  "지호",
  "은우",
  "유준",
];
const avatars = [
  "avatar-girl.svg",
  "avatar-boy.svg",
  "avatar-rose.svg",
  "avatar-violet.svg",
];
const candidates = Array.from({ length: 20 }, (_, index) => ({
  userId: index + 1,
  nickname: `${names[index % names.length]}${index >= names.length ? "별" : ""}`,
  age: 25 + (index % 6),
  region: ["서울 강남구", "서울 마포구", "경기 성남시", "서울 성동구"][
    index % 4
  ],
  job: ["IT_DATA", "CULTURE_DESIGN_MEDIA", "EDUCATION", "BUSINESS_OFFICE"][
    index % 4
  ],
  mbti: ["ENFP", "ISTJ", "INFP", "ENTJ"][index % 4],
  bio: "산책과 맛있는 커피, 편안한 대화를 좋아해요.",
  images: [
    {
      fileId: index + 1,
      displayOrder: 0,
      imageUrl: `/assets/landing/${avatars[index % avatars.length]}`,
    },
  ],
}));

let cards;
const answers = new Map();
const passed = new Set();
function reset() {
  answers.clear();
  passed.clear();
  cards = questions.map((item, index) => ({
    ...item,
    cardId: `demo_sentence_${index + 1}`,
    question: "위 질문의 답변을 보고 어떻게 느끼시나요?",
    choices: [...item.choices, { choiceId: "unsure", label: "잘 모르겠어요" }],
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  }));
}
reset();

function json(response, data, status = 200) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify({ data }));
}
function fail(response, status, errorCode) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ errorCode }));
}

async function handleApi(request, response, next) {
  const url = new URL(request.url, "http://localhost");
  const path = url.pathname;
  if (path === "/__demo/reset") {
    reset();
    response.writeHead(302, { Location: "/home" });
    response.end();
    return;
  }
  if (!path.startsWith("/api/v1/")) return next();

  // This middleware belongs to the dedicated preview server only.
  if (path === "/api/v1/auth/token/refresh") {
    return json(response, {
      tokenType: "Bearer",
      accessToken: "demo.eyJzdWIiOiJzZW50ZW5jZS1jYXJkLWRlbW8ifQ.demo",
    });
  }
  if (path === "/api/v1/users/me/onboarding") {
    return json(response, {
      userStatus: "ACTIVE",
      onboardingNextStep: "COMPLETE",
    });
  }
  if (path === "/api/v1/users/me/profile") {
    return json(response, {
      nickname: "레나",
      birthDate: "2000-01-01",
      activityRegionName: "서울 마포구",
      profileImageUrl: "/assets/user-avatar.png",
    });
  }
  if (
    path === "/api/v1/recommendation-batches/active" ||
    path === "/api/v1/recommendation-batches"
  ) {
    return json(response, { batchId: 1 });
  }
  if (path === "/api/v1/recommendation-batches/1/items") {
    return json(response, {
      items: candidates
        .filter((candidate) => !passed.has(candidate.userId))
        .map((candidate) => ({ candidate })),
      pageInfo: { hasNext: false, nextCursor: null },
    });
  }
  if (path === "/api/v1/users/me/sentence-cards/next") {
    const excluded = new Set(url.searchParams.getAll("excludeCardIds"));
    const card = cards.find(
      (item) => !answers.has(item.cardId) && !excluded.has(item.cardId),
    );
    if (card) return json(response, card);
    response.writeHead(204);
    response.end();
    return;
  }
  const answerRoute = path.match(
    /^\/api\/v1\/users\/me\/sentence-cards\/([^/]+)\/answer$/,
  );
  if (answerRoute && request.method === "POST") {
    const cardId = decodeURIComponent(answerRoute[1]);
    const card = cards.find((item) => item.cardId === cardId);
    if (!card) return fail(response, 404, "SENTENCE_CARD_NOT_FOUND");
    let body = "";
    for await (const chunk of request) body += chunk;
    let choiceId;
    try {
      ({ choiceId } = JSON.parse(body));
    } catch {
      return fail(response, 400, "INVALID_SENTENCE_CARD_ANSWER");
    }
    if (!card.choices.some((choice) => choice.choiceId === choiceId))
      return fail(response, 400, "INVALID_SENTENCE_CARD_ANSWER");
    if (answers.has(cardId) && answers.get(cardId) !== choiceId)
      return fail(response, 409, "SENTENCE_CARD_ALREADY_ANSWERED");
    answers.set(cardId, choiceId);
    await new Promise((resolve) => setTimeout(resolve, 300));
    return json(response, { cardId, status: "ANSWERED" });
  }
  const passRoute = path.match(
    /^\/api\/v1\/users\/me\/recommendation-passes\/(\d+)$/,
  );
  if (passRoute && request.method === "PUT") {
    passed.add(Number(passRoute[1]));
    return json(response, {});
  }
  if (path === "/api/v1/likes" && request.method === "POST")
    return json(response, {});
  if (path === "/api/v1/notifications/unread-count")
    return json(response, { unreadCount: 0 });
  if (path === "/api/v1/notifications/stream") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    response.write("event: connected\ndata: {}\n\n");
    const heartbeat = setInterval(
      () => response.write(": heartbeat\n\n"),
      20000,
    );
    response.on("close", () => clearInterval(heartbeat));
    return;
  }
  if (
    [
      "/api/v1/notifications",
      "/api/v1/chat-rooms",
      "/api/v1/likes/sent",
      "/api/v1/likes/received",
    ].includes(path)
  ) {
    return json(response, {
      items: [],
      totalUnreadCount: 0,
      pageInfo: { hasNext: false },
    });
  }
  return fail(response, 501, "DEMO_FEATURE_UNAVAILABLE");
}

const server = await createServer({
  configFile: false,
  root,
  define: { "import.meta.env.VITE_API_BASE_URL": JSON.stringify("") },
  server: { host: "127.0.0.1", port: 5187, strictPort: true },
  plugins: [
    {
      name: "sentence-cards-preview",
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          handleApi(request, response, next).catch(() =>
            fail(response, 500, "INTERNAL_SERVER_ERROR"),
          );
        });
      },
    },
  ],
});
await server.listen();
console.log("목업 실행 화면 http://127.0.0.1:5187/home");
console.log("질문에 답하기 http://127.0.0.1:5187/my/questions");
console.log("목업 처음부터 http://127.0.0.1:5187/__demo/reset");
