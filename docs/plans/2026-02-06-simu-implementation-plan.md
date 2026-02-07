# simu Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an MCP server that gives Claude full control over iOS Simulators for testing apps.

**Architecture:** Three layers — TypeScript MCP server exposing tools via stdio, a simctl executor for device management, and an XCUITest bridge (Swift) that runs as a long-lived HTTP server inside the simulator for accessibility tree queries and UI interactions.

**Tech Stack:** TypeScript (MCP server), Swift (XCUITest bridge), Network.framework (HTTP server in bridge), pixelmatch (screenshot diffing), zod (schema validation)

---

### Task 1: Project Scaffolding — TypeScript

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/index.ts`
- Create: `.gitignore`

**Step 1: Create package.json**

```json
{
  "name": "simu",
  "version": "0.1.0",
  "description": "MCP server for iOS Simulator control",
  "type": "module",
  "bin": {
    "simu": "./build/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^2.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "build", "bridge"]
}
```

**Step 3: Create .gitignore**

```
node_modules/
build/
*.js.map
.DS_Store
bridge/build/
bridge/DerivedData/
bridge/.build/
```

**Step 4: Create src/index.ts (minimal entry point)**

```typescript
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "simu",
  version: "0.1.0",
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

**Step 5: Install dependencies and verify build**

Run: `npm install && npm run build`
Expected: Clean build, `build/index.js` created

**Step 6: Commit**

```bash
git add package.json tsconfig.json .gitignore src/index.ts
git commit -m "feat: scaffold TypeScript project with MCP server entry point"
```

---

### Task 2: simctl Executor

**Files:**
- Create: `src/simctl/executor.ts`
- Create: `src/simctl/__tests__/executor.test.ts`

**Step 1: Write the tests**

```typescript
// src/simctl/__tests__/executor.test.ts
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
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/simctl/__tests__/executor.test.ts`
Expected: FAIL — module not found

**Step 3: Implement SimctlExecutor**

```typescript
// src/simctl/executor.ts
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
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/simctl/__tests__/executor.test.ts`
Expected: PASS (requires a booted simulator)

**Step 5: Commit**

```bash
git add src/simctl/
git commit -m "feat: add simctl executor with device management methods"
```

---

### Task 3: Device Management MCP Tools

**Files:**
- Create: `src/tools/device.ts`
- Modify: `src/index.ts`

**Step 1: Create device tools module**

```typescript
// src/tools/device.ts
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
```

**Step 2: Update src/index.ts to register device tools**

```typescript
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerDeviceTools } from "./tools/device.js";

const server = new McpServer({
  name: "simu",
  version: "0.1.0",
});

registerDeviceTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
```

**Step 3: Build and verify**

Run: `npm run build`
Expected: Clean build, no errors

**Step 4: Commit**

```bash
git add src/tools/device.ts src/index.ts
git commit -m "feat: add device management MCP tools wrapping simctl"
```

---

### Task 4: XCUITest Bridge — Xcode Project

**Files:**
- Create: `bridge/SimuBridge/SimuBridgeApp.swift`
- Create: `bridge/SimuBridgeUITests/TestEntry.swift`
- Create: `bridge/SimuBridgeUITests/HTTPServer.swift`
- Create: `bridge/SimuBridgeUITests/AccessibilityService.swift`
- Create: `bridge/SimuBridgeUITests/InteractionService.swift`
- Create: `bridge/SimuBridgeUITests/Routes.swift`
- Create: `bridge/SimuBridgeUITests/SimuBridgeUITests.entitlements`
- Create: `bridge/project.yml`

**Step 1: Create the empty host app**

```swift
// bridge/SimuBridge/SimuBridgeApp.swift
import SwiftUI

@main
struct SimuBridgeApp: App {
    var body: some Scene {
        WindowGroup {
            Text("SimuBridge Host")
        }
    }
}
```

**Step 2: Create the entitlements file**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.network.server</key>
    <true/>
</dict>
</plist>
```

**Step 3: Create HTTPServer.swift**

Uses Network.framework NWListener for a lightweight HTTP server. Accepts connections, parses HTTP method/path/body, delegates to a route handler closure, and sends JSON responses.

```swift
// bridge/SimuBridgeUITests/HTTPServer.swift
import Foundation
import Network

class HTTPServer {
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "com.simu.httpserver", attributes: .concurrent)
    private var routeHandler: ((String, String, String?) -> (Int, String))?

    func setRouteHandler(_ handler: @escaping (String, String, String?) -> (Int, String)) {
        self.routeHandler = handler
    }

    func start(completion: @escaping (UInt16?) -> Void) {
        do {
            let params = NWParameters.tcp
            params.allowLocalEndpointReuse = true
            listener = try NWListener(using: params, on: .any)

            listener?.newConnectionHandler = { [weak self] conn in
                self?.handleConnection(conn)
            }

            listener?.stateUpdateHandler = { [weak self] state in
                switch state {
                case .ready:
                    completion(self?.listener?.port?.rawValue)
                case .failed:
                    completion(nil)
                default:
                    break
                }
            }

            listener?.start(queue: queue)
        } catch {
            completion(nil)
        }
    }

    private func handleConnection(_ connection: NWConnection) {
        connection.start(queue: queue)
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, _, _ in
            guard let data = data, let request = String(data: data, encoding: .utf8) else {
                connection.cancel()
                return
            }

            let (method, path, body) = self?.parseRequest(request) ?? ("", "", nil)
            let (status, responseBody) = self?.routeHandler?(method, path, body) ?? (404, "{\"error\":\"no handler\"}")

            let statusText = status == 200 ? "OK" : status == 400 ? "Bad Request" : "Not Found"
            let response = "HTTP/1.1 \(status) \(statusText)\r\nContent-Type: application/json\r\nContent-Length: \(responseBody.utf8.count)\r\nConnection: close\r\n\r\n\(responseBody)"

            connection.send(content: response.data(using: .utf8), completion: .contentProcessed { _ in
                connection.cancel()
            })
        }
    }

    private func parseRequest(_ raw: String) -> (String, String, String?) {
        let headerBody = raw.components(separatedBy: "\r\n\r\n")
        let body = headerBody.count > 1 && !headerBody[1].isEmpty ? headerBody[1] : nil
        let lines = headerBody[0].components(separatedBy: "\r\n")
        guard let first = lines.first else { return ("", "", nil) }
        let parts = first.components(separatedBy: " ")
        guard parts.count >= 2 else { return ("", "", nil) }
        return (parts[0], parts[1], body)
    }

    func stop() {
        listener?.cancel()
    }
}
```

**Step 4: Create AccessibilityService.swift**

Wraps XCUIApplication to attach to running apps by bundle ID. Provides full element tree serialization (recursive) and element finding by identifier/label/type.

```swift
// bridge/SimuBridgeUITests/AccessibilityService.swift
import XCTest

