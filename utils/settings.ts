import { STORAGE_KEYS, DEFAULT_DECK } from './constants';
import type { CaptureMode, LabelFormat } from './constants';

export interface AutobotSettings {
  deck: string;
  mode: CaptureMode;
  includeChoices: boolean;
  labelFormat: LabelFormat;
  fixDarkMode: boolean;
}

export async function getDeck(): Promise<string> {
  const result = await browser.storage.local.get(STORAGE_KEYS.deck);
  return (result[STORAGE_KEYS.deck] as string) || DEFAULT_DECK;
}

export async function getMode(): Promise<CaptureMode> {
  const result = await browser.storage.local.get(STORAGE_KEYS.mode);
  return (result[STORAGE_KEYS.mode] as CaptureMode) || 'text';
}

export async function getIncludeChoices(): Promise<boolean> {
  const result = await browser.storage.local.get(STORAGE_KEYS.includeChoices);
  return (result[STORAGE_KEYS.includeChoices] as boolean) || false;
}

export async function getLabelFormat(): Promise<LabelFormat> {
  const result = await browser.storage.local.get(STORAGE_KEYS.labelFormat);
  const value = result[STORAGE_KEYS.labelFormat] as string;
  if (value === 'dot' || value === 'bracket') return value;
  return 'paren';
}

export async function getFixDarkMode(): Promise<boolean> {
  const result = await browser.storage.local.get(STORAGE_KEYS.fixDarkMode);
  // Default to true if not set
  return result[STORAGE_KEYS.fixDarkMode] !== false;
}

export async function getAllSettings(): Promise<AutobotSettings> {
  const [deck, mode, includeChoices, labelFormat, fixDarkMode] = await Promise.all([
    getDeck(),
    getMode(),
    getIncludeChoices(),
    getLabelFormat(),
    getFixDarkMode(),
  ]);
  return { deck, mode, includeChoices, labelFormat, fixDarkMode };
}
