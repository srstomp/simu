import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { readFile, writeFile } from "node:fs/promises";

export interface DiffResult {
  diffPercentage: number;
  match: boolean;
  diffImagePath?: string;
  totalPixels: number;
  differentPixels: number;
}

export async function compareScreenshots(
  pathA: string,
  pathB: string,
  options?: { threshold?: number; diffOutputPath?: string }
): Promise<DiffResult> {
  const [bufA, bufB] = await Promise.all([readFile(pathA), readFile(pathB)]);
  const imgA = PNG.sync.read(bufA);
  const imgB = PNG.sync.read(bufB);

  if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
    return {
      diffPercentage: 100,
      match: false,
      totalPixels: Math.max(imgA.width * imgA.height, imgB.width * imgB.height),
      differentPixels: Math.max(imgA.width * imgA.height, imgB.width * imgB.height),
    };
  }

  const { width, height } = imgA;
  const diff = new PNG({ width, height });
  const totalPixels = width * height;

  const differentPixels = pixelmatch(imgA.data, imgB.data, diff.data, width, height, { threshold: 0.1 });
  const diffPercentage = Math.round((differentPixels / totalPixels) * 100);
  const matchThreshold = options?.threshold ?? 1;
  const match = diffPercentage <= matchThreshold;

  let diffImagePath: string | undefined;
  if (options?.diffOutputPath) {
    diffImagePath = options.diffOutputPath;
    await writeFile(diffImagePath, PNG.sync.write(diff));
  }

  return { diffPercentage, match, diffImagePath, totalPixels, differentPixels };
}