class AccessibilityService {
    static let shared = AccessibilityService()
    private var app: XCUIApplication?

    func attach(bundleIdentifier: String) -> Bool {
        app = XCUIApplication(bundleIdentifier: bundleIdentifier)
        return app?.state == .runningForeground || app?.state == .runningBackground
    }

    func currentApp() -> XCUIApplication? { app }

    func getTree() -> [[String: Any]] {
        guard let app = app else { return [] }
        return [serializeElement(app, depth: 0)]
    }

    func findElements(identifier: String?, label: String?, elementType: String?) -> [[String: Any]] {
        guard let app = app else { return [] }
        let elements = app.descendants(matching: .any).allElementsBoundByAccessibilityElement

        var results: [[String: Any]] = []
        for element in elements {
            if let identifier = identifier, !identifier.isEmpty, element.identifier != identifier { continue }
            if let label = label, !label.isEmpty, element.label != label { continue }
            if let elementType = elementType, !elementType.isEmpty,
               describeType(element.elementType) != elementType { continue }
            results.append(serializeElement(element, depth: 0))
        }

        return results
    }

    private func serializeElement(_ element: XCUIElement, depth: Int) -> [String: Any] {
        guard depth < 15 else { return ["_truncated": true] }

        var node: [String: Any] = [
            "type": describeType(element.elementType),
            "identifier": element.identifier,
            "label": element.label,
            "value": element.value as? String ?? "",
            "isEnabled": element.isEnabled,
            "isHittable": element.isHittable,
            "frame": [
                "x": element.frame.origin.x,
                "y": element.frame.origin.y,
                "width": element.frame.size.width,
                "height": element.frame.size.height,
            ],
        ]

        let children = element.children(matching: .any)
        let count = children.count
        if count > 0 {
            var childNodes: [[String: Any]] = []
            for i in 0..<min(count, 100) {
                childNodes.append(serializeElement(children.element(boundBy: i), depth: depth + 1))
            }
            node["children"] = childNodes
        }

        return node
    }

    private func describeType(_ type: XCUIElement.ElementType) -> String {
        switch type {
        case .button: return "button"
        case .staticText: return "staticText"
        case .textField: return "textField"
        case .secureTextField: return "secureTextField"
        case .image: return "image"
        case .scrollView: return "scrollView"
        case .table: return "table"
        case .cell: return "cell"
        case .switch: return "switch"
        case .slider: return "slider"
        case .navigationBar: return "navigationBar"
        case .tabBar: return "tabBar"
        case .other: return "other"
        case .application: return "application"
        case .window: return "window"
        default: return "unknown(\(type.rawValue))"
        }
    }
}
```

**Step 5: Create InteractionService.swift**

Provides tap, long press, swipe, type, clear, scroll, wait, drag, and pinch interactions. Finds elements by accessibility identifier or label, falling back to coordinate-based interaction.

```swift
// bridge/SimuBridgeUITests/InteractionService.swift
import XCTest

class InteractionService {
    static let shared = InteractionService()

