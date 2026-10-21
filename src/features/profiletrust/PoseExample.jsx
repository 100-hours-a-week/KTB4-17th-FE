import { useEffect, useRef, useState } from "react";
import {
  HAND_DIRECTION_NAMES,
  HAND_NAMES,
  HEAD_MOTIONS,
  headGuideStep,
  requiresHandDirection,
} from "./challenge.js";
import { HandGlyph, HandShape } from "./HandShape.jsx";

function HandExample({ hand, direction }) {
  const angle = !requiresHandDirection(hand, direction)
    ? 0
    : direction === "SIDEWAYS"
      ? 90
      : 0;
  const radians = (angle * Math.PI) / 180;
  const wristX =
    109 + 1.55 * (10 + 0.5 * Math.cos(radians) - 12 * Math.sin(radians));
  const wristY =
    31 + 1.55 * (10 + 0.5 * Math.sin(radians) + 12 * Math.cos(radians));
  const elbow = { x: 109, y: 82 };
  const dx = wristX - elbow.x;
  const dy = wristY - elbow.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const polygon = (width) =>
    [
      `${elbow.x + nx * width},${elbow.y + ny * width}`,
      `${wristX + nx * width * 0.65},${wristY + ny * width * 0.65}`,
      `${wristX - nx * width * 0.65},${wristY - ny * width * 0.65}`,
      `${elbow.x - nx * width},${elbow.y - ny * width}`,
    ].join(" ");
  return (
    <g>
      <path
        d="M94 87h14l7-5-6-7-8 5-7-1z"
        fill="#a88bdf"
        stroke="#3b2466"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <polygon
        points={polygon(5)}
        fill="#a98ddd"
        stroke="#3b2466"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <polygon points={polygon(2.4)} fill="#e0d3ff" stroke="none" />
      <circle
        cx={elbow.x}
        cy={elbow.y}
        r="5"
        fill="#b9a3f7"
        stroke="#3b2466"
        strokeWidth="1.5"
      />
      <circle cx={elbow.x - 1} cy={elbow.y - 1} r="1.4" fill="#f7eeff" />
      <g transform={`translate(109 31) scale(1.55) rotate(${angle} 10 10)`}>
        <HandShape hand={hand} />
      </g>
    </g>
  );
}

function RobotHead({ yaw, pitch }) {
  // 머리의 각 면과 표정을 동일한 3D 좌표로 회전·투영한다.
  const y = (yaw * Math.PI) / 180;
  const p = (pitch * Math.PI) / 180;
  const project = ([x, yy, z]) => {
    const xx = x * Math.cos(y) + z * Math.sin(y);
    const zz = -x * Math.sin(y) + z * Math.cos(y);
    return `${(70 + xx).toFixed(2)},${(43 + yy * Math.cos(p) - zz * Math.sin(p)).toFixed(2)}`;
  };
  const points = (vertices) => vertices.map(project).join(" ");
  const frontRect = (x, yy, width, height, z = 19) =>
    points([
      [x, yy, z],
      [x + width, yy, z],
      [x + width, yy + height, z],
      [x, yy + height, z],
    ]);
  const side = yaw >= 0 ? -27 : 27;
  const edge = pitch >= 0 ? 24 : -24;
  return (
    <g stroke="#3b2466" strokeWidth="1.7" strokeLinejoin="round">
      <polygon
        points={points([
          [side, -24, -16],
          [side, -24, 18],
          [side, 24, 18],
          [side, 24, -16],
        ])}
        fill="#9e83d9"
      />
      <polygon
        points={points([
          [-27, edge, -16],
          [27, edge, -16],
          [27, edge, 18],
          [-27, edge, 18],
        ])}
        fill={pitch >= 0 ? "#a98de0" : "#f1eaff"}
      />
      <polygon
        points={points([
          [side, -8, -10],
          [side, -8, 6],
          [side, 8, 6],
          [side, 8, -10],
        ])}
        fill="#ee6ab1"
      />
      <polygon points={frontRect(-27, -24, 54, 48, 18)} fill="#ddd0ff" />
      <polyline
        points={points([
          [-23, -16, 19],
          [-23, -20, 19],
          [-14, -20, 19],
        ])}
        fill="none"
        stroke="white"
        strokeWidth="2"
      />
      <polygon points={frontRect(-21, -15, 42, 30, 19)} fill="#c9f7e1" />
      <polygon
        points={frontRect(-14, -8, 5, 8, 20)}
        fill="#3b2466"
        stroke="none"
      />
      <polygon
        points={frontRect(9, -8, 5, 8, 20)}
        fill="#3b2466"
        stroke="none"
      />
      <polyline
        points={points([
          [-6, 5, 20],
          [-6, 8, 20],
          [6, 8, 20],
          [6, 5, 20],
        ])}
        fill="none"
      />
      <polyline
        points={points([
          [-17, 4, 20],
          [-12, 4, 20],
        ])}
        fill="none"
        stroke="#ff9fc8"
        strokeWidth="2"
      />
      <polyline
        points={points([
          [12, 4, 20],
          [17, 4, 20],
        ])}
        fill="none"
        stroke="#ff9fc8"
        strokeWidth="2"
      />
      <polyline
        points={points([
          [0, -24, 0],
          [0, -32, 0],
        ])}
        fill="none"
      />
      <polygon
        points={points([
          [-3, -37, 0],
          [3, -37, 0],
          [3, -31, 0],
          [-3, -31, 0],
        ])}
        fill="#ee6ab1"
      />
    </g>
  );
}

