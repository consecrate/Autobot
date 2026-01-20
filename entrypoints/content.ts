import { captureElement } from "@/utils/capture";
import { extractContent, injectTexExtractor } from "@/utils/extract";
import {
  SELECTORS,
  getStepType,
  getFrontBackElements,
  getLessonName,
} from "@/utils/dom";

const DECK_KEY = "autobot_deck";
const MODE_KEY = "autobot_mode";
const DEFAULT_DECK = "MathAcademy";

async function getDeck(): Promise<string> {
  const result = await browser.storage.local.get(DECK_KEY);
  return (result[DECK_KEY] as string) || DEFAULT_DECK;
}

async function getMode(): Promise<'image' | 'text'> {
  const result = await browser.storage.local.get(MODE_KEY);
  return (result[MODE_KEY] as 'image' | 'text') || 'image';
}

function getStepName(step: Element): string {
  return step.querySelector('.stepName, .questionWidget-stepName, .questionWidget-title')?.textContent?.trim() || 'unnamed';
}

async function makeStepNameClickable(step: Element) {
  const stepNameEl = step.querySelector<HTMLElement>(
    ".stepName, .questionWidget-stepName, .questionWidget-title"
  );
  if (!stepNameEl || stepNameEl.dataset.autobotEnabled) return false;

  stepNameEl.dataset.autobotEnabled = "true";

  const originalText = stepNameEl.textContent || "";
  let isAdded = false;

  stepNameEl.style.cursor = "pointer";

  const updateStatus = (status: string) => {
    stepNameEl.textContent = status
      ? `${originalText} (${status})`
      : originalText;
    stepNameEl.title = isAdded ? "Click to remove from Anki" : "Click to add to Anki";
  };

  // Check if already added on load
  const deck = await getDeck();
  const lesson = getLessonName().toLowerCase().replace(/\s+/g, "-");
  const stepName = getStepName(step);
  const marker = `<!-- autobot:${lesson}:${stepName} -->`;

  const mode = await getMode();
  if (mode === 'text') {
    const { front, back } = getFrontBackElements(step, getStepType(step)!);
    if (front && back) {
      const frontText = marker + extractContent(front as HTMLElement);
      const backText = extractContent(back as HTMLElement);
      const canAdd = await browser.runtime.sendMessage({
        action: "canAddNotes",
        notes: [{ deckName: deck, modelName: "Basic", fields: { Front: frontText, Back: backText } }],
      });
      if (!canAdd[0]) {
        isAdded = true;
        updateStatus("Added");
      }
    }
  }

  if (!isAdded) {
    stepNameEl.title = "Click to add to Anki";
  }

  stepNameEl.onclick = async (e) => {
    e.stopPropagation();

    const type = getStepType(step);
    if (!type) return;

    if (isAdded) {
      // Remove from Anki
      updateStatus("Removing...");
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      try {
        const { front, back } = getFrontBackElements(step, type);
        if (!front || !back) throw new Error("Elements not found");

        const frontText = marker + extractContent(front as HTMLElement);
        const backText = extractContent(back as HTMLElement);

        // Find and delete the note
        const noteIds = await browser.runtime.sendMessage({
          action: "findNotes",
          query: `"Front:${frontText.slice(0, 50)}"`,
        });
        if (noteIds?.length) {
          await browser.runtime.sendMessage({
            action: "deleteNotes",
            notes: noteIds,
          });
        }

        isAdded = false;
        updateStatus("");
      } catch (e) {
        updateStatus("Error");
        console.error("[Autobot] Error:", e);
      }
      return;
    }

    // Add to Anki
    updateStatus("Adding...");
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const { front, back } = getFrontBackElements(step, type);
      if (!front || !back) throw new Error("Elements not found");

      if (mode === 'text') {
        const frontText = marker + extractContent(front as HTMLElement);
        const backText = extractContent(back as HTMLElement);

        await browser.runtime.sendMessage({
          action: "addTextNote",
          deckName: deck,
          front: frontText,
          back: backText,
          tags: ["mathacademy", lesson],
        });
      } else {
        const [frontImg, backImg] = await Promise.all([
          captureElement(front),
          captureElement(back),
        ]);

        await browser.runtime.sendMessage({
          action: "addNote",
          deckName: deck,
          frontImg,
          backImg,
          tags: ["mathacademy", lesson],
        });
      }

      isAdded = true;
      updateStatus("Added");
    } catch (e) {
      updateStatus("Error");
      console.error("[Autobot] Error:", e);
    }
  };
  return true;
}

async function injectButton(step: Element, index?: number) {
  const type = getStepType(step);
  if (!type) return;

  const name = getStepName(step);
  const prefix = index !== undefined ? `#${index + 1}` : '';

  if (await makeStepNameClickable(step)) {
    console.log(`[Autobot] ${prefix} "${name}" (${type}) → clickable`);
  } else {
    console.log(`[Autobot] ${prefix} "${name}" (${type}) → skipped (already processed)`);
  }
}

export default defineContentScript({
  matches: ["*://*.mathacademy.com/*"],
  main() {
    // Inject TeX extractor script early for text mode
    injectTexExtractor();

    console.log(`[Autobot] Loaded on: ${getLessonName()}`);

    // Inject on existing steps
    const steps = document.querySelectorAll(SELECTORS.step);
    console.log(`[Autobot] Initial scan: ${steps.length} step(s)`);
    steps.forEach((step, i) => injectButton(step, i));

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

      if (stepsToCheck.size > 0) {
        console.log(`[Autobot] Mutation: checking ${stepsToCheck.size} step(s)`);
        stepsToCheck.forEach((step) => injectButton(step));
      }
    }).observe(stepsContainer, { childList: true, subtree: true });
  },
});
