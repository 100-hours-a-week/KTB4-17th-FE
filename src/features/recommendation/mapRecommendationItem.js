export function mapRecommendationItem(item) {
  const candidate = item?.candidate;
  const id = candidate?.memberId;
  if (id == null) return null;
  const photos = (Array.isArray(candidate.images) ? candidate.images : [])
    .filter((image) => typeof image?.imageUrl === "string" && image.imageUrl)
    .sort((first, second) => first.displayOrder - second.displayOrder)
    .map((image) => image.imageUrl);
  return {
    id,
    nickname: candidate.nickname || "닉네임 정보 없음",
    age: Number.isFinite(candidate.age) ? candidate.age : null,
    job: candidate.job || "",
    region: candidate.region || "",
    mbti: candidate.mbti || "",
    verified: candidate.verified === true,
    activity: candidate.activity || "",
    photos,
    photo: photos[0] || "",
    bio: candidate.bio || "",
  };
}
