// Extracts TeX from MathJax and stores in data-tex attributes
// Handles both MathJax 2.x (.mjpage) and MathJax 3.x (mjx-container)
(function () {
    function extractTex() {
        // MathJax 3.x: mjx-container elements
        const mjx3 = document.querySelectorAll('mjx-container:not([data-tex])');
        mjx3.forEach(container => {
            try {
                if (typeof MathJax !== 'undefined' && MathJax?.startup?.document) {
                    const items = MathJax.startup.document.getMathItemsWithin(container);
                    if (items[0]?.math) {
                        container.setAttribute('data-tex', items[0].math);
                    }
                }
            } catch (e) { }
        });

        // MathJax 2.x: .mjpage spans with SVG containing title
        const mjx2 = document.querySelectorAll('.mjpage:not([data-tex])');
        mjx2.forEach(container => {
            const title = container.querySelector('svg title');
            if (title?.textContent) {
                container.setAttribute('data-tex', title.textContent);
            }
        });

        console.log('[Autobot TeX] Extracting from', mjx3.length, 'MJX3 +', mjx2.length, 'MJX2 containers');
    }

    extractTex();
    document.addEventListener('autobot-extract-tex', extractTex);
    console.log('[Autobot TeX] Ready');
})();
