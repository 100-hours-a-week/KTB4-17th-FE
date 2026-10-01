import assert from "node:assert/strict";
import test from "node:test";
import { dateAge } from "../../shared/utils.js";
import { isValidBirthDate, normalizeBirthDate } from "../user/birthDate.js";
import {
  createPhotoId,
  detectPhotoType,
  prepareProfilePhoto,
} from "./photoUpload.js";
import { profilePayload } from "./serialize.js";

test("single-digit month and day are accepted and sent in ISO format", () => {
  assert.equal(normalizeBirthDate("1998-1-1"), "1998-01-01");
  assert.equal(normalizeBirthDate("1998-01-1"), "1998-01-01");
  assert.equal(normalizeBirthDate("1998-1-01"), "1998-01-01");
  assert.equal(normalizeBirthDate("1998-12-31"), "1998-12-31");
});

test("invalid calendar dates are rejected instead of rolling into another month", () => {
  for (const value of [
    "1998-2-29",
    "2000-2-30",
    "2001-4-31",
    "1900-2-29",
    "2100-2-29",
    "2000-0-1",
    "2000-13-1",
    "2000-1-0",
    "2000-1-32",
    "2000-1-",
    "2000--1",
    "2000-001-01",
    "0000-1-1",
    "not-a-date",
  ]) {
    assert.equal(normalizeBirthDate(value), "", value);
    assert.equal(isValidBirthDate(value), false, value);
    assert.equal(dateAge(value), 0, value);
  }
  assert.equal(normalizeBirthDate("2000-2-29"), "2000-02-29");
  assert.equal(normalizeBirthDate("2004-2-29"), "2004-02-29");
});

test("mobile files without MIME metadata get their actual image type", async () => {
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  const original = new File([bytes], "mobile-photo", { type: "" });
  const prepared = await prepareProfilePhoto(original);
  assert.equal(prepared.type, "image/png");
  assert.equal(prepared.size, original.size);
  assert.deepEqual(new Uint8Array(await prepared.arrayBuffer()), bytes);
  assert.equal(
    detectPhotoType(new Uint8Array([255, 216, 255, 224])),
    "image/jpeg",
  );
  assert.equal(
    detectPhotoType(new TextEncoder().encode("RIFF1234WEBP")),
    "image/webp",
  );
  assert.equal(
    detectPhotoType(new TextEncoder().encode("0000ftypheic")),
    "image/heic",
  );
});

test("file extensions alone cannot bypass image validation", async () => {
  await assert.rejects(
    prepareProfilePhoto(
      new File(["not an image"], "photo.jpg", { type: "image/jpeg" }),
    ),
    { code: "FILE_TYPE_NOT_ALLOWED" },
  );
  await assert.rejects(prepareProfilePhoto(new File([], "photo.png")), {
    code: "FILE_INVALID_CONTENT",
  });
});

test("photo preview identifiers do not need secure-context crypto", () => {
  const ids = Array.from({ length: 100 }, () => createPhotoId());
  assert.equal(new Set(ids).size, 100);
});

test("a selected activity region sends its ID along with the whole profile", () => {
  const result = profilePayload({
    nickname: "테스트",
    activityRegionId: 42,
    regionName: "서울특별시 강남구",
    height: "170",
    bodyType: "AVERAGE",
    educationLevel: "BACHELOR",
    job: "개발자",
    religion: "NONE",
    drinking: "NEVER",
    smoking: "NON_SMOKER",
    mbti: "INFJ",
  });
  assert.equal(result.activityRegionId, 42);
  assert.equal(result.mbti, "INFJ");
  assert.equal(result.height, 170);
});
