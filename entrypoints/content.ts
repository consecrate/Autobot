import { injectTexExtractor } from "@/utils/extract";
import {
  SELECTORS,
  getStepType,
  getFrontBackElements,
  getLessonName,
} from "@/utils/dom";
import { CSS_CLASSES } from "@/utils/constants";
import { getAllSettings } from "@/utils/settings";
import { addCard, removeNote } from "@/utils/card";

function getStepName(step: Element): string {
  return step.querySelector('.stepName, .questionWidget-stepName, .questionWidget-title')?.textContent?.trim() || 'unnamed';
}

function getLessonTag(): string {
  return getLessonName().toLowerCase().replace(/\s+/g, "-");
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
  const lesson = getLessonTag();
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
      updateStatus("Removing...");
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      try {
        await removeNote(marker);
        isAdded = false;
        updateStatus("");
      } catch (e) {
        updateStatus("Error");
        console.error("[Autobot] Error:", e);
      }
      return;
    }

    // Add to Anki - fetch current settings at click time
    const settings = await getAllSettings();

    updateStatus("Adding...");
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const { front, back, choices, graphic } = getFrontBackElements(step, type);
      if (!front || !back) throw new Error("Elements not found");

      await addCard({
        marker,
        elements: { front, back, choices, graphic },
        settings,
        tags: ["mathacademy", lesson],
      });

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

  // Skip if this is a tutorial step
  if (stepEl.querySelector('.tutorial')) {
    return false;
  }

  // Skip if button already exists in this step (race-proof check)
  if (stepEl.querySelector(`.${CSS_CLASSES.ankiButton}`)) return false;

  const type = getStepType(step);
  if (!type) return false;

  const lesson = getLessonTag();
  const stepName = getStepName(step);
  const marker = `<!-- autobot:${lesson}:${stepName} -->`;

  // Create the button - use only our own class to prevent MathAcademy from hiding it
  const ankiBtn = document.createElement("div");
  ankiBtn.className = CSS_CLASSES.ankiButton;
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
        await removeNote(marker);
        isAdded = false;
        updateBtn();
      } catch (e) {
        updateBtn("Error");
        console.error("[Autobot] Error:", e);
      }
      return;
    }

    // Add to Anki
    const settings = await getAllSettings();

    updateBtn("Adding...");
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const { front, back, choices, graphic } = getFrontBackElements(step, type);
      if (!front || !back) throw new Error("Elements not found");

      await addCard({
        marker,
        elements: { front, back, choices, graphic },
        settings,
        tags: ["mathacademy", lesson],
      });

      isAdded = true;
      updateBtn("Added");
    } catch (e) {
      updateBtn("Error");
      console.error("[Autobot] Error:", e);
    }
  };

  // Find the specific Continue button for this step
  // Step ID is typically "step-{id}", and continue button is "continueButton-{id}"
  const stepId = stepEl.id.replace(/^step-/, '');
  const continueBtnId = `continueButton-${stepId}`;
  let continueBtn = document.getElementById(continueBtnId);

  // If found, check if it's visible
  if (continueBtn && (continueBtn.style.display === 'none' || getComputedStyle(continueBtn).display === 'none')) {
    continueBtn = null;
  }

  // Get the explanation container (works for both example and question types)
  const explanation = step.querySelector<HTMLElement>(SELECTORS.exampleBack)
    || step.querySelector<HTMLElement>(SELECTORS.questionBack);

  if (continueBtn) {
    // Continue button is visible - place button next to it
    const frame = continueBtn.parentElement;
    if (frame) {
      // Prevent duplicates in the frame
      if (frame.querySelector(`.${CSS_CLASSES.ankiButton}`)) return true;

      frame.style.display = "flex";
      frame.style.gap = "8px";
      frame.style.alignItems = "flex-end";
      ankiBtn.style.marginTop = "50px";
      frame.appendChild(ankiBtn);

      // Watch for when Continue button is hidden
      const observer = new MutationObserver(() => {
        if (!frame.contains(ankiBtn)) {
          observer.disconnect();
          return;
        }
        const isHidden = continueBtn!.style.display === 'none'
          || getComputedStyle(continueBtn!).display === 'none';
        if (isHidden && explanation) {
          // Check if explanation already has a button before moving
          if (!explanation.querySelector(`.${CSS_CLASSES.ankiButton}`)) {
            ankiBtn.style.marginTop = "12px";
            explanation.appendChild(ankiBtn);
          } else {
            ankiBtn.remove(); // Remove duplicate if target already has one
          }
          observer.disconnect();
        }
      });
      observer.observe(continueBtn, { attributes: true, attributeFilter: ['style'] });
    }
  } else if (explanation) {
    // No visible Continue button - place at end of explanation
    // Prevent duplicates in the explanation
    if (explanation.querySelector(`.${CSS_CLASSES.ankiButton}`)) return true;

    ankiBtn.style.marginTop = "12px";
    explanation.appendChild(ankiBtn);
  } else {
    return false; // Nowhere to place button
  }
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

