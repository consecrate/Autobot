# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Autobot** is a Chrome/Firefox extension that creates Anki flashcards from MathAcademy lessons. It injects "Add to Anki" buttons on lesson steps (examples and questions), captures content (as images or extracted text/math), and sends cards to Anki via AnkiConnect API.

Built with [WXT](https://wxt.dev/) framework for cross-browser extension development.

## Build Commands

```bash
# Development (Chrome)
npm run dev

# Development (Firefox)
npm run dev:firefox

# Production build
npm run build
npm run build:firefox

# Type checking
npm run compile

# Create distributable ZIP
npm run zip
npm run zip:firefox

# Setup (run after npm install)
npm run postinstall  # Generates .wxt/tsconfig.json
```

## Architecture

### Core Components

**Content Script** (`entrypoints/content.ts`)
- Injects into MathAcademy lesson pages
- Uses MutationObserver to detect new step elements (#steps)
- Makes step names clickable to add/remove flashcards
- Handles both "image mode" (screenshots) and "text mode" (extracted TeX)
- Communicates with background script via browser.runtime.sendMessage

**Background Script** (`entrypoints/background.ts`)
- Message router between content script and AnkiConnect
- Proxies all Anki API calls (getDeckNames, addNote, findNotes, deleteNotes, storeMediaFile)
- No complex logic - just async message forwarding

**Popup** (`entrypoints/popup/`)
- Settings UI for deck selection, capture mode, and options
- Fetches available Anki decks on load
- Persists settings to browser.storage.local

### Utility Modules

**DOM Utilities** (`utils/dom.ts`)
- Selectors for MathAcademy's HTML structure (.step, .example, .questionWidget)
- Functions: getStepType(), getFrontBackElements(), getLessonName()
- Distinguishes "example" vs "question" step types

**Anki Integration** (`utils/anki.ts`)
- AnkiConnect API client (localhost:8765)
- Functions: getDeckNames(), addNote(), addTextNote(), findNotes(), deleteNotes(), storeMediaFile()
- All functions use invoke() wrapper that handles JSON-RPC v6 protocol

**Image Capture** (`utils/capture.ts`)
- Uses modern-screenshot library (domToPng)
- Captures scrollable content with padding
- Hides free response answers before capture
- Returns base64 PNG data

**Content Extraction** (`utils/extract.ts`)
- Extracts text and TeX from DOM elements
- Handles MathJax 2.x (.mjpage) and 3.x (mjx-container)
- Fetches and embeds images as base64 for Anki media storage
- Supports custom label formats for multiple choice (a) vs a. vs (a))
- Returns { content: string, images: Array<{placeholder, src}> }

**TeX Extraction** (`public/tex-extractor.js`)
- Injected as web-accessible resource to bypass CSP
- Extracts TeX source from MathJax and stores in data-tex attributes
- Listens for 'autobot-extract-tex' custom event

### Data Flow

1. User clicks step name on MathAcademy page
2. Content script determines step type (example/question)
3. **Image mode**: captureElement() → sends base64 PNGs to background → AnkiConnect addNote
4. **Text mode**: extractContent() → fetches external images → storeMediaFile in Anki → addTextNote with TeX/HTML
5. Background script forwards to AnkiConnect (http://127.0.0.1:8765)
6. Content script checks for duplicates using hidden HTML marker: `<!-- autobot:lesson-name:step-name -->`

### Configuration

User settings stored in browser.storage.local:
- `autobot_deck`: Target Anki deck name (default: "MathAcademy")
- `autobot_mode`: "image" or "text" capture mode
- `autobot_include_choices`: Include multiple choice options in question front
- `autobot_label_format`: "paren" | "dot" | "bracket" for choice labels
- `autobot_fix_dark_mode`: Add white background to images for dark mode viewing

## Important Implementation Details

### MathAcademy DOM Structure

The extension targets specific elements:
- Container: `#steps`
- Step elements: `.step`
- Examples: `.step .example` with `.exampleQuestion` (front) and `.exampleExplanation` (back)
- Questions: `.step .questionWidget` with `.questionWidget-text` (front), `.questionWidget-choicesTable` (choices), `.questionWidget-explanation` (back)

### Duplicate Detection Strategy

Instead of content hashing, uses a stable HTML marker injected into the Front field:
```html
<!-- autobot:lesson-name:step-name -->
```
This marker persists regardless of user settings changes (include-choices, label format, etc). Search query: `"Front:<!-- autobot:..."`.

### MathJax Handling

Two versions of MathJax are encountered:
- **MathJax 3.x**: `<mjx-container>` elements - extract via MathJax.startup.document.getMathItemsWithin()
- **MathJax 2.x**: `.mjpage` spans with `<svg><title>` - extract from title.textContent

The tex-extractor.js script must run in page context (not content script) to access the MathJax global object.

### Free Response Inputs

Free response textboxes (`[id^="freeResponseTextbox"]`) are:
- Hidden during image capture (innerHTML temporarily cleared)
- Replaced with `\(\boxed{\quad}\)` placeholder in text mode

## Testing Notes

- Requires Anki desktop running with AnkiConnect addon installed
- Test on MathAcademy lesson pages (examples and question widgets)
- Verify both image and text modes work correctly
- Check that TeX renders properly in Anki (install MathJax support in Anki)

## Known Issues

See docs/Bugs.md for current bugs.

## Related Documentation

- `docs/PRD.md` - Original product requirements and technical design
- `docs/HTML-Ref.md` - MathAcademy HTML structure examples
- `wxt.config.ts` - Extension manifest configuration (permissions, web_accessible_resources)