    private func findElement(_ json: [String: Any]) -> XCUIElement? {
        guard let app = AccessibilityService.shared.currentApp() else { return nil }

        if let id = json["identifier"] as? String, !id.isEmpty {
            let el = app.descendants(matching: .any).matching(identifier: id).firstMatch
            if el.exists { return el }
        }
        if let label = json["label"] as? String, !label.isEmpty {
            let el = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label)).firstMatch
            if el.exists { return el }
        }
        return nil
    }

    func tap(_ json: [String: Any]) -> [String: Any] {
        if let x = json["x"] as? Double, let y = json["y"] as? Double {
            guard let app = AccessibilityService.shared.currentApp() else {
                return ["error": "no app attached"]
            }
            let coord = app.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0))
                .withOffset(CGVector(dx: x, dy: y))
            coord.tap()
            return ["success": true, "method": "coordinate"]
        }
        guard let el = findElement(json) else { return ["error": "element not found"] }
        el.tap()
        return ["success": true, "identifier": el.identifier, "label": el.label]
    }

    func longPress(_ json: [String: Any]) -> [String: Any] {
        guard let el = findElement(json) else { return ["error": "element not found"] }
        let duration = json["duration"] as? Double ?? 1.0
        el.press(forDuration: duration)
        return ["success": true]
    }

    func swipe(_ json: [String: Any]) -> [String: Any] {
        guard let direction = json["direction"] as? String else { return ["error": "missing direction"] }
        let target: XCUIElement
        if let el = findElement(json) {
            target = el
        } else if let app = AccessibilityService.shared.currentApp() {
            target = app
        } else {
            return ["error": "no target"]
        }

        switch direction {
        case "up": target.swipeUp()
        case "down": target.swipeDown()
        case "left": target.swipeLeft()
        case "right": target.swipeRight()
        default: return ["error": "invalid direction: \(direction)"]
        }
        return ["success": true]
    }

    func typeText(_ json: [String: Any]) -> [String: Any] {
        guard let text = json["text"] as? String else { return ["error": "missing text"] }
        if let el = findElement(json) {
            el.tap()
            el.typeText(text)
        } else {
            guard let app = AccessibilityService.shared.currentApp() else {
                return ["error": "no app attached"]
            }
            app.typeText(text)
        }
        return ["success": true]
    }

    func clearText(_ json: [String: Any]) -> [String: Any] {
        guard let el = findElement(json) else { return ["error": "element not found"] }
        el.tap()
        guard let value = el.value as? String else { return ["success": true] }
        let deleteString = String(repeating: XCUIKeyboardKey.delete.rawValue, count: value.count)
        el.typeText(deleteString)
        return ["success": true]
    }

    func scroll(_ json: [String: Any]) -> [String: Any] {
        return swipe(json)
    }

    func waitForElement(_ json: [String: Any]) -> [String: Any] {
        guard let app = AccessibilityService.shared.currentApp() else {
            return ["error": "no app attached"]
        }
        let timeout = json["timeout"] as? Double ?? 5.0
        let shouldExist = (json["exists"] as? Bool) ?? true

        if let id = json["identifier"] as? String, !id.isEmpty {
            let el = app.descendants(matching: .any).matching(identifier: id).firstMatch
            let result = el.waitForExistence(timeout: timeout)
            return shouldExist == result ? ["success": true] : ["success": false, "timedOut": true]
        }
        return ["error": "must specify identifier"]
    }

    func elementExists(_ json: [String: Any]) -> [String: Any] {
        guard let el = findElement(json) else { return ["exists": false] }
        return ["exists": el.exists]
    }

    func elementInfo(_ json: [String: Any]) -> [String: Any] {
        guard let el = findElement(json) else { return ["error": "element not found"] }
        return [
            "identifier": el.identifier,
            "label": el.label,
            "value": el.value as? String ?? "",
            "placeholderValue": el.placeholderValue ?? "",
            "isEnabled": el.isEnabled,
            "isHittable": el.isHittable,
            "isSelected": el.isSelected,
            "frame": [
                "x": el.frame.origin.x,
                "y": el.frame.origin.y,
                "width": el.frame.size.width,
                "height": el.frame.size.height,
            ],
        ]
    }

    func drag(_ json: [String: Any]) -> [String: Any] {
        guard let app = AccessibilityService.shared.currentApp() else {
            return ["error": "no app attached"]
        }
        guard let fromX = json["fromX"] as? Double, let fromY = json["fromY"] as? Double,
              let toX = json["toX"] as? Double, let toY = json["toY"] as? Double else {
            return ["error": "missing coordinates (fromX, fromY, toX, toY)"]
        }
        let from = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: fromX, dy: fromY))
        let to = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: toX, dy: toY))
        from.press(forDuration: 0.5, thenDragTo: to)
        return ["success": true]
    }

    func pinch(_ json: [String: Any]) -> [String: Any] {
        guard let el = findElement(json) ?? AccessibilityService.shared.currentApp() else {
            return ["error": "no target"]
        }
        let scale = json["scale"] as? Double ?? 2.0
        let velocity = json["velocity"] as? Double ?? 1.0
        el.pinch(withScale: CGFloat(scale), velocity: CGFloat(velocity))
        return ["success": true]
    }
}
```

**Step 6: Create Routes.swift**

Maps HTTP method + path to the appropriate service call.

```swift
// bridge/SimuBridgeUITests/Routes.swift
import Foundation

