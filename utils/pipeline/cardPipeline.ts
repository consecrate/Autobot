import { captureElement } from "@/utils/capture";
import { addWhiteBackground, extractContent } from "@/utils/extract";
import type { CardBuildInput } from "@/utils/pipeline/types";
import { createMediaResolver } from "@/utils/pipeline/mediaResolver";

function throwIfRuntimeError(response: unknown, action: string): void {
  if (!response || typeof response !== "object") return;
  if (!("error" in response)) return;

  const error = (response as { error?: unknown }).error;
  if (typeof error === "string" && error.length > 0) {
    throw new Error(`[Autobot] ${action} failed: ${error}`);
  }
}

async function sendMessageOrThrow<T>(
  message: Record<string, unknown>,
  action: string,
): Promise<T> {
  const response = await browser.runtime.sendMessage(message);
  throwIfRuntimeError(response, action);
  return response as T;
}

async function captureAndStore(
  element: HTMLElement,
  label: string,
  resolver: ReturnType<typeof createMediaResolver>,
): Promise<string> {
  const dataUrl = await captureElement(element);
  const filename = await resolver.storeCapturedDataUrl(label, dataUrl);

  return `<img src="${filename}">`;
}

async function captureGraphicText(
  graphic: HTMLElement,
  fixDarkMode: boolean,
  resolver: ReturnType<typeof createMediaResolver>,
): Promise<string> {
  const graphicImg = await captureElement(graphic);
  let graphicData = graphicImg.replace(/^data:image\/png;base64,/, "");

  if (fixDarkMode) {
    graphicData = await addWhiteBackground(graphicData);
  }

  const graphicFilename = await resolver.storeCapturedBase64(
    "graphic",
    graphicData,
  );

  return `<img src="${graphicFilename}"><br>`;
}

async function runTextMode(input: CardBuildInput): Promise<void> {
  const { marker, elements, settings, tags } = input;
  const { front, frontSupplement, back, choices, graphic } = elements;
  const { deck, includeChoices, labelFormat, fixDarkMode } = settings;
  const timestamp = Date.now();
  const resolver = createMediaResolver({
    timestamp,
    fixDarkMode,
  });

  let frontText = marker;

  if (graphic) {
    frontText += await captureGraphicText(graphic, fixDarkMode, resolver);
  }

  const extractedFront = extractContent(front);
  const extractedFrontSupplement = frontSupplement
    ? extractContent(frontSupplement)
    : undefined;
  const extractedBack = extractContent(back);
  const extractedChoices =
    includeChoices && choices
      ? extractContent(choices, { labelFormat })
      : undefined;

  const unresolvedMathTotal =
    extractedFront.unresolvedMathCount +
    (extractedFrontSupplement?.unresolvedMathCount ?? 0) +
    extractedBack.unresolvedMathCount +
    (extractedChoices?.unresolvedMathCount ?? 0);

  if (unresolvedMathTotal > 0) {
    console.warn(
      `[Autobot] Unresolved math detected (${unresolvedMathTotal}); falling back to image mode for this step`,
    );
    await runImageMode(input);
    return;
  }

  const frontResolved = await resolver.resolveExtractedContent({
    content: extractedFront.content,
    result: extractedFront,
  });
  frontText += frontResolved.content;

  if (extractedFrontSupplement) {
    const frontSupplementResolved = await resolver.resolveExtractedContent({
      content: extractedFrontSupplement.content,
      result: extractedFrontSupplement,
    });

    if (frontSupplementResolved.content) {
      frontText += `<br>${frontSupplementResolved.content}`;
    }
  }

  if (extractedChoices) {
    const choicesResolved = await resolver.resolveExtractedContent({
      content: extractedChoices.content,
      result: extractedChoices,
    });
    frontText += choicesResolved.content;
  }

  const backResolved = await resolver.resolveExtractedContent({
    content: extractedBack.content,
    result: extractedBack,
  });
  const backText = backResolved.content;

  await sendMessageOrThrow<number>(
    {
      action: "addTextNote",
      deckName: deck,
      front: frontText,
      back: backText,
      tags,
    },
    "addTextNote",
  );
}

async function runImageMode(input: CardBuildInput): Promise<void> {
  const { marker, elements, settings, tags } = input;
  const { front, frontSupplement, back, choices, graphic } = elements;
  const { deck, includeChoices } = settings;
  const timestamp = Date.now();
  const resolver = createMediaResolver({
    timestamp,
    fixDarkMode: false,
  });

  let frontHtml = marker;

  if (graphic) {
    frontHtml += (await captureAndStore(graphic, "graphic", resolver)) + "<br>";
  }

  frontHtml += await captureAndStore(front, "front", resolver);

  if (frontSupplement) {
    frontHtml += "<br>" +
      (await captureAndStore(frontSupplement, "front-supplement", resolver));
  }

  if (includeChoices && choices) {
    const circles = choices.querySelectorAll(
      ".questionWidget-choiceLetterCircle",
    );
    const savedStyles: (string | null)[] = [];

    circles.forEach((circle, idx) => {
      savedStyles[idx] = circle.getAttribute("style");
      circle.removeAttribute("style");
    });

    try {
      frontHtml +=
        "<br>" + (await captureAndStore(choices, "choices", resolver));
    } finally {
      circles.forEach((circle, idx) => {
        if (savedStyles[idx]) {
          circle.setAttribute("style", savedStyles[idx]);
        }
      });
    }
  }

  const backHtml = await captureAndStore(back, "back", resolver);

  await sendMessageOrThrow<number>(
    {
      action: "addTextNote",
      deckName: deck,
      front: frontHtml,
      back: backHtml,
      tags,
    },
    "addTextNote",
  );
}

export async function runCardPipeline(input: CardBuildInput): Promise<void> {
  const restore = input.prepareCapture?.();

  try {
    if (input.settings.mode === "text") {
      await runTextMode(input);
    } else {
      await runImageMode(input);
    }
  } finally {
    restore?.();
  }
}
