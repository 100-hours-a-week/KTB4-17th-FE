import { requiresHandDirection } from "./challenge.js";

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

export function HandShape({ hand, back = false, outline = false }) {
  // 손등에서는 손바닥 쪽으로 접힌 엄지를 숨기고, 바깥으로 편 엄지만 표시한다.
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
  } else if (!back) {
    shapes.push("M6 12q-3-2-3 0v3q0 2 3 2l5-2q1-2-1-2Z");
  }
  if (outline) {
    return (
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {shapes.map((d) => (
          <path key={d} d={d} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    );
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

export function HandGlyph({
  hand,
  direction,
  mirror = false,
  back = false,
  outline = false,
  className = "trust-hand-glyph",
}) {
  // 좌우 손을 뒤집어도 같은 챌린지이며, 가로 방향의 반대쪽도 허용된다.
  const angle = !requiresHandDirection(hand, direction)
    ? 0
    : direction === "SIDEWAYS"
      ? mirror
        ? -90
        : 90
      : 0;
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <g
        transform={`translate(24 24) scale(1.55) rotate(${angle}) scale(${mirror ? -1 : 1} 1) translate(-10 -11)`}
      >
        <HandShape hand={hand} back={back} outline={outline} />
      </g>
    </svg>
  );
}
