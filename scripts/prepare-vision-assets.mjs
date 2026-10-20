import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const target = new URL("public/vision/", root);
const model = new URL("face_landmarker.task", target);
const checksum = "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
await mkdir(new URL("wasm/", target), { recursive: true });
const wasm = new URL("node_modules/@mediapipe/tasks-vision/wasm/", root);
for (const name of await readdir(wasm)) {
  if (name.endsWith(".wasm") || name.endsWith(".js")) {
    await copyFile(new URL(name, wasm), new URL(`wasm/${name}`, target));
  }
}
let bytes = await readFile(model).catch(() => null);
if (!bytes || digest(bytes) !== checksum) {
  const response = await fetch(
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
    { signal: AbortSignal.timeout(30_000) },
  );
  if (!response.ok) throw new Error(`Face model download failed: ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
  if (digest(bytes) !== checksum) throw new Error("Face model checksum mismatch");
  await writeFile(model, bytes);
}
console.log(`Verified self-hosted face model and WASM: ${fileURLToPath(target)}`);
