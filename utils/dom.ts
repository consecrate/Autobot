// MathAcademy DOM selectors
export const SELECTORS = {
  steps: "#steps",
  step: ".step",
  example: ".example",
  question: ".questionWidget",
  exampleFront: ".exampleQuestion",
  exampleBack: ".exampleExplanation",
  questionText: ".questionWidget-text",
  questionFront: ".questionWidget-body",
  questionGraphic: ".questionWidget-graphic",
  questionChoices: ".questionWidget-choicesTable",
  questionBack: ".questionWidget-explanation",
  continueButton: ".continueButton",
  // Results page selectors
  resultsContainer: ".kpList",
  assessmentContainer: ".testAnswers",
  resultQuestion: '.question[id^="question-"]',
  resultExplanation: '.questionExplanation[id^="questionExplanation-"]',
  taskNameUnlocked: ".taskNameUnlocked",
  taskAnswersHeader: ".taskExpanded",
} as const;

export type StepType = "example" | "question" | null;

export function getStepType(step: Element): StepType {
  // Check both the step itself AND its children
  if (step.matches(SELECTORS.example) || step.querySelector(SELECTORS.example))
    return "example";
  if (
    step.matches(SELECTORS.question) ||
    step.querySelector(SELECTORS.question)
  )
    return "question";
  return null;
}

export function getFrontBackElements(step: Element, type: StepType) {
  if (type === "example") {
    return {
      front: step.querySelector<HTMLElement>(SELECTORS.exampleFront),
      back: step.querySelector<HTMLElement>(SELECTORS.exampleBack),
      choices: null,
      graphic: null,
    };
  }
  if (type === "question") {
    const questionText = step.querySelector<HTMLElement>(SELECTORS.questionText);
    const questionBody = step.querySelector<HTMLElement>(SELECTORS.questionFront);

    const front = questionText ?? questionBody;
    const frontSupplement =
      questionText &&
      questionBody &&
      questionText !== questionBody &&
      !questionText.contains(questionBody) &&
      !questionBody.contains(questionText)
        ? questionBody
        : null;

    return {
      front,
      frontSupplement,
      back: step.querySelector<HTMLElement>(SELECTORS.questionBack),
      choices: step.querySelector<HTMLElement>(SELECTORS.questionChoices),
      graphic: step.querySelector<HTMLElement>(SELECTORS.questionGraphic),
    };
  }
  return {
    front: null,
    frontSupplement: null,
    back: null,
    choices: null,
    graphic: null,
  };
}

export function getLessonName(): string {
  return document.title.split(" - ")[0] || "mathacademy";
}
