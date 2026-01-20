declare const browser: { runtime: { getURL: (path: string) => string } };

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
 * Extracts text and math from a DOM element.
 * Injects script to extract TeX from MathJax.
 */
export function extractContent(el: HTMLElement): string {
    injectTexExtractor();

    // Trigger TeX extraction for any new containers
    document.dispatchEvent(new CustomEvent('autobot-extract-tex'));

    const result: string[] = [];
    let mathCount = 0;

    function walk(node: Node) {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent?.trim();
            if (text) result.push(text);
            return;
        }

        if (!(node instanceof HTMLElement)) return;

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
        .replace(/(<br><br>)+/g, '<br><br>')   // Collapse multiple breaks
        .trim();

    console.log(`[Autobot] Extracted: ${mathCount} math expression(s), ${content.length} chars`);
    console.log(`[Autobot] Preview: ${content.slice(0, 100)}${content.length > 100 ? '...' : ''}`);

    return content;
}
