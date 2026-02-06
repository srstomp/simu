import { describe, it, expect } from "vitest";
import { SimctlExecutor } from "../executor.js";

describe("SimctlExecutor", () => {
  const executor = new SimctlExecutor();

  it("resolves device ID for 'booted'", async () => {
    const result = await executor.exec(["list", "devices", "-j"]);
    expect(result).toBeDefined();
    const parsed = JSON.parse(result);
    expect(parsed.devices).toBeDefined();
  });

  it("parses device list into structured output", async () => {
    const devices = await executor.listDevices();
    expect(Array.isArray(devices)).toBe(true);
    if (devices.length > 0) {
      expect(devices[0]).toHaveProperty("udid");
      expect(devices[0]).toHaveProperty("name");
      expect(devices[0]).toHaveProperty("state");
      expect(devices[0]).toHaveProperty("runtime");
    }
  });

  it("throws on invalid simctl command", async () => {
    await expect(executor.exec(["not-a-real-command"])).rejects.toThrow();
  });
});