class Routes {
    static func handle(method: String, path: String, body: String?) -> (Int, String) {
        let json: [String: Any]? = {
            guard let body = body, let data = body.data(using: .utf8) else { return nil }
            return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        }()

        switch (method, path) {
        case ("GET", "/health"):
            return (200, "{\"status\":\"ok\"}")

        case ("POST", "/attach"):
            guard let bundleId = json?["bundleIdentifier"] as? String else {
                return (400, "{\"error\":\"missing bundleIdentifier\"}")
            }
            let ok = AccessibilityService.shared.attach(bundleIdentifier: bundleId)
            return ok
                ? (200, "{\"success\":true}")
                : (400, "{\"error\":\"app not running or not found\"}")

        case ("GET", "/ui/tree"):
            return (200, toJSON(AccessibilityService.shared.getTree()))

        case ("POST", "/ui/find"):
            let results = AccessibilityService.shared.findElements(
                identifier: json?["identifier"] as? String,
                label: json?["label"] as? String,
                elementType: json?["elementType"] as? String
            )
            return (200, toJSON(results))

        case ("POST", "/ui/tap"):
            return (200, toJSON(InteractionService.shared.tap(json ?? [:])))
        case ("POST", "/ui/longPress"):
            return (200, toJSON(InteractionService.shared.longPress(json ?? [:])))
        case ("POST", "/ui/swipe"):
            return (200, toJSON(InteractionService.shared.swipe(json ?? [:])))
        case ("POST", "/ui/type"):
            return (200, toJSON(InteractionService.shared.typeText(json ?? [:])))
        case ("POST", "/ui/clear"):
            return (200, toJSON(InteractionService.shared.clearText(json ?? [:])))
        case ("POST", "/ui/scroll"):
            return (200, toJSON(InteractionService.shared.scroll(json ?? [:])))
        case ("POST", "/ui/wait"):
            return (200, toJSON(InteractionService.shared.waitForElement(json ?? [:])))
        case ("POST", "/ui/exists"):
            return (200, toJSON(InteractionService.shared.elementExists(json ?? [:])))
        case ("POST", "/ui/info"):
            return (200, toJSON(InteractionService.shared.elementInfo(json ?? [:])))
        case ("POST", "/ui/drag"):
            return (200, toJSON(InteractionService.shared.drag(json ?? [:])))
        case ("POST", "/ui/pinch"):
            return (200, toJSON(InteractionService.shared.pinch(json ?? [:])))

        default:
            return (404, "{\"error\":\"not found\"}")
        }
    }

    private static func toJSON(_ obj: Any) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: obj, options: []),
              let str = String(data: data, encoding: .utf8) else {
            return "{\"error\":\"serialization failed\"}"
        }
        return str
    }
}
```

**Step 7: Create TestEntry.swift**

Long-running XCUITest that starts the HTTP server and blocks indefinitely via RunLoop.

```swift
// bridge/SimuBridgeUITests/TestEntry.swift
import XCTest

final class SimuBridgeTests: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = true
    }

    func testRunBridge() throws {
        let server = HTTPServer()
        server.setRouteHandler { method, path, body in
            Routes.handle(method: method, path: path, body: body)
        }

        let started = expectation(description: "server started")

        server.start { port in
            guard let port = port else {
                XCTFail("Failed to start server")
                return
            }

            let portFilePath = NSTemporaryDirectory() + "simu-bridge-port"
            try? "\(port)".write(toFile: portFilePath, atomically: true, encoding: .utf8)
            print("SIMU_BRIDGE_PORT=\(port)")
            print("SIMU_BRIDGE_PORT_FILE=\(portFilePath)")
            started.fulfill()
        }

        wait(for: [started], timeout: 5.0)

        // Keep test alive indefinitely
        while true {
            RunLoop.current.run(until: Date(timeIntervalSinceNow: 1.0))
        }
    }
}
```

**Step 8: Create project.yml for xcodegen**

```yaml
# bridge/project.yml
name: SimuBridge
options:
  bundleIdPrefix: com.simu
  deploymentTarget:
    iOS: "17.0"
targets:
  SimuBridge:
    type: application
    platform: iOS
    sources:
      - SimuBridge
  SimuBridgeUITests:
    type: bundle.ui-testing
    platform: iOS
    sources:
      - SimuBridgeUITests
    dependencies:
      - target: SimuBridge
    settings:
      CODE_SIGN_ENTITLEMENTS: SimuBridgeUITests/SimuBridgeUITests.entitlements
