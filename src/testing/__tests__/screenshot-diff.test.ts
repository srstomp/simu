import { describe, it, expect } from "vitest";
import { compareScreenshots } from "../screenshot-diff.js";
import { PNG } from "pngjs";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const tmpDir = "/tmp/simu-test-screenshots";

function createTestPng(width: number, height: number, color: [number, number, number, number]): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = color[0];
      png.data[idx + 1] = color[1];
      png.data[idx + 2] = color[2];
      png.data[idx + 3] = color[3];
    }
  }
  return PNG.sync.write(png);
}

describe("compareScreenshots", () => {
  it("returns 0% diff for identical images", async () => {
    mkdirSync(tmpDir, { recursive: true });
    const img = createTestPng(10, 10, [255, 0, 0, 255]);
    writeFileSync(path.join(tmpDir, "a.png"), img);
    writeFileSync(path.join(tmpDir, "b.png"), img);
    const result = await compareScreenshots(path.join(tmpDir, "a.png"), path.join(tmpDir, "b.png"));
    expect(result.diffPercentage).toBe(0);
    expect(result.match).toBe(true);
  });

  it("returns 100% diff for completely different images", async () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(path.join(tmpDir, "c.png"), createTestPng(10, 10, [255, 0, 0, 255]));
    writeFileSync(path.join(tmpDir, "d.png"), createTestPng(10, 10, [0, 0, 255, 255]));
    const result = await compareScreenshots(path.join(tmpDir, "c.png"), path.join(tmpDir, "d.png"));
    expect(result.diffPercentage).toBe(100);
    expect(result.match).toBe(false);
  });

  it("respects custom threshold", async () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(path.join(tmpDir, "e.png"), createTestPng(10, 10, [255, 0, 0, 255]));
    writeFileSync(path.join(tmpDir, "f.png"), createTestPng(10, 10, [0, 0, 255, 255]));
    const result = await compareScreenshots(path.join(tmpDir, "e.png"), path.join(tmpDir, "f.png"), { threshold: 100 });
    expect(result.match).toBe(true);
  });
});
