import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: '.',
  manifest: {
    name: 'Autobot',
    description: 'Create Anki flashcards from MathAcademy lessons',
    permissions: ['storage'],
    host_permissions: ['http://localhost:8765/*', 'http://127.0.0.1:8765/*'],
    web_accessible_resources: [{
      resources: ['tex-extractor.js'],
      matches: ['<all_urls>'],
    }],
  },
});

