import { positiveId, simulationError, validateHandle } from "./model.js";

export async function requestSimulationAttempt(
  simulationId,
  { attempt, signal },
) {
  const sourceId = positiveId(simulationId);
  if (!sourceId) throw simulationError("SIMULATION_NOT_FOUND", 404);
  const validate = (value) => {
    const handle = validateHandle(value);
    if (handle.simulationId < sourceId)
      throw simulationError("SIMULATION_RESPONSE_INVALID");
    return handle;
  };
  try {
    const handle = validate(await attempt(sourceId, { signal }));
    return { handle, submissionRejected: false };
  } catch (error) {
    if (signal?.aborted || error?.name === "AbortError") throw error;
    if (
      error?.status === 503 &&
      error.code === "SIMULATION_CAPACITY_EXCEEDED" &&
      error.details?.status === "FAILED"
    ) {
      const handle = validate(error.details);
      if (handle.simulationId === sourceId)
        throw simulationError("SIMULATION_RESPONSE_INVALID");
      return { handle, submissionRejected: true };
    }
    throw error;
  }
}
