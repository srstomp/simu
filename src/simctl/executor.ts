import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface SimDevice {
  udid: string;
  name: string;
  state: "Booted" | "Shutdown" | "Shutting Down";
  runtime: string;
  isAvailable: boolean;
}

export class SimctlExecutor {
  async exec(args: string[]): Promise<string> {
    const { stdout } = await execFileAsync("xcrun", ["simctl", ...args]);
    return stdout;
  }

  async listDevices(): Promise<SimDevice[]> {
    const output = await this.exec(["list", "devices", "available", "-j"]);
    const parsed = JSON.parse(output);
    const devices: SimDevice[] = [];

    for (const [runtime, devs] of Object.entries(parsed.devices)) {
      for (const dev of devs as any[]) {
        devices.push({
          udid: dev.udid,
          name: dev.name,
          state: dev.state,
          runtime: runtime.replace("com.apple.CoreSimulator.SimRuntime.", ""),
          isAvailable: dev.isAvailable ?? true,
        });
      }
    }

    return devices;
  }

  async resolveDeviceId(deviceId?: string): Promise<string> {
    if (deviceId && deviceId !== "booted") return deviceId;

    const devices = await this.listDevices();
    const booted = devices.filter((d) => d.state === "Booted");

    if (booted.length === 0) throw new Error("No booted simulators found");
    if (booted.length > 1 && !deviceId)
      throw new Error(
        `Multiple booted simulators: ${booted.map((d) => `${d.name} (${d.udid})`).join(", ")}. Specify a deviceId.`
      );

    return booted[0].udid;
  }

  async boot(deviceId: string): Promise<void> {
    await this.exec(["boot", deviceId]);
  }

  async shutdown(deviceId: string): Promise<void> {
    await this.exec(["shutdown", deviceId]);
  }

  async screenshot(deviceId: string, outputPath: string): Promise<void> {
    await this.exec(["io", deviceId, "screenshot", "--type=png", outputPath]);
  }

  async install(deviceId: string, appPath: string): Promise<void> {
    await this.exec(["install", deviceId, appPath]);
  }

  async launch(deviceId: string, bundleId: string): Promise<void> {
    await this.exec(["launch", deviceId, bundleId]);
  }

  async terminate(deviceId: string, bundleId: string): Promise<void> {
    await this.exec(["terminate", deviceId, bundleId]);
  }

  async openUrl(deviceId: string, url: string): Promise<void> {
    await this.exec(["openurl", deviceId, url]);
  }

  async sendPush(deviceId: string, bundleId: string, payload: object): Promise<void> {
    const { writeFile, unlink } = await import("node:fs/promises");
    const tmpPath = `/tmp/simu-push-${Date.now()}.json`;
    await writeFile(tmpPath, JSON.stringify(payload));
    try {
      await this.exec(["push", deviceId, bundleId, tmpPath]);
    } finally {
      await unlink(tmpPath).catch(() => {});
    }
  }

  async setLocation(deviceId: string, lat: number, lon: number): Promise<void> {
    await this.exec(["location", deviceId, "set", `${lat},${lon}`]);
  }

  async setAppearance(deviceId: string, mode: "light" | "dark"): Promise<void> {
    await this.exec(["ui", deviceId, "appearance", mode]);
  }

  async overrideStatusBar(deviceId: string, overrides: Record<string, string>): Promise<void> {
    const args = ["status_bar", deviceId, "override"];
    for (const [key, value] of Object.entries(overrides)) {
      args.push(`--${key}`, value);
    }
    await this.exec(args);
  }

  async clearStatusBar(deviceId: string): Promise<void> {
    await this.exec(["status_bar", deviceId, "clear"]);
  }

  async getPasteboard(deviceId: string): Promise<string> {
    return await this.exec(["pbpaste", deviceId]);
  }

  async setPasteboard(deviceId: string, text: string): Promise<void> {
    const { execFile: execFileCb } = await import("node:child_process");
    return new Promise((resolve, reject) => {
      const proc = execFileCb("xcrun", ["simctl", "pbcopy", deviceId]);
      proc.stdin?.write(text);
      proc.stdin?.end();
      proc.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`pbcopy failed: ${code}`))
      );
    });
  }

  async erase(deviceId: string): Promise<void> {
    await this.exec(["erase", deviceId]);
  }

  async listApps(deviceId: string): Promise<string> {
    return await this.exec(["listapps", deviceId]);
  }

  async appInfo(deviceId: string, bundleId: string): Promise<string> {
    return await this.exec(["appinfo", deviceId, bundleId]);
  }
}
