import { useEffect, useState } from "react";
import { getAuthSessionSubject } from "../../shared/api/authToken.js";
import { emptyUnreadCategories, loadUnreadCategories } from "./unread.js";

export function useUnreadCategories({ subject, revision, count }) {
  const [snapshot, setSnapshot] = useState(null);
  const knownEmpty = count === 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: A notification mutation invalidates category flags, including pending cursor pages.
  useEffect(() => {
    if (!subject || knownEmpty) return undefined;
    const controller = new AbortController();
    void loadUnreadCategories({
      signal: controller.signal,
      isCurrent: () => getAuthSessionSubject() === subject,
    })
      .then((flags) => {
        if (!controller.signal.aborted && getAuthSessionSubject() === subject)
          setSnapshot({ subject, flags });
      })
      .catch(() => {
        // Keep the last confirmed dots during temporary errors; the provider
        // invalidates this snapshot on resume, SSE arrivals and its periodic sync.
      });
    return () => controller.abort();
  }, [subject, revision, knownEmpty]);
  const flags =
    !knownEmpty && snapshot?.subject === subject
      ? snapshot.flags
      : emptyUnreadCategories();
  return { ...flags, ALL: count > 0 || flags.ALL };
}
