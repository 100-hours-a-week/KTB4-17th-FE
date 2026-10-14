import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { getAuthSessionSubject } from "../../shared/api/authToken.js";
import { getMyProfile, getUserProfile } from "./api.js";
import { profileImageUrls } from "./imageUrls.js";

// Only share requests in flight. Signed image URLs must not be cached forever.
const pendingProfiles = new Map();

function freshPhotos(userId) {
  const key = `${getAuthSessionSubject()}:${userId}`;
  if (!pendingProfiles.has(key)) {
    const request = (userId === "me" ? getMyProfile() : getUserProfile(userId))
      .then(profileImageUrls)
      .finally(() => {
        if (pendingProfiles.get(key) === request) pendingProfiles.delete(key);
      });
    pendingProfiles.set(key, request);
  }
  return pendingProfiles.get(key);
}

export function useProfileImage(person, initialSource, index = 0) {
  const userId = person?.userId ?? person?.id;
  const key = `${userId}:${index}:${initialSource}`;
  const currentKey = useRef(key);
  currentKey.current = key;
  const generation = useRef(0);
  const mounted = useRef(false);
  const retry = useRef({ key, attempted: false });
  const [resolved, setResolved] = useState(null);
  const source = resolved?.key === key ? resolved.source : initialSource;

  // A cached image can fail during React's effect replay in development.
  // Keep an active refresh valid across replay, but ignore real unmounts.
  useLayoutEffect(() => {
    mounted.current = true;
    if (retry.current.key !== key) {
      retry.current = { key, attempted: false };
      setResolved(null);
    }
    return () => {
      mounted.current = false;
    };
  }, [key]);

  const onError = useCallback(async () => {
    if (
      (retry.current.key === key && retry.current.attempted) ||
      userId == null
    ) {
      setResolved({ key, source: "" });
      return;
    }
    retry.current = { key, attempted: true };
    const request = ++generation.current;
    setResolved({ key, source: "" });
    try {
      const photos = await freshPhotos(userId);
      if (
        !mounted.current ||
        request !== generation.current ||
        currentKey.current !== key
      )
        return;
      setResolved({ key, source: photos[index] || "" });
    } catch {
      // Show the placeholder after one failed refresh; never loop on a bad URL.
    }
  }, [index, key, userId]);

  return { source, onError };
}
