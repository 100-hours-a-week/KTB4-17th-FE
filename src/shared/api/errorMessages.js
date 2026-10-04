// Keep backend error codes for control flow; show these messages to users.
export const API_ERROR_MESSAGES = Object.freeze({
  INVALID_REQUEST: "입력 정보를 다시 확인해주세요.",
  AUTH_REQUIRED: "로그인이 만료됐어요. 다시 로그인해주세요.",
  INTERNAL_SERVER_ERROR:
    "서버에서 요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.",
  AUTH_PROVIDER_UNAVAILABLE:
    "카카오 인증에 연결하지 못했어요. 잠시 후 다시 로그인해주세요.",
  USER_AGE_REQUIREMENT_NOT_MET:
    "만 19세 이상, 만 40세 미만만 가입할 수 있어요.",
  USER_NOT_FOUND: "회원 정보를 찾을 수 없어요. 다시 로그인해주세요.",
  ONBOARDING_ACCESS_NOT_ALLOWED:
    "현재 가입 상태에서는 이 단계를 진행할 수 없어요. 가입 진행 상태를 다시 확인해주세요.",
  NICKNAME_ALREADY_IN_USE:
    "이미 사용 중인 닉네임이에요. 다른 닉네임을 입력해주세요.",

  PROFILE_NOT_FOUND: "프로필 정보를 찾을 수 없어요.",
  PROFILE_NICKNAME_REQUIRED: "닉네임을 입력한 뒤 AI 문답을 시작해주세요.",
  PROFILE_MBTI_REQUIRED: "MBTI를 선택한 뒤 가치관을 확정해주세요.",
  SESSION_NOT_FOUND: "대화 정보를 찾을 수 없어요. 대화를 다시 시작해주세요.",
  PERSONA_DRAFT_NOT_FOUND:
    "가치관 초안을 찾을 수 없어요. AI 문답 결과를 다시 확인해주세요.",
  NO_PENDING_QUESTION:
    "답변할 질문이 없어요. AI 문답 진행 상태를 다시 확인해주세요.",
  REQUEST_IN_PROGRESS: "이전 요청을 처리하고 있어요. 잠시만 기다려주세요.",
  TURN_MISMATCH:
    "현재 질문과 답변 순서가 달라요. 진행 중인 질문을 다시 확인해주세요.",
  ACTION_NOT_ALLOWED:
    "아직 이 단계를 진행할 수 없어요. 질문에 더 답변한 뒤 다시 시도해주세요.",
  ONBOARDING_NOT_FINISHED: "AI 문답을 마친 뒤 가치관 요약을 확인해주세요.",
  PERSONA_ALREADY_CONFIRMED:
    "이미 확정된 가치관이에요. 가입 진행 상태를 다시 확인해주세요.",
  PERSONA_CONFIRMATION_CONFLICT:
    "이미 확정된 가치관과 요청한 정보가 달라요. 저장된 정보를 다시 확인해주세요.",
  AI_REQUEST_REJECTED:
    "AI가 요청을 처리할 수 없어요. 입력 내용을 확인한 뒤 다시 시도해주세요.",
  AI_SERVER_NOT_CONFIGURED:
    "AI 서비스를 준비하고 있어요. 잠시 후 다시 시도해주세요.",
  AI_SERVER_UNAVAILABLE:
    "AI 서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.",
  AI_SERVER_RESPONSE_INVALID:
    "AI 응답을 정상적으로 받지 못했어요. 잠시 후 다시 시도해주세요.",

  FRONT_PHOTO_REQUIRED: "정면 사진을 등록해주세요.",
  FILE_NOT_AVAILABLE: "사용할 수 없는 사진이에요. 사진을 다시 등록해주세요.",
  FILE_NOT_FOUND: "파일을 찾을 수 없어요. 파일을 다시 선택해주세요.",
  FILE_UPLOAD_INTENT_NOT_FOUND:
    "업로드 정보를 찾을 수 없어요. 파일을 다시 선택해주세요.",
  FILE_UPLOAD_INTENT_EXPIRED:
    "업로드 시간이 만료됐어요. 파일을 다시 선택해주세요.",
  FILE_UPLOAD_INTENT_CONFLICT:
    "업로드 상태가 변경됐어요. 파일을 다시 선택해주세요.",
  FILE_UPLOAD_NOT_COMPLETE:
    "파일 업로드가 아직 완료되지 않았어요. 업로드를 마친 뒤 다시 시도해주세요.",
  FILE_TOO_LARGE:
    "파일 용량이 업로드 한도를 초과했어요. 더 작은 파일을 선택해주세요.",
  FILE_TYPE_NOT_ALLOWED:
    "지원하지 않는 파일 형식이에요. JPG, PNG, WEBP 사진을 선택해주세요.",
  FILE_INVALID_CONTENT: "파일을 읽을 수 없어요. 다른 파일을 선택해주세요.",
  FILE_UPLOAD_FAILED:
    "파일을 업로드하지 못했어요. 연결을 확인한 뒤 다시 시도해주세요.",
  FILE_READ_URL_FAILED: "파일을 불러오지 못했어요. 잠시 후 다시 시도해주세요.",
  FILE_IN_USE: "사용 중인 파일은 삭제할 수 없어요.",
  FILE_DELETE_FAILED: "파일을 삭제하지 못했어요. 잠시 후 다시 시도해주세요.",
  FILE_INVALID_STATE:
    "파일 상태를 확인하지 못했어요. 파일을 다시 선택해주세요.",

  MEMBER_NOT_FOUND: "상대 회원 정보를 찾을 수 없어요.",
  SENDER_NOT_ACTIVE: "가입을 완료한 뒤 좋아요를 보낼 수 있어요.",
  RECEIVER_NOT_ACTIVE: "현재 이 회원에게 좋아요를 보낼 수 없어요.",
  NOT_LIKE_RECEIVER: "내가 받은 좋아요만 처리할 수 있어요.",
  LIKE_NOT_FOUND: "좋아요 정보를 찾을 수 없어요. 목록을 다시 불러와주세요.",
  DUPLICATE_PENDING_LIKE:
    "이미 좋아요를 보낸 상대예요. 상대의 응답을 기다려주세요.",
  MATCH_ALREADY_EXISTS: "이미 매칭된 상대예요. 채팅 목록을 확인해주세요.",
  LIKE_ALREADY_RESOLVED: "이미 처리된 좋아요예요. 목록을 다시 불러와주세요.",
  SELF_LIKE_NOT_ALLOWED: "내 프로필에는 좋아요를 보낼 수 없어요.",
  REQUESTER_NOT_ACTIVE: "가입을 완료한 뒤 추천을 받을 수 있어요.",
  RESOURCE_NOT_AVAILABLE:
    "추천 정보를 더 이상 사용할 수 없어요. 추천 목록을 다시 불러와주세요.",

  INVALID_CHAT_ROOM_CURSOR:
    "채팅 목록의 조회 위치가 올바르지 않아요. 목록을 다시 불러와주세요.",
  INVALID_CHAT_ROOM_PAGE_SIZE:
    "채팅 목록을 조회할 수 없어요. 다시 시도해주세요.",
  INVALID_CHAT_MESSAGE_CURSOR:
    "대화의 조회 위치가 올바르지 않아요. 채팅방을 다시 열어주세요.",
  INVALID_CHAT_MESSAGE_PAGE_SIZE:
    "대화를 조회할 수 없어요. 채팅방을 다시 열어주세요.",
  CHAT_ACCESS_DENIED: "이 채팅방에 접근할 수 없어요.",
  CHAT_ROOM_NOT_FOUND: "채팅방을 찾을 수 없어요.",
  CHAT_IMAGE_NOT_FOUND: "대화에 첨부된 사진을 찾을 수 없어요.",
  CHAT_ROOM_NOT_ACTIVE: "종료된 대화에는 메시지를 보낼 수 없어요.",
  INVALID_CHAT_MESSAGE_READ_CURSOR:
    "읽음 상태를 갱신할 수 없어요. 채팅방을 다시 열어주세요.",
  CLIENT_MESSAGE_ID_CONFLICT:
    "메시지 전송 정보가 기존 메시지와 달라요. 대화 내역을 다시 확인해주세요.",
  TOO_MANY_MESSAGE_REQUESTS:
    "메시지를 너무 빠르게 보내고 있어요. 잠시 후 다시 보내주세요.",

  TARGET_MEMBER_NOT_FOUND: "상대 회원 정보를 찾을 수 없어요.",
  TARGET_MEMBER_UNAVAILABLE: "현재 이 상대와 AI 연습대화를 시작할 수 없어요.",
  INVALID_TARGET_MEMBER:
    "선택한 상대와 AI 대화를 진행할 수 없어요. 상대 정보를 다시 확인해주세요.",
  CHAT_NOT_FOUND:
    "AI 연습대화 메시지를 찾을 수 없어요. 대화 내역을 다시 확인해주세요.",
  SESSION_ENDED: "종료된 AI 연습대화에는 새 메시지를 보낼 수 없어요.",
  GENERATION_IN_PROGRESS:
    "AI가 이전 메시지에 답변하고 있어요. 잠시만 기다려주세요.",
  CHAT_NOT_RETRYABLE: "이 답변은 다시 시도할 수 없어요.",
  DAILY_LIMIT_EXCEEDED:
    "오늘의 연습 횟수를 모두 사용했어요. 내일 다시 이용해주세요.",
  AI_SESSION_ID_CONFLICT:
    "AI 대화 연결 정보가 달라요. 연습대화를 다시 시작해주세요.",
  AI_CALLBACK_UNAUTHORIZED:
    "AI 답변을 확인하지 못했어요. 잠시 후 다시 시도해주세요.",
  AI_CALLBACK_INVALID:
    "AI 답변 정보를 처리하지 못했어요. 잠시 후 다시 시도해주세요.",
  SIMULATION_NOT_FOUND:
    "시뮬레이션 결과를 찾을 수 없어요. 시뮬레이션을 다시 시작해주세요.",
  ME_PERSONA_NOT_FOUND:
    "내 AI 성향 정보가 없어 시뮬레이션을 만들 수 없어요. 가치관 문답을 완료해주세요.",
  TARGET_PERSONA_NOT_FOUND:
    "상대의 AI 성향 정보가 없어 시뮬레이션을 만들 수 없어요.",
  SIMULATION_ALREADY_RUNNING:
    "시뮬레이션을 만들고 있어요. 잠시만 기다려주세요.",
  SIMULATION_GENERATION_FAILED:
    "시뮬레이션을 생성하지 못했어요. 잠시 후 다시 시도해주세요.",

  AUTH_TOKEN_MISSING: "로그인 정보를 확인하지 못했어요. 다시 로그인해주세요.",
  LOCAL_TEST_LOGIN_DISABLED:
    "현재 환경에서는 테스트 로그인을 사용할 수 없어요.",
  TEST_ACCOUNT_ONBOARDING_INCOMPLETE:
    "테스트 계정의 가입 정보가 준비되지 않았어요.",
});

