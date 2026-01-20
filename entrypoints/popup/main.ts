const DECK_KEY = 'autobot_deck';
const MODE_KEY = 'autobot_mode';
const deckSelect = document.getElementById('deck') as HTMLSelectElement;
const modeSelect = document.getElementById('mode') as HTMLSelectElement;
const statusEl = document.getElementById('status')!;

async function init() {
  try {
    console.log('[Autobot] Requesting deck names...');
    const decks = await browser.runtime.sendMessage({ action: 'getDeckNames' });
    console.log('[Autobot] Response:', decks);

    if (!decks || !Array.isArray(decks)) {
      throw new Error(`Invalid response: ${JSON.stringify(decks)}`);
    }

    const { [DECK_KEY]: savedDeck, [MODE_KEY]: savedMode } = await browser.storage.local.get([DECK_KEY, MODE_KEY]);

    decks.forEach((name: string) => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = name;
      opt.selected = name === (savedDeck || 'MathAcademy');
      deckSelect.appendChild(opt);
    });

    modeSelect.value = (savedMode as string) || 'image';

    statusEl.textContent = 'Connected to Anki';
  } catch (err) {
    console.error('[Autobot] Error:', err);
    statusEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

deckSelect.onchange = () => {
  browser.storage.local.set({ [DECK_KEY]: deckSelect.value });
};

modeSelect.onchange = () => {
  browser.storage.local.set({ [MODE_KEY]: modeSelect.value });
};

init();
