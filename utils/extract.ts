import { CSS_CLASSES, MATHJAX, DOM_IDS, EVENTS } from './constants';
import type { LabelFormat } from './constants';

interface MathSource {
    type: 'tex' | 'mathml';
    value: string;
}

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
 * Gets math source from a MathJax container.
 * Returns TeX strings directly or raw MathML for native browser rendering.
 * Prefers mjx-container's data-tex/data-mathml (correct) over .mjpage's (often broken).
 */
function getTexSource(container: HTMLElement): MathSource | null {
    // For .mjpage wrappers, prefer nested mjx-container's data-tex or data-mathml
    if (container.classList.contains(MATHJAX.mjpage)) {
        const mjxChildTex = container.querySelector<HTMLElement>(`${MATHJAX.mjxContainer}[data-tex]`);
        if (mjxChildTex) {
            const tex = mjxChildTex.getAttribute('data-tex');
            if (tex) return { type: 'tex', value: tex };
        }
        const mjxChildMathML = container.querySelector<HTMLElement>(`${MATHJAX.mjxContainer}[data-mathml]`);
        if (mjxChildMathML) {
            const mathml = mjxChildMathML.getAttribute('data-mathml');
            if (mathml) return { type: 'mathml', value: mathml };
        }
    }

    // Check data-tex on the container itself (original TeX is most reliable)
    const dataTex = container.getAttribute('data-tex');
    if (dataTex) return { type: 'tex', value: dataTex };

    // Raw MathML — Anki renders natively (no lossy conversion)
    const dataMathML = container.getAttribute('data-mathml');
    if (dataMathML) return { type: 'mathml', value: dataMathML };

    // Fallback: adjacent script tag
    const prevSibling = container.previousElementSibling;
    if (prevSibling?.matches('script[type="math/tex"], script[type="math/tex; mode=display"]')) {
        const tex = prevSibling.textContent;
        if (tex) return { type: 'tex', value: tex };
    }

    return null;
}

/**
 * Extracts options from a selectList element.
 * Returns formatted string: inline "opt1/opt2" if short, or "_________ (opt1 / opt2)" otherwise.
 */
function extractSelectListContent(
    selectList: HTMLElement,
    mathCountRef: { value: number }
): string {
    const optionEls = selectList.querySelectorAll('.selectListOption');
    const optionTexts: string[] = [];

    for (const opt of optionEls) {
        const optParts: string[] = [];
        for (const child of opt.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
                const text = child.textContent?.trim();
                if (text) optParts.push(text);
            } else if (child instanceof HTMLElement) {
                const isMath = child.tagName.toLowerCase() === MATHJAX.mjxContainer || child.classList.contains(MATHJAX.mjpage);
                if (isMath) {
                    const source = getTexSource(child);
                    if (source) {
                        mathCountRef.value++;
                        if (source.type === 'mathml') {
                            optParts.push(source.value);
                        } else {
                            optParts.push(`\\(${source.value}\\)`);
                        }
                    } else {
                        optParts.push(child.textContent || '');
                    }
                } else {
                    optParts.push(child.textContent?.trim() || '');
                }
            }
        }
        const optText = optParts.join('').trim();
        if (optText) optionTexts.push(optText);
    }

    if (optionTexts.length === 0) {
        return '_________';
    }

    // If all options are short (< 5 chars), use inline format
    const allShort = optionTexts.every(opt => opt.length < 5);
    if (allShort) {
        return optionTexts.join('/');
    }
    return `_________ (${optionTexts.join(' / ')})`;
}

/**
 * Options for extractContent function.
 */
export interface ExtractOptions {
    labelFormat?: LabelFormat;
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

// --- Unified walker ---

interface WalkConfig {
    blockMathFormat: 'simple' | 'newlines';  // \[tex\] vs \n\n\[tex\]\n\n
    handleLists: boolean;
    handleBlockElements: boolean;
    choicesConfig?: { labelFormat: LabelFormat };  // only set when root is choices table
    skipChoicesTable: boolean;  // skip TABLE processing when root is choices table
}

const CELL_CONFIG: WalkConfig = {
    blockMathFormat: 'simple',
    handleLists: false,
    handleBlockElements: false,
    skipChoicesTable: false,
};

const LIST_ITEM_CONFIG: WalkConfig = {
    blockMathFormat: 'simple',
    handleLists: true,
    handleBlockElements: false,
    skipChoicesTable: false,
};

/**
 * Unified tree-walker for extracting content from DOM nodes.
 * Replaces the three nearly-identical walkCell/walkItem/walk functions.
 */
function walkNodes(
    node: Node,
    parts: string[],
    images: ExtractResult['images'],
    mathCountRef: { value: number },
    config: WalkConfig,
): void {
    if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim();
        if (text) parts.push(text);
        return;
    }

    if (!(node instanceof HTMLElement)) return;

