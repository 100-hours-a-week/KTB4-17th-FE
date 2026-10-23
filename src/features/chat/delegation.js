const DELEGATION_STATUSES = new Set([
  "DRAFT_GENERATING",
  "AWAITING_CONFIRMATION",
  "DRAFT_FAILED",
  "IN_PROGRESS",
  "COMPLETED",
  "INTERRUPTED",
  "RETRY_REQUIRED",
  "FAILED",
]);

const DRAFT_STATUSES = new Set([
  "DRAFT_GENERATING",
  "AWAITING_CONFIRMATION",
  "DRAFT_FAILED",
]);

const RESTRICTED_STATUSES = new Set([
  "IN_PROGRESS",
  "RETRY_REQUIRED",
  "FAILED",
]);

const PRESERVED_PREVIEW_STATUSES = new Set([
  "IN_PROGRESS",
  "COMPLETED",
  "INTERRUPTED",
]);

export const CHAT_DELEGATION_REFRESH_EVENT =
  "pocket-signal:chat-delegation-refresh";

export const DELEGATION_END_TYPES = Object.freeze([
  {
    value: "GENTLE",
    label: "부드럽게 마무리",
    description: "감사와 배려를 담아 자연스럽게 대화를 마무리해요.",
  },
  {
    value: "DIRECT",
    label: "분명하게 마무리",
    description: "오해가 남지 않도록 내 뜻을 분명하게 전해요.",
  },
  {
    value: "CASUAL",
    label: "가볍게 마무리",
    description: "부담스럽지 않은 말투로 편안하게 대화를 끝내요.",
  },
]);

const END_TYPE_VALUES = new Set(DELEGATION_END_TYPES.map(({ value }) => value));

export function positiveDelegationId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function normalizeDelegation(value) {
  if (!value || typeof value !== "object") return null;
  const delegationId = positiveDelegationId(value.delegationId);
  if (
    !delegationId ||
    !DELEGATION_STATUSES.has(value.status) ||
    !END_TYPE_VALUES.has(value.endType)
  )
    return null;
  return { delegationId, status: value.status, endType: value.endType };
}

export function isDelegationDraftStatus(status) {
  return DRAFT_STATUSES.has(status);
}

export function isDelegationActionRestricted(status) {
  return RESTRICTED_STATUSES.has(status);
}

export function preservesDelegationPreview(status) {
  return PRESERVED_PREVIEW_STATUSES.has(status);
}

export function delegationSelectionPath(chatRoomId) {
  return `/chats/${positiveDelegationId(chatRoomId)}/delegation`;
}

export function delegationDraftPath(chatRoomId, delegationId) {
  return `/chats/${positiveDelegationId(chatRoomId)}/delegations/${positiveDelegationId(delegationId)}/draft`;
}

export function delegationProgressPath(chatRoomId, delegationId) {
  return `/chats/${positiveDelegationId(chatRoomId)}/delegations/${positiveDelegationId(delegationId)}`;
}

export function delegationPathForRoom(room) {
  const delegation = normalizeDelegation(room?.delegation);
  if (!delegation) return `/chats/${positiveDelegationId(room?.id)}`;
  return isDelegationDraftStatus(delegation.status)
    ? delegationDraftPath(room.id, delegation.delegationId)
    : delegationProgressPath(room.id, delegation.delegationId);
}

export function delegationEndTypeLabel(endType) {
  return (
    DELEGATION_END_TYPES.find((option) => option.value === endType)?.label ||
    "대화 정리"
  );
}

export function delegationError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function normalizeDelegationProgress(value, expectedDelegationId) {
  const delegationId = positiveDelegationId(value?.delegationId);
  if (
    !delegationId ||
    (expectedDelegationId && delegationId !== expectedDelegationId) ||
    !DELEGATION_STATUSES.has(value?.status)
  )
    throw delegationError("CHAT_DELEGATION_RESPONSE_INVALID");

  const turnsByNumber = new Map(
    (Array.isArray(value.turns) ? value.turns : [])
      .filter((turn) => [1, 2, 3].includes(Number(turn?.turn)))
      .map((turn) => [
        Number(turn.turn),
        {
          turn: Number(turn.turn),
          completed: Boolean(turn.completed),
          sentAt: turn.completed ? turn.sentAt || null : null,
        },
      ]),
  );

  return {
    delegationId,
    status: value.status,
    isBlockPromptRequired: Boolean(value.isBlockPromptRequired),
    targetUserId: positiveDelegationId(value.targetUserId),
    turns: [1, 2, 3].map(
      (turn) =>
        turnsByNumber.get(turn) || { turn, completed: false, sentAt: null },
    ),
  };
}
