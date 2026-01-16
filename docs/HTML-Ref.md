# MathAcademy HTML Structure Reference

Condensed guide for DOM targeting in MathAcademy lessons.

---

## 1. Page Container & Loading
All content resides in `#steps`. Steps are loaded dynamically as the user progresses. Use a `MutationObserver` on `#steps` to detect new `.step` elements.

```html
<div id="steps">
  <div id="step-e123" class="step" style="display: block">...</div>
</div>
```

---

## 2. Core Step Types

### Example (Worked Problem)
Target: `exampleQuestion` (Front) → `exampleExplanation` (Back).

```html
<div class="example">
  <div class="stepHeader"><span class="stepType">Example:</span> Solving...</div>
  <div class="exampleQuestion"><p>Solve for x...</p></div>
  <div class="exampleExplanationHeader">EXPLANATION</div>
  <div class="exampleExplanation"><p>To remove the logarithm...</p></div>
</div>
```

### Question (Practice Problem)
Target: `questionWidget-text` + optional `choicesTable` (Front) → `questionWidget-explanation` (Back).

```html
<div class="step questionWidget">
  <div class="questionWidget-title">Question 1</div>
  <div class="questionWidget-text"><p>Find the solution...</p></div>
  <table class="questionWidget-choicesTable">...</table>
  <div class="questionWidget-result">Correct</div> <!-- Only visible after submit -->
  <div class="questionWidget-explanation">...</div> <!-- Useful after submit -->
</div>
```

---

## 3. Key Selectors

| Component | Example Selector | Question Selector |
|-----------|------------------|-------------------|
| **Container** | `.step .example` | `.step.questionWidget` |
| **Front** | `.exampleQuestion` | `.questionWidget-text`, `.questionWidget-choicesTable` |
| **Back** | `.exampleExplanation` | `.questionWidget-explanation` |
| **Context** | `.stepHeader .stepName` | `.questionWidget-title` |

---

## 4. Implementation Details

### Math Rendering
Math is pre-rendered as **SVG** within `<span class="mjpage">`. `html2canvas` captures these directly. No LaTeX parsing required.

### Button Injection
Inject "Add to Anki" buttons into `.stepHeader` (for Examples) or `.questionWidget-header` (for Questions). Alternatively, use a floating overlay in the top-right of the `.step` container.

### Capture Logic
- **Examples**: Capture `.exampleQuestion` and `.exampleExplanation`.
- **Questions**: Combine `.questionWidget-text` and `.questionWidget-choicesTable` for Front. Wait for `.questionWidget-explanation` to appear before allowing capture.
- **Lesson Tags**: Extract from `document.title` or `.lessonTitle` element.

---

## 5. Quick Summary Table

| Type | Target Front | Target Back | Action |
|------|--------------|-------------|--------|
| **Tutorial** | N/A | N/A | Skip (v1) |
| **Example** | `.exampleQuestion` | `.exampleExplanation` | Capture immediately |
| **Question** | Text + Choices | `.questionWidget-explanation` | Capture after answer |
| **Global** | `#steps` | N/A | Observe for new steps |
