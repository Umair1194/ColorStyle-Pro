> Historical audit of the screenshot-restored version. The main recommendations are now implemented in 2.0; see [CHANGELOG.md](CHANGELOG.md) and [README.md](README.md). Code line references below describe the earlier source. Live Figma verification remains pending.

# ColorStyle Pro — UX and functionality audit

Reviewed: 3 October 2026. Scope: current local `ui.html`, `code.js`, manifest, existing test coverage, and rendered initial/populated UI. This is a code-based and visual usability review, not a user study or a live Figma integration test. The published plugin's missing source is outside this review. No implementation changes were made during this audit.

## Assessment

The plugin covers a useful basic task: turn base colors into palette styles, variables, a visual guide and developer tokens. Its strongest existing features are predictable canonical levels, stable style/variable IDs on repeat runs, real white/black contrast calculations, optional semantic-status colors, local processing, and multiple exports.

The next release should prioritize confidence in output and efficient repeat use. A designer should know exactly which colors will be created, which assets will change, what dark mode actually means, and whether an export still matches the current palette. Additional features should follow those corrections.

Priorities below use P1 for output/document trust issues, P2 for substantial workflow improvements, and P3 for optional capabilities. Effort is relative, not a delivery estimate: Small is a localized UI/logic change; Medium affects several workflows; Large involves new data models or document synchronization.

## Priority findings

| ID | Priority | Finding | Recommended improvement | Effort |
| --- | --- | --- | --- | --- |
| F01 | P1 | Total Steps changes preview, not generated colors | Make preview exactly match output; replace the control with “6 tints” / “10 tones”, or make custom steps an explicit output mode | Small for fixed palettes |
| F02 | P1 | Dark mode is implied without semantic switching | Separate “Add darker tones” from “Create theme modes”; introduce semantic aliases as an opt-in workflow | Small for wording; Large for themes |
| F03 | P1 | Matching styles and variables are changed without an asset review | Show create/update/conflict counts, destination collection and target modes; preserve unrelated bindings and modes | Medium |
| F04 | P1 | Existing variable bindings can be removed when Variables is unchecked | Preserve bindings by default; make detachment an explicit action | Medium |
| F05 | P1 | Guide colors can update while their labels remain stale | Choose a consistent snapshot or synchronized guide model; update all annotations together | Medium |
| F06 | P1 | Export remains available after inputs change | Mark the result as a previous generation; show “Changes not generated” and distinguish draft from generated output | Small |
| F07 | P1 | Failures can leave partial document changes | Complete read-only preflight first, journal mutations and restore prior state where feasible; report partial results clearly | Large |
| F08 | P2 | The primary action is beneath a very long form and preview | Compact inputs, collapse optional settings, add a sticky generation footer and separate Preview view | Medium |
| F09 | P2 | First-time setup is rigid and disabled states lack guidance | Start with one brand color, offer neutral/secondary suggestions, and explain missing input or invalid step values | Medium |
| F10 | P2 | Reopening requires re-entering the palette | Remember draft/settings, offer saved palettes and explicit reset; allow reading plugin-created document assets | Medium |
| F11 | P2 | Every run creates more guide/token frames | Update a plugin-owned guide by default; offer “Create another guide” and optional outputs | Medium |
| F12 | P2 | Contrast preview checks only black/white pairs | Add a selectable foreground/background tester and UI component examples | Medium |
| F13 | P2 | Gradient import happens implicitly and CSS is approximate | Add an explicit selection import action, preview and export warnings before generation | Medium; Large for accurate geometry |
| F14 | P2 | Naming and export behavior are disconnected | Show examples and distinguish Figma style names, variable names and export token paths | Small |
| F15 | P2 | Inputs stay editable while generation is running | Freeze the submitted controls or clearly label the result as belonging to the submitted snapshot | Small |
| F16 | P3 | Palette tuning and interoperability are limited | Add optional perceptual ramps, custom roles, settings import/export and typed token export | Medium–Large |

## Detailed user impact and acceptance criteria

### F01 — Preview must describe the generated result

Evidence: `ui.html:29`, `ui.html:63–69`, `code.js:76`. The UI allows 2–20 steps and interpolates a different preview at nondefault counts. Generation always writes six light levels and optionally four dark levels. An empty Steps input can still preview six tints because of a fallback; out-of-range values disable generation without a dedicated error.

A designer choosing 12 steps reasonably expects the generated palette to match those 12 steps. Helper text does not remove this mismatch.

Recommendation: use a fixed palette-size choice in the first improvement release. If custom scales are later offered, share one palette calculation between preview and generation and clearly define their names.

Acceptance: every displayed output swatch has the same name and color in generated styles, variables and exports. Invalid controls show an actionable message.

### F02 — Distinguish tone generation from theme behavior

Evidence: `ui.html:28,32`, `code.js:378–421`. Requesting darker tones may create a Dark mode, but canonical variables have identical color values in Light and Dark. Existing matching variable values in the default/Light/Dark modes are overwritten, including Dark values during a light-only run.

