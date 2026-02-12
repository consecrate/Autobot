import { domToPng } from "modern-screenshot";
import { CSS_CLASSES, DOM_IDS } from "./constants";

// Padding configuration
const PADDING = {
  MIN: 30,
  MAX: 80,
  RATIO: 0.08, // 8% of dimension
  TABLE_EXTRA: 20,
} as const;

/**
 * Get accurate dimensions based on visible content bounds.
 * Avoids inflated scrollHeight from flexbox layouts by measuring
 * actual visible descendants.
 */
function getAccurateDimensions(el: HTMLElement): { width: number; height: number } {
  const rect = el.getBoundingClientRect();

  // Start with the element's bounding rect (CSS box, not inflated by flexbox)
  let maxWidth = rect.width;
  let maxHeight = rect.height;

  // Scan visible descendants to find actual content bounds
  el.querySelectorAll("*").forEach((child) => {
    // Skip non-HTMLElements
    if (!(child instanceof HTMLElement)) return;

    // Skip hidden elements
    const style = getComputedStyle(child);
    if (style.display === "none" || style.visibility === "hidden") return;

    const childRect = child.getBoundingClientRect();
    // Only consider if child has actual dimensions
    if (childRect.width > 0 && childRect.height > 0) {
      maxWidth = Math.max(maxWidth, childRect.right - rect.left);
      maxHeight = Math.max(maxHeight, childRect.bottom - rect.top);
    }
  });

  // Use the smaller of scrollHeight and calculated height to avoid inflation
  // from flexbox stretching
  maxHeight = Math.min(maxHeight, el.scrollHeight);
  maxWidth = Math.min(maxWidth, el.scrollWidth);

  // Fall back to bounding rect if dimensions are effectively zero
  if (maxWidth < 1) {
    maxWidth = rect.width;
  }
  if (maxHeight < 1) {
    maxHeight = rect.height;
  }

  // Add 2px buffer for rounding
  return { width: Math.ceil(maxWidth) + 2, height: Math.ceil(maxHeight) + 2 };
}

/**
 * Calculate adaptive padding based on content dimensions.
 * Smaller content gets relatively more padding, larger content less.
 * Tables get extra horizontal padding to prevent clipping.
 */
function calculatePadding(
  width: number,
  height: number,
  hasTable: boolean
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
    `[id^="${DOM_IDS.freeResponsePrefix}"] .mq-root-block`
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
  // Get accurate dimensions including overflow
  const { width: contentWidth, height: contentHeight } = getAccurateDimensions(el);

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
      // Fix overflow on all descendants and handle tables
      onCloneNode: (clonedNode) => {
        if (clonedNode instanceof HTMLElement) {
          // Hide Autobot UI elements (buttons injected by this extension)
          if (clonedNode.classList.contains(CSS_CLASSES.ankiButton)) {
            clonedNode.style.display = 'none';
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

          // Remove any overflow clipping on other elements
          if (getComputedStyle(clonedNode).overflow !== "visible") {
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
