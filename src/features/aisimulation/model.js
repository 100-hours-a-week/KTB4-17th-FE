export const SIMULATION_STATUSES = new Set([
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
  "CANCELED",
]);

export function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function simulationError(code, status) {
  const error = new Error(code);
  error.code = code;
  if (status) error.status = status;
  return error;
}

export function validateHandle(value, expectedId) {
  const simulationId = positiveId(value?.simulationId);
  if (
    !simulationId ||
    !SIMULATION_STATUSES.has(value?.status) ||
    (expectedId != null && simulationId !== positiveId(expectedId))
  )
    throw simulationError("SIMULATION_RESPONSE_INVALID");
  return { ...value, simulationId };
}

export function validatePair(value, targetUserId) {
  if (positiveId(value?.targetUserId) !== positiveId(targetUserId))
    throw simulationError("SIMULATION_RESPONSE_INVALID");
  if (value.simulationId === null && value.status === null) return value;
  return validateHandle(value);
}

export function simulationPath(simulationId, chatRoomId) {
  const roomId = positiveId(chatRoomId);
  return `/ai/simulations/${simulationId}${roomId ? `?chatRoomId=${roomId}` : ""}`;
}

export function simulationForViewer(detail, subject) {
  const viewerId = positiveId(subject);
  const aId = positiveId(detail?.me?.userId);
  const bId = positiveId(detail?.partner?.userId);
  if (
    !viewerId ||
    !aId ||
    !bId ||
    aId === bId ||
    ![aId, bId].includes(viewerId)
  )
    throw simulationError("SIMULATION_PARTICIPANT_INVALID");
  if (!Array.isArray(detail.transcript) || !detail.report)
    throw simulationError("SIMULATION_RESPONSE_INVALID");
  const reversed = viewerId === bId;
  const report = {
    ...detail.report,
    areas: (detail.report.areas || []).map((area) => ({
      ...area,
      dimensions: (area.dimensions || []).map((dimension) => ({
        ...dimension,
        mine: reversed ? dimension.b : dimension.a,
        partner: reversed ? dimension.a : dimension.b,
      })),
    })),
  };
  return {
    ...detail,
    me: reversed ? detail.partner : detail.me,
    partner: reversed ? detail.me : detail.partner,
    mySpeaker: reversed ? "b" : "a",
    report,
  };
}