const HTTP_ERROR_MESSAGES = Object.freeze({
  400: API_ERROR_MESSAGES.INVALID_REQUEST,
  401: API_ERROR_MESSAGES.AUTH_REQUIRED,
  403: "이 요청을 처리할 권한이 없어요.",
  404: "요청한 정보를 찾을 수 없어요.",
  408: "요청 시간이 초과됐어요. 연결을 확인한 뒤 다시 시도해주세요.",
  413: API_ERROR_MESSAGES.FILE_TOO_LARGE,
  415: API_ERROR_MESSAGES.FILE_TYPE_NOT_ALLOWED,
  422: API_ERROR_MESSAGES.INVALID_REQUEST,
  429: "요청이 너무 많아요. 잠시 후 다시 시도해주세요.",
});

export function apiErrorMessage(
  error,
  fallback = "요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.",
) {
  const code = typeof error === "string" ? error : error?.code;
  if (typeof code === "string" && Object.hasOwn(API_ERROR_MESSAGES, code))
    return API_ERROR_MESSAGES[code];
  const status = error?.status || Number(/^HTTP_(\d{3})$/.exec(code)?.[1]);
  if (Object.hasOwn(HTTP_ERROR_MESSAGES, status))
    return HTTP_ERROR_MESSAGES[status];
  if (status >= 500 && status <= 599)
    return API_ERROR_MESSAGES.INTERNAL_SERVER_ERROR;
  return fallback;
}

export function createApiError(response, result) {
  const code =
    result?.errorCode ||
    (response.status === 401 ? "AUTH_REQUIRED" : `HTTP_${response.status}`);
  const error = new Error(apiErrorMessage({ code, status: response.status }));
  error.code = code;
  error.status = response.status;
  error.fields = result?.errors || [];
  return error;
}
