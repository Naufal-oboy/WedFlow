import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";

// axe-core is already installed by eslint-plugin-jsx-a11y; no runtime dependency.
const source = readFile("node_modules/axe-core/axe.min.js", "utf8");
export async function auditAccessibility(page: Page) {
  // Scan the settled visual state, not a toast's partially transparent entrance.
  // Infinite loading indicators must not block the audit.
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations()
      .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => undefined)));
  });
  await page.addScriptTag({ content: await source });
  const violations = await page.evaluate(async () => {
    const { axe } = window as unknown as { axe: typeof import("axe-core") };
    const result = await axe.run({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } });
    return result.violations.map(issue => ({ rule: issue.id, targets: issue.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }));
  });
  assert.deepEqual(violations, [], `Accessibility: ${new URL(page.url()).pathname} at ${page.viewportSize()?.width}px`);
}
