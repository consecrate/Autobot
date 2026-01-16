const DECK_KEY = 'autobot_deck';
const deckSelect = document.getElementById('deck') as HTMLSelectElement;
const statusEl = document.getElementById('status')!;

async function init() {
  try {
    console.log('[Autobot] Requesting deck names...');
    const decks = await browser.runtime.sendMessage({ action: 'getDeckNames' });
    console.log('[Autobot] Response:', decks);

    if (!decks || !Array.isArray(decks)) {
      throw new Error(`Invalid response: ${JSON.stringify(decks)}`);
    }

    const saved = (await browser.storage.local.get(DECK_KEY))[DECK_KEY] || 'MathAcademy';

    decks.forEach((name: string) => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = name;
      opt.selected = name === saved;
      deckSelect.appendChild(opt);
    });

    statusEl.textContent = 'Connected to Anki';
  } catch (err) {
    console.error('[Autobot] Error:', err);
    statusEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

deckSelect.onchange = () => {
  browser.storage.local.set({ [DECK_KEY]: deckSelect.value });
};

init();
