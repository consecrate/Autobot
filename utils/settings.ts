import { STORAGE_KEYS, DEFAULT_DECK } from "./constants";
import type { CaptureMode, LabelFormat } from "./constants";

export interface AutobotSettings {
  deck: string;
  mode: CaptureMode;
  includeChoices: boolean;
  labelFormat: LabelFormat;
  fixDarkMode: boolean;
}

const SETTINGS_STORAGE_KEYS = [
  STORAGE_KEYS.deck,
  STORAGE_KEYS.mode,
  STORAGE_KEYS.includeChoices,
  STORAGE_KEYS.labelFormat,
  STORAGE_KEYS.fixDarkMode,
] as const;

function normalizeLabelFormat(value: unknown): LabelFormat {
  return value === "dot" || value === "bracket" ? value : "paren";
}

function normalizeMode(value: unknown): CaptureMode {
  return value === "image" || value === "text" ? value : "text";
}

export function parseSettings(raw: Record<string, unknown>): AutobotSettings {
  return {
    deck: (raw[STORAGE_KEYS.deck] as string) || DEFAULT_DECK,
    mode: normalizeMode(raw[STORAGE_KEYS.mode]),
    includeChoices: raw[STORAGE_KEYS.includeChoices] !== false,
    labelFormat: normalizeLabelFormat(raw[STORAGE_KEYS.labelFormat]),
    fixDarkMode: raw[STORAGE_KEYS.fixDarkMode] !== false,
  };
}

export async function getAllSettings(): Promise<AutobotSettings> {
  const raw = await browser.storage.local.get([...SETTINGS_STORAGE_KEYS]);
  return parseSettings(raw as Record<string, unknown>);
}
