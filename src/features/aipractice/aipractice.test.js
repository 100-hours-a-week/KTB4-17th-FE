import assert from "node:assert/strict";
import test from "node:test";
import {
  isPracticeAccessUnavailable,
  PRACTICE_UNAVAILABLE_MESSAGE,
} from "./access.js";

test("blocked practice sessions become terminal while network errors remain retryable", () => {
  assert.equal(
    isPracticeAccessUnavailable({ code: "SESSION_NOT_FOUND" }),
    true,
  );
  assert.equal(
    isPracticeAccessUnavailable({ code: "TARGET_USER_NOT_FOUND" }),
    true,
  );
  assert.equal(isPracticeAccessUnavailable({ status: 404 }), true);
  assert.equal(isPracticeAccessUnavailable({ code: "HTTP_500" }), false);
  assert.equal(
    PRACTICE_UNAVAILABLE_MESSAGE,
    "더 이상 이용할 수 없는 AI 연습대화예요.",
  );
});
