// Storage keys (shared between content script and popup)
export const STORAGE_KEYS = {
  deck: 'autobot_deck',
  mode: 'autobot_mode',
  includeChoices: 'autobot_include_choices',
  labelFormat: 'autobot_label_format',
  fixDarkMode: 'autobot_fix_dark_mode',
} as const;

export const DEFAULT_DECK = 'MathAcademy';

// CSS classes for Autobot UI elements
export const CSS_CLASSES = {
  ankiButton: 'autobotAnkiButton',
  addAllButton: 'autobotAddAllButton',
  addAllIncorrectButton: 'autobotAddAllIncorrectButton',
} as const;

// MathJax tag/class names
export const MATHJAX = {
  mjxContainer: 'mjx-container',
  mjpage: 'mjpage',
  mjpageBlock: 'mjpage__block',
} as const;

// DOM identifiers
export const DOM_IDS = {
  freeResponsePrefix: 'freeResponseTextbox',
} as const;

// Custom events
export const EVENTS = {
  extractTex: 'autobot-extract-tex',
} as const;

export type CaptureMode = 'image' | 'text';
export type LabelFormat = 'paren' | 'dot' | 'bracket';
