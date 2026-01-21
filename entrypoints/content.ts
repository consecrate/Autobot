import { captureElement } from "@/utils/capture";
import { extractContent, injectTexExtractor, fetchImageAsBase64, addWhiteBackground, ExtractResult } from "@/utils/extract";
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
const FIX_DARK_MODE_KEY = "autobot_fix_dark_mode";
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

async function getFixDarkMode(): Promise<boolean> {
  const result = await browser.storage.local.get(FIX_DARK_MODE_KEY);
  // Default to true if not set
  return result[FIX_DARK_MODE_KEY] !== false;
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
    const deck = await getDeck();
    const mode = await getMode();
    const includeChoices = await getIncludeChoices();
    const labelFormat = await getLabelFormat();
    const fixDarkMode = await getFixDarkMode();

    updateStatus("Adding...");
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const { front, back, choices, graphic } = getFrontBackElements(step, type);
      if (!front || !back) throw new Error("Elements not found");

      if (mode === 'text') {
        let frontText = marker;
        const timestamp = Date.now();
        let imageCounter = 0;

        // Helper function to process extracted content with images
        const processExtractedContent = async (result: ExtractResult): Promise<string> => {
          let processedContent = result.content;

          // Process each image: fetch, optionally fix for dark mode, store, and replace placeholder
          for (const img of result.images) {
            try {
              let base64Data = await fetchImageAsBase64(img.src);

              // Add white background if fix dark mode is enabled
              if (fixDarkMode) {
                base64Data = await addWhiteBackground(base64Data);
              }

              const filename = `autobot-${timestamp}-img${imageCounter++}.png`;

              await browser.runtime.sendMessage({
                action: "storeMediaFile",
                filename,
                data: base64Data,
              });

              // Replace placeholder with actual img tag
              processedContent = processedContent.replace(
                img.placeholder,
                `<img src="${filename}">`
              );

              console.log(`[Autobot] Stored option image: ${img.src} -> ${filename}`);
            } catch (e) {
              console.error(`[Autobot] Failed to process image ${img.src}:`, e);
              // Remove the placeholder if we couldn't process the image
              processedContent = processedContent.replace(img.placeholder, '[Image]');
            }
          }

          return processedContent;
        };

        // Add graphic as image if present
        if (graphic) {
          const graphicImg = await captureElement(graphic);

          // Store graphic as media file
          const graphicFilename = `autobot-${timestamp}-graphic.png`;
          let graphicData = graphicImg.replace(/^data:image\/png;base64,/, '');

          // Add white background if fix dark mode is enabled
          if (fixDarkMode) {
            graphicData = await addWhiteBackground(graphicData);
          }

          await browser.runtime.sendMessage({
            action: "storeMediaFile",
            filename: graphicFilename,
            data: graphicData,
          });

          frontText += `<img src="${graphicFilename}"><br>`;
        }

        // Add front text
        const frontResult = extractContent(front as HTMLElement);
        frontText += await processExtractedContent(frontResult);

        // Add choices if enabled
        if (includeChoices && choices) {
          const choicesResult = extractContent(choices as HTMLElement, { labelFormat });
          frontText += await processExtractedContent(choicesResult);
        }

        const backResult = extractContent(back as HTMLElement);
        const backText = await processExtractedContent(backResult);

        await browser.runtime.sendMessage({
          action: "addTextNote",
          deckName: deck,
          front: frontText,
          back: backText,
          tags: ["mathacademy", lesson],
        });
      } else {
        // Image mode: capture front elements individually and composite them
        const timestamp = Date.now();
        let frontHtml = marker; // Start with marker for duplicate detection

        // Helper to capture an element, store it, and return an img tag
        const captureAndStore = async (element: HTMLElement, label: string): Promise<string> => {
          const dataUrl = await captureElement(element);
          const filename = `autobot-${timestamp}-${label}.png`;
          const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
          await browser.runtime.sendMessage({
            action: "storeMediaFile",
            filename,
            data: base64,
          });
          return `<img src="${filename}">`;
        };

        // Capture graphic if present
        if (graphic) {
          frontHtml += await captureAndStore(graphic, 'graphic') + '<br>';
        }

        // Capture front (question text)
        frontHtml += await captureAndStore(front, 'front');

        // Capture choices if enabled (with temporary style stripping)
        if (includeChoices && choices) {
          // Temporarily remove selection styling from circles
          const circles = choices.querySelectorAll('.questionWidget-choiceLetterCircle');
          const savedStyles: (string | null)[] = [];

          circles.forEach((circle, idx) => {
            savedStyles[idx] = circle.getAttribute('style');
            circle.removeAttribute('style');
          });

          try {
            frontHtml += '<br>' + await captureAndStore(choices, 'choices');
          } finally {
            // Restore original styles
            circles.forEach((circle, idx) => {
              if (savedStyles[idx]) {
                circle.setAttribute('style', savedStyles[idx]);
              }
            });
          }
        }

        // Capture back
        const backHtml = await captureAndStore(back, 'back');

        // Use addTextNote since we have HTML content with multiple images
        await browser.runtime.sendMessage({
          action: "addTextNote",
          deckName: deck,
          front: frontHtml,
          back: backHtml,
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

async function injectAnkiButton(step: Element) {
  // Skip if step is not visible (not yet solved)
  const stepEl = step as HTMLElement;
  if (stepEl.style.display === 'none' || getComputedStyle(stepEl).display === 'none') {
    return false;
  }

  // Skip if already processed
  if (stepEl.dataset.autobotAnkiBtn) return false;

  const type = getStepType(step);
  if (!type) return false;

  const lesson = getLessonName().toLowerCase().replace(/\s+/g, "-");
  const stepName = getStepName(step);
  const marker = `<!-- autobot:${lesson}:${stepName} -->`;

  // Create the button - use only our own class to prevent MathAcademy from hiding it
  const ankiBtn = document.createElement("div");
  ankiBtn.className = "autobotAnkiButton";
  ankiBtn.textContent = "Add to Anki";
  ankiBtn.style.cssText = `
    background-color: #5a9fd4;
    color: #f8f8f8;
    cursor: pointer;
    display: inline-block;
    width: 100px;
    padding: 10px 0;
    border-radius: 17px;
    font-size: 14px;
    text-align: center;
    user-select: none;
  `;

  let isAdded = false;

  const updateBtn = (status?: string) => {
    if (status === "Adding..." || status === "Removing...") {
      ankiBtn.textContent = status;
      ankiBtn.style.opacity = "0.7";
    } else if (status === "Added") {
      ankiBtn.textContent = "Added";
      ankiBtn.style.backgroundColor = "#4a8";
      ankiBtn.style.opacity = "1";
    } else if (status === "Error") {
      ankiBtn.textContent = "Error";
      ankiBtn.style.backgroundColor = "#d55";
      ankiBtn.style.opacity = "1";
    } else {
      ankiBtn.textContent = "Add to Anki";
      ankiBtn.style.backgroundColor = "#5a9fd4";
      ankiBtn.style.opacity = "1";
    }
  };

  // Check if already added
  const existingNotes = await browser.runtime.sendMessage({
    action: "findNotes",
    query: `"Front:${marker}"`,
  });
  if (existingNotes?.length) {
    isAdded = true;
    updateBtn("Added");
  }

  ankiBtn.onclick = async (e) => {
    e.stopPropagation();
    e.preventDefault();

    if (isAdded) {
      updateBtn("Removing...");
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
        updateBtn();
      } catch (e) {
        updateBtn("Error");
        console.error("[Autobot] Error:", e);
      }
      return;
    }

    // Add to Anki
    const deck = await getDeck();
    const mode = await getMode();
    const includeChoices = await getIncludeChoices();
    const labelFormat = await getLabelFormat();
    const fixDarkMode = await getFixDarkMode();

    updateBtn("Adding...");
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const { front, back, choices, graphic } = getFrontBackElements(step, type);
      if (!front || !back) throw new Error("Elements not found");

      if (mode === 'text') {
        let frontText = marker;
        const timestamp = Date.now();
        let imageCounter = 0;

        const processExtractedContent = async (result: ExtractResult): Promise<string> => {
          let processedContent = result.content;
          for (const img of result.images) {
            try {
              let base64Data = await fetchImageAsBase64(img.src);
              if (fixDarkMode) {
                base64Data = await addWhiteBackground(base64Data);
              }
              const filename = `autobot-${timestamp}-img${imageCounter++}.png`;
              await browser.runtime.sendMessage({
                action: "storeMediaFile",
                filename,
                data: base64Data,
              });
              processedContent = processedContent.replace(
                img.placeholder,
                `<img src="${filename}">`
              );
            } catch (e) {
              processedContent = processedContent.replace(img.placeholder, '[Image]');
            }
          }
          return processedContent;
        };

        if (graphic) {
          const graphicImg = await captureElement(graphic);
          const graphicFilename = `autobot-${timestamp}-graphic.png`;
          let graphicData = graphicImg.replace(/^data:image\/png;base64,/, '');
          if (fixDarkMode) {
            graphicData = await addWhiteBackground(graphicData);
          }
          await browser.runtime.sendMessage({
            action: "storeMediaFile",
            filename: graphicFilename,
            data: graphicData,
          });
          frontText += `<img src="${graphicFilename}"><br>`;
        }

        const frontResult = extractContent(front as HTMLElement);
        frontText += await processExtractedContent(frontResult);

        if (includeChoices && choices) {
          const choicesResult = extractContent(choices as HTMLElement, { labelFormat });
          frontText += await processExtractedContent(choicesResult);
        }

        const backResult = extractContent(back as HTMLElement);
        const backText = await processExtractedContent(backResult);

        await browser.runtime.sendMessage({
          action: "addTextNote",
          deckName: deck,
          front: frontText,
          back: backText,
          tags: ["mathacademy", lesson],
        });
      } else {
        const timestamp = Date.now();
        let frontHtml = marker;

        const captureAndStore = async (element: HTMLElement, label: string): Promise<string> => {
          const dataUrl = await captureElement(element);
          const filename = `autobot-${timestamp}-${label}.png`;
          const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
          await browser.runtime.sendMessage({
            action: "storeMediaFile",
            filename,
            data: base64,
          });
          return `<img src="${filename}">`;
        };

        if (graphic) {
          frontHtml += await captureAndStore(graphic, 'graphic') + '<br>';
        }
        frontHtml += await captureAndStore(front, 'front');

        if (includeChoices && choices) {
          const circles = choices.querySelectorAll('.questionWidget-choiceLetterCircle');
          const savedStyles: (string | null)[] = [];
          circles.forEach((circle, idx) => {
            savedStyles[idx] = circle.getAttribute('style');
            circle.removeAttribute('style');
          });
          try {
            frontHtml += '<br>' + await captureAndStore(choices, 'choices');
          } finally {
            circles.forEach((circle, idx) => {
              if (savedStyles[idx]) {
                circle.setAttribute('style', savedStyles[idx]);
              }
            });
          }
        }

        const backHtml = await captureAndStore(back, 'back');

        await browser.runtime.sendMessage({
          action: "addTextNote",
          deckName: deck,
          front: frontHtml,
          back: backHtml,
          tags: ["mathacademy", lesson],
        });
      }

      isAdded = true;
      updateBtn("Added");
    } catch (e) {
      updateBtn("Error");
      console.error("[Autobot] Error:", e);
    }
  };

  // Determine where to place the button based on current state
  const frame = step.nextElementSibling;
  const continueBtnEl = frame?.classList.contains('continueButtonFrame')
    ? frame.querySelector<HTMLElement>(SELECTORS.continueButton)
    : null;
  // Check if continue button is actually visible (not display: none)
  const isContinueVisible = continueBtnEl
    && continueBtnEl.style.display !== 'none'
    && getComputedStyle(continueBtnEl).display !== 'none';
  const continueBtn = isContinueVisible ? continueBtnEl : null;

  // Get the explanation container based on step type
  const explanationSelector = type === 'example'
    ? SELECTORS.exampleBack
    : SELECTORS.questionBack;
  const explanation = step.querySelector<HTMLElement>(explanationSelector);

  if (continueBtn) {
    // Continue button is visible - place button next to it
    (frame as HTMLElement).style.display = "flex";
    (frame as HTMLElement).style.gap = "8px";
    (frame as HTMLElement).style.alignItems = "flex-end";
    // Match Continue button's margin-top so they align
    ankiBtn.style.marginTop = "50px";
    frame!.appendChild(ankiBtn);

    // Watch for when Continue button is hidden (display: none)
    const moveToExplanation = () => {
      if (!frame!.contains(ankiBtn) || !explanation) return; // Already moved or no target
      ankiBtn.style.marginTop = "12px";
      explanation.appendChild(ankiBtn);
    };

    const observer = new MutationObserver(() => {
      if (!frame!.contains(ankiBtn)) {
        observer.disconnect();
        return;
      }
      // Check Continue button visibility directly
      const isContinueHidden = continueBtn.style.display === 'none'
        || getComputedStyle(continueBtn).display === 'none';
      if (isContinueHidden) {
        moveToExplanation();
        observer.disconnect();
      }
    });
    // Watch both the Continue button and the frame for style changes
    observer.observe(continueBtn, { attributes: true, attributeFilter: ['style'] });
    observer.observe(frame!, { attributes: true, attributeFilter: ['style'] });
  } else if (explanation) {
    // No continue button visible - place at end of explanation
    ankiBtn.style.marginTop = "12px";
    explanation.appendChild(ankiBtn);
  } else {
    return false; // Nowhere to place button
  }

  // Mark as processed only after successful placement
  stepEl.dataset.autobotAnkiBtn = "true";
  return true;
}

async function injectButton(step: Element, index?: number) {
  const type = getStepType(step);
  if (!type) return;

  const name = getStepName(step);
  const prefix = index !== undefined ? `#${index + 1}` : '';

  const titleAdded = await makeStepNameClickable(step);
  const btnAdded = await injectAnkiButton(step);

  if (titleAdded || btnAdded) {
    console.log(`[Autobot] ${prefix} "${name}" (${type}) → injected`);
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
        // Handle attribute changes (e.g., style/display changes)
        if (m.type === 'attributes' && m.target instanceof Element) {
          const step = m.target.matches?.(SELECTORS.step)
            ? m.target
            : m.target.closest?.(SELECTORS.step);
          if (step && !step.hasAttribute('data-autobot-anki-btn')) {
            stepsToCheck.add(step);
          }
          continue;
        }

        // Handle added nodes
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
    }).observe(stepsContainer, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  },
});
