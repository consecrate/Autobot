import { STORAGE_KEYS, DEFAULT_DECK } from "@/utils/constants";
import { getAllSettings } from "@/utils/settings";

const deckSelect = document.getElementById("deck") as HTMLSelectElement;
const modeSelect = document.getElementById("mode") as HTMLSelectElement;
const choicesCheckbox = document.getElementById("choices") as HTMLInputElement;
const labelFormatSelect = document.getElementById(
  "labelFormat",
) as HTMLSelectElement;
const labelFormatGroup = document.getElementById("labelFormatGroup")!;
const textModeOptions = document.getElementById("textModeOptions")!;
const fixDarkModeCheckbox = document.getElementById(
  "fixDarkMode",
) as HTMLInputElement;
const statusEl = document.getElementById("status")!;
const extractStructureBtn = document.getElementById(
  "extractStructureBtn",
) as HTMLButtonElement;

async function init() {
  try {
    console.log("[Autobot] Requesting deck names...");
    const decks = await browser.runtime.sendMessage({ action: "getDeckNames" });
    console.log("[Autobot] Response:", decks);

    if (!decks || !Array.isArray(decks)) {
      throw new Error(`Invalid response: ${JSON.stringify(decks)}`);
    }

    const settings = await getAllSettings();

    decks.forEach((name: string) => {
      const opt = document.createElement("option");
      opt.value = opt.textContent = name;
      opt.selected = name === (settings.deck || DEFAULT_DECK);
      deckSelect.appendChild(opt);
    });

    modeSelect.value = settings.mode;
    choicesCheckbox.checked = settings.includeChoices;
    labelFormatSelect.value = settings.labelFormat;
    labelFormatGroup.classList.toggle("visible", choicesCheckbox.checked);
    textModeOptions.classList.toggle("visible", modeSelect.value === "text");
    fixDarkModeCheckbox.checked = settings.fixDarkMode;

    statusEl.textContent = "Connected to Anki";
  } catch (err) {
    console.error("[Autobot] Error:", err);
    statusEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

deckSelect.onchange = () => {
  browser.storage.local.set({ [STORAGE_KEYS.deck]: deckSelect.value });
};

modeSelect.onchange = () => {
  browser.storage.local.set({ [STORAGE_KEYS.mode]: modeSelect.value });
  textModeOptions.classList.toggle("visible", modeSelect.value === "text");
};

choicesCheckbox.onchange = () => {
  browser.storage.local.set({
    [STORAGE_KEYS.includeChoices]: choicesCheckbox.checked,
  });
  labelFormatGroup.classList.toggle("visible", choicesCheckbox.checked);
};

labelFormatSelect.onchange = () => {
  browser.storage.local.set({
    [STORAGE_KEYS.labelFormat]: labelFormatSelect.value,
  });
};

fixDarkModeCheckbox.onchange = () => {
  browser.storage.local.set({
    [STORAGE_KEYS.fixDarkMode]: fixDarkModeCheckbox.checked,
  });
};

extractStructureBtn.onclick = async () => {
  extractStructureBtn.disabled = true;
  extractStructureBtn.textContent = "Extracting...";
  try {
    const response = await browser.runtime.sendMessage({
      action: "extractStructure",
    });
    if ("error" in response) {
      statusEl.textContent = `Error: ${response.error}`;
    } else {
      await navigator.clipboard.writeText(JSON.stringify(response, null, 2));
      statusEl.textContent = "Structure copied to clipboard.";
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    statusEl.textContent = `Error: ${errorMsg}`;
  } finally {
    extractStructureBtn.disabled = false;
    extractStructureBtn.textContent = "Copy Page Structure";
  }
};

init();
