import { injectTexExtractor } from "@/utils/extract";
import {
  SELECTORS,
  getStepType,
  getFrontBackElements,
  getLessonName,
} from "@/utils/dom";
import { CSS_CLASSES } from "@/utils/constants";
import { getAllSettings } from "@/utils/settings";
import { runCardPipeline } from "@/utils/pipeline/cardPipeline";
import {
  createLessonStepIdentity,
  createResultQuestionIdentity,
  getStepName,
} from "@/utils/pipeline/pageAdapter";
import {
  buildLessonStepMarkers,
  buildResultMarkers,
  findNoteIdsByMarkers,
  getLookupMarkers,
  normalizeMarker,
  prefetchLessonMarkers,
  removeNotesByMarkers,
  type MarkerLookup,
} from "@/utils/pipeline/markerService";
import type {
  AutobotMessage,
  ExtractStructureResponse,
} from "@/utils/messages";
import { buildStructureSnapshot } from "@/utils/domSnapshot";

const resultsAddHandlers = new WeakMap<HTMLElement, () => Promise<boolean>>();
const pendingStepInjections = new Set<Element>();
const inFlightStepInjections = new WeakSet<Element>();

const STEP_RELEVANT_NODE_SELECTORS = [
  SELECTORS.example,
  SELECTORS.question,
  SELECTORS.questionText,
  SELECTORS.questionFront,
  SELECTORS.exampleBack,
  SELECTORS.questionBack,
  SELECTORS.continueButton,
  ".tutorial",
].join(", ");

const RESULTS_RELEVANT_NODE_SELECTORS = [
  SELECTORS.resultQuestion,
  SELECTORS.resultExplanation,
  SELECTORS.taskNameUnlocked,
  SELECTORS.taskAnswersHeader,
  `.${CSS_CLASSES.ankiButton}`,
  `.${CSS_CLASSES.addAllButton}`,
  `.${CSS_CLASSES.addAllIncorrectButton}`,
].join(", ");

const PRIMARY_STEP_BUTTON_STYLE = `
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

const PRIMARY_RESULTS_BUTTON_STYLE = `
    ${PRIMARY_STEP_BUTTON_STYLE}
    margin-top: 12px;
  `;

const ADD_ALL_BUTTON_STYLE = `
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

