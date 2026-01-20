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
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Failed to get canvas context'));
                return;
            }

            // Draw white background first
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw the image on top
            ctx.drawImage(img, 0, 0);

            // Convert back to base64 (PNG format to preserve quality)
            const dataUrl = canvas.toDataURL('image/png');
            const newBase64 = dataUrl.split(',')[1];
            resolve(newBase64);
        };
        img.onerror = () => reject(new Error('Failed to load image for white background processing'));
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
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            // Extract just the base64 part (remove data:image/...;base64, prefix)
            const base64 = result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = () => reject(new Error('Failed to read image as base64'));
        reader.readAsDataURL(blob);
    });
}

/**
 * Injects web-accessible script to extract TeX from MathJax.
 * Bypasses CSP by loading external script file.
 */
export function injectTexExtractor(): void {
    if (document.querySelector('script[data-autobot-tex]')) return;
    const script = document.createElement('script');
    script.src = browser.runtime.getURL('/tex-extractor.js');
    script.dataset.autobotTex = '';
    document.head.appendChild(script);
}

/**
 * Gets TeX from a MathJax container.
 * Checks data-tex attribute (set by injected script) or script tags.
 */
function getTexSource(container: HTMLElement): string | null {
    // First check data-tex set by injected script
    const dataTex = container.getAttribute('data-tex');
    console.log('[Autobot] getTexSource: data-tex attr =', dataTex?.slice(0, 30) || 'null');
    if (dataTex) return dataTex;

    // Fallback: check for adjacent script tag
    const prevSibling = container.previousElementSibling;
    console.log('[Autobot] getTexSource: prevSibling =', prevSibling?.tagName, prevSibling?.getAttribute('type'));
    if (prevSibling?.matches('script[type="math/tex"], script[type="math/tex; mode=display"]')) {
        return prevSibling.textContent;
    }

    console.log('[Autobot] getTexSource: no TeX found, using textContent fallback');
    return null;
}

/**
 * Options for extractContent function.
 */
export interface ExtractOptions {
    labelFormat?: 'paren' | 'dot' | 'bracket';  // a) | a. | (a)
}

/**
 * Result from extractContent function.
 */
export interface ExtractResult {
    content: string;
    images: Array<{
        placeholder: string;  // e.g., "{{IMG_0}}"
        src: string;          // The image URL to fetch
    }>;
}

/**
 * Extracts text and math from a DOM element.
 * Injects script to extract TeX from MathJax.
 * Returns content and any images that need to be fetched/stored.
 */
export function extractContent(el: HTMLElement, options: ExtractOptions = {}): ExtractResult {
    injectTexExtractor();
    document.dispatchEvent(new CustomEvent('autobot-extract-tex'));

    const { labelFormat = 'paren' } = options;
    const isChoicesTable = el.classList?.contains('questionWidget-choicesTable');

    const parts: string[] = [];
    const images: ExtractResult['images'] = [];
    let mathCount = 0;

    function walk(node: Node) {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent?.trim();
            if (text) parts.push(text);
            return;
        }

        if (!(node instanceof HTMLElement)) return;

        // Skip style and script elements entirely
        if (node.tagName === 'STYLE' || node.tagName === 'SCRIPT') return;

        // Free response textbox: replace with empty box placeholder
        if (node.id?.startsWith('freeResponseTextbox')) {
            parts.push('\\(\\boxed{\\quad}\\)');
            return;
        }

        // Choices table rows: label + content + newline
        if (isChoicesTable && node.tagName === 'TR') {
            const cells = Array.from(node.querySelectorAll('td'));
            if (cells.length >= 2) {
                const label = cells[0].textContent?.trim() || '';
                const formatted = labelFormat === 'dot' ? `${label}.`
                    : labelFormat === 'bracket' ? `(${label})`
                        : `${label})`;
                parts.push(formatted + ' ');
                for (let i = 1; i < cells.length; i++) walk(cells[i]);
                parts.push('\n');
                return;
            }
        }

        // Images: placeholder for later replacement
        if (node.tagName === 'IMG') {
            const src = node.getAttribute('src');
            if (src) {
                const placeholder = `{{IMG_${images.length}}}`;
                images.push({ placeholder, src });
                parts.push(placeholder);
            }
            return;
        }

        // MathJax: extract TeX source (both 2.x and 3.x)
        const isMathJax = node.tagName.toLowerCase() === 'mjx-container' || node.classList.contains('mjpage');
        if (isMathJax) {
            const tex = getTexSource(node);
            if (tex) {
                mathCount++;
                const isBlock = node.getAttribute('display') === 'block' || node.classList.contains('mjpage__block');
                parts.push(isBlock ? `\n\n\\[${tex}\\]\n\n` : `\\(${tex}\\)`);
            } else {
                parts.push(node.textContent || '');
            }
            return;
        }

        // Block elements: process children, then add paragraph break
        const isBlock = ['P', 'DIV', 'BR', 'LI', 'H1', 'H2', 'H3', 'H4'].includes(node.tagName);
        for (const child of Array.from(node.childNodes)) walk(child);
        if (isBlock && parts.length > 0) parts.push('\n\n');
    }

    walk(el);

    // Single-pass cleanup: normalize whitespace, convert newlines to <br>
    const content = parts.join(' ')
        .replace(/[ \t]+/g, ' ')          // Collapse horizontal whitespace
        .replace(/ ?\n ?/g, '\n')         // Clean spaces around newlines
        .replace(/\n{3,}/g, '\n\n')       // Max 2 consecutive newlines
        .replace(/\n\n/g, '<br><br>')     // Paragraph breaks
        .replace(/\n/g, '<br>')           // Line breaks
        .trim();

    console.log(`[Autobot] Extracted: ${mathCount} math, ${images.length} img, ${content.length} chars`);
    return { content, images };
}