// Results page: inject button for each question/explanation pair
async function injectResultsPageButton(questionEl: HTMLElement, explanationEl: HTMLElement) {

  const lesson = getLessonTag();
  // Extract question ID from element id (e.g., "question-4115" -> "4115")
  const questionId = questionEl.id.replace('question-', '');
  const marker = `<!-- autobot-result:${lesson}:${questionId} -->`;

  const ankiBtn = document.createElement("div");
  ankiBtn.className = CSS_CLASSES.ankiButton;
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
    margin-top: 12px;
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
        await removeNote(marker);
        isAdded = false;
        updateBtn();
      } catch (e) {
        updateBtn("Error");
        console.error("[Autobot] Error:", e);
      }
      return;
    }

    // Add to Anki
    const settings = await getAllSettings();

    updateBtn("Adding...");
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      // Front = question text, Back = explanation
      const questionText = questionEl.querySelector<HTMLElement>('.questionText');
      if (!questionText) throw new Error("Question text not found");

      if (settings.mode === 'text') {
        // Clone questionText and remove the answer table before extraction
        const questionClone = questionText.cloneNode(true) as HTMLElement;
        const tableToRemove = questionClone.querySelector('table');
        tableToRemove?.remove();

        await addCard({
          marker,
          elements: {
            front: questionClone,
            back: explanationEl,
          },
          settings,
          tags: ["mathacademy", lesson, "results"],
          prepareCapture: () => {
            // Ensure explanation is visible for extraction
            const originalExplanationDisplay = explanationEl.style.display;
            explanationEl.style.display = 'block';
            const originalBtnDisplay = ankiBtn.style.display;
            ankiBtn.style.display = 'none';

            return () => {
              ankiBtn.style.display = originalBtnDisplay;
              explanationEl.style.display = originalExplanationDisplay;
            };
          },
        });
      } else {
        // Image mode: pass questionText directly (table hidden via prepareCapture)
        await addCard({
          marker,
          elements: {
            front: questionText,
            back: explanationEl,
          },
          settings,
          tags: ["mathacademy", lesson, "results"],
          prepareCapture: () => {
            // Hide answer table inside questionText before capture
            const answerTable = questionText.querySelector('table');
            const originalTableDisplay = answerTable?.style.display;
            if (answerTable) answerTable.style.display = 'none';

            // Ensure explanation is visible for capture
            const originalExplanationDisplay = explanationEl.style.display;
            explanationEl.style.display = 'block';
            const originalBtnDisplay = ankiBtn.style.display;
            ankiBtn.style.display = 'none';

            return () => {
              if (answerTable) answerTable.style.display = originalTableDisplay || '';
              ankiBtn.style.display = originalBtnDisplay;
              explanationEl.style.display = originalExplanationDisplay;
            };
          },
        });
      }

      isAdded = true;
      updateBtn("Added");
    } catch (e) {
      updateBtn("Error");
      console.error("[Autobot] Error:", e);
    }
  };

  // Final check before appending
  if (!explanationEl.querySelector(`.${CSS_CLASSES.ankiButton}`)) {
    explanationEl.appendChild(ankiBtn);
  }
  return true;
}

function processResultsPage() {
  const container = document.querySelector(SELECTORS.resultsContainer)
    || document.querySelector(SELECTORS.assessmentContainer);
  const questions = document.querySelectorAll<HTMLElement>(SELECTORS.resultQuestion);
  console.log(`[Autobot] Results: container=${!!container}, questions=${questions.length}`);
  let processed = 0;

  questions.forEach((questionEl) => {
    const questionId = questionEl.id.replace('question-', '');
    const explanationEl = document.querySelector<HTMLElement>(`#questionExplanation-${questionId}`);

    if (explanationEl && !explanationEl.dataset.autobotAnkiBtn) {
      // Mark as processed SYNCHRONOUSLY before async call to prevent race condition
      explanationEl.dataset.autobotAnkiBtn = "true";
      injectResultsPageButton(questionEl, explanationEl);
      processed++;
    }
  });

  if (processed > 0) {
    console.log(`[Autobot] Results page: processed ${processed} question(s)`);
  }

  // Add the "Add all" button if questions exist
  if (questions.length > 0) {
    injectAddAllButton();
    injectAddAllIncorrectButton();
  }
}