const ADD_ALL_INCORRECT_BUTTON_STYLE = `
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

let stepFlushTimer: number | undefined;
let resultsProcessTimer: number | undefined;

let pageMarkerCache = new Set<string>();
let pageMarkerCacheLessonSlug: string | null = null;
let pageMarkerCacheLoaded = false;
let pageMarkerCacheInflight: Promise<void> | null = null;

type ToggleStatus = "Adding..." | "Removing..." | "Added" | "Error";

type ObserverMetrics = {
  stepSchedule: {
    called: number;
    skippedDisconnected: number;
    skippedHasButton: number;
    skippedInFlight: number;
    queued: number;
    flushAlreadyScheduled: number;
  };
  stepFlush: {
    cycles: number;
    candidates: number;
    injected: number;
    skippedDisconnected: number;
    skippedHasButton: number;
    skippedInFlight: number;
    skippedEmpty: number;
  };
  lessonObserver: {
    totalRecords: number;
    attributeRecords: number;
    addedNodesInspected: number;
  };
  resultsMutations: {
    totalRecords: number;
    addedNodesInspected: number;
    removedNodesInspected: number;
    relevantMatches: number;
  };
  resultsProcessing: {
    debounceSkipped: number;
    scheduled: number;
    runs: number;
  };
};

const DEBUG_METRICS_ENABLED = (() => {
  try {
    return window.localStorage.getItem("autobot_debug_metrics") === "true";
  } catch {
    return false;
  }
})();

const observerMetrics: ObserverMetrics = {
  stepSchedule: {
    called: 0,
    skippedDisconnected: 0,
    skippedHasButton: 0,
    skippedInFlight: 0,
    queued: 0,
    flushAlreadyScheduled: 0,
  },
  stepFlush: {
    cycles: 0,
    candidates: 0,
    injected: 0,
    skippedDisconnected: 0,
    skippedHasButton: 0,
    skippedInFlight: 0,
    skippedEmpty: 0,
  },
  lessonObserver: {
    totalRecords: 0,
    attributeRecords: 0,
    addedNodesInspected: 0,
  },
  resultsMutations: {
    totalRecords: 0,
    addedNodesInspected: 0,
    removedNodesInspected: 0,
    relevantMatches: 0,
  },
  resultsProcessing: {
    debounceSkipped: 0,
    scheduled: 0,
    runs: 0,
  },
};

let metricsLogTimer: number | undefined;

function metricInc(
  section: keyof ObserverMetrics,
  key: string,
  amount = 1,
): void {
  if (!DEBUG_METRICS_ENABLED) return;
  const bucket = observerMetrics[section] as Record<string, number>;
  bucket[key] = (bucket[key] ?? 0) + amount;
}

function logObserverMetricsSummary(): void {
  if (!DEBUG_METRICS_ENABLED) return;

  const s = observerMetrics.stepSchedule;
  const f = observerMetrics.stepFlush;
  const l = observerMetrics.lessonObserver;
  const r = observerMetrics.resultsMutations;
  const p = observerMetrics.resultsProcessing;

  console.log(
    `[Autobot][metrics] stepSchedule(calls=${s.called}, queued=${s.queued}, skip:disc=${s.skippedDisconnected}, btn=${s.skippedHasButton}, inflight=${s.skippedInFlight}, debounce=${s.flushAlreadyScheduled}) stepFlush(cycles=${f.cycles}, cand=${f.candidates}, injected=${f.injected}, skip:empty=${f.skippedEmpty}, disc=${f.skippedDisconnected}, btn=${f.skippedHasButton}, inflight=${f.skippedInFlight}) lessonObs(records=${l.totalRecords}, attr=${l.attributeRecords}, added=${l.addedNodesInspected}) resultsMut(records=${r.totalRecords}, added=${r.addedNodesInspected}, removed=${r.removedNodesInspected}, relevant=${r.relevantMatches}) resultsProc(scheduled=${p.scheduled}, debounceSkip=${p.debounceSkipped}, runs=${p.runs})`,
  );
}

function startObserverMetricsLogging(): void {
  if (!DEBUG_METRICS_ENABLED || metricsLogTimer !== undefined) return;
  metricsLogTimer = window.setInterval(logObserverMetricsSummary, 15_000);
}

function ensurePageMarkerCacheScope(lessonSlug: string): void {
  if (pageMarkerCacheLessonSlug === lessonSlug) return;

  pageMarkerCacheLessonSlug = lessonSlug;
  pageMarkerCache = new Set<string>();
  pageMarkerCacheLoaded = false;
  pageMarkerCacheInflight = null;
}

function cacheAddMarkers(markers: string[]): void {
  markers.forEach((marker) => pageMarkerCache.add(normalizeMarker(marker)));
}

function cacheDeleteMarkers(markers: string[]): void {
  markers.forEach((marker) => pageMarkerCache.delete(normalizeMarker(marker)));
}

function cacheHasLookup(lookup: MarkerLookup): boolean {
  return getLookupMarkers(lookup)
    .map((marker) => normalizeMarker(marker))
    .some((marker) => pageMarkerCache.has(marker));
}

async function ensurePageMarkerCacheLoaded(lessonSlug: string): Promise<void> {
  ensurePageMarkerCacheScope(lessonSlug);
  if (pageMarkerCacheLoaded) return;

  if (!pageMarkerCacheInflight) {
    pageMarkerCacheInflight = prefetchLessonMarkers(lessonSlug)
      .then((markers) => {
        pageMarkerCache = markers;
        pageMarkerCacheLoaded = true;
      })
      .catch((error) => {
        console.warn("[Autobot] Marker prefetch failed:", error);
      })
      .finally(() => {
        pageMarkerCacheInflight = null;
      });
  }

  await pageMarkerCacheInflight;
}

async function runBatchAdd(
  button: HTMLElement,
  handlers: Array<() => Promise<boolean>>,
): Promise<void> {
  if (handlers.length === 0) {
    button.textContent = "All added!";
    return;
  }

  for (let i = 0; i < handlers.length; i++) {
    button.textContent = `${i + 1}/${handlers.length}`;
    button.style.opacity = "0.7";
    await handlers[i]();
  }

  button.textContent = "All added!";
  button.style.backgroundColor = "#4a8";
  button.style.opacity = "1";
}

function scheduleStepInjection(step: Element): void {
  metricInc("stepSchedule", "called");

  if (!step.isConnected) {
    metricInc("stepSchedule", "skippedDisconnected");
    return;
  }
  if (hasFreshStepButton(step)) {
    metricInc("stepSchedule", "skippedHasButton");
    return;
  }
  if (inFlightStepInjections.has(step)) {
    metricInc("stepSchedule", "skippedInFlight");
    return;
  }

  if (!pendingStepInjections.has(step)) {
    pendingStepInjections.add(step);
    metricInc("stepSchedule", "queued");
  }

  if (stepFlushTimer !== undefined) {
    metricInc("stepSchedule", "flushAlreadyScheduled");
    return;
  }

  stepFlushTimer = window.setTimeout(() => {
    metricInc("stepFlush", "cycles");
    stepFlushTimer = undefined;
    const steps = Array.from(pendingStepInjections);
    pendingStepInjections.clear();
    metricInc("stepFlush", "candidates", steps.length);

    if (steps.length === 0) {
      metricInc("stepFlush", "skippedEmpty");
      return;
    }

    console.log(`[Autobot] Mutation: checking ${steps.length} step(s)`);
    steps.forEach((queuedStep) => {
      if (!queuedStep.isConnected) {
        metricInc("stepFlush", "skippedDisconnected");
        return;
      }
      if (hasFreshStepButton(queuedStep)) {
        metricInc("stepFlush", "skippedHasButton");
        return;
      }
      if (inFlightStepInjections.has(queuedStep)) {
        metricInc("stepFlush", "skippedInFlight");
        return;
      }

      inFlightStepInjections.add(queuedStep);
      metricInc("stepFlush", "injected");
      void injectButton(queuedStep).finally(() => {
        inFlightStepInjections.delete(queuedStep);
      });
    });
  }, 60);
}

function getStepAnkiButton(step: Element): HTMLElement | null {
  return step.querySelector<HTMLElement>(`.${CSS_CLASSES.ankiButton}`);
}

function hasFreshStepButton(step: Element): boolean {
  const existingButton = getStepAnkiButton(step);
  if (!existingButton) return false;

  const expectedMarker = buildLessonStepMarkers(
    createLessonStepIdentity(step),
  ).canonical;
  const buttonMarker = existingButton.dataset.autobotMarker;

  if (buttonMarker === expectedMarker) {
    return true;
  }

  existingButton.remove();
  return false;
}

function isNodeOrDescendantMatching(node: Element, selectors: string): boolean {
  return node.matches(selectors) || !!node.querySelector(selectors);
}

function isStepReadyMutationNode(node: Element): boolean {
  return isNodeOrDescendantMatching(node, STEP_RELEVANT_NODE_SELECTORS);
}

function scheduleStepMutationsFromAddedNode(node: Element): void {
  if (node.matches(SELECTORS.step)) {
    scheduleStepInjection(node);
    return;
  }

  node
    .querySelectorAll(SELECTORS.step)
    .forEach((nestedStep) => scheduleStepInjection(nestedStep));

  if (!isStepReadyMutationNode(node)) return;

  const parentStep = node.closest(SELECTORS.step);
  if (parentStep) {
    scheduleStepInjection(parentStep);
  }
}

function isResultsMutationNodeRelevant(node: Node): boolean {
  if (!(node instanceof Element)) return false;
  return isNodeOrDescendantMatching(node, RESULTS_RELEVANT_NODE_SELECTORS);
}

function shouldProcessResultsMutations(mutations: MutationRecord[]): boolean {
  metricInc("resultsMutations", "totalRecords", mutations.length);
  let hasRelevant = false;

  for (const mutation of mutations) {
    if (mutation.type !== "childList") continue;

    for (const node of Array.from(mutation.addedNodes)) {
      metricInc("resultsMutations", "addedNodesInspected");
      if (isResultsMutationNodeRelevant(node)) {
        metricInc("resultsMutations", "relevantMatches");
        hasRelevant = true;
      }
    }

    for (const node of Array.from(mutation.removedNodes)) {
      metricInc("resultsMutations", "removedNodesInspected");
      if (isResultsMutationNodeRelevant(node)) {
        metricInc("resultsMutations", "relevantMatches");
        hasRelevant = true;
      }
    }
  }

  return hasRelevant;
}

function scheduleResultsProcessing(): void {
  if (resultsProcessTimer !== undefined) {
    metricInc("resultsProcessing", "debounceSkipped");
    return;
  }

  metricInc("resultsProcessing", "scheduled");

  resultsProcessTimer = window.setTimeout(() => {
    resultsProcessTimer = undefined;
    metricInc("resultsProcessing", "runs");
    processResultsPage();
  }, 80);
}

function createAnkiToggleController(
  button: HTMLElement,
  lessonSlug: string,
  markerLookup: MarkerLookup,
  addHandler: () => Promise<void>,
) {
  let isAdded = false;

  const updateButton = (status?: ToggleStatus) => {
    if (status === "Adding..." || status === "Removing...") {
      button.textContent = status;
      button.style.opacity = "0.7";
    } else if (status === "Added") {
      button.textContent = "Added";
      button.style.backgroundColor = "#4a8";
      button.style.opacity = "1";
    } else if (status === "Error") {
      button.textContent = "Error";
      button.style.backgroundColor = "#d55";
      button.style.opacity = "1";
    } else {
      button.textContent = "Add to Anki";
      button.style.backgroundColor = "#5a9fd4";
      button.style.opacity = "1";
    }
  };

  const waitNextFrames = () =>
    new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );

  const initialize = async () => {
    const lookupMarkers = getLookupMarkers(markerLookup);

    await ensurePageMarkerCacheLoaded(lessonSlug);
    if (cacheHasLookup(markerLookup)) {
      isAdded = true;
      updateButton("Added");
      return;
    }

    const existingNotes = await findNoteIdsByMarkers(lookupMarkers);
    if (existingNotes?.length) {
      cacheAddMarkers(lookupMarkers);
      isAdded = true;
      updateButton("Added");
    }
  };

  const addIfNeeded = async (): Promise<boolean> => {
    if (isAdded) return false;

    updateButton("Adding...");
    await waitNextFrames();
    try {
      await addHandler();
      cacheAddMarkers([markerLookup.canonical]);
      isAdded = true;
      updateButton("Added");
      return true;
    } catch (e) {
      updateButton("Error");
      console.error("[Autobot] Error:", e);
      return false;
    }
  };

  const toggle = async (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (isAdded) {
      updateButton("Removing...");
      await waitNextFrames();
      try {
        const lookupMarkers = getLookupMarkers(markerLookup);
        await removeNotesByMarkers(lookupMarkers);
        cacheDeleteMarkers(lookupMarkers);
        isAdded = false;
        updateButton();
      } catch (err) {
        updateButton("Error");
        console.error("[Autobot] Error:", err);
      }
      return;
    }

    await addIfNeeded();
  };

  return {
    initialize,
    toggle,
    addIfNeeded,
  };
}

async function injectAnkiButton(step: Element) {
  // Skip if step is not visible (not yet solved)
  const stepEl = step as HTMLElement;
  if (
    stepEl.style.display === "none" ||
    getComputedStyle(stepEl).display === "none"
  ) {
    return false;
  }

  // Skip if this is a tutorial step
  if (stepEl.querySelector(".tutorial")) {
    return false;
  }

  const existingButton = getStepAnkiButton(step);
  if (existingButton) {
    if (hasFreshStepButton(step)) {
      return false;
    }
  }

  const type = getStepType(step);
  if (!type) return false;

  const identity = createLessonStepIdentity(step);
  const lesson = identity.lessonSlug;
  const markerLookup = buildLessonStepMarkers(identity);
  const marker = markerLookup.canonical;

  // Create the button - use only our own class to prevent MathAcademy from hiding it
  const ankiBtn = document.createElement("div");
  ankiBtn.className = CSS_CLASSES.ankiButton;
  ankiBtn.dataset.autobotMarker = marker;
  ankiBtn.textContent = "Add to Anki";
  ankiBtn.style.cssText = PRIMARY_STEP_BUTTON_STYLE;

  const controller = createAnkiToggleController(
    ankiBtn,
    lesson,
    markerLookup,
    async () => {
      const settings = await getAllSettings();
      const { front, frontSupplement, back, choices, graphic } =
        getFrontBackElements(
        step,
        type,
        );
      if (!front || !back) throw new Error("Elements not found");

      await runCardPipeline({
        marker,
        elements: { front, frontSupplement, back, choices, graphic },
        settings,
        tags: ["mathacademy", lesson],
      });
    },
  );

  await controller.initialize();
  ankiBtn.onclick = controller.toggle;

  // Find the specific Continue button for this step
  // Step ID is typically "step-{id}", and continue button is "continueButton-{id}"
  const stepId = stepEl.id.replace(/^step-/, "");
  const continueBtnId = `continueButton-${stepId}`;
  let continueBtn = document.getElementById(continueBtnId);

  // If found, check if it's visible
  if (
    continueBtn &&
    (continueBtn.style.display === "none" ||
      getComputedStyle(continueBtn).display === "none")
  ) {
    continueBtn = null;
  }

  // Get the explanation container (works for both example and question types)
  const explanation =
    step.querySelector<HTMLElement>(SELECTORS.exampleBack) ||
    step.querySelector<HTMLElement>(SELECTORS.questionBack);

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
        const isHidden =
          continueBtn!.style.display === "none" ||
          getComputedStyle(continueBtn!).display === "none";
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
      observer.observe(continueBtn, {
        attributes: true,
        attributeFilter: ["style"],
      });
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
  const prefix = index !== undefined ? `#${index + 1}` : "";

  const btnAdded = await injectAnkiButton(step);

  if (btnAdded) {
    console.log(`[Autobot] ${prefix} "${name}" (${type}) → injected`);
  } else {
    console.log(
      `[Autobot] ${prefix} "${name}" (${type}) → skipped (already processed)`,
    );
  }
}

