import { STORAGE_KEYS, DEFAULT_DECK } from '@/utils/constants';

const deckSelect = document.getElementById('deck') as HTMLSelectElement;
const modeSelect = document.getElementById('mode') as HTMLSelectElement;
const choicesCheckbox = document.getElementById('choices') as HTMLInputElement;
const labelFormatSelect = document.getElementById('labelFormat') as HTMLSelectElement;
const labelFormatGroup = document.getElementById('labelFormatGroup')!;
const textModeOptions = document.getElementById('textModeOptions')!;
const fixDarkModeCheckbox = document.getElementById('fixDarkMode') as HTMLInputElement;
const statusEl = document.getElementById('status')!;

async function init() {
  try {
    console.log('[Autobot] Requesting deck names...');
    const decks = await browser.runtime.sendMessage({ action: 'getDeckNames' });
    console.log('[Autobot] Response:', decks);

    if (!decks || !Array.isArray(decks)) {
      throw new Error(`Invalid response: ${JSON.stringify(decks)}`);
    }

    const {
      [STORAGE_KEYS.deck]: savedDeck,
      [STORAGE_KEYS.mode]: savedMode,
      [STORAGE_KEYS.includeChoices]: savedChoices,
      [STORAGE_KEYS.labelFormat]: savedLabelFormat,
      [STORAGE_KEYS.fixDarkMode]: savedFixDarkMode,
    } = await browser.storage.local.get([
      STORAGE_KEYS.deck,
      STORAGE_KEYS.mode,
      STORAGE_KEYS.includeChoices,
      STORAGE_KEYS.labelFormat,
      STORAGE_KEYS.fixDarkMode,
    ]);

    decks.forEach((name: string) => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = name;
      opt.selected = name === (savedDeck || DEFAULT_DECK);
      deckSelect.appendChild(opt);
    });

    modeSelect.value = (savedMode as string) || 'text';
    choicesCheckbox.checked = (savedChoices as boolean) || false;
    labelFormatSelect.value = (savedLabelFormat as string) || 'paren';
    labelFormatGroup.classList.toggle('visible', choicesCheckbox.checked);
    textModeOptions.classList.toggle('visible', modeSelect.value === 'text');
    // Default to true if not set
    fixDarkModeCheckbox.checked = savedFixDarkMode !== false;

    statusEl.textContent = 'Connected to Anki';
  } catch (err) {
    console.error('[Autobot] Error:', err);
    statusEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

deckSelect.onchange = () => {
  browser.storage.local.set({ [STORAGE_KEYS.deck]: deckSelect.value });
};

modeSelect.onchange = () => {
  browser.storage.local.set({ [STORAGE_KEYS.mode]: modeSelect.value });
  textModeOptions.classList.toggle('visible', modeSelect.value === 'text');
};

choicesCheckbox.onchange = () => {
  browser.storage.local.set({ [STORAGE_KEYS.includeChoices]: choicesCheckbox.checked });
  labelFormatGroup.classList.toggle('visible', choicesCheckbox.checked);
};

labelFormatSelect.onchange = () => {
  browser.storage.local.set({ [STORAGE_KEYS.labelFormat]: labelFormatSelect.value });
};

fixDarkModeCheckbox.onchange = () => {
  browser.storage.local.set({ [STORAGE_KEYS.fixDarkMode]: fixDarkModeCheckbox.checked });
};

init();
