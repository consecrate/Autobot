import { captureElement } from "@/utils/capture";
import {
  SELECTORS,
  getStepType,
  getFrontBackElements,
  getLessonName,
} from "@/utils/dom";

const DECK_KEY = "autobot_deck";
const DEFAULT_DECK = "MathAcademy";

async function getDeck(): Promise<string> {
  const result = await browser.storage.local.get(DECK_KEY);
  return (result[DECK_KEY] as string) || DEFAULT_DECK;
}

function makeStepNameClickable(step: Element) {
  const stepName = step.querySelector<HTMLElement>(
    ".stepName, .questionWidget-stepName"
  );
  if (!stepName || stepName.dataset.autobotEnabled) return;

  // Mark as already processed
  stepName.dataset.autobotEnabled = "true";

  // Store original text
  const originalText = stepName.textContent || "";

  // Make it look clickable
  stepName.style.cursor = "pointer";
  stepName.title = "Click to add to Anki";

  const updateStatus = (status: string) => {
    stepName.textContent = status
      ? `${originalText} (${status})`
      : originalText;
  };

  stepName.onclick = async (e) => {
    e.stopPropagation();

    const type = getStepType(step);
    if (!type) return;

    updateStatus("⏳ Adding...");
    // Force repaint before heavy capture work
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r))
    );
    try {
      const { front, back } = getFrontBackElements(step, type);
      if (!front || !back) throw new Error("Elements not found");

      const [frontImg, backImg] = await Promise.all([
        captureElement(front),
        captureElement(back),
      ]);

      const deck = await getDeck();
      const lesson = getLessonName().toLowerCase().replace(/\s+/g, "-");

      await browser.runtime.sendMessage({
        action: "addNote",
        deckName: deck,
        frontImg,
        backImg,
        tags: ["mathacademy", lesson],
      });

      updateStatus("✅ Added");
    } catch (e) {
      updateStatus("❌ Error");
      console.error("[Autobot] Error:", e);
    }
    setTimeout(() => updateStatus(""), 2000);
  };
}

function injectButton(step: Element) {
  const type = getStepType(step);
  if (!type) return;

  makeStepNameClickable(step);
  console.log("[Autobot] Step name made clickable:", type);
}

export default defineContentScript({
  matches: ["*://*.mathacademy.com/*"],
  main() {
    console.log("[Autobot] Content script loaded");

    // Inject on existing steps
    document.querySelectorAll(SELECTORS.step).forEach(injectButton);

    // Watch for dynamically loaded content
    const stepsContainer = document.querySelector(SELECTORS.steps);
    if (!stepsContainer) return;

    new MutationObserver((mutations) => {
      const stepsToCheck = new Set<Element>();

      for (const m of mutations) {
        const targetStep = (m.target as Element).closest?.(SELECTORS.step);
        if (targetStep) stepsToCheck.add(targetStep);

        for (const node of Array.from(m.addedNodes)) {
          if (!(node instanceof Element)) continue;
          if (node.matches?.(SELECTORS.step)) stepsToCheck.add(node);
          const parentStep = node.closest?.(SELECTORS.step);
          if (parentStep) stepsToCheck.add(parentStep);
        }
      }

      stepsToCheck.forEach(injectButton);
    }).observe(stepsContainer, { childList: true, subtree: true });
  },
});
