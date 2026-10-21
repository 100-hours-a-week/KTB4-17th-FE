import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const target = new URL("public/vision/", root);
const models = [
  ["face_landmarker", "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff"],
  ["hand_landmarker", "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1"],
];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
await mkdir(new URL("wasm/", target), { recursive: true });
const wasm = new URL("node_modules/@mediapipe/tasks-vision/wasm/", root);
for (const name of await readdir(wasm)) {
  if (name.endsWith(".wasm") || name.endsWith(".js")) {
    await copyFile(new URL(name, wasm), new URL(`wasm/${name}`, target));
  }
}
for (const [name, checksum] of models) {
  const model = new URL(`${name}.task`, target);
  let bytes = await readFile(model).catch(() => null);
  if (bytes && digest(bytes) === checksum) continue;
  const response = await fetch(
    `https://storage.googleapis.com/mediapipe-models/${name}/${name}/float16/1/${name}.task`,
    { signal: AbortSignal.timeout(30_000) },
  );
  if (!response.ok) throw new Error(`${name} download failed: ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
  if (digest(bytes) !== checksum) throw new Error(`${name} checksum mismatch`);
  await writeFile(model, bytes);
}
console.log(`Verified self-hosted face/hand models and WASM: ${fileURLToPath(target)}`);
