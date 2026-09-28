export function profilePayload(profile) {
  return {
    nickname: profile.nickname || null,
    activityRegionId: profile.activityRegionId || null,
    height: profile.height ? Number(profile.height) : null,
    bodyType: profile.bodyType || null,
    educationLevel: profile.educationLevel || null,
    job: profile.job.trim() || null,
    religion: profile.religion || null,
    drinking: profile.drinking || null,
    smoking: profile.smoking || null,
    mbti: profile.mbti || null,
  };
}
