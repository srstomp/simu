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
