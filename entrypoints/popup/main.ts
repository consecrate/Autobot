const DECK_KEY = 'autobot_deck';
const MODE_KEY = 'autobot_mode';
const CHOICES_KEY = 'autobot_include_choices';
const LABEL_FORMAT_KEY = 'autobot_label_format';
const FIX_DARK_MODE_KEY = 'autobot_fix_dark_mode';
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

    const { [DECK_KEY]: savedDeck, [MODE_KEY]: savedMode, [CHOICES_KEY]: savedChoices, [LABEL_FORMAT_KEY]: savedLabelFormat, [FIX_DARK_MODE_KEY]: savedFixDarkMode } = await browser.storage.local.get([DECK_KEY, MODE_KEY, CHOICES_KEY, LABEL_FORMAT_KEY, FIX_DARK_MODE_KEY]);

    decks.forEach((name: string) => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = name;
      opt.selected = name === (savedDeck || 'MathAcademy');
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
  browser.storage.local.set({ [DECK_KEY]: deckSelect.value });
};

modeSelect.onchange = () => {
  browser.storage.local.set({ [MODE_KEY]: modeSelect.value });
  textModeOptions.classList.toggle('visible', modeSelect.value === 'text');
};

choicesCheckbox.onchange = () => {
  browser.storage.local.set({ [CHOICES_KEY]: choicesCheckbox.checked });
  labelFormatGroup.classList.toggle('visible', choicesCheckbox.checked);
};

labelFormatSelect.onchange = () => {
  browser.storage.local.set({ [LABEL_FORMAT_KEY]: labelFormatSelect.value });
};

fixDarkModeCheckbox.onchange = () => {
  browser.storage.local.set({ [FIX_DARK_MODE_KEY]: fixDarkModeCheckbox.checked });
};

init();