    // Skip style, script, Autobot UI
    if (node.tagName === 'STYLE' || node.tagName === 'SCRIPT') return;
    if (node.classList?.contains(CSS_CLASSES.ankiButton)) return;

    // Skip MathJax assistive MathML (screen reader duplicate of visual math)
    if (node.tagName === 'MJX-ASSISTIVE-MML') return;

    // Free response textbox
    if (node.id?.startsWith(DOM_IDS.freeResponsePrefix)) {
        parts.push('\\(\\boxed{\\vphantom{X}\\quad}\\)');
        return;
    }

    // SelectList dropdown
    if (node.classList?.contains('selectList')) {
        parts.push(extractSelectListContent(node, mathCountRef));
        return;
    }

    // Standard HTML <select> dropdown (e.g., truth table fill-in cells)
    if (node.tagName === 'SELECT') {
        const optionTexts = Array.from(node.querySelectorAll('option'))
            .map(opt => opt.textContent?.trim())
            .filter((t): t is string => !!t);

        if (optionTexts.length === 0) {
            parts.push('_________');
        } else {
            const allShort = optionTexts.every(opt => opt.length < 5);
            if (allShort) {
                parts.push(`_________ (${optionTexts.join('/')})`);
            } else {
                parts.push(`_________ (${optionTexts.join(' / ')})`);
            }
        }
        return;
    }

    // Choices table rows: label + content + newline (only in main walk with choicesConfig)
    if (config.choicesConfig && node.tagName === 'TR') {
        const cells = Array.from(node.querySelectorAll('td'));
        if (cells.length >= 2) {
            const label = cells[0].textContent?.trim() || '';
            const { labelFormat } = config.choicesConfig;
            const formatted = labelFormat === 'dot' ? `${label}.`
                : labelFormat === 'bracket' ? `(${label})`
                    : `${label})`;
            parts.push(formatted + ' ');
            for (let i = 1; i < cells.length; i++) walkNodes(cells[i], parts, images, mathCountRef, config);
            parts.push('\n');
            return;
        }
    }

    // Images
    if (node.tagName === 'IMG') {
        const src = node.getAttribute('src');
        if (src) {
            const placeholder = `{{IMG_${images.length}}}`;
            images.push({ placeholder, src });
            parts.push(placeholder);
        }
        return;
    }

