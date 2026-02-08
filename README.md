# simu

An MCP server that gives Claude full control over iOS Simulators for testing apps.

## What it does

simu exposes 35 tools to Claude via MCP, organized in three groups:

**Device management** (16 tools) — list/boot/shutdown simulators, install and launch apps, take screenshots, set location, send push notifications, toggle dark mode, override the status bar, manage the pasteboard, and more.

**UI interaction** (14 tools) — query the accessibility tree, find elements, tap, swipe, type text, long press, drag, pinch, scroll, wait for elements, and check element properties. Works with any running app.

**Test orchestration** (5 tools) — run markdown test files with step-by-step execution, compare screenshots with pixel-level diffing, save and verify screenshot baselines.

## Architecture

```
Claude (MCP Client)
    |
    v
+-------------------------+
|  simu MCP Server (TS)   |
|                         |
|  +-------+ +----------+|
|  |simctl  | |XCUITest  ||
|  |layer   | |bridge    ||
|  +-------+ +----------+|
+-------------------------+
    |              |
    v              v
Simulator      Test Runner
(device mgmt)  (HTTP server,
                accessibility +
                interaction)
```

- **simctl layer** wraps `xcrun simctl` for device management
- **XCUITest bridge** runs as a persistent test on the simulator, exposing an HTTP API for accessibility queries and UI interactions
- **MCP server** registers tools with Claude and delegates to the appropriate layer

## Requirements

- macOS with Xcode installed
- Node.js 18+
- An iOS Simulator runtime (comes with Xcode)

## Setup

```bash
git clone <repo-url> simu
cd simu
npm install
npm run build
```

The XCUITest bridge builds automatically on first use (~15 seconds).

## Usage with Claude Code

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "simu": {
      "command": "node",
      "args": ["/path/to/simu/build/index.js"]
    }
  }
}
```

Then ask Claude things like:
- "Boot the iPhone 17 Pro simulator and take a screenshot"
- "Launch com.myapp.example and tap the login button"
- "Get the accessibility tree of the current screen"
- "Run the test file at tests/login-flow.md"

## Markdown test format

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

## Tools reference

### Device management

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

### UI interaction

| Tool | Description |
|---|---|
| `ui_attach` | Attach to an app by bundle ID |
| `ui_tree` | Dump the accessibility tree of the current screen |
| `ui_find` | Find elements by accessibility ID, label, or type |
| `ui_tap` | Tap an element or coordinates |
| `ui_long_press` | Long press with configurable duration |
| `ui_swipe` | Swipe in a direction |
| `ui_type` | Type text into a field |
| `ui_clear` | Clear a text field |
| `ui_scroll` | Scroll within a scrollable element |
| `ui_wait` | Wait for an element to appear/disappear |
| `ui_exists` | Check if an element exists |
| `ui_element_info` | Get detailed properties of an element |
| `ui_drag` | Drag from one point to another |
| `ui_pinch` | Pinch in/out gesture |

### Test orchestration

| Tool | Description |
|---|---|
| `test_run` | Execute a markdown test file |
| `test_run_all` | Run all `.md` test files in a directory |
| `test_screenshot_compare` | Compare two screenshots with similarity threshold |
| `test_screenshot_baseline` | Save a screenshot as baseline |
| `test_screenshot_verify` | Compare current screenshot against a baseline |

## Development

```bash
npm run dev      # Watch mode
npm test         # Run tests
npm run build    # Build
```

## License

MIT
