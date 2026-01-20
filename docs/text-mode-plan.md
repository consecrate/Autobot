# Text Mode Export Feature

Add a toggle in the extension popup to switch between **Image** and **Text** export modes for Anki cards.

## Background

Currently, cards are captured as PNG images using `modern-screenshot`. This works well for preserving visual fidelity, but text mode offers:
- Searchable content in Anki
- Editable cards
- Smaller file sizes
- Native MathJax rendering in Anki

## Proposed Changes

### Popup UI

#### [MODIFY] [index.html](file:///Users/thientrung/Projects/Autobot/entrypoints/popup/index.html)

Add export mode toggle:
```html
<label for="mode">Mode:</label>
<select id="mode">
  <option value="image">📷 Image</option>
  <option value="text">📝 Text</option>
</select>
```

#### [MODIFY] [main.ts](file:///Users/thientrung/Projects/Autobot/entrypoints/popup/main.ts)

Add mode persistence to `chrome.storage.local` (similar to deck selection).

---

### Text Extraction

#### [NEW] [extract.ts](file:///Users/thientrung/Projects/Autobot/utils/extract.ts)

New utility to extract text + math from DOM elements:

```typescript
export function extractContent(el: HTMLElement): string
```

**Logic:**
1. Walk DOM tree recursively
2. For `<mjx-container>` elements: extract MathML from `<mjx-assistive-mml>`, convert to LaTeX, wrap in `\[...\]` or `\(...\)`
3. For regular elements: extract `textContent`
4. Preserve paragraph structure

**MathML → LaTeX conversion** using [`mathml-to-latex`](https://www.npmjs.com/package/mathml-to-latex) npm package.

---

### Anki Integration

#### [MODIFY] [anki.ts](file:///Users/thientrung/Projects/Autobot/utils/anki.ts)

Add text-based note creation:
```typescript
export const addTextNote = (
  deckName: string,
  front: string,
  back: string,
  tags: string[]
) => invoke<number>('addNote', {
  note: {
    deckName,
    modelName: 'Basic',
    fields: { Front: front, Back: back },
    tags,
  },
});
```

---

### Content Script

#### [MODIFY] [content.ts](file:///Users/thientrung/Projects/Autobot/entrypoints/content.ts)

Update `stepName.onclick` handler:
1. Read export mode from storage
2. If `image`: use existing `captureElement()` flow
3. If `text`: use new `extractContent()` flow

---

### Background Script

#### [MODIFY] [background.ts](file:///Users/thientrung/Projects/Autobot/entrypoints/background.ts)

Handle new message type for text notes:
```typescript
if (msg.action === 'addTextNote') {
  addTextNote(msg.deckName, msg.front, msg.back, msg.tags)
    .then(sendResponse)
    .catch((err) => sendResponse({ error: err.message }));
  return true;
}
```

---

## File Summary

| File | Action |
|------|--------|
| `entrypoints/popup/index.html` | Add mode selector |
| `entrypoints/popup/main.ts` | Persist mode setting |
| `utils/extract.ts` | **NEW** - Text + math extraction |
| `utils/anki.ts` | Add `addTextNote()` |
| `entrypoints/content.ts` | Branch on export mode |
| `entrypoints/background.ts` | Handle `addTextNote` action |
| `package.json` | Add `mathml-to-latex` dependency |

---

## Verification Plan

### Manual Testing

1. **Build extension**: `npm run dev`
2. **Load in Chrome**: Go to `chrome://extensions`, load unpacked from `.output/chrome-mv3-dev`
3. **Open popup**: Click extension icon, verify mode dropdown appears
4. **Toggle mode**: Select "Text", close and reopen popup → should persist
5. **Test text export**:
   - Navigate to a MathAcademy lesson
   - Click a step name to add card
   - Open Anki → verify card has text + rendered math (not image)
6. **Test image export**: Switch back to image mode, repeat → verify PNG embedded

### Edge Cases to Verify

- Math with fractions, superscripts, matrices renders correctly
- Multi-paragraph explanations preserve structure
- Mixed text + math content extracts properly
