import { getLessonName } from "@/utils/dom";

export interface LessonStepIdentity {
  lessonSlug: string;
  stepId: string;
  stepName: string;
}

export interface ResultQuestionIdentity {
  lessonSlug: string;
  questionId: string;
}

export function slugifyLessonName(lessonName: string): string {
  return lessonName.toLowerCase().trim().replace(/\s+/g, "-");
}

export function getLessonSlug(): string {
  return slugifyLessonName(getLessonName());
}

export function getStepName(step: Element): string {
  return (
    step
      .querySelector(
        ".stepName, .questionWidget-stepName, .questionWidget-title",
      )
      ?.textContent?.trim() || "unnamed"
  );
}

function sanitizeIdPart(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown"
  );
}

export function getLessonStepId(step: Element, fallbackName: string): string {
  const stepEl = step as HTMLElement;
  const stepId = stepEl.id.replace(/^step-/, "").trim();
  if (stepId.length > 0 && stepId !== stepEl.id) return stepId;

  const dataId =
    stepEl.getAttribute("data-step-id") || stepEl.getAttribute("data-id");
  if (dataId?.trim()) return sanitizeIdPart(dataId);

  return `name-${sanitizeIdPart(fallbackName)}`;
}

export function getResultQuestionId(questionEl: HTMLElement): string {
  return questionEl.id.replace(/^question-/, "").trim() || "unknown";
}

export function createLessonStepIdentity(step: Element): LessonStepIdentity {
  const stepName = getStepName(step);
  return {
    lessonSlug: getLessonSlug(),
    stepId: getLessonStepId(step, stepName),
    stepName,
  };
}

export function createResultQuestionIdentity(
  questionEl: HTMLElement,
): ResultQuestionIdentity {
  return {
    lessonSlug: getLessonSlug(),
    questionId: getResultQuestionId(questionEl),
  };
}
