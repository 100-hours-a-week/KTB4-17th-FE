export function dateAge(value) {
  if (!value) return 0;
  const birth = new Date(`${value}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return 0;
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  )
    years--;
  return years;
}

export function profilePhotoUrls(person) {
  const photos = Array.isArray(person?.photos)
    ? person.photos.filter((photo) => typeof photo === "string" && photo)
    : [];
  if (photos.length) return photos;
  return person?.photo ? [person.photo] : [];
}

export function onboardingStepFromStatus(status) {
  const serverSteps = {
    REGION: "region",
    PROFILE: "profile",
    LIFESTYLE: "lifestyle",
    PERSONA: "questions",
    PROFILE_IMAGE: "photo-intro",
    COMPLETE: "complete",
  };
  return serverSteps[status?.onboardingNextStep] || "identity";
}
