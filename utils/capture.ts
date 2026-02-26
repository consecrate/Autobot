import { domToPng } from "modern-screenshot";
import { CSS_CLASSES, DOM_IDS } from "./constants";

// Padding configuration
const PADDING = {
  MIN: 30,
  MAX: 80,
  RATIO: 0.08, // 8% of dimension
  TABLE_EXTRA: 20,
} as const;

function getCaptureDimensions(el: HTMLElement): {
  width: number;
  height: number;
} {
  const rect = el.getBoundingClientRect();

  const width = Math.max(rect.width, el.scrollWidth, el.clientWidth, 1);
  const height = Math.max(rect.height, el.scrollHeight, el.clientHeight, 1);

  return { width: Math.ceil(width) + 2, height: Math.ceil(height) + 2 };
}

/**
 * Calculate adaptive padding based on content dimensions.
 * Smaller content gets relatively more padding, larger content less.
 * Tables get extra horizontal padding to prevent clipping.
 */
function calculatePadding(
  width: number,
  height: number,
  hasTable: boolean,
): { h: number; v: number } {
  const baseH = Math.round(width * PADDING.RATIO);
  const baseV = Math.round(height * PADDING.RATIO);

  let h = Math.max(PADDING.MIN, Math.min(PADDING.MAX, baseH));
  const v = Math.max(PADDING.MIN, Math.min(PADDING.MAX, baseV));

  if (hasTable) {
    h += PADDING.TABLE_EXTRA;
  }

  return { h, v };
}

/**
 * Temporarily hide free response answers for capture.
 * Returns a restore function to call after capture.
 */
function hideFreeResponseAnswers(el: HTMLElement): () => void {
  const freeResponseBlocks = el.querySelectorAll<HTMLElement>(
    `[id^="${DOM_IDS.freeResponsePrefix}"] .mq-root-block`,
  );
  const savedContent: string[] = [];

  freeResponseBlocks.forEach((block, i) => {
    savedContent[i] = block.innerHTML;
    block.innerHTML = "";
  });

  return () => {
    freeResponseBlocks.forEach((block, i) => {
      block.innerHTML = savedContent[i];
    });
  };
}

export async function captureElement(el: HTMLElement): Promise<string> {
  const { width: contentWidth, height: contentHeight } =
    getCaptureDimensions(el);

  // Check if element contains tables
  const hasTable = el.querySelector("table") !== null;

  // Calculate adaptive padding
  const padding = calculatePadding(contentWidth, contentHeight, hasTable);

  // Total canvas size with padding on both sides (for centering)
  const canvasWidth = contentWidth + padding.h * 2;
  const canvasHeight = contentHeight + padding.v * 2;

  // Hide free response answers before capture
  const restoreAnswers = hideFreeResponseAnswers(el);

  try {
    return await domToPng(el, {
      scale: 2.0,
      backgroundColor: "#ffffff",
      width: canvasWidth,
      height: canvasHeight,
      // Center content with explicit margins
      style: {
        overflow: "visible",
        maxHeight: "none",
        maxWidth: "none",
        height: "auto",
        width: `${contentWidth}px`,
        marginTop: `${padding.v}px`,
        marginBottom: `${padding.v}px`,
        marginLeft: `${padding.h}px`,
        marginRight: `${padding.h}px`,
      },
      onCloneNode: (clonedNode) => {
        if (clonedNode instanceof HTMLElement) {
          // Hide Autobot UI elements (buttons injected by this extension)
          if (clonedNode.classList.contains(CSS_CLASSES.ankiButton)) {
            clonedNode.style.display = "none";
            return;
          }

          const tagName = clonedNode.tagName;

          // Table-specific centering and overflow handling
          if (tagName === "TABLE") {
            clonedNode.style.tableLayout = "auto";
            clonedNode.style.marginLeft = "auto";
            clonedNode.style.marginRight = "auto";
          }

          // Ensure table cells don't clip content
          if (tagName === "TD" || tagName === "TH") {
            clonedNode.style.overflow = "visible";
          }
        }
      },
    });
  } finally {
    // Restore free response answers
    restoreAnswers();
  }
}