Recommendation: put primitive colors in a palette collection and use a separate theme collection for semantic aliases. Example: `Background/Default` points to a light neutral in Light mode and a dark neutral in Dark mode; `Text/Primary` switches in the opposite direction. Let designers review mappings. Until available, use “Add darker tones (600–900)” and explain that tone generation does not create an adaptive theme.

Acceptance: tone-only generation needs no extra theme mode; switching theme mode changes semantic roles intentionally. A light-only update preserves unrelated existing Dark mappings.

### F03/F04 — Make asset updates predictable

Evidence: `code.js:17`, `code.js:383–401`, `code.js:405–421`, `code.js:458–470`. Collection and asset matching is name-based. Duplicate paint-style names are collapsed into a Map without a conflict decision. When Variables is off, `bindShade` returns an unbound paint and upsert replaces the existing style's paints, removing its prior binding.

Recommendation: track plugin-owned assets with metadata, let users choose a collection/namespace, and present a concise review such as “18 styles: 12 new, 6 updated; 18 variables; 1 guide updated.” For unrelated matching assets, offer keep, rename or update. Preserve binding by default rather than treating a checkbox as a detachment request.

Acceptance: turning Variables off does not silently detach a previously bound style. Foreign same-name assets and duplicate style names are identified. Naming changes have an explicit migration/keep-old-assets choice.

### F05 — Generated documentation needs a consistent source of truth

Evidence: `code.js:225` binds guide swatches to variables, while `code.js:250,262,270` writes hex and contrast annotations as static text. A later generation updates those variables and creates a new guide, leaving older guide labels untouched. Manual variable edits can cause the same mismatch.

Recommendation: choose one of two explicit behaviors: a dated snapshot with unbound swatches and static annotations, or an updateable guide that recalculates swatches, labels and tokens together. A snapshot is simpler; a synchronized guide is more useful for maintained systems but needs document refresh handling.

Acceptance: guide colors, displayed hex codes, contrast labels and related tokens match after a palette update. A snapshot clearly identifies its generation/version.

### F06/F15 — Separate a draft from a generated result

Evidence: `ui.html:60–75`. Editing colors or export format does not hide or mark the previous token result. Copy/Download still use the last generated data and `exportFormat`. Only the Generate button is locked during generation, so the visible draft can change while the original request is being processed. A failure leaves the previous result accessible.

Recommendation: track a draft revision and a generated revision. Label older results “Previous generation”; display their actual format and time. Disable stale download or allow it under that explicit label. Freeze generation inputs temporarily or preserve a visible submitted snapshot. Changing export format alone should reserialize the existing result without changing the Figma document.

Acceptance: users cannot mistake old CSS for the JSON selected in the current form. Results identify the exact palette they represent.

### F07 — Recovery should match the document state

Evidence: `code.js:448–501`. Collection/mode creation occurs before all conflict checks finish. Later failures in style creation or guide/token creation can leave earlier mutations intact. The error reports the exception without identifying assets already changed.

Recommendation: prepare a complete generation plan before writes, preflight conflicts and fonts, snapshot existing values, then apply updates with a recovery journal. Where complete recovery is unavailable, show precisely what completed and how to resume safely.

Acceptance: a deliberately injected failure produces either restored prior state or an accurate partial-result summary. Retry does not create duplicate guides.

### F08/F09 — Reduce effort before the first useful result

Evidence: `ui.html:6–20,25–37`. Seven fields, options and every preview group share one long column in a 320×600 window. The action follows the entire preview. Preview text is 9px; generated guide contrast labels are 8px. Three colors are mandatory. Empty required inputs show no explanatory error, only a disabled button. An invalid text entry retains the last valid picker swatch.

Recommendation:

- Start with the brand color and a “Try example” action. Offer editable suggested secondary and neutral colors; never silently replace a user's colors.
- Put Info/Success/Warning/Danger in an expandable “Status colors” section. Prefer the familiar label Warning over the ambiguous Alert.
- Keep Generate and a short output summary visible in a footer. Keep Export reachable after generation.
- Use Palette / Preview / Export views if needed, and collapse advanced settings rather than adding more controls to the same column.
- Increase useful preview text size and offer details when a swatch is selected. Preserve keyboard access and textual pass/fail information.
- Explain required fields and distinguish an empty field from a selected white color. Validate incomplete typing gently, with clear feedback on blur or attempted submission.
- Offer “Use selected fill” and normalize pasted `3366FF` or `#36F` to six-digit hex. Reject unsupported alpha explicitly rather than silently truncating it with `maxlength=7`.

Acceptance: a first-time user can generate from an example without scrolling through advanced settings. Generate remains reachable while inspecting the preview; all disabled states explain the next action.

### F10/F11 — Optimize repeated work

Evidence: no draft persistence or palette loading exists in the UI; `code.js:490–493` creates new frames each time and changes the selection. The guide position depends on the viewport and can overlap prior content.

