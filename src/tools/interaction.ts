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
