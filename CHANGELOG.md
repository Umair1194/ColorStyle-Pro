# ColorStyle Pro changes

## 2.0.2 — Selected-frame color detection

- Automatic selection summaries and recursive inventory of fills, strokes, mixed text, shadows and gradient stops, including hidden paints.
- All four Figma gradient kinds retained, with opacity, deduplication and no previous color/gradient count truncation.
- Use frame colors reviews detected bases and includes gradients on apply; cancel preserves prior palette/import state.
- Image pixels are not sampled, and palette-base import uses opaque RGB with source opacity shown.
- All 33 logic/build tests and integrated browser checks pass, including selection summaries, nested gradients, opacity and cancelled imports. Live desktop Figma verification remains pending.

## 2.0.1 — Stuck Working fix

- Removed the Window-source assumption that dropped source-less desktop bridge replies. Responses are matched by UI session and request IDs.
- Added progress replies, a 20-second timeout for unanswered read-only reviews/exports, and safe retry. Generation writes stay locked until completion is confirmed.
- Ignore late/cancelled reviews and report malformed UI replies instead of leaving the interface locked.
- Updated browser integration tests to use source-less MessageEvents; added timeout, late-reply and session checks. All 29 logic/build tests and the integrated browser checks pass.

Close and rerun the development plugin to load both rebuilt artifacts. No saved palette storage keys were changed.

## 2.0.0 — Audit implementation

Implemented the main UX/functionality recommendations in the local plugin:

- F01: one shared calculation; replaced preview-only Steps with exact six/ten-tone choices.
- F02: darker tones separated from themes; optional separate Light/Dark collection with reviewed semantic aliases and sample contrast feedback.
- F03/F04: read-only asset review, explicit foreign-asset updates, duplicate/type checks, plugin ownership/scope metadata, namespaces, preserved bindings and unrelated modes.
- F05: consistent unbound snapshot guides, updated on repeat generation rather than accumulating this version's frames.
- F06/F15: draft/generated revision tracking, clearly marked previous output, format switching without writes, and locked inputs during processing.
- F07: preflight fonts/document state, mutation journal, rollback attempts, staged guide replacement and explicit recovery/cleanup errors.
- F08/F09: Palette/Preview/Export/Help views, persistent generation action, optional status/settings sections, Primary-only starting requirement, examples, companions, shorthand hex and actionable errors.
- F10/F11: saved draft/palettes, settings import/export, selected fill import, document base-color import, optional outputs, export-only and explicit locate-guide.
- F12: actual pair testing, AA/AAA feedback, passing alternatives and theme UI samples.
- F13: explicit selected-gradient inclusion, editable names, pre-export fidelity notice, paint opacity and raw-paint structured exports.
- F14/F16: naming examples, typed DTCG exports with aliases, custom color groups, locked base colors, editable tones, duplicate-tone feedback and optional OKLCH ramps with sRGB chroma reduction.

Backups are preserved, and `manifest.json` retains its ID and offline network policy.

Remaining limits: gradient CSS geometry remains approximate; alias/import compatibility is intentionally scoped; documentation is a static snapshot rather than an always-live document observer; no automatic removal/migration of legacy asset names or old guide frames; rollback cannot be guaranteed after editor termination. Optional color-vision simulations and broader preset libraries remain future enhancements. Actual desktop Figma integration verification is still pending.

Automated verification: 27 logic/build tests plus integrated browser/UI-to-plugin checks. The integration harness verifies message flows with a simulated Figma API. It does not certify behavior in the actual Figma editor.
