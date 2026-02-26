import { EVENTS } from "./constants";
import { extractElementContent } from "./extractContent";
import type { ExtractOptions, ExtractResult } from "./extractContent";

export type { ExtractOptions, ExtractResult } from "./extractContent";

declare const browser: { runtime: { getURL: (path: string) => string } };

/**
 * Adds a white background to an image by drawing it on a canvas.
 * This fixes transparent images for dark mode viewing.
 * @param base64Data - The base64-encoded image data (without prefix)
 * @returns Promise with new base64 data with white background
 */
export async function addWhiteBackground(base64Data: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      // Draw white background first
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw the image on top
      ctx.drawImage(img, 0, 0);

      // Convert back to base64 (PNG format to preserve quality)
      const dataUrl = canvas.toDataURL("image/png");
      const newBase64 = dataUrl.split(",")[1];
      resolve(newBase64);
    };
    img.onerror = () =>
      reject(new Error("Failed to load image for white background processing"));
    img.src = `data:image/png;base64,${base64Data}`;
  });
}

/**
 * Fetches an image from a URL and returns it as base64.
 * Handles relative URLs by resolving against the current page.
 */
export async function fetchImageAsBase64(src: string): Promise<string> {
  // Resolve relative URLs
  const url = new URL(src, window.location.href).href;
  console.log(`[Autobot] Fetching image: ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch image: ${response.status} ${response.statusText}`,
    );
  }

  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Extract just the base64 part (remove data:image/...;base64, prefix)
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read image as base64"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Injects web-accessible script to extract TeX from MathJax.
 * Bypasses CSP by loading external script file.
 */
export function injectTexExtractor(): void {
  if (document.querySelector("script[data-autobot-tex]")) return;
  const script = document.createElement("script");
  script.src = browser.runtime.getURL("/tex-extractor.js");
  script.dataset.autobotTex = "";
  document.head.appendChild(script);
}

/**
 * Extracts text and math from a DOM element.
 * Injects script to extract TeX from MathJax.
 * Returns content and any images that need to be fetched/stored.
 */
export function extractContent(
  el: HTMLElement,
  options: ExtractOptions = {},
): ExtractResult {
  injectTexExtractor();
  document.dispatchEvent(new CustomEvent(EVENTS.extractTex));
  return extractElementContent(el, options);
}
