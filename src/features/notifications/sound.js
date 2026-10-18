// A soft E-major chime: nostalgic handset melody with a short, warm decay.
// Shared with offline rendering so the preview uses the same sound as the app.
export function scheduleNotificationTone(audio, voices = new Set()) {
  const start = audio.currentTime + 0.01;
  for (const [offset, frequency, duration, volume] of [
    [0, 659.255, 0.22, 0.15],
    [0.12, 830.609, 0.24, 0.14],
    [0.26, 987.767, 0.42, 0.13],
  ]) {
    for (const [type, harmonic, level] of [
      ["triangle", 1, 1],
      ["sine", 2, 0.16],
    ]) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const at = start + offset;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency * harmonic, at);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(volume * level, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration - 0.025);
      gain.gain.linearRampToValueAtTime(0, at + duration);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      voices.add(oscillator);
      oscillator.onended = () => {
        voices.delete(oscillator);
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(at);
      oscillator.stop(at + duration);
    }
  }
}

export function createNotificationSound() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  let context;
  let stopped = false;
  let lastPlayed = -Infinity;
  const voices = new Set();

  function getContext() {
    if (stopped || !AudioContext) return null;
    try {
      context ??= new AudioContext({ latencyHint: "interactive" });
      return context;
    } catch {
      return null;
    }
  }

  function unlock(event) {
    if (event && !event.isTrusted) return;
    const audio = getContext();
    if (audio && audio.state !== "running" && audio.state !== "closed") {
      // Resume inside a real gesture, including after mobile audio interruption.
      // Never queue old notifications to play when audio becomes available.
      try {
        void audio.resume().catch(() => {});
      } catch {
        // Sound availability must not affect notification delivery.
      }
    }
  }

  const gestures = ["pointerdown", "pointerup", "touchend", "keydown"];
  for (const gesture of gestures)
    window.addEventListener(gesture, unlock, { capture: true, passive: true });
  getContext();
  if (navigator.userActivation?.hasBeenActive) unlock();

  return {
    play() {
      const audio = getContext();
      const now = performance.now();
      if (audio?.state !== "running" || now - lastPlayed < 1200) return;
      try {
        scheduleNotificationTone(audio, voices);
        lastPlayed = now;
      } catch {
        // Unsupported or interrupted audio leaves cards and badges working.
      }
    },
    stop() {
      if (stopped) return;
      stopped = true;
      for (const gesture of gestures)
        window.removeEventListener(gesture, unlock, true);
      for (const oscillator of voices) {
        try {
          oscillator.stop();
        } catch {
          // A tone may already have ended during cleanup.
        }
      }
      voices.clear();
      if (context && context.state !== "closed")
        void context.close().catch(() => {});
    },
  };
}
