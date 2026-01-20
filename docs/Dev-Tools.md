# Development Tools for Autobot

Dev tools to make development and debugging easier, especially since the extension relies heavily on MathAcademy's DOM structure.

---

## 1. DOM Snapshot Tool

**Problem**: MathAcademy could change their HTML structure at any time, breaking all selectors.

**Solution**: A tool that captures and saves raw HTML snapshots of current lesson pages.

### Features
- Captures full HTML of current page to `dev/snapshots/`
- Triggered via keyboard shortcut (e.g., `Ctrl+Shift+S`) or dev-mode button
- Stores metadata about detected selectors
- Enables diff comparison over time to detect structural changes

### Output Format
```json
{
  "timestamp": "2026-01-20T10:14:14",
  "url": "mathacademy.com/lesson/xyz",
  "selectors": {
    ".exampleQuestion": { "found": true, "count": 3 },
    ".questionWidget-text": { "found": true, "count": 5 },
    ".exampleExplanation": { "found": true, "count": 3 }
  },
  "html": "<full HTML snapshot>"
}
```

---

## 2. Selector Validator Panel

**Problem**: No visibility into which selectors are working/broken until something fails.

**Solution**: A floating dev panel showing live status of all selectors.

### Features
- Toggle via console command or popup checkbox
- Shows real-time status of all selectors from `utils/dom.ts`
- Highlights detected/missing elements on the page
- Displays element counts and visibility states
- Red/green indicators for each selector

### UI Example
```
┌─ Autobot Selector Validator ─────┐
│ ✅ #steps (1)                     │
│ ✅ .step (5)                      │
│ ✅ .example (3)                   │
│ ✅ .exampleQuestion (3)           │
│ ✅ .exampleExplanation (3)        │
│ ✅ .questionWidget (2)            │
│ ❌ .questionWidget-choices (0)    │
└───────────────────────────────────┘
```

---

## 3. Capture Preview Mode

**Problem**: Rendering issues (MathJax not loaded, elements cut off, wrong dimensions) only discovered after adding to Anki.

**Solution**: Show preview modal before sending to Anki.

### Features
- Side-by-side comparison: original DOM vs captured image
- Display actual pixel dimensions and file sizes
- Ability to cancel or retry capture
- Prevents polluting Anki deck with broken cards

### Modal Layout
```
┌─────────────────────────────────────────┐
│  Front (1200x400px, 145KB)              │
│  [Original DOM] | [Captured PNG]        │
│                                         │
│  Back (1200x800px, 230KB)               │
│  [Original DOM] | [Captured PNG]        │
│                                         │
│  [Cancel] [Retry] [Add to Anki]         │
└─────────────────────────────────────────┘
```

---

## 4. Mock MathAcademy Pages

**Problem**: Development/testing requires navigating to specific MathAcademy lessons, which is time-consuming.

**Solution**: Store sanitized HTML fixtures for local testing.

### Directory Structure
```
dev/fixtures/
├── example-simple.html
├── example-long-content.html
├── question-multiple-choice.html
├── question-with-diagram.html
├── edge-case-nested-mathjax.html
└── mixed-content-page.html
```

### Benefits
- Test without real MathAcademy account
- CI/automated testing
- Regression testing when updating selectors
- On-demand edge case testing
- Faster iteration cycle

---

## 5. Console Logging Levels

**Problem**: Too much logging clutters console; too little makes debugging hard.

**Solution**: Configurable debug flag for verbose logging.

### Implementation
```typescript
// In content.ts or utils/debug.ts
const DEBUG = localStorage.getItem('autobot_debug') === 'true';

function log(...args: any[]) {
  if (DEBUG) console.log('[Autobot]', ...args);
}

function warn(...args: any[]) {
  console.warn('[Autobot]', ...args);
}

function error(...args: any[]) {
  console.error('[Autobot]', ...args);
}
```

### Usage
```javascript
// Enable debug mode in console
localStorage.setItem('autobot_debug', 'true');

// Disable debug mode
localStorage.removeItem('autobot_debug');
```

---

## 6. Dry-Run Mode

**Problem**: Testing capture logic creates junk cards in Anki.

**Solution**: Skip AnkiConnect call but show what would be sent.

### Features
- Display preview of note data without creating card
- Shows deck name, tags, image sizes
- Base64 preview of images
- Toggle via popup or console flag

### Console Output Example
```
[Autobot Dry-Run]
  Deck: MathAcademy
  Tags: ["mathacademy", "logarithmic-equations"]
  Front: 1200x400px (145KB)
  Back: 1200x800px (230KB)
  
  (Card NOT created - dry-run mode active)
```

---

## Priority Ranking

### Top Priority: DOM Snapshot + Selector Validator
MathAcademy's structure changing is the #1 fragility risk. These tools make it instantly visible when something breaks.

**Impact**: Prevents complete extension breakage from undetected DOM changes.

### Second Priority: Mock Fixtures
Development/debugging without needing to navigate to specific MathAcademy lessons saves massive time.

**Impact**: 10x faster iteration speed during development.

### Third Priority: Capture Preview + Dry-Run
Prevents bad data from entering Anki and speeds up testing.

**Impact**: Better UX and cleaner Anki decks.

---

## Implementation Notes

- All dev tools should be gated behind a `DEV_MODE` flag
- Dev tools should not increase production bundle size
- Use conditional imports: `if (DEV_MODE) import('./dev-tools')`
- Store dev-related files in `dev/` directory (already exists)