function HaruPose({ challenge, moving }) {
  const [turn, setTurn] = useState(0);
  const currentTurn = useRef(0);
  useEffect(() => {
    const target = moving ? 1 : 0;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      currentTurn.current = target;
      setTurn(target);
      return undefined;
    }
    let frame;
    const started = performance.now();
    // 단계가 중간에 바뀌어도 현재 각도에서 자연스럽게 이어진다.
    const from = currentTurn.current;
    const animate = (now) => {
      const t = Math.min((now - started) / 650, 1);
      const eased = t * t * (3 - 2 * t);
      currentTurn.current = from + (target - from) * eased;
      setTurn(currentTurn.current);
      if (t < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [moving]);
  const horizontal =
    challenge.head === "TURN_LEFT"
      ? -1
      : challenge.head === "TURN_RIGHT"
        ? 1
        : 0;
  const vertical =
    challenge.head === "LOOK_UP" ? -1 : challenge.head === "LOOK_DOWN" ? 1 : 0;
  return (
    <svg
      className="trust-example-art"
      viewBox="0 0 160 105"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M8 20V9h11M141 9h11v11M8 85v11h11M141 96h11V85"
        fill="none"
        stroke="#c9b6ed"
        strokeWidth="2"
      />
      <path
        d="M43 102V84l8-8h40l8 8v18"
        fill="#d7c7ff"
        stroke="#3b2466"
        strokeWidth="2"
      />
      <path
        d="M65 67h12v15H65z"
        fill="#b9a3f7"
        stroke="#3b2466"
        strokeWidth="2"
      />
      <RobotHead yaw={horizontal * turn * 48} pitch={-vertical * turn * 28} />
      {moving && (
        <path
          d={
            horizontal > 0
              ? "M109 28h25m-6-6 6 6-6 6"
              : horizontal < 0
                ? "M32 28H13m6-6-6 6 6 6"
                : vertical < 0
                  ? "M24 49V25m-6 6 6-6 6 6"
                  : "M24 25v24m-6-6 6 6 6-6"
          }
          fill="none"
          stroke="#7c5cfa"
          strokeWidth="3"
        />
      )}
      <HandExample hand={challenge.hand} direction={challenge.direction} />
    </svg>
  );
}

export function PoseExample({ challenge, progress, showHelp = true }) {
  const [demoStep, setDemoStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const recording = progress.stage === "recording";
  const key = challenge
    ? `${challenge.hand}-${challenge.direction}-${challenge.head}`
    : "";
  useEffect(() => {
    if (!key || recording) return undefined;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reset = () => {
      setDemoStep(0);
      setPlaying(!media.matches);
    };
    reset();
    media.addEventListener("change", reset);
    return () => media.removeEventListener("change", reset);
  }, [key, recording]);
  useEffect(() => {
    if (!playing || recording || !challenge?.head) return undefined;
    const timer = window.setInterval(
      () => setDemoStep((step) => (step + 1) % 3),
      1800,
    );
    return () => window.clearInterval(timer);
  }, [playing, recording, challenge?.head]);
  if (!challenge || challenge.legacy) return null;
  const motion = HEAD_MOTIONS[challenge.head];
  const step = !motion
    ? progress.stage === "centering"
      ? 0
      : 1
    : recording
      ? headGuideStep(progress.stage, progress.clipProgress)
      : demoStep;
  const labels = motion
    ? ["정면 보기", motion.label, "다시 정면"]
    : ["정면 2초", "포즈 3초", "자동 완료"];
  return (
    <section className="trust-pose-example" aria-label="하루의 포즈 예시">
      <div className="trust-example-heading">
        <strong>
          {motion
            ? "추가 확인 · 하루와 함께 따라 해요"
            : "정면 확인 후 이 포즈를 3초 유지해 주세요"}
        </strong>
        {!recording && motion && (
          <button
            type="button"
            onClick={() => setPlaying((value) => !value)}
            aria-pressed={playing}
          >
            {playing ? "예시 멈추기" : "예시 재생"}
          </button>
        )}
      </div>
      <div className="trust-example-preview">
        <HaruPose
          challenge={challenge}
          moving={Boolean(motion) && step === 1}
        />
        <div className="trust-example-copy">
          <strong>{HAND_NAMES[challenge.hand]}</strong>
          {requiresHandDirection(challenge.hand, challenge.direction) ? (
            <span>
              손끝:{" "}
              {challenge.direction === "SIDEWAYS"
                ? "← 가로 → 어느 쪽이든"
                : HAND_DIRECTION_NAMES[challenge.direction]}
            </span>
          ) : (
            <span>손끝 방향은 자유예요</span>
          )}
          {showHelp && (
            <>
              <span>손바닥·손등 어느 쪽도 OK</span>
              <span>왼손·오른손 모두 가능</span>
            </>
          )}
        </div>
      </div>
      {showHelp && (
        <>
          <p className="trust-hand-variations-title">
            같은 손 모양, 이렇게 잡아도 돼요
          </p>
          <div className="trust-hand-variations">
            {[
              { label: "왼손 · 손바닥", mirror: false, back: false },
              { label: "오른손 · 손바닥", mirror: true, back: false },
              { label: "왼손 · 손등", mirror: false, back: true },
              { label: "오른손 · 손등", mirror: true, back: true },
            ].map((variation) => (
              <div className="trust-hand-variation" key={variation.label}>
                <HandGlyph
                  hand={challenge.hand}
                  direction={challenge.direction}
                  mirror={variation.mirror}
                  back={variation.back}
                />
                <span>{variation.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {showHelp &&
        requiresHandDirection(challenge.hand, challenge.direction) &&
        challenge.direction === "SIDEWAYS" && (
          <p className="trust-hand-direction-note">
            손끝은 ← 왼쪽 또는 오른쪽 → 어느 쪽을 향해도 돼요.
          </p>
        )}
      <ol className="trust-head-steps">
        {labels.map((label, index) => (
          <li key={label} aria-current={index === step ? "step" : undefined}>
            {recording || !motion ? (
              <span>
                {index + 1}. {label}
              </span>
            ) : (
              <button
                type="button"
                aria-pressed={index === step}
                onClick={() => {
                  setPlaying(false);
                  setDemoStep(index);
                }}
              >
                {index + 1}. {label}
              </button>
            )}
          </li>
        ))}
      </ol>
      {showHelp && (
        <small>
          {!motion
            ? "정면과 손 모양이 확인되면 자동으로 촬영을 마쳐요."
            : step === 1
              ? motion.detail
              : step === 0
                ? "먼저 정면을 바라봐 주세요."
                : "정면으로 돌아와 그대로 유지해 주세요."}{" "}
          좌우는 내 몸 기준이에요.{" "}
          {!requiresHandDirection(challenge.hand, challenge.direction)
            ? "손 모양만 맞추고 방향에 상관없이 편한 위치에 두세요."
            : "손 모양과 방향만 맞추면, 화면 안에서 편한 위치에 두어도 돼요."}{" "}
          예시는 참고용이에요. 손바닥·손등 방향이나 팔 각도까지 똑같이 따라 하지
          않아도 돼요. 얼굴은 가리지 말아 주세요.
        </small>
      )}
    </section>
  );
}
