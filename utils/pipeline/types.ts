import type { AutobotSettings } from "@/utils/settings";

export interface CardElements {
  front: HTMLElement;
  frontSupplement?: HTMLElement | null;
  back: HTMLElement;
  choices?: HTMLElement | null;
  graphic?: HTMLElement | null;
}

export type FragmentType =
  | "text"
  | "math-tex"
  | "image-ref"
  | "table"
  | "line-break";

export interface FragmentIR {
  type: FragmentType;
  value: string;
}

export interface ExtractionOutput {
  front: FragmentIR[];
  back: FragmentIR[];
  warnings: string[];
}

export interface BuildResult {
  frontHtml: string;
  backHtml: string;
  mediaFiles: string[];
  diagnostics: string[];
}

export interface CardBuildInput {
  marker: string;
  elements: CardElements;
  settings: AutobotSettings;
  tags: string[];
  prepareCapture?: () => () => void;
}
