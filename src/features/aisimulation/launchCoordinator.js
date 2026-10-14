export function createSimulationLaunchCoordinator({
  getOwner = () => null,
} = {}) {
  let current = null;

  return {
    begin(userId) {
      if (current) return null;
      current = {
        userId,
        owner: getOwner(),
        controller: new AbortController(),
      };
      return current;
    },
    cancel(userId) {
      if (current && (userId == null || current.userId === userId)) {
        const cancelled = current;
        current = null;
        cancelled.controller.abort();
        return cancelled;
      }
      return null;
    },
    finish(request) {
      if (current !== request) return false;
      current = null;
      return true;
    },
    isCurrent(request) {
      return (
        current === request &&
        !request.controller.signal.aborted &&
        request.owner === getOwner()
      );
    },
  };
}
