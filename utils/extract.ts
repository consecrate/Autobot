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
 * Prefers mjx-container's data-tex (correct) over .mjpage's (often broken).
 */
function getTexSource(container: HTMLElement): string | null {
    // For .mjpage wrappers, prefer nested mjx-container's data-tex
    if (container.classList.contains('mjpage')) {
        const mjxChild = container.querySelector<HTMLElement>('mjx-container[data-tex]');
        if (mjxChild) {
            const tex = mjxChild.getAttribute('data-tex');
            if (tex) return tex;
        }
    }

    // Check data-tex on the container itself
    const dataTex = container.getAttribute('data-tex');
    if (dataTex) return dataTex;

    // Fallback: adjacent script tag
    const prevSibling = container.previousElementSibling;
    if (prevSibling?.matches('script[type="math/tex"], script[type="math/tex; mode=display"]')) {
        return prevSibling.textContent;
    }

    return null;
}

/**
 * Options for extractContent function.
 */
export interface ExtractOptions {
    labelFormat?: 'paren' | 'dot' | 'bracket';  // a) | a. | (a)
}

/**
 * Extracts content from a table cell, processing text, MathJax, and images.
 */
function extractCellContent(
    cell: HTMLElement,
    images: ExtractResult['images'],
    mathCountRef: { value: number }
): string {
    const cellParts: string[] = [];

    function walkCell(node: Node) {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent?.trim();
            if (text) cellParts.push(text);
            return;
        }

        if (!(node instanceof HTMLElement)) return;

        // Skip style, script, Autobot UI
        if (node.tagName === 'STYLE' || node.tagName === 'SCRIPT') return;
        if (node.classList?.contains('autobotAnkiButton')) return;

        // Free response textbox
        if (node.id?.startsWith('freeResponseTextbox')) {
            cellParts.push('\\(\\boxed{\\quad}\\)');
            return;
        }

        // Images
        if (node.tagName === 'IMG') {
            const src = node.getAttribute('src');
            if (src) {
                const placeholder = `{{IMG_${images.length}}}`;
                images.push({ placeholder, src });
                cellParts.push(placeholder);
            }
            return;
        }

        // MathJax (2.x and 3.x)
        const isMathJax = node.tagName.toLowerCase() === 'mjx-container' || node.classList.contains('mjpage');
        if (isMathJax) {
            const tex = getTexSource(node);
            if (tex) {
                mathCountRef.value++;
                const isBlock = node.getAttribute('display') === 'block' || node.classList.contains('mjpage__block');
                cellParts.push(isBlock ? `\\[${tex}\\]` : `\\(${tex}\\)`);
            } else {
                cellParts.push(node.textContent || '');
            }
            return;
        }

        // Nested tables
        if (node.tagName === 'TABLE') {
            cellParts.push(processTable(node, images, mathCountRef));
            return;
        }

        // Process children
        for (const child of Array.from(node.childNodes)) walkCell(child);
    }

    walkCell(cell);
    return cellParts.join(' ').trim();
}

/**
 * Processes a TABLE element into an HTML string, preserving structure.
 * Cell contents are processed for math, images, and nested tables.
 */
function processTable(
    table: HTMLElement,
    images: ExtractResult['images'],
    mathCountRef: { value: number }
): string {
    let html = '<table style="border-collapse: collapse; margin: 8px 0;">';

    const rows = table.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tr');
    for (const row of Array.from(rows)) {
        html += '<tr>';
        const cells = row.querySelectorAll(':scope > td, :scope > th');
        for (const cell of Array.from(cells)) {
            const tag = cell.tagName.toLowerCase();
            const colspan = cell.getAttribute('colspan');
            const rowspan = cell.getAttribute('rowspan');
            let attrs = ' style="border: 1px solid #ccc; padding: 4px 8px;"';
            if (colspan) attrs += ` colspan="${colspan}"`;
            if (rowspan) attrs += ` rowspan="${rowspan}"`;

            const cellContent = extractCellContent(cell as HTMLElement, images, mathCountRef);
            html += `<${tag}${attrs}>${cellContent}</${tag}>`;
        }
        html += '</tr>';
    }

    html += '</table>';
    return html;
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
    const mathCountRef = { value: 0 };

    function walk(node: Node) {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent?.trim();
            if (text) parts.push(text);
            return;
        }

        if (!(node instanceof HTMLElement)) return;

        // Skip style, script, and Autobot UI elements
        if (node.tagName === 'STYLE' || node.tagName === 'SCRIPT') return;
        if (node.classList?.contains('autobotAnkiButton')) return;

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
                mathCountRef.value++;
                const isBlock = node.getAttribute('display') === 'block' || node.classList.contains('mjpage__block');
                parts.push(isBlock ? `\n\n\\[${tex}\\]\n\n` : `\\(${tex}\\)`);
            } else {
                parts.push(node.textContent || '');
            }
            return;
        }

        // Tables: preserve HTML structure (but not choices tables - handled separately)
        if (node.tagName === 'TABLE' && !isChoicesTable) {
            parts.push(processTable(node, images, mathCountRef));
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

    console.log(`[Autobot] Extracted: ${mathCountRef.value} math, ${images.length} img, ${content.length} chars`);
    return { content, images };
}
