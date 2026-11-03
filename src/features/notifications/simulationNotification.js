import { positiveId, simulationError } from "../aisimulation/model.js";

export async function loadSimulationCompletionNotification(
  item,
  viewerId,
  { loadSimulation, loadProfile, signal },
) {
  const simulationId = positiveId(item?.targetId);
  if (!simulationId) throw simulationError("SIMULATION_NOT_FOUND", 404);

  const detail = await loadSimulation(simulationId, { signal });
  if (positiveId(detail?.simulationId) !== simulationId)
    throw simulationError("SIMULATION_RESPONSE_INVALID");

  // The API keeps these participant fields fixed: `me` is the original
  // requester and `partner` is the other participant, regardless of viewer.
  const requesterId = positiveId(detail?.me?.userId);
  const partnerId = positiveId(detail?.partner?.userId);
  const currentUserId = positiveId(viewerId);
  if (!requesterId || !partnerId || requesterId === partnerId || !currentUserId)
    throw simulationError("SIMULATION_PARTICIPANT_INVALID");

  if (currentUserId === requesterId)
    return { role: "requester", requesterId, detail };
  if (currentUserId !== partnerId)
    throw simulationError("SIMULATION_PARTICIPANT_INVALID");

  let profile;
  try {
    profile = await loadProfile(requesterId, { signal });
  } catch (error) {
    if (error && typeof error === "object") error.notificationStage = "profile";
    throw error;
  }
  const profileUserId = positiveId(profile?.userId ?? requesterId);
  if (profileUserId !== requesterId || typeof profile?.nickname !== "string") {
    const error = new Error("PROFILE_RESPONSE_INVALID");
    error.code = "PROFILE_RESPONSE_INVALID";
    error.notificationStage = "profile";
    throw error;
  }

  return { role: "partner", requesterId, profile, detail };
}
