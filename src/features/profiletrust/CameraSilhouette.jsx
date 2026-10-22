import { headGuideStep } from "./challenge.js";
import { HandGlyph } from "./HandShape.jsx";

export function CameraSilhouette({
  ready = false,
  recording = false,
  challenge,
  progress,
  handSide = null,
}) {
  const showPose =
    challenge &&
    !challenge.legacy &&
    ["pose", "head", "recording"].includes(progress?.stage);
  const live = progress?.live;
  const handMatched = Boolean(live?.handMatched);
  const headDone = Boolean(live?.headCompleted);
  const step = showPose
    ? headGuideStep(progress.stage, progress.clipProgress, live)
    : 0;
  const arrows = {
    LOOK_UP: "M120 106V72m-10 10 10-10 10 10",
    LOOK_DOWN: "M120 72v34m-10-10 10 10 10-10",
  };
  return (
    <div
      className={`trust-camera-silhouette${ready || headDone ? " is-ready" : ""}${recording ? " is-recording" : ""}${showPose && !handSide ? " is-seeking-hand" : ""}${handMatched ? " is-hand-matched" : ""}`}
      aria-hidden="true"
    >
      <svg
        className="trust-silhouette-art"
        viewBox="0 0 240 300"
        fill="none"
        focusable="false"
        aria-hidden="true"
      >
        <path
          className="trust-silhouette-head"
          d="M120 60C88 60 72 84 72 118C72 156 82 191 102 208C113 219 127 219 138 208C158 191 168 156 168 118C168 84 152 60 120 60Z"
        />
        <path
          className="trust-silhouette-shoulders"
          d="M96 203V230C96 243 68 247 48 257C26 267 13 280 8 300M144 203V230C144 243 172 247 192 257C214 267 227 280 232 300"
        />
        <path
          className="trust-silhouette-eyeline"
          d="M88 124H106M134 124H152"
        />
        {showPose && challenge.head && step === 1 && (
          <path
            className="trust-silhouette-motion"
            d={arrows[challenge.head]}
          />
        )}
      </svg>
      {showPose &&
        (handSide ? [handSide] : ["left", "right"]).map((side) => (
          <HandGlyph
            key={side}
            className={`trust-silhouette-hand is-${side}`}
            hand={challenge.hand}
            direction={challenge.direction}
            mirror={side === "left"}
            outline
          />
        ))}
    </div>
  );
}