// Results page: inject button for each question/explanation pair
async function injectResultsPageButton(
  questionEl: HTMLElement,
  explanationEl: HTMLElement,
) {
  const identity = createResultQuestionIdentity(questionEl);
  const lesson = identity.lessonSlug;
  const markerLookup = buildResultMarkers(identity);
  const marker = markerLookup.canonical;

  const ankiBtn = document.createElement("div");
  ankiBtn.className = CSS_CLASSES.ankiButton;
  ankiBtn.textContent = "Add to Anki";
  ankiBtn.style.cssText = PRIMARY_RESULTS_BUTTON_STYLE;

  const controller = createAnkiToggleController(
    ankiBtn,
    lesson,
    markerLookup,
    async () => {
      const settings = await getAllSettings();

      // Front = question text, Back = explanation
      const questionText =
        questionEl.querySelector<HTMLElement>(".questionText");
      if (!questionText) throw new Error("Question text not found");

      if (settings.mode === "text") {
        // Clone questionText and remove the answer table before extraction
        const questionClone = questionText.cloneNode(true) as HTMLElement;
        const tableToRemove = questionClone.querySelector("table");
        tableToRemove?.remove();

        await runCardPipeline({
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
            explanationEl.style.display = "block";
            const originalBtnDisplay = ankiBtn.style.display;
            ankiBtn.style.display = "none";

            return () => {
              ankiBtn.style.display = originalBtnDisplay;
              explanationEl.style.display = originalExplanationDisplay;
            };
          },
        });
      } else {
        // Image mode: pass questionText directly (table hidden via prepareCapture)
        await runCardPipeline({
          marker,
          elements: {
            front: questionText,
            back: explanationEl,
          },
          settings,
          tags: ["mathacademy", lesson, "results"],
          prepareCapture: () => {
            // Hide answer table inside questionText before capture
            const answerTable = questionText.querySelector("table");
            const originalTableDisplay = answerTable?.style.display;
            if (answerTable) answerTable.style.display = "none";

            // Ensure explanation is visible for capture
            const originalExplanationDisplay = explanationEl.style.display;
            explanationEl.style.display = "block";
            const originalBtnDisplay = ankiBtn.style.display;
            ankiBtn.style.display = "none";

            return () => {
              if (answerTable)
                answerTable.style.display = originalTableDisplay || "";
              ankiBtn.style.display = originalBtnDisplay;
              explanationEl.style.display = originalExplanationDisplay;
            };
          },
        });
      }
    },
  );

  await controller.initialize();
  ankiBtn.onclick = controller.toggle;
  resultsAddHandlers.set(ankiBtn, controller.addIfNeeded);

  // Final check before appending
  if (!explanationEl.querySelector(`.${CSS_CLASSES.ankiButton}`)) {
    explanationEl.appendChild(ankiBtn);
  }
  return true;
}

