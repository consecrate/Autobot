# Autobot Minimization & Efficiency Plan (Review First)

## Scope

This document proposes **only** code-reduction and simplification opportunities.
No implementation changes are included yet.

Primary goal: reduce unnecessary code paths and maintenance overhead while preserving current behavior.

## Ground Rules for Implementation (after approval)

1. Preserve user-visible behavior in lesson and results flows.
2. Prefer deletion/consolidation over refactors that expand abstractions.
3. Ship in small, reversible commits by risk tier.
4. Run `npm run compile` after each tier.

## Findings: High-Confidence Simplification Targets

### Tier 1 — Low-Risk, Immediate Wins

1. Remove unused template file
   - Candidate: `components/counter.ts`
   - Why: no usages found in project source.
   - Expected impact: dead code removal only.

2. Remove unused settings accessor wrappers
   - Candidate: `utils/settings.ts`
   - Functions: `getDeck`, `getMode`, `getIncludeChoices`, `getLabelFormat`, `getFixDarkMode`
   - Why: only definitions + generated `.wxt/types/imports.d.ts` references; runtime code uses `getAllSettings`.
   - Expected impact: API surface reduction, less maintenance.

3. Collapse thin extraction wrapper layer
   - Candidates: `utils/pipeline/extractorCore.ts` + call site in `utils/pipeline/cardPipeline.ts`
   - Why: `extractCardContent` currently wraps 2–3 `extractContent(...)` calls with minimal added logic.
   - Expected impact: one fewer module and fewer indirections.

4. Reduce duplicated button inline style strings via shared constants/helpers
   - Candidate: `entrypoints/content.ts`
   - Why: repeated style literals for step/result/add-all buttons increase file size and drift risk.
   - Expected impact: smaller script and simpler edits without behavioral change.

### Tier 2 — Moderate-Risk, Still Likely Worth It

5. Simplify marker lookup shape if legacy list is effectively unused
   - Candidates: `utils/pipeline/markerService.ts`, `entrypoints/content.ts`, `utils/card.ts`
   - Observation: `MarkerLookup` contains `legacy: string[]`, but `getLookupMarkers(...)` currently returns canonical only.
   - Plan: remove/flatten legacy structure if no active migration dependency remains.
   - Risk: duplicate detection regression for older notes if assumptions are wrong.

6. Remove façade indirection in card orchestration
   - Candidates: `utils/card.ts`, imports in `entrypoints/content.ts`
   - Observation: `addCard` simply forwards to `runCardPipeline`; `removeNote` is lightweight marker plumbing.
   - Plan: either inline into content layer or merge into pipeline/marker services.
   - Risk: low-medium (touches central call paths).

7. Consolidate background message typing duplication
   - Candidate: `entrypoints/background.ts`
   - Observation: local `ExtractStructureMessage` duplicates message contracts already in `utils/messages.ts`.
   - Expected impact: less type duplication and cleaner handler map.

### Tier 3 — Investigate Before Touching

8. Evaluate logging noise reduction
   - Candidates: `entrypoints/content.ts`, `entrypoints/popup/main.ts`, `utils/extract.ts`, `utils/extractContent.ts`
   - Observation: many unconditional logs in hot paths.
   - Plan: gate non-essential logs behind debug flags.
   - Risk: reduced diagnostics if over-pruned.

9. Reassess `domSnapshot` runtime inclusion
   - Candidates: `utils/domSnapshot.ts`, `entrypoints/content.ts`
   - Observation: structure extraction is dev-tool oriented but message listener is always registered.
   - Plan: ensure this path stays lightweight or guarded.
   - Risk: might affect troubleshooting workflow.

## Proposed Execution Sequence (Post-Approval)

### Phase A (Safe Deletions & Consolidations)

- Remove `components/counter.ts`.
- Remove unused settings accessor functions.
- Inline extractorCore usage into `cardPipeline` and delete `extractorCore.ts`.
- Compile check.

### Phase B (Targeted Structural Simplification)

- Consolidate duplicated button styling blocks in `content.ts`.
- Reduce/flatten card façade (`utils/card.ts`) if still redundant after Phase A.
- Compile check.

### Phase C (Compatibility-Guarded Cleanup)

- Validate marker compatibility assumptions with existing note markers.
- If safe, simplify `MarkerLookup` shape and related plumbing.
- Compile check + manual smoke checklist.

## Validation Checklist (Per Phase)

1. `npm run compile` passes.
2. Lesson page still injects per-step button correctly.
3. Results page still injects per-question + Add All buttons.
4. Add/remove toggle still reflects note state.
5. Text mode unresolved-math fallback still works.

## Out of Scope

- No feature additions.
- No UX redesign.
- No behavioral changes to extraction logic unless explicitly approved.

## Decision Needed

If you approve, I will execute **Tier 1 / Phase A first** as the safest code-stripping pass, then stop for review before moving to Tier 2.
