// Pixel icons drawn from character grids (B안 시안과 같은 도트). "." is empty;
// any other character is a pixel whose colour comes from `colors[char]` or currentColor.
const ICONS = {
  back: ["...XX", "..XX.", ".XX..", "XX...", ".XX..", "..XX.", "...XX"],
  chev: ["XX...", ".XX..", "..XX.", "...XX", "..XX.", ".XX..", "XX..."],
  search: [
    ".XXX...",
    "X...X..",
    "X...X..",
    "X...X..",
    ".XXX...",
    "....XX.",
    ".....XX",
  ],
  check: ["......X", ".....XX", "X...XX.", "XX.XX..", ".XXX...", "..X...."],
  lock: [
    "..XXX..",
    ".X...X.",
    ".X...X.",
    "XXXXXXX",
    "XXX.XXX",
    "XXX.XXX",
    "XXXXXXX",
  ],
  send: [
    "X......",
    "XXX....",
    "XXXXX..",
    "XXXXXXX",
    "XXXXX..",
    "XXX....",
    "X......",
  ],
  alert: [
    "..XXX..",
    ".XX.XX.",
    "XXX.XXX",
    "XXX.XXX",
    "XXXXXXX",
    ".XX.XX.",
    "..XXX..",
  ],
  pin: [
    ".XXXXX.",
    "XX...XX",
    "XX.X.XX",
    "XX...XX",
    ".XX.XX.",
    "..XXX..",
    "...X...",
  ],
  briefcase: [
    "..XXX..",
    "..X.X..",
    "XXXXXXX",
    "X.....X",
    "XXX.XXX",
    "X.....X",
    "XXXXXXX",
  ],
  plus: ["..X..", "..X..", "XXXXX", "..X..", "..X.."],
  x: ["X...X", ".X.X.", "..X..", ".X.X.", "X...X"],
  spark: [
    "...X...",
    "...X...",
    "..XXX..",
    "XXXXXXX",
    "..XXX..",
    "...X...",
    "...X...",
  ],
  target: [
    "...XXX...",
    ".XX...XX.",
    ".X.....X.",
    "X..XXX..X",
    "X..XXX..X",
    "X..XXX..X",
    ".X.....X.",
    ".XX...XX.",
    "...XXX...",
  ],
  radio: [
    "..XXX..",
    ".X...X.",
    "X.....X",
    "X.....X",
    "X.....X",
    ".X...X.",
    "..XXX..",
  ],
  radioOn: [
    "..XXX..",
    ".X...X.",
    "X.XXX.X",
    "X.XXX.X",
    "X.XXX.X",
    ".X...X.",
    "..XXX..",
  ],
  burger: [
    "XXXXXXXX",
    "........",
    "........",
    "XXXXXXXX",
    "........",
    "........",
    "XXXXXXXX",
  ],
  home: [
    "...X...",
    "..XXX..",
    ".XXXXX.",
    "XXXXXXX",
    ".XX.XX.",
    ".XX.XX.",
    ".XX.XX.",
  ],
  user: [
    "..XXX..",
    ".X...X.",
    ".X...X.",
    "..XXX..",
    ".......",
    ".XXXXX.",
    "X.....X",
    "XXXXXXX",
  ],
  burgerSm: ["XXXXXXX", ".......", "XXXXXXX", ".......", "XXXXXXX"],
  heart: [".XX.XX.", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."],
  chat: [
    "XXXXXXXX",
    "X......X",
    "X.XXXX.X",
    "X......X",
    "XXXXXXXX",
    ".XX.....",
    ".X......",
  ],
  sim: [
    "...X...",
    ".XXXXX.",
    ".XX.XX.",
    "XX...XX",
    ".XX.XX.",
    ".XXXXX.",
    "...X...",
  ],
  bust: [
    "....XXX....",
    "...XXXXX...",
    "...XXXXX...",
    "...XXXXX...",
    "....XXX....",
    ".....X.....",
    "..XXXXXXX..",
    ".XXXXXXXXX.",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
  ],
  robot: [
    ".....aa.....",
    ".....a......",
    "..oooooooo..",
    ".offffffffo.",
    ".offeffeffo.",
    ".offeffeffo.",
    ".offffffffo.",
    ".offfeefffo.",
    ".offffffffo.",
    "..oooooooo..",
  ],
};

const ROBOT_COLORS = { a: "#ee6ab1", o: "#4c3373", f: "#fff", e: "#1b1430" };

const pathCache = new Map();

function runs(name) {
  if (pathCache.has(name)) return pathCache.get(name);
  const byChar = {};
  ICONS[name].forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const char = row[x];
      if (char === ".") {
        x += 1;
        continue;
      }
      let end = x;
      while (row[end + 1] === char) end += 1;
      const width = end - x + 1;
      byChar[char] = `${byChar[char] || ""}M${x} ${y}h${width}v1h-${width}z`;
      x = end + 1;
    }
  });
  pathCache.set(name, byChar);
  return byChar;
}

export function PixelIcon({ name, scale = 2, colors, className = "" }) {
  const rows = ICONS[name];
  const width = rows[0].length;
  const height = rows.length;
  const palette = colors || (name === "robot" ? ROBOT_COLORS : {});
  return (
    <svg
      className={`pixel-icon ${className}`}
      width={width * scale}
      height={height * scale}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {Object.entries(runs(name)).map(([char, d]) => (
        <path key={char} d={d} fill={palette[char] || "currentColor"} />
      ))}
    </svg>
  );
}