function processResultsPage() {
  const container =
    document.querySelector(SELECTORS.resultsContainer) ||
    document.querySelector(SELECTORS.assessmentContainer);
  const questions = document.querySelectorAll<HTMLElement>(
    SELECTORS.resultQuestion,
  );
  console.log(
    `[Autobot] Results: container=${!!container}, questions=${questions.length}`,
  );
  let processed = 0;

  questions.forEach((questionEl) => {
    const questionId = createResultQuestionIdentity(questionEl).questionId;
    const explanationEl = document.querySelector<HTMLElement>(
      `#questionExplanation-${questionId}`,
    );

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
  const taskName =
    document.querySelector<HTMLElement>(SELECTORS.taskNameUnlocked) ||
    document.querySelector<HTMLElement>(SELECTORS.taskAnswersHeader);
  if (!taskName || taskName.dataset.autobotAddAll) return;

  taskName.dataset.autobotAddAll = "true";

  const addAllBtn = document.createElement("div");
  addAllBtn.className = CSS_CLASSES.addAllButton;
  addAllBtn.textContent = "Add All to Anki";
  addAllBtn.style.cssText = ADD_ALL_BUTTON_STYLE;

  addAllBtn.onclick = async (e) => {
    e.stopPropagation();
    e.preventDefault();

    // Find all unprocessed question handlers
    const allBtns = document.querySelectorAll<HTMLElement>(
      `.${CSS_CLASSES.ankiButton}`,
    );
    const toAdd = Array.from(allBtns)
      .map((btn) => resultsAddHandlers.get(btn))
      .filter((handler): handler is () => Promise<boolean> => !!handler);
    await runBatchAdd(addAllBtn, toAdd);
  };

  taskName.insertAdjacentElement("afterend", addAllBtn);
}

// "Add All Incorrect" button for results page — only adds questions marked incorrect
function injectAddAllIncorrectButton() {
  const addAllBtn = document.querySelector<HTMLElement>(
    `.${CSS_CLASSES.addAllButton}`,
  );
  if (
    !addAllBtn ||
    document.querySelector(`.${CSS_CLASSES.addAllIncorrectButton}`)
  )
    return;

  const btn = document.createElement("div");
  btn.className = CSS_CLASSES.addAllIncorrectButton;
  btn.textContent = "Add All Incorrect to Anki";
  btn.style.cssText = ADD_ALL_INCORRECT_BUTTON_STYLE;

  btn.onclick = async (e) => {
    e.stopPropagation();
    e.preventDefault();

    // Find all question elements that have an "Incorrect" answer result
    const questions = document.querySelectorAll<HTMLElement>(
      SELECTORS.resultQuestion,
    );
    const incorrectHandlers: Array<() => Promise<boolean>> = [];

    questions.forEach((questionEl) => {
      const answerResult =
        questionEl.querySelector<HTMLElement>("span.answerResult");
      if (answerResult && answerResult.textContent?.trim() === "Incorrect") {
        const questionId = createResultQuestionIdentity(questionEl).questionId;
        const explanationEl = document.querySelector<HTMLElement>(
          `#questionExplanation-${questionId}`,
        );
        if (explanationEl) {
          const ankiBtn = explanationEl.querySelector<HTMLElement>(
            `.${CSS_CLASSES.ankiButton}`,
          );
          if (ankiBtn) {
            const handler = resultsAddHandlers.get(ankiBtn);
            if (handler) {
              incorrectHandlers.push(handler);
            }
          }
        }
      }
    });

    await runBatchAdd(btn, incorrectHandlers);
  };

  addAllBtn.insertAdjacentElement("afterend", btn);
}

export default defineContentScript({
  matches: ["*://*.mathacademy.com/*"],
  main() {
    if (DEBUG_METRICS_ENABLED) {
      console.log(
        "[Autobot][metrics] Observer metrics enabled (localStorage autobot_debug_metrics=true)",
      );
      startObserverMetricsLogging();
    }

    browser.runtime.onMessage.addListener(
      (msg: AutobotMessage, _sender, sendResponse) => {
        if (msg.action !== "extractStructure") return;

        try {
          const snapshot = buildStructureSnapshot({
            maxSnippets: msg.maxSnippets,
            maxSnippetLength: msg.maxSnippetLength,
          });
          sendResponse(snapshot);
        } catch (error) {
          const response: ExtractStructureResponse = {
            error: error instanceof Error ? error.message : String(error),
          };
          sendResponse(response);
        }
        return true;
      },
    );

    // Inject TeX extractor script early for text mode
    injectTexExtractor();

    console.log(`[Autobot] Loaded on: ${getLessonName()}`);

    // Inject on existing steps (lesson page)
    const steps = document.querySelectorAll(SELECTORS.step);
    console.log(`[Autobot] Initial scan: ${steps.length} step(s)`);
    steps.forEach((step, i) => injectButton(step, i));

    // Process results page if present
    scheduleResultsProcessing();

    // Watch for dynamically loaded content (lesson page)
    const stepsContainer = document.querySelector(SELECTORS.steps);
    if (stepsContainer) {
      new MutationObserver((mutations) => {
        metricInc("lessonObserver", "totalRecords", mutations.length);
        for (const m of mutations) {
          // Handle attribute changes (e.g., style/display changes)
          if (m.type === "attributes" && m.target instanceof Element) {
            metricInc("lessonObserver", "attributeRecords");
            if (m.target.matches(SELECTORS.step)) {
              scheduleStepInjection(m.target);
            }
            continue;
          }

          // Handle added nodes
          for (const node of Array.from(m.addedNodes)) {
            metricInc("lessonObserver", "addedNodesInspected");
            if (!(node instanceof Element)) continue;
            scheduleStepMutationsFromAddedNode(node);
          }
        }
      }).observe(stepsContainer, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style"],
      });
    }

    // Watch for results page content (results page)
    // Container may not exist yet, so watch for it to appear
    const setupResultsObserver = (container: Element) => {
      scheduleResultsProcessing();
      new MutationObserver((mutations) => {
        if (shouldProcessResultsMutations(mutations)) {
          scheduleResultsProcessing();
        }
      }).observe(container, {
        childList: true,
        subtree: true,
      });
    };

    const resultsContainer =
      document.querySelector(SELECTORS.resultsContainer) ||
      document.querySelector(SELECTORS.assessmentContainer);
    if (resultsContainer) {
      setupResultsObserver(resultsContainer);
    } else {
      // Wait for container to appear
      const bodyObserver = new MutationObserver(() => {
        const container =
          document.querySelector(SELECTORS.resultsContainer) ||
          document.querySelector(SELECTORS.assessmentContainer);
        if (container) {
          bodyObserver.disconnect();
          setupResultsObserver(container);
        }
      });
      bodyObserver.observe(document.body, { childList: true, subtree: true });
    }
  },
});
