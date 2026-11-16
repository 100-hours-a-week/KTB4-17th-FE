import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { dummyFeedbackCards } from "../src/features/sentence-cards/dummyCards.js";

const root = fileURLToPath(new URL("../", import.meta.url));
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
  // Same dummy cards the app serves with VITE_DEMO_MODE=true.
  cards = dummyFeedbackCards();
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
  // Like AI, the same card is returned until it is answered.
  if (
    path === "/api/v1/persona/feedback-cards/next" &&
    request.method === "POST"
  ) {
    const card = cards.find((item) => !answers.has(item.cardId));
    if (card) return json(response, card);
    response.writeHead(204);
    response.end();
    return;
  }
  const answerRoute = path.match(
    /^\/api\/v1\/persona\/feedback-cards\/([^/]+)\/answer$/,
  );
  if (answerRoute && request.method === "POST") {
    const cardId = decodeURIComponent(answerRoute[1]);
    const card = cards.find((item) => item.cardId === cardId);
    if (!card) return fail(response, 404, "FEEDBACK_CARD_NOT_AVAILABLE");
    let body = "";
    for await (const chunk of request) body += chunk;
    let answer;
    try {
      answer = JSON.parse(body);
    } catch {
      return fail(response, 400, "INVALID_REQUEST");
    }
    if (
      !["YES", "NO"].includes(answer.answer) ||
      (answer.answer === "YES" && answer.correctionText != null) ||
      !answer.answeredAt ||
      !answer.consentVersion
    )
      return fail(response, 400, "INVALID_REQUEST");
    const key = JSON.stringify(answer);
    if (answers.has(cardId) && answers.get(cardId) !== key)
      return fail(response, 409, "FEEDBACK_CARD_ALREADY_ANSWERED");
    answers.set(cardId, key);
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
