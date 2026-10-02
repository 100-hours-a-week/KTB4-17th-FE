// Keep fulfilled requests for this login session; failed requests can be retried.
export function createLikeRequestGuard() {
  const requests = new Map();
  return {
    clear: () => requests.clear(),
    run(key, send) {
      if (requests.has(key)) return requests.get(key);
      const request = Promise.resolve()
        .then(send)
        .catch((error) => {
          if (requests.get(key) === request) requests.delete(key);
          throw error;
        });
      requests.set(key, request);
      return request;
    },
  };
}
