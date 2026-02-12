// Extracts TeX from MathJax and stores in data-tex attributes
// Handles both MathJax 2.x (.mjpage) and MathJax 3.x (mjx-container)
(function () {
    function extractTex() {
        // MathJax 3.x: mjx-container elements
        const mjx3 = document.querySelectorAll('mjx-container:not([data-tex]):not([data-mathml])');
        mjx3.forEach(container => {
            // Skip containers with embedded selectLists (fill-in-the-blank questions)
            if (container.querySelector('.selectList')) return;
            try {
                if (typeof MathJax !== 'undefined' && MathJax?.startup?.document) {
                    const items = MathJax.startup.document.getMathItemsWithin(container);
                    const math = items[0]?.math;
                    if (math) {
                        if (math.trim().startsWith('<')) {
                            // MathML input - store separately (Anki renders natively)
                            container.setAttribute('data-mathml', math);
                        } else {
                            // TeX input
                            container.setAttribute('data-tex', math);
                        }
                    }
                }
            } catch (e) { }
        });

        // MathJax 2.x: .mjpage spans - use MathJax.Hub API for original TeX
        const mjx2 = document.querySelectorAll('.mjpage:not([data-tex])');
        mjx2.forEach(container => {
            let tex = null;

            // Method 1: Get TeX from MathJax.Hub jax object
            if (typeof MathJax !== 'undefined' && MathJax.Hub) {
                try {
                    const jaxList = MathJax.Hub.getAllJax(container);
                    if (jaxList && jaxList.length > 0) {
                        // Combine all jax sources (usually just one per container)
                        tex = jaxList.map(jax => jax.originalText).filter(Boolean).join(' ');
                    }
                } catch (e) { }
            }

            // Method 2: Check for adjacent script tag
            if (!tex) {
                const prev = container.previousElementSibling;
                if (prev?.matches('script[type*="math/tex"]')) {
                    tex = prev.textContent;
                }
            }

            // Method 3: Fallback to SVG title (loses matrix structure)
            if (!tex) {
                const title = container.querySelector('svg title');
                if (title?.textContent) {
                    tex = title.textContent;
                }
            }

            if (tex) {
                container.setAttribute('data-tex', tex);
            }
        });

        console.log('[Autobot TeX] Extracting from', mjx3.length, 'MJX3 +', mjx2.length, 'MJX2 containers');
    }

    extractTex();
    document.addEventListener('autobot-extract-tex', extractTex);
    console.log('[Autobot TeX] Ready');
})();
