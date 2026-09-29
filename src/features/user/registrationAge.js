import { dateAge } from "../../shared/utils.js";

const MINIMUM_REGISTRATION_AGE = 19;
const MAXIMUM_REGISTRATION_AGE_EXCLUSIVE = 40;

export function getRegistrationAgeRestriction(birthDate) {
  if (!birthDate) return null;

  const age = dateAge(birthDate);
  if (age < MINIMUM_REGISTRATION_AGE) {
    return {
      helperMessage:
        "만 19세 미만은 이용할 수 없어요. 생년월일이 맞는지 확인해주세요",
      heading: "만 19세 이상만",
      description:
        "이 서비스는 청소년유해매체물로 분류되어 만 19세 미만은 가입할 수 없어요.",
    };
  }

  if (age >= MAXIMUM_REGISTRATION_AGE_EXCLUSIVE) {
    return {
      helperMessage:
        "만 40세 이상은 이용할 수 없어요. 생년월일이 맞는지 확인해주세요",
      heading: "만 40세 미만만",
      description: "만 40세 이상은 가입할 수 없어요. 생년월일을 확인해주세요.",
    };
  }

  return null;
}
