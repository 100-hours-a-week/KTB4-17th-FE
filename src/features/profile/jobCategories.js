export const jobCategories = Object.freeze(
  [
    ["BUSINESS_OFFICE", "경영·사무·기획"],
    ["IT_DATA", "IT·개발·데이터"],
    ["FINANCE_ACCOUNTING", "금융·회계·세무"],
    ["SALES_MARKETING", "영업·판매·마케팅"],
    ["RESEARCH_ENGINEERING", "연구·공학"],
    ["HEALTHCARE", "의료·보건"],
    ["EDUCATION", "교육"],
    ["LEGAL", "법률·법무"],
    ["PUBLIC_ADMIN_DEFENSE", "공공행정·국방·치안"],
    ["CULTURE_DESIGN_MEDIA", "문화·예술·디자인·미디어·스포츠"],
    ["PERSONAL_HOSPITALITY_SERVICE", "서비스·외식·뷰티·관광"],
    ["MANUFACTURING_CONSTRUCTION", "생산·건설·설비"],
    ["TRANSPORT_LOGISTICS", "운송·물류"],
    ["AGRICULTURE_FISHERIES", "농림·어업"],
    ["WELFARE_CARE_RELIGION", "복지·돌봄·종교"],
    ["STUDENT", "학생·대학원생"],
    ["JOB_SEEKING", "취업 준비 중"],
    ["NOT_EMPLOYED", "현재 직업 없음"],
    ["OTHER", "기타 직군"],
  ].map((option) => Object.freeze(option)),
);

const labels = new Map(jobCategories);

export function isJobCategory(value) {
  return typeof value === "string" && labels.has(value);
}

export function normalizeJobCategory(value) {
  return isJobCategory(value) ? value : "";
}

export function jobCategoryLabel(value) {
  return labels.get(value) ?? "직업 정보 확인 필요";
}

export function normalizeProfileJob(profile) {
  return { ...profile, job: normalizeJobCategory(profile.job) };
}
