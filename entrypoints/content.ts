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
const CHOICES_KEY = "autobot_include_choices";
const LABEL_FORMAT_KEY = "autobot_label_format";
const DEFAULT_DECK = "MathAcademy";

async function getDeck(): Promise<string> {
  const result = await browser.storage.local.get(DECK_KEY);
  return (result[DECK_KEY] as string) || DEFAULT_DECK;
}

async function getMode(): Promise<'image' | 'text'> {
  const result = await browser.storage.local.get(MODE_KEY);
  return (result[MODE_KEY] as 'image' | 'text') || 'text';
}

async function getIncludeChoices(): Promise<boolean> {
  const result = await browser.storage.local.get(CHOICES_KEY);
  return (result[CHOICES_KEY] as boolean) || false;
}

async function getLabelFormat(): Promise<'paren' | 'dot' | 'bracket'> {
  const result = await browser.storage.local.get(LABEL_FORMAT_KEY);
  const value = result[LABEL_FORMAT_KEY] as string;
  if (value === 'dot' || value === 'bracket') return value;
  return 'paren';
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

  // Check if already added on load (search by marker which is stable regardless of settings)
  const deck = await getDeck();
  const lesson = getLessonName().toLowerCase().replace(/\s+/g, "-");
  const stepName = getStepName(step);
  const marker = `<!-- autobot:${lesson}:${stepName} -->`;

  // Check if note with this marker already exists
  const existingNotes = await browser.runtime.sendMessage({
    action: "findNotes",
    query: `"Front:${marker}"`,
  });
  if (existingNotes?.length) {
    isAdded = true;
    updateStatus("Added");
  }

  if (!isAdded) {
    stepNameEl.title = "Click to add to Anki";
  }

  stepNameEl.onclick = async (e) => {
    e.stopPropagation();

    const type = getStepType(step);
    if (!type) return;

    if (isAdded) {
      // Remove from Anki - search by marker to find the note regardless of include-choices setting
      updateStatus("Removing...");
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      try {
        const noteIds = await browser.runtime.sendMessage({
          action: "findNotes",
          query: `"Front:${marker}"`,
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

    // Add to Anki - fetch current settings at click time
    const mode = await getMode();
    const includeChoices = await getIncludeChoices();
    const labelFormat = await getLabelFormat();

    updateStatus("Adding...");
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const { front, back, choices } = getFrontBackElements(step, type);
      if (!front || !back) throw new Error("Elements not found");

      if (mode === 'text') {
        let frontText = marker + extractContent(front as HTMLElement);
        if (includeChoices && choices) {
          frontText += '<br><br>' + extractContent(choices as HTMLElement, { labelFormat });
        }
        const backText = extractContent(back as HTMLElement);

        await browser.runtime.sendMessage({
          action: "addTextNote",
          deckName: deck,
          front: frontText,
          back: backText,
          tags: ["mathacademy", lesson],
        });
      } else {
        // Image mode: capture front (optionally with choices) and back
        let frontImg: string;
        if (includeChoices && choices) {
          // Create a temporary wrapper to capture both elements together
          const wrapper = document.createElement('div');
          wrapper.style.cssText = 'position: absolute; left: -9999px; background: white;';
          wrapper.appendChild(front.cloneNode(true));
          wrapper.appendChild(choices.cloneNode(true));
          document.body.appendChild(wrapper);
          try {
            frontImg = await captureElement(wrapper);
          } finally {
            document.body.removeChild(wrapper);
          }
        } else {
          frontImg = await captureElement(front);
        }
        const backImg = await captureElement(back);

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
        for (const node of Array.from(m.addedNodes)) {
          if (!(node instanceof Element)) continue;
          // New step elements
          if (node.matches?.(SELECTORS.step)) {
            stepsToCheck.add(node);
          } 
          // Steps nested inside larger added DOM chunks
          else {
            node.querySelectorAll?.(SELECTORS.step)?.forEach(s => stepsToCheck.add(s));
          }
          // Content added inside an unprocessed step (e.g., MathJax loading)
          const parentStep = node.closest?.(SELECTORS.step);
          if (parentStep && !parentStep.querySelector('[data-autobot-enabled]')) {
            stepsToCheck.add(parentStep);
          }
        }
      }

      if (stepsToCheck.size > 0) {
        console.log(`[Autobot] Mutation: checking ${stepsToCheck.size} step(s)`);
        stepsToCheck.forEach((step) => injectButton(step));
      }
    }).observe(stepsContainer, { childList: true, subtree: true });
  },
});