Recommendation: save local draft/settings, support named palettes, and use document metadata to locate generated assets. Update the plugin-owned guide/token frame by default, with explicit “Create new” and placement options. Separate output choices: Variables, Styles, Guide and Token frame. Offer export-only without canvas writes. Keep a success summary with links/actions to locate generated assets instead of forcing a viewport change on every run.

Acceptance: reopening restores the user's last draft; two identical generations do not add frames; choosing Download does not regenerate the document.

### F12 — Accessibility advice should answer actual design questions

Evidence: `ui.html:70` evaluates each tone against white and black, then labels the better pair. That is useful but does not tell the designer whether their chosen blue text on a grey card passes.

Recommendation: foreground/background selectors, text-size context, an accessible-pair matrix, suggested passing alternatives and sample buttons, cards, inputs and status banners. Include borders/icons against their adjacent background and avoid using hue alone to convey success/error. Explain that the badge applies to the displayed pair rather than to an entire color or UI.

For text, use the applicable 4.5:1 normal-text and 3:1 large-text thresholds; applicable non-text UI components use 3:1 against adjacent colors. Conformance depends on the actual intended pairing and context. Sources: [W3C text contrast](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum), [W3C non-text contrast](https://www.w3.org/WAI/WCAG21/understanding/non-text-contrast.html).

Acceptance: a designer can test any two generated tones, identify a failing pairing, and select a passing alternative without manual calculation.

### F13 — Make gradients explicit and readable

Evidence: `code.js:54–70,475–487`. Selection gradients are imported automatically, after asynchronous work has begun. Generated names contain opaque hashes. Export warnings arrive after generation; radial transform geometry and diamond behavior are approximate. Linear paint opacity is not represented separately in the CSS serializer.

Recommendation: an explicit “Import selected gradients” action that snapshots the selection, lists found gradients and lets users rename/choose them. Before export, explain supported geometry and transparency limitations. Preserve raw Figma geometry in an optional structured export until visual equivalence is validated. Keep unsupported exact conversion clearly separated from an approximate CSS option.

Acceptance: users know which gradients are included before creation, can identify them by meaningful names, and see fidelity limitations before handoff.

### F14/F16 — Make design-to-development handoff clearer

Evidence: `ui.html:30–31`, `code.js:284–334,467–468`. The naming dropdown changes Figma styles, while variables use fixed slash names and tokens use their own fixed paths. Current JSON contains group-to-hex mappings without typed values or semantic aliases.

Recommendation: show live examples: “Style: Primary / 500 · Variable: Primary/500 · CSS: --primary-500.” Treat tool-specific naming as separate options only when users need customization. Add descriptions, semantic usage guidance and an optional typed DTCG export with preserved aliases. Keep existing simple JSON for compatibility.

The DTCG format provides a structured foundation for types and aliases; actual compatibility must be tested against intended consuming tools. Source: [Design Tokens Format Module 2025.10](https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/).

Acceptance: exported aliases resolve, names are unique and predictable, and users understand which naming choice affects which destination.

## Useful additions after the priority fixes

- Optional perceptual palette generation with editable tone values, base-color lock and duplicate-tone detection. Keep the current RGB algorithm as a compatibility preset.
- Custom groups for Accent, Background, Surface, Border, Text and multiple brands; support adding/removing roles instead of a fixed seven-field model.
- Named presets for product UI, brand palette and status colors, with explanations and accessible pairing examples.
- Settings/palette import and export for sharing reproducible inputs with teammates.
- A compact help drawer explaining levels, primitives versus semantic roles, theme modes, contrast badges and update behavior.
- Guide content that includes intended usage, token path, theme behavior and version, rather than color chips alone.
- Optional color-vision simulations as an educational preview; do not label a palette fully accessible based on a simulation.

## Suggested release sequence

**Release 1 — Reliable and understandable:** preview/output parity; accurate dark-tone wording; preserve bindings and modes; asset conflict review; current-versus-previous export state; consistent guide snapshots; clear validation and generation state. Add regression tests for the newly identified cases.

**Release 2 — Faster designer workflow:** compact form, persistent generation action, saved drafts, selection import, updateable guide, optional outputs, export-only and actual foreground/background testing.

**Release 3 — Design-system workflows:** semantic Light/Dark aliases, custom roles, typed token export, editable perceptual ramps and robust document synchronization/recovery.

## Validation before release

Run actual Figma integration checks for mode switching, existing same-name assets, duplicate styles, plan mode limits, variable-bound style reruns, guide annotations, export-only behavior and failure recovery. Existing passing mocks/browser tests do not cover these behaviors fully.

Then observe representative designers completing five tasks: start a palette from one color; import existing colors; find an accessible button pair; update a generated system; export the correct theme tokens. Record task completion, misunderstood controls, accidental changes and time spent locating actions. Evaluate proposed UI changes against these observations rather than assigning unsupported numerical UX scores.
