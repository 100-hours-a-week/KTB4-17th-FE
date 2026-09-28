export function readPhoto(file, onReady, onError) {
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    onError("2MB 이하의 사진을 선택해주세요.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => onReady(String(reader.result));
  reader.onerror = () => onError("사진을 불러오지 못했어요.");
  reader.readAsDataURL(file);
}
