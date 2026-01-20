// Extracts TeX from MathJax and stores in data-tex attributes
(function () {
    function extractTex() {
        if (typeof MathJax === 'undefined' || !MathJax?.startup?.document) {
            console.log('[Autobot TeX] MathJax not ready');
            return;
        }

        const containers = document.querySelectorAll('mjx-container:not([data-tex])');
        console.log('[Autobot TeX] Extracting from', containers.length, 'containers');

        containers.forEach(container => {
            try {
                const items = MathJax.startup.document.getMathItemsWithin(container);
                if (items[0]?.math) {
                    container.setAttribute('data-tex', items[0].math);
                }
            } catch (e) { }
        });
    }

    // Run immediately
    extractTex();

    // Listen for re-extraction requests
    document.addEventListener('autobot-extract-tex', extractTex);

    console.log('[Autobot TeX] Ready, listening for events');
})();
