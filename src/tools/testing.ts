import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { SimctlExecutor } from "../simctl/executor.js";
import { BridgeManager } from "../bridge/manager.js";
import { BridgeClient } from "../bridge/client.js";
import { TestRunner } from "../testing/runner.js";
import { compareScreenshots } from "../testing/screenshot-diff.js";

const executor = new SimctlExecutor();
const bridgeManager = new BridgeManager();

async function getRunner(deviceId?: string, baselinesDir?: string) {
  const id = await executor.resolveDeviceId(deviceId);
  const port = await bridgeManager.start(id);
  return new TestRunner(new BridgeClient(port), executor, id, baselinesDir);
}

export function registerTestingTools(server: McpServer) {
  server.tool("test_run", "Execute a markdown test file and return pass/fail results per step", {
    filePath: z.string().describe("Path to the markdown test file"),
    baselinesDir: z.string().optional(),
    deviceId: z.string().optional(),
  }, async ({ filePath, baselinesDir, deviceId }) => {
    const runner = await getRunner(deviceId, baselinesDir);
    const result = await runner.runFile(filePath);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  });

  server.tool("test_run_all", "Run all markdown test files in a directory", {
    dirPath: z.string().describe("Directory containing .md test files"),
    baselinesDir: z.string().optional(),
    deviceId: z.string().optional(),
  }, async ({ dirPath, baselinesDir, deviceId }) => {
    const runner = await getRunner(deviceId, baselinesDir);
    const files = (await readdir(dirPath)).filter((f) => f.endsWith(".md"));
    const results = [];
    for (const file of files) {
      results.push(await runner.runFile(path.join(dirPath, file)));
    }
    const summary = {
      total: results.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      results,
    };
    return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
  });

  server.tool("test_screenshot_compare", "Compare two screenshots and return diff percentage", {
    pathA: z.string(), pathB: z.string(),
    threshold: z.number().optional().describe("Match threshold percentage (default 1%)"),
    diffOutputPath: z.string().optional(),
  }, async ({ pathA, pathB, threshold, diffOutputPath }) => {
    const result = await compareScreenshots(pathA, pathB, { threshold, diffOutputPath });
    const content: any[] = [{ type: "text", text: JSON.stringify(result, null, 2) }];
    if (diffOutputPath) {
      const diffImage = await readFile(diffOutputPath);
      content.push({ type: "image", data: diffImage.toString("base64"), mimeType: "image/png" });
    }
    return { content };
  });

  server.tool("test_screenshot_baseline", "Save current simulator screenshot as a named baseline", {
    name: z.string().describe("Baseline name"),
    baselinesDir: z.string().optional(),
    deviceId: z.string().optional(),
  }, async ({ name, baselinesDir, deviceId }) => {
    const dir = baselinesDir ?? "tests/baselines";
    const id = await executor.resolveDeviceId(deviceId);
    const tmpPath = `/tmp/simu-baseline-${Date.now()}.png`;
    await executor.screenshot(id, tmpPath);
    const { mkdir, copyFile } = await import("node:fs/promises");
    await mkdir(dir, { recursive: true });
    const destPath = path.join(dir, `${name}.png`);
    await copyFile(tmpPath, destPath);
    return { content: [{ type: "text", text: `Baseline saved to ${destPath}` }] };
  });

  server.tool("test_screenshot_verify", "Take a screenshot and compare against a named baseline", {
    name: z.string(), baselinesDir: z.string().optional(),
    threshold: z.number().optional(), deviceId: z.string().optional(),
  }, async ({ name, baselinesDir, threshold, deviceId }) => {
    const dir = baselinesDir ?? "tests/baselines";
    const id = await executor.resolveDeviceId(deviceId);
    const currentPath = `/tmp/simu-verify-${Date.now()}.png`;
    await executor.screenshot(id, currentPath);
    const diffPath = `/tmp/simu-diff-${Date.now()}.png`;
    const result = await compareScreenshots(path.join(dir, `${name}.png`), currentPath, { threshold, diffOutputPath: diffPath });
    const content: any[] = [{ type: "text", text: JSON.stringify(result, null, 2) }];
    if (!result.match) {
      const diffImage = await readFile(diffPath);
      content.push({ type: "image", data: diffImage.toString("base64"), mimeType: "image/png" });
    }
    return { content };
  });
}
