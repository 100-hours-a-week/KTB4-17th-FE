export function createSimulationLaunchCoordinator() {
  let current = null;

  return {
    begin(memberId) {
      if (current) return null;
      current = { memberId, controller: new AbortController() };
      return current;
    },
    cancel(memberId) {
      if (current && (memberId == null || current.memberId === memberId)) {
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
      return current === request && !request.controller.signal.aborted;
    },
  };
}
