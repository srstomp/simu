# simu — iOS Simulator MCP Server

An MCP server that gives Claude full control over iOS Simulators for testing apps.

## Architecture

Three layers:

```
Claude (MCP Client)
    |
    v
+-------------------------+
|  simu MCP Server (TS)   |  <- Exposes tools via MCP protocol
|                         |
|  +-------+ +----------+|
|  |simctl  | |XCUITest  ||
|  |layer   | |bridge    ||
|  +-------+ +----------+|
+-------------------------+
    |              |
    v              v
Simulator      Test Runner
(device mgmt)  (HTTP server on sim,
                accessibility + interaction)
```

- **simctl layer** wraps `xcrun simctl` for device management: boot/shutdown, install/launch apps, screenshots, push notifications, location, pasteboard, deep links, status bar, appearance.
- **XCUITest bridge** is a minimal Xcode project that runs a persistent XCUITest on the simulator. Exposes an HTTP API for querying the accessibility tree and performing UI interactions.
- **MCP server** is a TypeScript process that registers tools with Claude, delegates to the appropriate layer, and handles test orchestration.

## MCP Tools — Device Management (simctl layer)

Wraps `xcrun simctl`. All tools take an optional `deviceId` parameter. If omitted, targets the currently booted device.

| Tool | Description |
|---|---|
| `simulator_list` | List all available simulators with their state |
| `simulator_boot` | Boot a simulator by UDID or device name |
| `simulator_shutdown` | Shutdown a simulator |
| `simulator_screenshot` | Capture a PNG screenshot, return as base64 image |
| `simulator_install` | Install a `.app` bundle on a simulator |
| `simulator_launch` | Launch an app by bundle ID |
| `simulator_terminate` | Kill a running app by bundle ID |
| `simulator_open_url` | Open a deep link / URL scheme |
| `simulator_push` | Send a simulated push notification (JSON payload) |
| `simulator_location` | Set simulated GPS coordinates |
| `simulator_appearance` | Toggle light/dark mode |
| `simulator_status_bar` | Override status bar for clean screenshots |
| `simulator_pasteboard` | Read/write the simulator pasteboard |
| `simulator_erase` | Factory reset a simulator |
| `simulator_list_apps` | List all installed apps |
| `simulator_app_info` | Get info about an installed app |

## MCP Tools — App Interaction (XCUITest bridge)

Talks to the HTTP server running inside the XCUITest runner.

| Tool | Description |
|---|---|
| `ui_tree` | Dump the full accessibility tree of the current screen |
| `ui_find` | Find elements by accessibility ID, label, type, or predicate |
| `ui_tap` | Tap an element by accessibility ID, label, or coordinates |
| `ui_long_press` | Long press with configurable duration |
| `ui_swipe` | Swipe in a direction from an element or coordinates |
| `ui_type` | Type text into a field |
| `ui_clear` | Clear a text field |
| `ui_scroll` | Scroll within a scrollable element |
| `ui_wait` | Wait for an element to appear/disappear with timeout |
| `ui_exists` | Check if an element exists right now |
| `ui_element_info` | Get detailed properties of an element |
| `ui_drag` | Drag from one element/coordinate to another |
| `ui_pinch` | Pinch in/out gesture |

## MCP Tools — Test Orchestration

| Tool | Description |
|---|---|
| `test_run` | Execute a markdown test file, returns pass/fail per step |
| `test_run_all` | Run all `.md` test files in a directory |
| `test_screenshot_compare` | Compare two screenshots with similarity threshold |
| `test_screenshot_baseline` | Save a screenshot as baseline for a named checkpoint |
| `test_screenshot_verify` | Compare current screenshot against a named baseline |

### Markdown test format

```markdown
# Login Flow

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
```

The server parses steps, executes them sequentially, captures screenshots after each step, and returns a structured report with pass/fail, timings, and screenshots for failures.

## XCUITest Bridge — Implementation

A minimal Xcode project inside the simu repo.

### Structure

```
bridge/
  SimuBridge.xcodeproj
  SimuBridge/
    SimuBridgeApp.swift           <- Empty host app (required by XCUITest)
  SimuBridgeUITests/
    HTTPServer.swift              <- Lightweight HTTP server
    AccessibilityService.swift    <- Queries XCUIApplication element tree
    InteractionService.swift      <- Tap, swipe, type, etc.
    Routes.swift                  <- Maps HTTP routes to services
    TestEntry.swift               <- XCUITest entry point, starts server and blocks
```

### Lifecycle

1. MCP server builds the bridge once with `xcodebuild build-for-testing`
2. MCP server launches the test runner with `xcodebuild test-without-building`, targeting the simulator
3. The XCUITest entry point starts the HTTP server on a dynamic port, writes the port to a known file path on the simulator filesystem
4. MCP server reads the port file and connects
5. The test runner attaches to the frontmost app via `XCUIApplication(bundleIdentifier:)` — works with any app without rebuilding

The runner stays alive as a long-running test. If it dies, the MCP server detects the failed connection and relaunches automatically. A `GET /health` endpoint verifies liveness.

## Project Structure

```
simu/
  package.json
  tsconfig.json
  src/
    index.ts                  <- MCP server entry point
    server.ts                 <- Tool registration and routing
    tools/
      device.ts               <- simctl wrapper tools
      interaction.ts          <- XCUITest bridge client tools
      testing.ts              <- Test orchestration tools
    simctl/
      executor.ts             <- Spawns xcrun simctl, parses output
    bridge/
      manager.ts              <- Builds, launches, monitors XCUITest runner
      client.ts               <- HTTP client for bridge API
    testing/
      parser.ts               <- Markdown test file parser
      runner.ts               <- Step-by-step test executor
      screenshot-diff.ts      <- Pixel comparison via pixelmatch
  bridge/
    SimuBridge.xcodeproj
    SimuBridge/
      SimuBridgeApp.swift
    SimuBridgeUITests/
      HTTPServer.swift
      AccessibilityService.swift
      InteractionService.swift
      Routes.swift
      TestEntry.swift
```

## Dependencies

- `@modelcontextprotocol/sdk` — MCP server SDK
- `pixelmatch` + `pngjs` — screenshot diffing
- No other runtime deps. `simctl` and `xcodebuild` are already on the machine.

## Installation

Users add simu to their Claude MCP config pointing at the built JS entry point. First run triggers a one-time `xcodebuild build-for-testing` for the bridge (~15 seconds).

## Design Decisions

- **simctl for device management, XCUITest for UI interaction** — clean separation. simctl is reliable for device-level ops. XCUITest gives accurate accessibility tree and native gesture support.
- **XCUITest over IDB** — Apple's own framework, always up-to-date, no third-party dependencies.
- **HTTP bridge over stdin/stdout** — debuggable with curl, independent lifecycle, easy to restart.
- **Screenshot + accessibility tree (dual approach)** — screenshots give Claude visual understanding, accessibility tree gives precise element targeting.
- **Markdown test files + ad-hoc commands** — repeatable regression suites committed to repo, plus interactive exploration in conversation.
- **TypeScript MCP server** — most mature MCP SDK, orchestration-only role so language choice is about ecosystem not performance.
