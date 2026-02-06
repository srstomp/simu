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
