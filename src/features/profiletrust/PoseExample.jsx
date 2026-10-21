import { useEffect, useRef, useState } from "react";
import {
  HAND_DIRECTION_NAMES,
  HAND_NAMES,
  HEAD_MOTIONS,
  headGuideStep,
} from "./challenge.js";

// 손가락을 각각 그려 숫자 3·4도 글자가 아닌 손 모양으로 보여 준다.
const FINGERS = {
  HAND_FIST: [],
  HAND_ONE: [0],
  HAND_TWO: [0, 1],
  HAND_THREE: [0, 1, 2],
  HAND_FOUR: [0, 1, 2, 3],
  HAND_OPEN_PALM: [0, 1, 2, 3],
  HAND_THUMBS_UP: [],
  HAND_L_SHAPE: [0],
  HAND_LOVE_YOU: [0, 3],
  HAND_CALL_ME: [3],
};
const THUMB_OUT = new Set([
  "HAND_OPEN_PALM",
  "HAND_L_SHAPE",
  "HAND_LOVE_YOU",
  "HAND_CALL_ME",
]);

function HandShape({ hand, back = false }) {
  // 모든 예시가 같은 손가락 모양을 사용한다. 손등/손바닥은 표면 무늬만 다르다.
  const shapes = [
    "M6 10Q5 9 5 12v3q0 4 4 4h3q4 0 4-4v-4q0-2-2-2H8Z",
    "M8 18h5v4H8z",
  ];
  const fingers = [
    "M6 12 5 4Q5 2 6.5 2T8 4l1 8Z",
    "M9 11V2Q9 0 10.5 0T12 2v10Z",
    "M12 12V4q0-2 1.5-2T15 4v9Z",
    "M15 13l1-6q.3-1.5 1.5-1.2T19 7.5L18 15Z",
  ];
  for (const finger of FINGERS[hand]) {
    shapes.push(
      hand === "HAND_TWO"
        ? finger === 0
          ? "M7 12 3 4Q2 2 3.5 1.5T6 3l4 8Z"
          : "M10 11 12 2q.5-2 2-1.5T15 3l-2 10Z"
        : fingers[finger],
    );
  }
  if (hand === "HAND_THUMBS_UP") {
    shapes.push("M5 13 4 9l1-6q.3-2 2-1.5Q9 2 8 5L8 9h4v7Z");
  } else if (THUMB_OUT.has(hand)) {
    shapes.push("M8 13 3 8Q1.5 6.5.3 8T1 11l5 6Z");
  } else {
    shapes.push("M6 12q-3-2-3 0v3q0 2 3 2l5-2q1-2-1-2Z");
  }
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <g fill={back ? "#f7c7ac" : "#ffe0c5"} stroke="#6d4d70" strokeWidth="1.1">
        {shapes.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <path
        d="M7 12q1-1 2-1M7 15q3 1 6 0"
        fill="none"
        stroke={back ? "#e9ab9a" : "#f4bda8"}
        strokeWidth="0.7"
      />
      {back ? (
        <path d="M8 13h1m2-1h1m2 1h1" stroke="#b67d86" strokeWidth="0.8" />
      ) : (
        <path
          d="M8 17q2 1 4 0"
          fill="none"
          stroke="#d9998f"
          strokeWidth="0.7"
        />
      )}
      <path
        d="M7.5 20h6v3h-6z"
        fill="#b79cf1"
        stroke="#6d4d70"
        strokeWidth="1"
      />
      <path d="M8.5 21h3.8" stroke="#f4ecff" strokeWidth="0.65" />
    </g>
  );
}

function HandExample({ hand, direction }) {
  const angle =
    hand === "HAND_FIST"
      ? 0
      : direction === "DOWN"
        ? 180
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

function HandVariation({ hand, direction, mirror, back }) {
  // 좌우 손을 뒤집어도 같은 챌린지이며, 가로 방향의 반대쪽도 허용된다.
  const angle =
    hand === "HAND_FIST"
      ? 0
      : direction === "DOWN"
        ? 180
        : direction === "SIDEWAYS"
          ? mirror
            ? -90
            : 90
          : 0;
  return (
    <svg
      className="trust-hand-glyph"
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <g
        transform={`translate(24 24) scale(1.55) rotate(${angle}) scale(${mirror ? -1 : 1} 1) translate(-10 -11)`}
      >
        <HandShape hand={hand} back={back} />
      </g>
    </svg>
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

export function PoseExample({ challenge, progress }) {
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
    if (!playing || recording) return undefined;
    const timer = window.setInterval(
      () => setDemoStep((step) => (step + 1) % 3),
      1800,
    );
    return () => window.clearInterval(timer);
  }, [playing, recording]);
  if (!challenge || challenge.legacy) return null;
  const motion = HEAD_MOTIONS[challenge.head];
  const step = recording
    ? headGuideStep(progress.stage, progress.clipProgress)
    : demoStep;
  const labels = ["정면 보기", motion.label, "다시 정면"];
  return (
    <section className="trust-pose-example" aria-label="하루의 포즈 예시">
      <div className="trust-example-heading">
        <strong>
          {recording ? "하루와 함께 따라 해요" : "하루가 먼저 보여줄게요"}
        </strong>
        {!recording && (
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
        <HaruPose challenge={challenge} moving={step === 1} />
        <div className="trust-example-copy">
          <strong>{HAND_NAMES[challenge.hand]}</strong>
          {challenge.hand !== "HAND_FIST" && (
            <span>
              손끝:{" "}
              {challenge.direction === "SIDEWAYS"
                ? "← 가로 → 어느 쪽이든"
                : HAND_DIRECTION_NAMES[challenge.direction]}
            </span>
          )}
          <span>손바닥·손등 어느 쪽도 OK</span>
          <span>왼손·오른손 모두 가능</span>
        </div>
      </div>
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
            <HandVariation
              hand={challenge.hand}
              direction={challenge.direction}
              mirror={variation.mirror}
              back={variation.back}
            />
            <span>{variation.label}</span>
          </div>
        ))}
      </div>
      {challenge.hand !== "HAND_FIST" && challenge.direction === "SIDEWAYS" && (
        <p className="trust-hand-direction-note">
          손끝은 ← 왼쪽 또는 오른쪽 → 어느 쪽을 향해도 돼요.
        </p>
      )}
      <ol className="trust-head-steps">
        {labels.map((label, index) => (
          <li key={label} aria-current={index === step ? "step" : undefined}>
            {recording ? (
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
      <small>
        {step === 1
          ? motion.detail
          : step === 0
            ? "먼저 정면을 바라봐 주세요."
            : "정면으로 돌아와 그대로 유지해 주세요."}{" "}
        좌우는 내 몸 기준이에요.{" "}
        {challenge.hand === "HAND_FIST"
          ? "주먹은 방향에 상관없이 화면 안 편한 위치에 두세요."
          : "손 모양과 방향만 맞추면, 화면 안에서 편한 위치에 두어도 돼요."}{" "}
        예시는 참고용이에요. 손바닥·손등 방향이나 팔 각도까지 똑같이 따라 하지
        않아도 돼요. 얼굴은 가리지 말아 주세요.
      </small>
    </section>
  );
}
