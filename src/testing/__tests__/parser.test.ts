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
