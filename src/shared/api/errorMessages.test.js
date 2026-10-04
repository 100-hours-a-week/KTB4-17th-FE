import assert from "node:assert/strict";
import test from "node:test";
import {
  chatListErrorMessage,
  chatRoomErrorMessage,
  chatSendErrorMessage,
} from "../../features/chat/model.js";
import { profilePhotoErrorMessage } from "../../features/profile/photoUpload.js";
import { apiErrorMessage, createApiError } from "./errorMessages.js";

test("API errors show a translated message and preserve control flow metadata", () => {
  const fields = [{ field: "nickname", message: "must not be blank" }];
  const error = createApiError(
    { status: 409 },
    { errorCode: "NICKNAME_ALREADY_IN_USE", errors: fields },
  );
  assert.ok(error instanceof Error);
  assert.equal(error.code, "NICKNAME_ALREADY_IN_USE");
  assert.equal(error.status, 409);
  assert.deepEqual(error.fields, fields);
  assert.match(error.message, /이미 사용 중인 닉네임/);
});

test("missing error bodies still translate authentication and HTTP failures", () => {
  const unauthenticated = createApiError({ status: 401 }, null);
  assert.equal(unauthenticated.code, "AUTH_REQUIRED");
  assert.match(unauthenticated.message, /다시 로그인/);
  assert.deepEqual(unauthenticated.fields, []);
  const unavailable = createApiError({ status: 503 }, null);
  assert.equal(unavailable.code, "HTTP_503");
  assert.match(unavailable.message, /잠시 후 다시/);
  assert.match(apiErrorMessage("HTTP_429"), /요청이 너무 많아요/);
});

test("unknown codes and untrusted messages never appear in user messages", () => {
  const fallback = "목록을 다시 불러와주세요.";
  for (const code of [
    "NEW_BACKEND_CODE",
    "toString",
    "constructor",
    "__proto__",
  ]) {
    assert.equal(
      apiErrorMessage({ code, message: "internal server detail" }, fallback),
      fallback,
    );
    const error = createApiError({ status: 409 }, { errorCode: code });
    assert.equal(error.code, code);
    assert.notEqual(error.message, code);
    assert.equal(typeof error.message, "string");
  }
  assert.equal(
    apiErrorMessage(new TypeError("Failed to fetch"), fallback),
    fallback,
  );
  assert.equal(apiErrorMessage(null, fallback), fallback);
});

test("known error codes take precedence over generic HTTP messages", () => {
  assert.match(
    apiErrorMessage({ code: "DAILY_LIMIT_EXCEEDED", status: 429 }),
    /오늘의 연습 횟수/,
  );
  assert.match(
    apiErrorMessage({ code: "FRONT_PHOTO_REQUIRED", status: 400 }),
    /정면 사진/,
  );
  assert.match(
    apiErrorMessage({ code: "SIMULATION_GENERATION_FAILED", status: 503 }),
    /시뮬레이션/,
  );
  assert.match(
    apiErrorMessage({ code: "TURN_MISMATCH", status: 409 }),
    /질문과 답변 순서/,
  );
});

test("feature helpers use new shared messages and retain contextual overrides", () => {
  assert.match(
    chatSendErrorMessage({ code: "TOO_MANY_MESSAGE_REQUESTS" }),
    /너무 빠르게/,
  );
  assert.match(
    chatSendErrorMessage({ code: "CLIENT_MESSAGE_ID_CONFLICT" }),
    /기존 메시지/,
  );
  assert.match(
    chatListErrorMessage({ code: "INVALID_CHAT_ROOM_CURSOR" }),
    /목록을 다시/,
  );
  assert.match(
    chatRoomErrorMessage({ code: "INVALID_CHAT_MESSAGE_CURSOR" }),
    /채팅방을 다시/,
  );
  assert.match(
    profilePhotoErrorMessage({ code: "FRONT_PHOTO_REQUIRED" }),
    /정면 사진/,
  );
  assert.match(
    profilePhotoErrorMessage({ code: "FILE_UPLOAD_NOT_COMPLETE" }),
    /아직 완료되지/,
  );
  assert.match(chatSendErrorMessage({ code: "FILE_TOO_LARGE" }), /10MB/);
  assert.match(profilePhotoErrorMessage({ code: "FILE_TOO_LARGE" }), /30MB/);
});
