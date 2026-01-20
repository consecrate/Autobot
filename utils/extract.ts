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

    // Trigger TeX extraction for any new containers
    document.dispatchEvent(new CustomEvent('autobot-extract-tex'));

    const { labelFormat = 'paren' } = options;
    const isChoicesTable = el.classList?.contains('questionWidget-choicesTable');

    const result: string[] = [];
    const images: ExtractResult['images'] = [];
    let mathCount = 0;

    function walk(node: Node) {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent?.trim();
            if (text) result.push(text);
            return;
        }

        if (!(node instanceof HTMLElement)) return;

        // Special handling for choices table rows
        if (isChoicesTable && node.tagName === 'TR') {
            const cells = Array.from(node.querySelectorAll('td'));
            if (cells.length >= 2) {
                const label = cells[0].textContent?.trim() || '';
                // Format label based on user preference
                let formattedLabel: string;
                switch (labelFormat) {
                    case 'dot': formattedLabel = `${label}.`; break;
                    case 'bracket': formattedLabel = `(${label})`; break;
                    default: formattedLabel = `${label})`; break;
                }
                result.push(formattedLabel + ' ');
                // Process remaining cells (the content) inline
                for (let i = 1; i < cells.length; i++) {
                    walk(cells[i]);
                }
                result.push('<br>');  // Single line break after each option
                return;  // Don't process children normally
            }
        }

        // Handle <img> elements - extract src and add placeholder
        if (node.tagName === 'IMG') {
            const src = node.getAttribute('src');
            if (src) {
                const placeholder = `{{IMG_${images.length}}}`;
                images.push({ placeholder, src });
                result.push(placeholder);
                console.log(`[Autobot] Found image in content: ${src} -> ${placeholder}`);
            }
            return;
        }

        // Handle MathJax containers
        if (node.tagName.toLowerCase() === 'mjx-container') {
            const tex = getTexSource(node);
            if (tex) {
                mathCount++;
                const isBlock = node.getAttribute('display') === 'block';
                if (isBlock) {
                    result.push(`<br><br>\\[${tex}\\]<br><br>`);
                } else {
                    result.push(`\\(${tex}\\)`);
                }
            } else {
                // Fallback to text content if TeX source unavailable
                result.push(node.textContent || '');
            }
            return;
        }

        // Handle block elements
        const isBlock = ['P', 'DIV', 'BR', 'LI', 'H1', 'H2', 'H3', 'H4'].includes(node.tagName);
        if (isBlock && result.length > 0 && !result[result.length - 1].endsWith('<br><br>')) {
            result.push('<br><br>');
        }

        for (const child of Array.from(node.childNodes)) {
            walk(child);
        }

        if (isBlock && result.length > 0 && !result[result.length - 1].endsWith('<br><br>')) {
            result.push('<br><br>');
        }
    }

    walk(el);

    const content = result.join(' ')
        .replace(/\s+/g, ' ')
        .replace(/ ?<br><br> ?/g, '<br><br>')
        .replace(/ ?<br> ?/g, '<br>')
        .replace(/(<br><br>)+/g, '<br><br>')   // Collapse multiple double breaks
        .replace(/(<br>)+/g, '<br>')           // Collapse multiple single breaks
        .trim();

    console.log(`[Autobot] Extracted: ${mathCount} math expression(s), ${images.length} image(s), ${content.length} chars`);
    console.log(`[Autobot] Preview: ${content.slice(0, 100)}${content.length > 100 ? '...' : ''}`);

    return { content, images };
}