// Add All button for results page
function injectAddAllButton() {
  const taskName = document.querySelector<HTMLElement>(SELECTORS.taskNameUnlocked)
    || document.querySelector<HTMLElement>(SELECTORS.taskAnswersHeader);
  if (!taskName || taskName.dataset.autobotAddAll) return;

  taskName.dataset.autobotAddAll = "true";

  const addAllBtn = document.createElement("div");
  addAllBtn.className = CSS_CLASSES.addAllButton;
  addAllBtn.textContent = "Add All to Anki";
  addAllBtn.style.cssText = `
    background-color: #5a9fd4;
    color: #f8f8f8;
    cursor: pointer;
    display: inline-block;
    padding: 6px 12px;
    border-radius: 12px;
    font-size: 12px;
    text-align: center;
    user-select: none;
    margin-left: 10px;
    vertical-align: middle;
  `;

  addAllBtn.onclick = async (e) => {
    e.stopPropagation();
    e.preventDefault();

    // Find all unprocessed questions
    const allBtns = document.querySelectorAll<HTMLElement>(`.${CSS_CLASSES.ankiButton}`);
    const toAdd = Array.from(allBtns).filter(btn => btn.textContent !== 'Added');
    const total = toAdd.length;

    if (total === 0) {
      addAllBtn.textContent = "All added!";
      return;
    }

    for (let i = 0; i < toAdd.length; i++) {
      addAllBtn.textContent = `${i + 1}/${total}`;
      addAllBtn.style.opacity = "0.7";
      toAdd[i].click();
      // Wait for the button to finish processing
      await new Promise(r => setTimeout(r, 100));
      while (toAdd[i].textContent === 'Adding...') {
        await new Promise(r => setTimeout(r, 50));
      }
    }

    addAllBtn.textContent = "All added!";
    addAllBtn.style.backgroundColor = "#4a8";
    addAllBtn.style.opacity = "1";
  };

  taskName.insertAdjacentElement('afterend', addAllBtn);
}

// "Add All Incorrect" button for results page — only adds questions marked incorrect
function injectAddAllIncorrectButton() {
  const addAllBtn = document.querySelector<HTMLElement>(`.${CSS_CLASSES.addAllButton}`);
  if (!addAllBtn || document.querySelector(`.${CSS_CLASSES.addAllIncorrectButton}`)) return;

  const btn = document.createElement("div");
  btn.className = CSS_CLASSES.addAllIncorrectButton;
  btn.textContent = "Add All Incorrect to Anki";
  btn.style.cssText = `
    background-color: #d55;
    color: #f8f8f8;
    cursor: pointer;
    display: inline-block;
    padding: 6px 12px;
    border-radius: 12px;
    font-size: 12px;
    text-align: center;
    user-select: none;
    margin-left: 6px;
    vertical-align: middle;
  `;

  btn.onclick = async (e) => {
    e.stopPropagation();
    e.preventDefault();

    // Find all question elements that have an "Incorrect" answer result
    const questions = document.querySelectorAll<HTMLElement>(SELECTORS.resultQuestion);
    const incorrectBtns: HTMLElement[] = [];

    questions.forEach((questionEl) => {
      const answerResult = questionEl.querySelector<HTMLElement>('span.answerResult');
      if (answerResult && answerResult.textContent?.trim() === 'Incorrect') {
        const questionId = questionEl.id.replace('question-', '');
        const explanationEl = document.querySelector<HTMLElement>(`#questionExplanation-${questionId}`);
        if (explanationEl) {
          const ankiBtn = explanationEl.querySelector<HTMLElement>(`.${CSS_CLASSES.ankiButton}`);
          if (ankiBtn && ankiBtn.textContent !== 'Added') {
            incorrectBtns.push(ankiBtn);
          }
        }
      }
    });

    if (incorrectBtns.length === 0) {
      btn.textContent = "All added!";
      return;
    }

    for (let i = 0; i < incorrectBtns.length; i++) {
      btn.textContent = `${i + 1}/${incorrectBtns.length}`;
      btn.style.opacity = "0.7";
      incorrectBtns[i].click();
      await new Promise(r => setTimeout(r, 100));
      while (incorrectBtns[i].textContent === 'Adding...') {
        await new Promise(r => setTimeout(r, 50));
      }
    }

    btn.textContent = "All added!";
    btn.style.backgroundColor = "#4a8";
    btn.style.opacity = "1";
  };

  addAllBtn.insertAdjacentElement('afterend', btn);
}

export default defineContentScript({
  matches: ["*://*.mathacademy.com/*"],
  main() {
    // Inject TeX extractor script early for text mode
    injectTexExtractor();

    console.log(`[Autobot] Loaded on: ${getLessonName()}`);

    // Inject on existing steps (lesson page)
    const steps = document.querySelectorAll(SELECTORS.step);
    console.log(`[Autobot] Initial scan: ${steps.length} step(s)`);
    steps.forEach((step, i) => injectButton(step, i));

    // Process results page if present
    processResultsPage();

    // Watch for dynamically loaded content (lesson page)
    const stepsContainer = document.querySelector(SELECTORS.steps);
    if (stepsContainer) {
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
    }

    // Watch for results page content (results page)
    // Container may not exist yet, so watch for it to appear
    const setupResultsObserver = (container: Element) => {
      processResultsPage();
      new MutationObserver(() => processResultsPage())
        .observe(container, { childList: true, subtree: true });
    };

    const resultsContainer = document.querySelector(SELECTORS.resultsContainer)
      || document.querySelector(SELECTORS.assessmentContainer);
    if (resultsContainer) {
      setupResultsObserver(resultsContainer);
    } else {
      // Wait for container to appear
      const bodyObserver = new MutationObserver(() => {
        const container = document.querySelector(SELECTORS.resultsContainer)
          || document.querySelector(SELECTORS.assessmentContainer);
        if (container) {
          bodyObserver.disconnect();
          setupResultsObserver(container);
        }
      });
      bodyObserver.observe(document.body, { childList: true, subtree: true });
    }
  },
});