    // MathJax character element — read rendered char from CSS ::before
    // Only reached when walking into mjx-containers with selectLists
    if (node.tagName === 'MJX-C') {
        const content = window.getComputedStyle(node, '::before').content;
        if (content && content !== 'none' && content !== 'normal') {
            const char = content.replace(/^["']|["']$/g, '');
            if (char) parts.push(char);
        }
        return;
    }

    // MathJax (2.x and 3.x)
    const isMathJax = node.tagName.toLowerCase() === MATHJAX.mjxContainer || node.classList.contains(MATHJAX.mjpage);

    // MathJax container with embedded selectLists (fill-in-the-blank math)
    // These have interactive dropdowns inside the MathJax rendering —
    // walk into mjx-math to process both static math chars and selectLists
    if (isMathJax && node.querySelector('.selectList')) {
        const mjxMath = node.querySelector(':scope > mjx-math');
        if (mjxMath) {
            for (const child of Array.from(mjxMath.childNodes)) {
                walkNodes(child, parts, images, mathCountRef, config);
            }
        }
        return;
    }

    if (isMathJax) {
        const source = getTexSource(node);
        if (source) {
            mathCountRef.value++;
            const isBlock = node.getAttribute('display') === 'block' || node.classList.contains(MATHJAX.mjpageBlock);
            if (source.type === 'mathml') {
                // Raw MathML — Anki renders natively
                let mathml = source.value;
                if (isBlock && !mathml.includes('display="block"')) {
                    mathml = mathml.replace('<math', '<math display="block"');
                }
                parts.push(mathml);
            } else {
                // TeX — wrap in delimiters for MathJax rendering
                if (isBlock) {
                    parts.push(config.blockMathFormat === 'newlines' ? `\n\n\\[${source.value}\\]\n\n` : `\\[${source.value}\\]`);
                } else {
                    parts.push(`\\(${source.value}\\)`);
                }
            }
        } else {
            parts.push(node.textContent || '');
        }
        return;
    }

    // Tables (skip when this is a choices table being walked)
    if (node.tagName === 'TABLE' && !config.skipChoicesTable) {
        parts.push(processTable(node, images, mathCountRef));
        return;
    }

    // Lists (only in list-item and main walk configs)
    if (config.handleLists && (node.tagName === 'OL' || node.tagName === 'UL')) {
        parts.push(processList(node, images, mathCountRef));
        return;
    }

    // Block elements (only in main walk config)
    const isBlock = config.handleBlockElements
        && ['P', 'DIV', 'BR', 'H1', 'H2', 'H3', 'H4'].includes(node.tagName);

    // Process children
    for (const child of Array.from(node.childNodes)) walkNodes(child, parts, images, mathCountRef, config);

    if (isBlock && parts.length > 0) parts.push('\n\n');
}

/**
 * Extracts content from a table cell, processing text, MathJax, and images.
 */
function extractCellContent(
    cell: HTMLElement,
    images: ExtractResult['images'],
    mathCountRef: { value: number }
): string {
    const parts: string[] = [];
    walkNodes(cell, parts, images, mathCountRef, CELL_CONFIG);
    return parts.join(' ').trim();
}

/**
 * Builds the attribute string for a <table> element, preserving original
 * inline styles and HTML attributes (rules, cellpadding, etc.) without injecting defaults.
 */
function buildTableAttrs(table: HTMLElement): string {
    const style = table.getAttribute('style');
    let attrs = '';

    if (style) {
        // Preserve original style verbatim
        attrs += ` style="${style}"`;
    }

    for (const name of ['rules', 'cellpadding', 'cellspacing', 'border', 'align']) {
        const val = table.getAttribute(name);
        if (val) attrs += ` ${name}="${val}"`;
    }
    return attrs;
}

/**
 * Builds the attribute string for a <td>/<th> element, preserving original
 * inline styles (e.g. border: hidden) and structural attributes without injecting defaults.
 */
function buildCellAttrs(cell: Element): string {
    const style = cell.getAttribute('style');
    let attrs = '';

    if (style) {
        // Preserve original style verbatim
        attrs += ` style="${style}"`;
    }

    for (const name of ['colspan', 'rowspan', 'align', 'valign']) {
        const val = cell.getAttribute(name);
        if (val) attrs += ` ${name}="${val}"`;
    }
    return attrs;
}

/**
 * Processes a TABLE element into an HTML string, preserving structure.
 * Cell contents are processed for math, images, and nested tables.
 * Preserves original styling so layout tables (e.g. binomial coefficients)
 * keep hidden borders while data tables retain visible ones.
 */
function processTable(
    table: HTMLElement,
    images: ExtractResult['images'],
    mathCountRef: { value: number }
): string {
    let html = `<table${buildTableAttrs(table)}>`;

    const rows = table.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tr');
    for (const row of Array.from(rows)) {
        const rowStyle = (row as HTMLElement).getAttribute('style');
        html += rowStyle ? `<tr style="${rowStyle}">` : '<tr>';
        const cells = row.querySelectorAll(':scope > td, :scope > th');
        for (const cell of Array.from(cells)) {
            const tag = cell.tagName.toLowerCase();
            const cellContent = extractCellContent(cell as HTMLElement, images, mathCountRef);
            html += `<${tag}${buildCellAttrs(cell)}>${cellContent}</${tag}>`;
        }
        html += '</tr>';
    }

    html += '</table>';
    return html;
}

/**
 * Extracts content from a list item, processing text, MathJax, images, nested lists.
 */
function extractListItemContent(
    item: HTMLElement,
    images: ExtractResult['images'],
    mathCountRef: { value: number }
): string {
    const parts: string[] = [];
    walkNodes(item, parts, images, mathCountRef, LIST_ITEM_CONFIG);
    return parts.join(' ').trim();
}

/**
 * Processes an OL or UL element into an HTML string, preserving structure.
 * List item contents are processed for math, images, and nested elements.
 */
function processList(
    list: HTMLElement,
    images: ExtractResult['images'],
    mathCountRef: { value: number }
): string {
    const tag = list.tagName.toLowerCase(); // 'ol' or 'ul'
    let html = `<${tag}>`;

    const items = list.querySelectorAll(':scope > li');
    for (const item of Array.from(items)) {
        const itemContent = extractListItemContent(item as HTMLElement, images, mathCountRef);
        html += `<li>${itemContent}</li>`;
    }

    html += `</${tag}>`;
    return html;
}

/**
 * Extracts text and math from a DOM element.
 * Injects script to extract TeX from MathJax.
 * Returns content and any images that need to be fetched/stored.
 */
export function extractContent(el: HTMLElement, options: ExtractOptions = {}): ExtractResult {
    injectTexExtractor();
    document.dispatchEvent(new CustomEvent(EVENTS.extractTex));

    const { labelFormat = 'paren' } = options;
    const isChoicesTable = el.classList?.contains('questionWidget-choicesTable');

    const parts: string[] = [];
    const images: ExtractResult['images'] = [];
    const mathCountRef = { value: 0 };

    const mainConfig: WalkConfig = {
        blockMathFormat: 'newlines',
        handleLists: true,
        handleBlockElements: true,
        choicesConfig: isChoicesTable ? { labelFormat } : undefined,
        skipChoicesTable: isChoicesTable,
    };

    walkNodes(el, parts, images, mathCountRef, mainConfig);

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
