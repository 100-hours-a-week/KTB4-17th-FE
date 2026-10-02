export function profileImageUrls(profile) {
  const urls = (Array.isArray(profile?.images) ? profile.images : [])
    .filter((image) => typeof image?.imageUrl === "string" && image.imageUrl)
    .slice()
    .sort(
      (first, second) =>
        Number(first.displayOrder || 0) - Number(second.displayOrder || 0),
    )
    .map((image) => image.imageUrl);
  return urls.length ? urls : [profile?.profileImageUrl].filter(Boolean);
}
