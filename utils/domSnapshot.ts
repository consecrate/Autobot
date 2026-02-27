import {
  SELECTORS,
  getFrontBackElements,
  getLessonName,
  getStepType,
} from "@/utils/dom";
import type {
  DomSnippet,
  StepStructureSummary,
  StructureSnapshot,
} from "@/utils/messages";

interface SnapshotOptions {
  maxSnippets?: number;
  maxSnippetLength?: number;
}

const DEFAULT_MAX_SNIPPETS = 16;
const DEFAULT_MAX_SNIPPET_LENGTH = 5000;

function truncateSnippet(html: string, maxLength: number): string {
  if (html.length <= maxLength) return html;
  return `${html.slice(0, maxLength)}\n<!-- truncated -->`;
}

function extractSnippets(
  maxSnippets: number,
  maxSnippetLength: number,
): DomSnippet[] {
  const selectorsToCapture = [
    SELECTORS.steps,
    SELECTORS.step,
    SELECTORS.example,
    SELECTORS.question,
    SELECTORS.exampleFront,
    SELECTORS.exampleBack,
    SELECTORS.questionText,
    SELECTORS.questionFront,
    SELECTORS.questionChoices,
    SELECTORS.questionBack,
    SELECTORS.resultsContainer,
    SELECTORS.assessmentContainer,
  ];

  const snippets: DomSnippet[] = [];

  for (const selector of selectorsToCapture) {
    if (snippets.length >= maxSnippets) break;

    const elements = document.querySelectorAll<HTMLElement>(selector);
    const maxPerSelector = selector === SELECTORS.step ? 3 : 1;

    for (let i = 0; i < elements.length && i < maxPerSelector; i++) {
      if (snippets.length >= maxSnippets) break;
      snippets.push({
        selector,
        html: truncateSnippet(elements[i].outerHTML, maxSnippetLength),
      });
    }
  }

  return snippets;
}

function getStepName(step: Element): string {
  return (
    step
      .querySelector(
        ".stepName, .questionWidget-stepName, .questionWidget-title",
      )
      ?.textContent?.trim() || "unnamed"
  );
}

export function buildStructureSnapshot(
  options: SnapshotOptions = {},
): StructureSnapshot {
  const maxSnippets = options.maxSnippets ?? DEFAULT_MAX_SNIPPETS;
  const maxSnippetLength =
    options.maxSnippetLength ?? DEFAULT_MAX_SNIPPET_LENGTH;

  const selectorList = [
    SELECTORS.steps,
    SELECTORS.step,
    SELECTORS.example,
    SELECTORS.question,
    SELECTORS.exampleFront,
    SELECTORS.exampleBack,
    SELECTORS.questionText,
    SELECTORS.questionFront,
    SELECTORS.questionChoices,
    SELECTORS.questionBack,
    SELECTORS.continueButton,
    SELECTORS.resultsContainer,
    SELECTORS.assessmentContainer,
    SELECTORS.resultQuestion,
    SELECTORS.resultExplanation,
  ];

  const selectors = Object.fromEntries(
    selectorList.map((selector) => {
      const count = document.querySelectorAll(selector).length;
      return [selector, { found: count > 0, count }];
    }),
  );

  const stepElements = Array.from(document.querySelectorAll(SELECTORS.step));
  const steps: StepStructureSummary[] = stepElements.map((step, index) => {
    const stepType = getStepType(step);
    const { front, back, choices, graphic } = getFrontBackElements(
      step,
      stepType,
    );

    return {
      index,
      id: step.id || null,
      name: getStepName(step),
      type: stepType ?? "unknown",
      hasFront: Boolean(front),
      hasBack: Boolean(back),
      hasChoices: Boolean(choices),
      hasGraphic: Boolean(graphic),
    };
  });

  const stepSummary = {
    total: steps.length,
    examples: steps.filter((step) => step.type === "example").length,
    questions: steps.filter((step) => step.type === "question").length,
    unknown: steps.filter((step) => step.type === "unknown").length,
  };

  const warnings: string[] = [];
  if (
    steps.length === 0 &&
    !document.querySelector(SELECTORS.resultsContainer) &&
    !document.querySelector(SELECTORS.assessmentContainer)
  ) {
    warnings.push(
      "No lesson steps or results containers were detected on this page.",
    );
  }
  if (!document.querySelector(SELECTORS.steps)) {
    warnings.push("Expected lesson container (#steps) was not found.");
  }
  if (stepSummary.unknown > 0) {
    warnings.push(
      `${stepSummary.unknown} step(s) did not match known example/question selectors.`,
    );
  }

  return {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    title: document.title,
    lessonName: getLessonName(),
    selectors,
    stepSummary,
    steps,
    snippets: extractSnippets(maxSnippets, maxSnippetLength),
    warnings,
  };
}
