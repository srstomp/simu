import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseTestFile, TestStep, TestFile } from "./parser.js";
import { compareScreenshots } from "./screenshot-diff.js";
import { BridgeClient } from "../bridge/client.js";
import { SimctlExecutor } from "../simctl/executor.js";

export interface StepResult {
  step: TestStep;
  passed: boolean;
  error?: string;
  durationMs: number;
}

export interface SectionResult {
  name: string;
  steps: StepResult[];
  passed: boolean;
}

export interface TestResult {
  name: string;
  sections: SectionResult[];
  passed: boolean;
  totalSteps: number;
  passedSteps: number;
  durationMs: number;
}

export class TestRunner {
  constructor(
    private client: BridgeClient,
    private executor: SimctlExecutor,
    private deviceId: string,
    private baselinesDir: string = "tests/baselines"
  ) {}

  async runFile(filePath: string): Promise<TestResult> {
    const content = await readFile(filePath, "utf-8");
    return this.runTestFile(parseTestFile(content));
  }

  async runTestFile(testFile: TestFile): Promise<TestResult> {
    const startTime = Date.now();
    const sectionResults: SectionResult[] = [];
    let totalSteps = 0;
    let passedSteps = 0;

    for (const section of testFile.sections) {
      const stepResults: StepResult[] = [];
      let sectionPassed = true;

      for (const step of section.steps) {
        totalSteps++;
        const stepStart = Date.now();
        let passed = true;
        let error: string | undefined;

        try {
          await this.executeStep(step);
        } catch (e) {
          passed = false;
          error = e instanceof Error ? e.message : String(e);
          sectionPassed = false;
        }

        if (passed) passedSteps++;
        stepResults.push({ step, passed, error, durationMs: Date.now() - stepStart });
        if (!passed) break;
      }

      sectionResults.push({ name: section.name, steps: stepResults, passed: sectionPassed });
      if (section.isSetup && !sectionPassed) break;
    }

    return {
      name: testFile.name,
      sections: sectionResults,
      passed: sectionResults.every((s) => s.passed),
      totalSteps,
      passedSteps,
      durationMs: Date.now() - startTime,
    };
  }

  private async executeStep(step: TestStep): Promise<void> {
    switch (step.action) {
      case "launch":
        await this.executor.launch(this.deviceId, step.bundleId);
        await new Promise((r) => setTimeout(r, 2000));
        await this.client.attach(step.bundleId);
        break;
      case "tap": {
        const r = await this.client.tap({ identifier: step.identifier });
        if (r.error) throw new Error(r.error);
        break;
      }
      case "wait": {
        const r = await this.client.waitFor({ identifier: step.identifier, timeout: step.timeout });
        if (!r.success) throw new Error(`Timed out waiting for ${step.identifier}`);
        break;
      }
      case "type": {
        const r = await this.client.type({ identifier: step.identifier, text: step.text });
        if (r.error) throw new Error(r.error);
        break;
      }
      case "screenshot_baseline": {
        await mkdir(this.baselinesDir, { recursive: true });
        const tmpPath = `/tmp/simu-baseline-${Date.now()}.png`;
        await this.executor.screenshot(this.deviceId, tmpPath);
        const data = await readFile(tmpPath);
        await writeFile(path.join(this.baselinesDir, `${step.name}.png`), data);
        break;
      }
      case "screenshot_verify": {
        const currentPath = `/tmp/simu-verify-${Date.now()}.png`;
        await this.executor.screenshot(this.deviceId, currentPath);
        const diff = await compareScreenshots(
          path.join(this.baselinesDir, `${step.name}.png`),
          currentPath,
          { threshold: step.threshold }
        );
        if (!diff.match) throw new Error(`Screenshot mismatch: ${diff.diffPercentage}% different`);
        break;
      }
      case "verify": {
        const info = await this.client.elementInfo({ identifier: step.identifier });
        if (info.error) throw new Error(info.error);
        if (info[step.property] !== step.expected)
          throw new Error(`Expected ${step.property}="${step.expected}" but got "${info[step.property]}"`);
        break;
      }
      case "swipe": {
        const r = await this.client.swipe({ identifier: step.identifier, direction: step.direction });
        if (r.error) throw new Error(r.error);
        break;
      }
      case "scroll": {
        const r = await this.client.scroll({ identifier: step.identifier, direction: step.direction });
        if (r.error) throw new Error(r.error);
        break;
      }
    }
  }
}
