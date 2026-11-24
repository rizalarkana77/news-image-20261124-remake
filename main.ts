// One Day, Five Stories — Tuesday 24 November 2026 (Remake)
// make.fun competition news-image-20261124.
// The entry is a single pre-rendered image (entry.png). This program only
// validates it against the competition's limits and copies it, byte for byte,
// to the output directory the grader provides.
//
// Node 22, standard library only. No network, no randomness, no clock reads:
// the same input always produces the same output bytes.

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_BYTES = 1048576;
const MAX_SIDE = 1024;

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// Read the width/height out of the PNG IHDR chunk (bytes 16..24) and
// confirm the file really ends with an IEND chunk.
function checkPngShape(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_MAGIC)) {
    throw new Error("entry.png is not a PNG file");
  }
  if (bytes.readUInt32BE(8) !== 13 || bytes.toString("latin1", 12, 16) !== "IHDR") {
    throw new Error("entry.png has no valid IHDR chunk");
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width > MAX_SIDE || height > MAX_SIDE || width === 0 || height === 0) {
    throw new Error(`image is ${width}x${height}, over the ${MAX_SIDE}x${MAX_SIDE} limit`);
  }
  const colorType = bytes[25];
  if (colorType !== 2 && colorType !== 6) {
    throw new Error(`unsupported PNG colour type ${colorType} (want truecolour 2 or 6)`);
  }
  const iend = bytes.subarray(bytes.length - 12);
  if (iend.readUInt32BE(0) !== 0 || iend.toString("latin1", 4, 8) !== "IEND") {
    throw new Error("entry.png does not end with an IEND chunk");
  }
  return { width, height };
}

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = join(here, "entry.png");
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  const target = join(outDir, "entry.png");
  if (outDir.trim() === "") {
    throw new Error("MAKEFUN_OUTPUT_DIR is set but empty; unset it or give a directory");
  }

  const info = await stat(source);
  if (!info.isFile()) {
    throw new Error("entry.png is not a regular file");
  }
  if (info.size > MAX_BYTES) {
    throw new Error(`entry.png is ${info.size} bytes, over the 1 MiB limit`);
  }
  const bytes = await readFile(source);
  if (bytes.length !== info.size) {
    throw new Error("entry.png changed size while being read");
  }
  const { width, height } = checkPngShape(bytes);

  await mkdir(outDir, { recursive: true });
  await copyFile(source, target);

  // Prove the copy is exact: read the output back and compare hash + size.
  const written = await readFile(target);
  const inHash = sha256Hex(bytes);
  const outHash = sha256Hex(written);
  if (written.length !== bytes.length || outHash !== inHash) {
    throw new Error("output does not match entry.png byte for byte");
  }
  console.log(`wrote ${target}: ${width}x${height}, ${written.length} bytes, sha256 ${outHash}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
