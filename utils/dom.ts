// MathAcademy DOM selectors
export const SELECTORS = {
    steps: '#steps',
    step: '.step',
    example: '.example',
    question: '.questionWidget',
    exampleFront: '.exampleQuestion',
    exampleBack: '.exampleExplanation',
    questionFront: '.questionWidget-text',
    questionGraphic: '.questionWidget-graphic',
    questionChoices: '.questionWidget-choicesTable',
    questionBack: '.questionWidget-explanation',
} as const;

export type StepType = 'example' | 'question' | null;

export function getStepType(step: Element): StepType {
    // Check both the step itself AND its children
    if (step.matches(SELECTORS.example) || step.querySelector(SELECTORS.example)) return 'example';
    if (step.matches(SELECTORS.question) || step.querySelector(SELECTORS.question)) return 'question';
    return null;
}

export function getFrontBackElements(step: Element, type: StepType) {
    if (type === 'example') {
        return {
            front: step.querySelector<HTMLElement>(SELECTORS.exampleFront),
            back: step.querySelector<HTMLElement>(SELECTORS.exampleBack),
            choices: null,
            graphic: null,
        };
    }
    if (type === 'question') {
        return {
            front: step.querySelector<HTMLElement>(SELECTORS.questionFront),
            back: step.querySelector<HTMLElement>(SELECTORS.questionBack),
            choices: step.querySelector<HTMLElement>(SELECTORS.questionChoices),
            graphic: step.querySelector<HTMLElement>(SELECTORS.questionGraphic),
        };
    }
    return { front: null, back: null, choices: null, graphic: null };
}

export function getLessonName(): string {
    return document.title.split(' - ')[0] || 'mathacademy';
}
