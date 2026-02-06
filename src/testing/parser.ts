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
