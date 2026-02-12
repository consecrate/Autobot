import { captureElement } from './capture';
import { extractContent, fetchImageAsBase64, addWhiteBackground } from './extract';
import type { ExtractResult } from './extract';
import type { AutobotSettings } from './settings';
import type { LabelFormat } from './constants';

export interface CardElements {
  front: HTMLElement;
  back: HTMLElement;
  choices?: HTMLElement | null;
  graphic?: HTMLElement | null;
}

export interface AddCardParams {
  marker: string;
  elements: CardElements;
  settings: AutobotSettings;
  tags: string[];
  prepareCapture?: () => (() => void);  // returns restore function
}

/**
 * Finds and deletes Anki notes matching the given marker.
 */
export async function removeNote(marker: string): Promise<void> {
  const noteIds = await browser.runtime.sendMessage({
    action: 'findNotes',
    query: `"Front:${marker}"`,
  });
  if (noteIds?.length) {
    await browser.runtime.sendMessage({
      action: 'deleteNotes',
      notes: noteIds,
    });
  }
}

/**
 * Processes an ExtractResult: fetches images, optionally adds white background,
 * stores via storeMediaFile, and replaces placeholders with <img> tags.
 */
async function processExtractedContent(
  result: ExtractResult,
  fixDarkMode: boolean,
  timestamp: number,
  imageCounterRef: { value: number },
): Promise<string> {
  let processedContent = result.content;

  for (const img of result.images) {
    try {
      let base64Data = await fetchImageAsBase64(img.src);

      if (fixDarkMode) {
        base64Data = await addWhiteBackground(base64Data);
      }

      const filename = `autobot-${timestamp}-img${imageCounterRef.value++}.png`;

      await browser.runtime.sendMessage({
        action: 'storeMediaFile',
        filename,
        data: base64Data,
      });

      processedContent = processedContent.replace(
        img.placeholder,
        `<img src="${filename}">`,
      );

      console.log(`[Autobot] Stored option image: ${img.src} -> ${filename}`);
    } catch (e) {
      console.error(`[Autobot] Failed to process image ${img.src}:`, e);
      processedContent = processedContent.replace(img.placeholder, '[Image]');
    }
  }

  return processedContent;
}

/**
 * Captures an element as PNG, stores it via storeMediaFile, returns an <img> tag.
 */
async function captureAndStore(
  element: HTMLElement,
  label: string,
  timestamp: number,
): Promise<string> {
  const dataUrl = await captureElement(element);
  const filename = `autobot-${timestamp}-${label}.png`;
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  await browser.runtime.sendMessage({
    action: 'storeMediaFile',
    filename,
    data: base64,
  });
  return `<img src="${filename}">`;
}

/**
 * Captures a graphic element, stores it, and returns an <img> tag with <br>.
 * Optionally adds white background for dark mode fix.
 */
async function captureGraphicText(
  graphic: HTMLElement,
  fixDarkMode: boolean,
  timestamp: number,
): Promise<string> {
  const graphicImg = await captureElement(graphic);
  const graphicFilename = `autobot-${timestamp}-graphic.png`;
  let graphicData = graphicImg.replace(/^data:image\/png;base64,/, '');

  if (fixDarkMode) {
    graphicData = await addWhiteBackground(graphicData);
  }

  await browser.runtime.sendMessage({
    action: 'storeMediaFile',
    filename: graphicFilename,
    data: graphicData,
  });

  return `<img src="${graphicFilename}"><br>`;
}

/**
 * Adds a card in text mode: extracts content from DOM elements.
 */
async function addCardTextMode(
  marker: string,
  elements: CardElements,
  settings: AutobotSettings,
  tags: string[],
): Promise<void> {
  const { front, back, choices, graphic } = elements;
  const { deck, includeChoices, labelFormat, fixDarkMode } = settings;
  const timestamp = Date.now();
  const imageCounterRef = { value: 0 };

  let frontText = marker;

  // Add graphic as image if present
  if (graphic) {
    frontText += await captureGraphicText(graphic, fixDarkMode, timestamp);
  }

  // Add front text
  const frontResult = extractContent(front);
  frontText += await processExtractedContent(frontResult, fixDarkMode, timestamp, imageCounterRef);

  // Add choices if enabled
  if (includeChoices && choices) {
    const choicesResult = extractContent(choices, { labelFormat });
    frontText += await processExtractedContent(choicesResult, fixDarkMode, timestamp, imageCounterRef);
  }

  const backResult = extractContent(back);
  const backText = await processExtractedContent(backResult, fixDarkMode, timestamp, imageCounterRef);

  await browser.runtime.sendMessage({
    action: 'addTextNote',
    deckName: deck,
    front: frontText,
    back: backText,
    tags,
  });
}

/**
 * Adds a card in image mode: captures DOM elements as screenshots.
 */
async function addCardImageMode(
  marker: string,
  elements: CardElements,
  settings: AutobotSettings,
  tags: string[],
): Promise<void> {
  const { front, back, choices, graphic } = elements;
  const { deck, includeChoices } = settings;
  const timestamp = Date.now();

  let frontHtml = marker;

  // Capture graphic if present
  if (graphic) {
    frontHtml += await captureAndStore(graphic, 'graphic', timestamp) + '<br>';
  }

  // Capture front (question text)
  frontHtml += await captureAndStore(front, 'front', timestamp);

  // Capture choices if enabled (with temporary style stripping)
  if (includeChoices && choices) {
    const circles = choices.querySelectorAll('.questionWidget-choiceLetterCircle');
    const savedStyles: (string | null)[] = [];

    circles.forEach((circle, idx) => {
      savedStyles[idx] = circle.getAttribute('style');
      circle.removeAttribute('style');
    });

    try {
      frontHtml += '<br>' + await captureAndStore(choices, 'choices', timestamp);
    } finally {
      circles.forEach((circle, idx) => {
        if (savedStyles[idx]) {
          circle.setAttribute('style', savedStyles[idx]);
        }
      });
    }
  }

  // Capture back
  const backHtml = await captureAndStore(back, 'back', timestamp);

  await browser.runtime.sendMessage({
    action: 'addTextNote',
    deckName: deck,
    front: frontHtml,
    back: backHtml,
    tags,
  });
}

/**
 * Adds a card to Anki. Entry point that dispatches to text or image mode.
 * If prepareCapture is provided, it runs before capture and its restore function
 * runs in a finally block.
 */
export async function addCard(params: AddCardParams): Promise<void> {
  const { marker, elements, settings, tags, prepareCapture } = params;
  const restore = prepareCapture?.();

  try {
    if (settings.mode === 'text') {
      await addCardTextMode(marker, elements, settings, tags);
    } else {
      await addCardImageMode(marker, elements, settings, tags);
    }
  } finally {
    restore?.();
  }
}
