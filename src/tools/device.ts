import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { SimctlExecutor } from "../simctl/executor.js";

const executor = new SimctlExecutor();

const optionalDevice = {
  deviceId: z
    .string()
    .optional()
    .describe("Simulator UDID. Omit to use the booted device."),
};

export function registerDeviceTools(server: McpServer) {
  server.tool(
    "simulator_list",
    "List all available simulators with their state (booted/shutdown)",
    {},
    async () => {
      const devices = await executor.listDevices();
      return {
        content: [{ type: "text", text: JSON.stringify(devices, null, 2) }],
      };
    }
  );

  server.tool(
    "simulator_boot",
    "Boot a simulator by UDID or device name",
    { deviceId: z.string().describe("Simulator UDID or device name") },
    async ({ deviceId }) => {
      await executor.boot(deviceId);
      return { content: [{ type: "text", text: `Booted ${deviceId}` }] };
    }
  );

  server.tool(
    "simulator_shutdown",
    "Shutdown a simulator",
    optionalDevice,
    async ({ deviceId }) => {
      const id = await executor.resolveDeviceId(deviceId);
      await executor.shutdown(id);
      return { content: [{ type: "text", text: `Shut down ${id}` }] };
    }
  );

  server.tool(
    "simulator_screenshot",
    "Capture a PNG screenshot of the simulator, returned as an image",
    optionalDevice,
    async ({ deviceId }) => {
      const id = await executor.resolveDeviceId(deviceId);
      const tmpPath = `/tmp/simu-screenshot-${Date.now()}.png`;
      await executor.screenshot(id, tmpPath);
      const imageBuffer = await readFile(tmpPath);
      const base64 = imageBuffer.toString("base64");
      return {
        content: [{ type: "image", data: base64, mimeType: "image/png" }],
      };
    }
  );

  server.tool(
    "simulator_install",
    "Install a .app bundle on a simulator",
    {
      appPath: z.string().describe("Path to the .app bundle"),
      ...optionalDevice,
    },
    async ({ appPath, deviceId }) => {
      const id = await executor.resolveDeviceId(deviceId);
      await executor.install(id, appPath);
      return {
        content: [{ type: "text", text: `Installed ${appPath} on ${id}` }],
      };
    }
  );

  server.tool(
    "simulator_launch",
    "Launch an app by bundle ID on a simulator",
    {
      bundleId: z.string().describe("App bundle identifier"),
      ...optionalDevice,
    },
    async ({ bundleId, deviceId }) => {
      const id = await executor.resolveDeviceId(deviceId);
      await executor.launch(id, bundleId);
      return {
        content: [{ type: "text", text: `Launched ${bundleId} on ${id}` }],
      };
    }
  );

  server.tool(
    "simulator_terminate",
    "Kill a running app by bundle ID",
    {
      bundleId: z.string().describe("App bundle identifier"),
      ...optionalDevice,
    },
    async ({ bundleId, deviceId }) => {
      const id = await executor.resolveDeviceId(deviceId);
      await executor.terminate(id, bundleId);
      return {
        content: [{ type: "text", text: `Terminated ${bundleId} on ${id}` }],
      };
    }
  );

  server.tool(
    "simulator_open_url",
    "Open a URL or deep link on a simulator",
    {
      url: z.string().describe("URL or deep link to open"),
      ...optionalDevice,
    },
    async ({ url, deviceId }) => {
      const id = await executor.resolveDeviceId(deviceId);
      await executor.openUrl(id, url);
      return { content: [{ type: "text", text: `Opened ${url} on ${id}` }] };
    }
  );

  server.tool(
    "simulator_push",
    "Send a simulated push notification",
    {
      bundleId: z.string().describe("App bundle identifier"),
      payload: z
        .object({ aps: z.record(z.any()).describe("APS payload") })
        .passthrough()
        .describe("Push notification payload"),
      ...optionalDevice,
    },
    async ({ bundleId, payload, deviceId }) => {
      const id = await executor.resolveDeviceId(deviceId);
      await executor.sendPush(id, bundleId, payload);
      return {
        content: [{ type: "text", text: `Sent push to ${bundleId} on ${id}` }],
      };
    }
  );

  server.tool(
    "simulator_location",
    "Set simulated GPS location",
    {
      latitude: z.number().describe("Latitude"),
      longitude: z.number().describe("Longitude"),
      ...optionalDevice,
    },
    async ({ latitude, longitude, deviceId }) => {
      const id = await executor.resolveDeviceId(deviceId);
      await executor.setLocation(id, latitude, longitude);
      return {
        content: [{ type: "text", text: `Set location to ${latitude},${longitude}` }],
      };
    }
  );

  server.tool(
    "simulator_appearance",
    "Set light or dark mode",
    {
      mode: z.enum(["light", "dark"]).describe("Appearance mode"),
      ...optionalDevice,
    },
    async ({ mode, deviceId }) => {
      const id = await executor.resolveDeviceId(deviceId);
      await executor.setAppearance(id, mode);
      return {
        content: [{ type: "text", text: `Set appearance to ${mode}` }],
      };
    }
  );

  server.tool(
    "simulator_status_bar",
    "Override status bar values for clean screenshots",
    {
      time: z.string().optional().describe("Time string, e.g. '9:41'"),
      batteryLevel: z.number().optional().describe("Battery level 0-100"),
      batteryState: z.enum(["charging", "charged", "discharging"]).optional(),
      clear: z.boolean().optional().describe("Set to true to clear all overrides"),
      ...optionalDevice,
    },
    async ({ time, batteryLevel, batteryState, clear, deviceId }) => {
      const id = await executor.resolveDeviceId(deviceId);
      if (clear) {
        await executor.clearStatusBar(id);
        return { content: [{ type: "text", text: "Cleared status bar overrides" }] };
      }
      const overrides: Record<string, string> = {};
      if (time) overrides.time = time;
      if (batteryLevel !== undefined) overrides.batteryLevel = String(batteryLevel);
      if (batteryState) overrides.batteryState = batteryState;
      await executor.overrideStatusBar(id, overrides);
      return { content: [{ type: "text", text: "Status bar overridden" }] };
    }
  );

  server.tool(
    "simulator_pasteboard",
    "Read or write the simulator pasteboard",
    {
      action: z.enum(["read", "write"]).describe("Read or write"),
      text: z.string().optional().describe("Text to write (required for write action)"),
      ...optionalDevice,
    },
    async ({ action, text, deviceId }) => {
      const id = await executor.resolveDeviceId(deviceId);
      if (action === "read") {
        const content = await executor.getPasteboard(id);
        return { content: [{ type: "text", text: content }] };
      }
      if (!text) throw new Error("text is required for write action");
      await executor.setPasteboard(id, text);
      return { content: [{ type: "text", text: "Pasteboard updated" }] };
    }
  );

  server.tool(
    "simulator_erase",
    "Factory reset a simulator (erases all content and settings)",
    { deviceId: z.string().describe("Simulator UDID to erase") },
    async ({ deviceId }) => {
      await executor.erase(deviceId);
      return { content: [{ type: "text", text: `Erased ${deviceId}` }] };
    }
  );

  server.tool(
    "simulator_list_apps",
    "List all installed apps on a simulator",
    optionalDevice,
    async ({ deviceId }) => {
      const id = await executor.resolveDeviceId(deviceId);
      const apps = await executor.listApps(id);
      return { content: [{ type: "text", text: apps }] };
    }
  );

  server.tool(
    "simulator_app_info",
    "Get info about an installed app",
    {
      bundleId: z.string().describe("App bundle identifier"),
      ...optionalDevice,
    },
    async ({ bundleId, deviceId }) => {
      const id = await executor.resolveDeviceId(deviceId);
      const info = await executor.appInfo(id, bundleId);
      return { content: [{ type: "text", text: info }] };
    }
  );
}
