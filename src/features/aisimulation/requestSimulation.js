import { validateHandle, validatePair } from "./model.js";

export async function requestSimulation(
  targetUserId,
  { getPair, create, signal },
) {
  const pair = validatePair(
    await getPair(targetUserId, { signal }),
    targetUserId,
  );
  if (pair.simulationId !== null) return pair;
  try {
    return validateHandle(await create(targetUserId, { signal }));
  } catch (error) {
    if (
      signal?.aborted ||
      error?.name === "AbortError" ||
      (error?.status && error.status < 500)
    )
      throw error;
    try {
      const recovered = validatePair(
        await getPair(targetUserId, { signal }),
        targetUserId,
      );
      if (recovered.simulationId !== null) return recovered;
    } catch {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    }
    throw error;
  }
}
