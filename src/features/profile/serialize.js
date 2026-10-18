import { isJobCategory } from "./jobCategories.js";

export function profilePayload(profile) {
  if (!isJobCategory(profile.job)) {
    const error = new Error("직업군을 선택해 주세요.");
    error.code = "JOB_CATEGORY_REQUIRED";
    throw error;
  }
  return {
    nickname: profile.nickname || null,
    activityRegionId: profile.activityRegionId || null,
    height: profile.height ? Number(profile.height) : null,
    bodyType: profile.bodyType || null,
    educationLevel: profile.educationLevel || null,
    job: profile.job,
    religion: profile.religion || null,
    drinking: profile.drinking || null,
    smoking: profile.smoking || null,
    mbti: profile.mbti || null,
  };
}
