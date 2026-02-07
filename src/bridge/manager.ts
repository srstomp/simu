import { spawn, ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export class BridgeManager {
  private process: ChildProcess | null = null;
  private port: number | null = null;
  private bridgeDir: string;

  constructor() {
    const thisDir = path.dirname(fileURLToPath(import.meta.url));
    this.bridgeDir = path.join(thisDir, "../../bridge");
  }

  async ensureBuilt(): Promise<void> {
    const projectPath = path.join(this.bridgeDir, "SimuBridge.xcodeproj");
    if (!existsSync(projectPath)) {
      throw new Error(`Bridge project not found at ${projectPath}`);
    }

    await new Promise<void>((resolve, reject) => {
      const proc = spawn("xcodebuild", [
        "build-for-testing",
        "-project", projectPath,
        "-scheme", "SimuBridge",
        "-destination", "platform=iOS Simulator,name=iPhone 17 Pro",
        "-quiet",
      ], { stdio: ["ignore", "ignore", "ignore"] });
      proc.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`xcodebuild failed: ${code}`))
      );
    });
  }

  async start(deviceId: string): Promise<number> {
    if (this.port && (await this.isHealthy())) return this.port;

    await this.ensureBuilt();

    const projectPath = path.join(this.bridgeDir, "SimuBridge.xcodeproj");

    this.process = spawn("xcodebuild", [
      "test-without-building",
      "-project", projectPath,
      "-scheme", "SimuBridge",
      `-destination`, `platform=iOS Simulator,id=${deviceId}`,
      "-test-timeouts-enabled", "NO",
      "-only-testing:SimuBridgeUITests/SimuBridgeTests/testRunBridge",
    ]);

    this.port = await new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Bridge start timeout")), 30000);

      const onData = (data: Buffer) => {
        const line = data.toString();
        const match = line.match(/SIMU_BRIDGE_PORT=(\d+)/);
        if (match) {
          clearTimeout(timeout);
          resolve(parseInt(match[1]));
        }
      };

      this.process!.stdout?.on("data", onData);
      this.process!.stderr?.on("data", onData);

      this.process!.on("close", (code) => {
        clearTimeout(timeout);
        reject(new Error(`Bridge exited with code ${code}`));
      });
    });

    return this.port;
  }

  async isHealthy(): Promise<boolean> {
    if (!this.port) return false;
    try {
      const resp = await fetch(`http://localhost:${this.port}/health`);
      const body = await resp.json() as any;
      return body.status === "ok";
    } catch {
      return false;
    }
  }

  async stop(): Promise<void> {
    this.process?.kill();
    this.process = null;
    this.port = null;
  }

  getPort(): number | null {
    return this.port;
  }
}
