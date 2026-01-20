import { domToPng } from "modern-screenshot";

const CAPTURE_PADDING = 60; // Extra padding around the captured element

export async function captureElement(el: HTMLElement): Promise<string> {
  // Use scrollWidth/scrollHeight to get full content size including overflow
  const width = el.scrollWidth + CAPTURE_PADDING * 2;
  const height = el.scrollHeight + CAPTURE_PADDING * 2;

  // Hide free response answers before capture
  const freeResponseBlocks = el.querySelectorAll<HTMLElement>(
    '[id^="freeResponseTextbox"] .mq-root-block'
  );
  const savedContent: string[] = [];
  freeResponseBlocks.forEach((block, i) => {
    savedContent[i] = block.innerHTML;
    block.innerHTML = '';
  });

  try {
    return await domToPng(el, {
      scale: 2.0,
      backgroundColor: "#ffffff",
      width,
      height,
      // Override styles on the root element to prevent clipping
      style: {
        overflow: "visible",
        maxHeight: "none",
        maxWidth: "none",
        height: "auto",
        margin: `${CAPTURE_PADDING}px`,
      },
      // Fix overflow on all descendants
      onCloneNode: (clonedNode) => {
        if (clonedNode instanceof HTMLElement) {
          // Remove any overflow clipping
          if (getComputedStyle(clonedNode).overflow !== "visible") {
            clonedNode.style.overflow = "visible";
          }
        }
      },
    });
  } finally {
    // Restore free response answers
    freeResponseBlocks.forEach((block, i) => {
      block.innerHTML = savedContent[i];
    });
  }
}
