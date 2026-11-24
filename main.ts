// One Day, Five Stories — Tuesday 24 November 2026 (Remake)
// make.fun competition: news-image-20261124.
//
// The poster itself is a pre-rendered image (entry.png). This program is
// only a courier: it checks the image against the competition's limits and
// then copies it, byte for byte, into the directory the grader provides.
//
// Nothing here touches the network, the clock, or any random source, and it
// only uses the Node 22 standard library — so the same input always yields
// the same output bytes.

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// --- Competition limits -------------------------------------------------

const ONE_MEBIBYTE = 1024 * 1024;
const MAX_IMAGE_BYTES = ONE_MEBIBYTE; // entry.png must stay under 1 MiB
const MAX_IMAGE_SIDE = 1024; // and fit inside a 1024x1024 square
const MIN_PNG_BYTES = 33; // signature (8) + IHDR chunk (25)

// The eight-byte signature every PNG file starts with.
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

// PNG colour types the competition accepts: truecolour (2) and
// truecolour-with-alpha (6). Palette and greyscale images are out.
const ACCEPTED_COLOUR_TYPES = new Set([2, 6]);

// --- Small helpers ------------------------------------------------------

function sha256Of(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function fail(message: string): never {
  throw new Error(message);
}

// --- PNG inspection -----------------------------------------------------
//
// A PNG is a signature followed by chunks. The first chunk must be IHDR
// (13 bytes of header: width, height, bit depth, colour type, ...), and the
// last chunk must be IEND (length 0, type "IEND"). We check exactly those
// two chunks plus the signature — enough to prove the file is a real,
// well-formed PNG of an allowed size without decoding a single pixel.

interface PngGeometry {
  width: number;
  height: number;
}

function readChunkType(png: Buffer, offset: number): string {
  return png.toString("latin1", offset + 4, offset + 8);
}

function inspectPng(png: Buffer): PngGeometry {
  if (png.length < MIN_PNG_BYTES) {
    fail("entry.png is too short to be a PNG file");
  }
  if (!png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    fail("entry.png does not start with the PNG signature");
  }

  // IHDR sits right after the signature: length at 8, type at 12.
  const ihdrLength = png.readUInt32BE(8);
  if (ihdrLength !== 13 || readChunkType(png, 8) !== "IHDR") {
    fail("entry.png has no valid IHDR chunk");
  }

  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width === 0 || height === 0) {
    fail("entry.png has a zero dimension");
  }
  if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE) {
    fail(
      `entry.png is ${width}x${height}, larger than the ${MAX_IMAGE_SIDE}x${MAX_IMAGE_SIDE} limit`,
    );
  }

  // Colour type is the tenth byte of the IHDR data (offset 25 in the file).
  const colourType = png[25];
  if (!ACCEPTED_COLOUR_TYPES.has(colourType)) {
    fail(
      `entry.png uses PNG colour type ${colourType}; only truecolour (2) or truecolour+alpha (6) are allowed`,
    );
  }

  // The file must end with an IEND chunk: length 0, type "IEND".
  const tail = png.subarray(png.length - 12);
  if (tail.readUInt32BE(0) !== 0 || readChunkType(tail, 0) !== "IEND") {
    fail("entry.png does not end with an IEND chunk");
  }

  return { width, height };
}

// --- Entry point --------------------------------------------------------

async function run(): Promise<void> {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const sourcePath = join(scriptDir, "entry.png");

  const rawOutputDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  if (rawOutputDir.trim() === "") {
    fail("MAKEFUN_OUTPUT_DIR is set but empty; unset it or give a directory");
  }
  const destinationPath = join(rawOutputDir, "entry.png");

  const metadata = await stat(sourcePath);
  if (!metadata.isFile()) {
    fail("entry.png is not a regular file");
  }
  if (metadata.size > MAX_IMAGE_BYTES) {
    fail(
      `entry.png is ${metadata.size} bytes, over the ${MAX_IMAGE_BYTES}-byte limit`,
    );
  }

  const original = await readFile(sourcePath);
  if (original.length !== metadata.size) {
    fail("entry.png changed size while it was being read");
  }
  const { width, height } = inspectPng(original);

  await mkdir(rawOutputDir, { recursive: true });
  await copyFile(sourcePath, destinationPath);

  // Read the copy back and prove it is identical: same length, same hash.
  const copied = await readFile(destinationPath);
  const sourceHash = sha256Of(original);
  const copiedHash = sha256Of(copied);
  if (copied.length !== original.length || copiedHash !== sourceHash) {
    fail("the copied entry.png does not match the source byte for byte");
  }

  console.log(
    `wrote ${destinationPath}: ${width}x${height}, ${copied.length} bytes, sha256 ${copiedHash}`,
  );
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