```

**Step 9: Generate Xcode project and build**

Run: `brew install xcodegen` (if not installed)
Run: `cd bridge && xcodegen generate`
Expected: `SimuBridge.xcodeproj` generated

Run: `cd bridge && xcodebuild build-for-testing -project SimuBridge.xcodeproj -scheme SimuBridge -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -quiet`
Expected: BUILD SUCCEEDED

**Step 10: Commit**

```bash
git add bridge/
git commit -m "feat: add XCUITest bridge with HTTP server, accessibility, and interaction services"
```

---

### Task 5: Bridge Manager (TypeScript)

**Files:**
- Create: `src/bridge/manager.ts`
- Create: `src/bridge/client.ts`

**Step 1: Create bridge manager**

Handles building, launching, health-checking, and restarting the XCUITest runner. Reads the bridge port from stdout.

```typescript
// src/bridge/manager.ts
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
      "-destination", `platform=iOS Simulator,id=${deviceId}`,
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
```

**Step 2: Create bridge HTTP client**

Simple fetch-based client that mirrors the bridge's HTTP routes.

```typescript
// src/bridge/client.ts
export class BridgeClient {
  constructor(private port: number) {}

  private async request(method: string, path: string, body?: object): Promise<any> {
    const resp = await fetch(`http://localhost:${this.port}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return resp.json();
  }

  async health() { return this.request("GET", "/health"); }
  async attach(bundleIdentifier: string) { return this.request("POST", "/attach", { bundleIdentifier }); }
  async getTree() { return this.request("GET", "/ui/tree"); }
  async find(query: { identifier?: string; label?: string; elementType?: string }) { return this.request("POST", "/ui/find", query); }
  async tap(params: { identifier?: string; label?: string; x?: number; y?: number }) { return this.request("POST", "/ui/tap", params); }
  async longPress(params: { identifier?: string; label?: string; duration?: number }) { return this.request("POST", "/ui/longPress", params); }
  async swipe(params: { identifier?: string; label?: string; direction: string }) { return this.request("POST", "/ui/swipe", params); }
  async type(params: { identifier?: string; label?: string; text: string }) { return this.request("POST", "/ui/type", params); }
  async clear(params: { identifier?: string; label?: string }) { return this.request("POST", "/ui/clear", params); }
  async scroll(params: { identifier?: string; direction: string }) { return this.request("POST", "/ui/scroll", params); }
  async waitFor(params: { identifier: string; timeout?: number; exists?: boolean }) { return this.request("POST", "/ui/wait", params); }
  async exists(params: { identifier?: string; label?: string }) { return this.request("POST", "/ui/exists", params); }
  async elementInfo(params: { identifier?: string; label?: string }) { return this.request("POST", "/ui/info", params); }
  async drag(params: { fromX: number; fromY: number; toX: number; toY: number }) { return this.request("POST", "/ui/drag", params); }
  async pinch(params: { identifier?: string; scale?: number; velocity?: number }) { return this.request("POST", "/ui/pinch", params); }
}
```

**Step 3: Build and verify**

Run: `npm run build`
Expected: Clean build

**Step 4: Commit**

```bash
git add src/bridge/
git commit -m "feat: add bridge manager and HTTP client for XCUITest communication"
```

---

### Task 6: Interaction MCP Tools

**Files:**
- Create: `src/tools/interaction.ts`
- Modify: `src/index.ts`

**Step 1: Create interaction tools**

Registers all `ui_*` MCP tools. Each tool resolves the device, ensures the bridge is running, and delegates to the BridgeClient.

```typescript
// src/tools/interaction.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BridgeManager } from "../bridge/manager.js";
import { BridgeClient } from "../bridge/client.js";
import { SimctlExecutor } from "../simctl/executor.js";

const bridgeManager = new BridgeManager();
const executor = new SimctlExecutor();

async function getClient(deviceId?: string): Promise<BridgeClient> {
  const id = await executor.resolveDeviceId(deviceId);
  const port = await bridgeManager.start(id);
  return new BridgeClient(port);
}

const elementQuery = {
  identifier: z.string().optional().describe("Accessibility identifier"),
  label: z.string().optional().describe("Accessibility label text"),
  deviceId: z.string().optional().describe("Simulator UDID"),
};

export function registerInteractionTools(server: McpServer) {
  server.tool(
    "ui_attach",
    "Attach the bridge to a running app by bundle ID. Required before other ui_ tools.",
    {
      bundleIdentifier: z.string().describe("Bundle ID of the app to attach to"),
      deviceId: z.string().optional(),
    },
    async ({ bundleIdentifier, deviceId }) => {
      const client = await getClient(deviceId);
      const result = await client.attach(bundleIdentifier);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool("ui_tree", "Dump the full accessibility tree of the current screen", { deviceId: z.string().optional() }, async ({ deviceId }) => {
    const client = await getClient(deviceId);
    const tree = await client.getTree();
    return { content: [{ type: "text", text: JSON.stringify(tree, null, 2) }] };
  });

  server.tool("ui_find", "Find elements matching a query by accessibility ID, label, or element type", {
    identifier: z.string().optional(), label: z.string().optional(), elementType: z.string().optional(), deviceId: z.string().optional(),
  }, async ({ identifier, label, elementType, deviceId }) => {
    const client = await getClient(deviceId);
    const results = await client.find({ identifier, label, elementType });
    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  });

  server.tool("ui_tap", "Tap an element by accessibility ID, label, or screen coordinates", {
    identifier: z.string().optional(), label: z.string().optional(),
    x: z.number().optional().describe("X coordinate"), y: z.number().optional().describe("Y coordinate"),
    deviceId: z.string().optional(),
  }, async ({ identifier, label, x, y, deviceId }) => {
    const client = await getClient(deviceId);
    return { content: [{ type: "text", text: JSON.stringify(await client.tap({ identifier, label, x, y })) }] };
  });

  server.tool("ui_long_press", "Long press an element with configurable duration", {
    ...elementQuery, duration: z.number().optional().describe("Duration in seconds (default 1.0)"),
  }, async ({ identifier, label, duration, deviceId }) => {
    const client = await getClient(deviceId);
    return { content: [{ type: "text", text: JSON.stringify(await client.longPress({ identifier, label, duration })) }] };
  });

  server.tool("ui_swipe", "Swipe in a direction on an element or the screen", {
    ...elementQuery, direction: z.enum(["up", "down", "left", "right"]),
  }, async ({ identifier, label, direction, deviceId }) => {
    const client = await getClient(deviceId);
    return { content: [{ type: "text", text: JSON.stringify(await client.swipe({ identifier, label, direction })) }] };
  });

  server.tool("ui_type", "Type text into a field. If identifier/label given, taps it first.", {
    text: z.string().describe("Text to type"), ...elementQuery,
  }, async ({ text, identifier, label, deviceId }) => {
    const client = await getClient(deviceId);
    return { content: [{ type: "text", text: JSON.stringify(await client.type({ identifier, label, text })) }] };
  });

  server.tool("ui_clear", "Clear a text field's contents", elementQuery, async ({ identifier, label, deviceId }) => {
    const client = await getClient(deviceId);
    return { content: [{ type: "text", text: JSON.stringify(await client.clear({ identifier, label })) }] };
  });

  server.tool("ui_scroll", "Scroll within a scrollable element", {
    ...elementQuery, direction: z.enum(["up", "down", "left", "right"]),
  }, async ({ identifier, label, direction, deviceId }) => {
    const client = await getClient(deviceId);
    return { content: [{ type: "text", text: JSON.stringify(await client.scroll({ identifier, direction })) }] };
  });

  server.tool("ui_wait", "Wait for an element to appear or disappear, with timeout", {
    identifier: z.string().describe("Accessibility identifier to wait for"),
    timeout: z.number().optional().describe("Timeout in seconds (default 5)"),
    exists: z.boolean().optional().describe("Wait for existence (true) or disappearance (false)"),
    deviceId: z.string().optional(),
  }, async ({ identifier, timeout, exists, deviceId }) => {
    const client = await getClient(deviceId);
    return { content: [{ type: "text", text: JSON.stringify(await client.waitFor({ identifier, timeout, exists })) }] };
  });

  server.tool("ui_exists", "Check if an element exists on screen right now (no waiting)", elementQuery, async ({ identifier, label, deviceId }) => {
    const client = await getClient(deviceId);
    return { content: [{ type: "text", text: JSON.stringify(await client.exists({ identifier, label })) }] };
  });

  server.tool("ui_element_info", "Get detailed properties of a specific element", elementQuery, async ({ identifier, label, deviceId }) => {
    const client = await getClient(deviceId);
    return { content: [{ type: "text", text: JSON.stringify(await client.elementInfo({ identifier, label }), null, 2) }] };
  });

  server.tool("ui_drag", "Drag from one screen coordinate to another", {
    fromX: z.number(), fromY: z.number(), toX: z.number(), toY: z.number(), deviceId: z.string().optional(),
  }, async ({ fromX, fromY, toX, toY, deviceId }) => {
    const client = await getClient(deviceId);
    return { content: [{ type: "text", text: JSON.stringify(await client.drag({ fromX, fromY, toX, toY })) }] };
  });

  server.tool("ui_pinch", "Pinch in or out at an element or screen center", {
    ...elementQuery,
    scale: z.number().optional().describe("Scale factor (>1 = zoom in, <1 = zoom out)"),
    velocity: z.number().optional().describe("Speed of the pinch gesture"),
  }, async ({ identifier, label, scale, velocity, deviceId }) => {
    const client = await getClient(deviceId);
    return { content: [{ type: "text", text: JSON.stringify(await client.pinch({ identifier, scale, velocity })) }] };
  });
}
```

**Step 2: Update src/index.ts**

```typescript
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerDeviceTools } from "./tools/device.js";
import { registerInteractionTools } from "./tools/interaction.js";

const server = new McpServer({
  name: "simu",
  version: "0.1.0",
});

registerDeviceTools(server);
registerInteractionTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
```

**Step 3: Build and verify**

Run: `npm run build`
Expected: Clean build

**Step 4: Commit**

```bash
git add src/tools/interaction.ts src/index.ts
git commit -m "feat: add UI interaction MCP tools via XCUITest bridge"
```

---

### Task 7: Test Orchestration — Markdown Parser

**Files:**
- Create: `src/testing/parser.ts`
- Create: `src/testing/__tests__/parser.test.ts`

**Step 1: Write the tests**

```typescript
// src/testing/__tests__/parser.test.ts
import { describe, it, expect } from "vitest";
import { parseTestFile } from "../parser.js";

const sampleMarkdown = `# Login Flow

## Setup
- Launch app: com.myapp.example
- Wait for element: "welcomeScreen"

## Test: Successful Login
- Tap: "loginButton"
- Wait for element: "emailField"
- Type into "emailField": "user@test.com"
- Type into "passwordField": "password123"
- Tap: "submitButton"
- Wait for element: "homeScreen" (timeout: 5s)
- Screenshot baseline: "home-after-login"
- Verify: element "welcomeLabel" has value "Hello, User"
`;

describe("parseTestFile", () => {
  it("parses test name", () => {
    const result = parseTestFile(sampleMarkdown);
    expect(result.name).toBe("Login Flow");
  });

  it("parses setup steps", () => {
    const result = parseTestFile(sampleMarkdown);
    expect(result.sections[0].name).toBe("Setup");
    expect(result.sections[0].steps).toHaveLength(2);
    expect(result.sections[0].steps[0]).toEqual({ action: "launch", bundleId: "com.myapp.example" });
  });

  it("parses test steps", () => {
    const result = parseTestFile(sampleMarkdown);
    expect(result.sections[1].name).toBe("Successful Login");
    expect(result.sections[1].steps).toHaveLength(8);
  });

  it("parses tap action", () => {
    const result = parseTestFile(sampleMarkdown);
    expect(result.sections[1].steps[0]).toEqual({ action: "tap", identifier: "loginButton" });
  });

  it("parses type action with target", () => {
    const result = parseTestFile(sampleMarkdown);
    expect(result.sections[1].steps[2]).toEqual({ action: "type", identifier: "emailField", text: "user@test.com" });
  });

  it("parses wait with timeout", () => {
    const result = parseTestFile(sampleMarkdown);
    expect(result.sections[1].steps[5]).toEqual({ action: "wait", identifier: "homeScreen", timeout: 5 });
  });

  it("parses screenshot baseline", () => {
    const result = parseTestFile(sampleMarkdown);
    expect(result.sections[1].steps[6]).toEqual({ action: "screenshot_baseline", name: "home-after-login" });
  });

  it("parses verify action", () => {
    const result = parseTestFile(sampleMarkdown);
    expect(result.sections[1].steps[7]).toEqual({
      action: "verify", identifier: "welcomeLabel", property: "value", expected: "Hello, User",
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/testing/__tests__/parser.test.ts`
Expected: FAIL

**Step 3: Implement the parser**

```typescript
// src/testing/parser.ts
export type TestStep =
  | { action: "launch"; bundleId: string }
  | { action: "tap"; identifier: string }
  | { action: "wait"; identifier: string; timeout?: number }
  | { action: "type"; identifier: string; text: string }
  | { action: "screenshot_baseline"; name: string }
  | { action: "screenshot_verify"; name: string; threshold?: number }
  | { action: "verify"; identifier: string; property: string; expected: string }
  | { action: "swipe"; direction: string; identifier?: string }
  | { action: "scroll"; direction: string; identifier?: string };

export interface TestSection {
  name: string;
  isSetup: boolean;
  steps: TestStep[];
}

export interface TestFile {
  name: string;
  sections: TestSection[];
}

export function parseTestFile(markdown: string): TestFile {
  const lines = markdown.split("\n");
  let name = "";
  const sections: TestSection[] = [];
  let currentSection: TestSection | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) {
      name = trimmed.slice(2).trim();
      continue;
    }

    if (trimmed.startsWith("## ")) {
      const sectionTitle = trimmed.slice(3).trim();
      const isSetup = sectionTitle.toLowerCase() === "setup";
      const sectionName = sectionTitle.replace(/^Test:\s*/i, "");
      currentSection = { name: sectionName, isSetup, steps: [] };
      sections.push(currentSection);
      continue;
    }

    if (trimmed.startsWith("- ") && currentSection) {
      const step = parseStep(trimmed.slice(2).trim());
      if (step) currentSection.steps.push(step);
    }
  }

  return { name, sections };
}

function parseStep(line: string): TestStep | null {
  const launchMatch = line.match(/^Launch app:\s*(.+)$/i);
  if (launchMatch) return { action: "launch", bundleId: launchMatch[1].trim() };

  const tapMatch = line.match(/^Tap:\s*"([^"]+)"$/i);
  if (tapMatch) return { action: "tap", identifier: tapMatch[1] };

  const waitMatch = line.match(/^Wait for element:\s*"([^"]+)"(?:\s*\(timeout:\s*(\d+)s?\))?$/i);
  if (waitMatch) {
    const step: TestStep = { action: "wait", identifier: waitMatch[1] };
    if (waitMatch[2]) (step as any).timeout = parseInt(waitMatch[2]);
    return step;
  }

  const typeMatch = line.match(/^Type into "([^"]+)":\s*"([^"]+)"$/i);
  if (typeMatch) return { action: "type", identifier: typeMatch[1], text: typeMatch[2] };

  const baselineMatch = line.match(/^Screenshot baseline:\s*"([^"]+)"$/i);
  if (baselineMatch) return { action: "screenshot_baseline", name: baselineMatch[1] };

  const verifyScreenMatch = line.match(/^Screenshot verify:\s*"([^"]+)"(?:\s*\(threshold:\s*(\d+)%?\))?$/i);
  if (verifyScreenMatch) {
    const step: TestStep = { action: "screenshot_verify", name: verifyScreenMatch[1] };
    if (verifyScreenMatch[2]) (step as any).threshold = parseInt(verifyScreenMatch[2]);
    return step;
  }

  const verifyMatch = line.match(/^Verify:\s*element "([^"]+)" has (\w+) "([^"]+)"$/i);
  if (verifyMatch) return { action: "verify", identifier: verifyMatch[1], property: verifyMatch[2], expected: verifyMatch[3] };

  const swipeMatch = line.match(/^Swipe:\s*"(\w+)"(?:\s+on\s+"([^"]+)")?$/i);
  if (swipeMatch) return { action: "swipe", direction: swipeMatch[1], identifier: swipeMatch[2] };

  return null;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/testing/__tests__/parser.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/testing/
git commit -m "feat: add markdown test file parser"
```

---

### Task 8: Screenshot Diffing

**Files:**
- Create: `src/testing/screenshot-diff.ts`
- Create: `src/testing/__tests__/screenshot-diff.test.ts`

**Step 1: Install pixelmatch dependencies**

Run: `npm install pixelmatch pngjs && npm install -D @types/pngjs`

**Step 2: Write the test**

```typescript
// src/testing/__tests__/screenshot-diff.test.ts
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
```

**Step 3: Run tests to verify they fail**

Run: `npx vitest run src/testing/__tests__/screenshot-diff.test.ts`
Expected: FAIL

**Step 4: Implement screenshot diffing**

```typescript
// src/testing/screenshot-diff.ts
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
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run src/testing/__tests__/screenshot-diff.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/testing/screenshot-diff.ts src/testing/__tests__/screenshot-diff.test.ts package.json package-lock.json
git commit -m "feat: add screenshot comparison using pixelmatch"
```

---

### Task 9: Test Runner

**Files:**
- Create: `src/testing/runner.ts`

**Step 1: Implement the test runner**

Executes a parsed TestFile step-by-step, using the BridgeClient and SimctlExecutor. Reports pass/fail per step with timings.

```typescript
// src/testing/runner.ts
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
```

**Step 2: Build and verify**

Run: `npm run build`
Expected: Clean build

**Step 3: Commit**

```bash
git add src/testing/runner.ts
git commit -m "feat: add test runner for executing markdown test suites"
```

---

### Task 10: Test Orchestration MCP Tools

**Files:**
- Create: `src/tools/testing.ts`
- Modify: `src/index.ts`

**Step 1: Create testing tools**

Registers `test_run`, `test_run_all`, `test_screenshot_compare`, `test_screenshot_baseline`, and `test_screenshot_verify` MCP tools.

```typescript
// src/tools/testing.ts
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
```

**Step 2: Update src/index.ts (final version)**

```typescript
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerDeviceTools } from "./tools/device.js";
import { registerInteractionTools } from "./tools/interaction.js";
import { registerTestingTools } from "./tools/testing.js";

const server = new McpServer({
  name: "simu",
  version: "0.1.0",
});

registerDeviceTools(server);
registerInteractionTools(server);
registerTestingTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
```

**Step 3: Build and verify**

Run: `npm run build`
Expected: Clean build

**Step 4: Commit**

```bash
git add src/tools/testing.ts src/index.ts
git commit -m "feat: add test orchestration MCP tools"
```

---

### Task 11: End-to-End Verification

**Step 1: Build everything**

Run: `npm run build`
Expected: Clean build

**Step 2: Run all unit tests**

Run: `npm test`
Expected: All tests pass

**Step 3: Test MCP server starts**

Run: `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node build/index.js`
Expected: JSON response with server capabilities listing all tools

**Step 4: Build bridge project**

Run: `cd bridge && xcodegen generate && xcodebuild build-for-testing -project SimuBridge.xcodeproj -scheme SimuBridge -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -quiet`
Expected: BUILD SUCCEEDED

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve issues found during e2e verification"
```

---

### Task 12: MCP Config

**Step 1: Add to Claude Code MCP config**

Add to `~/.claude.json` or project `.claude/settings.json`:

```json
{
  "mcpServers": {
    "simu": {
      "command": "node",
      "args": ["/Users/steve/Projects/stevestomp/simu/build/index.js"]
    }
  }
}
```

**Step 2: Final commit**

```bash
git add -A
git commit -m "feat: complete simu MCP server v0.1.0"
```
