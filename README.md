# ColorStyle Pro 2.0.2

A local Figma plugin for building color palettes, styles, variables, semantic themes and developer tokens. This release implements the UX/functionality audit: one shared palette engine, reviewed document updates, saved palettes, imports, exact previews and versioned exports.

The published Community plugin is not changed by these local edits. The manifest keeps the original plugin ID and allows no network domains. Original files remain in `backup/`; the screenshot-restored version is in `backup/pre-ux-upgrade/`.

## Run in Figma

1. Open Figma Design in the desktop app, preferably a disposable test file for first verification.
2. Choose Plugins → Development → Import plugin from manifest and select this folder's `manifest.json`. If already imported, close and rerun the development plugin.
3. Enter Primary or choose **Try example**. Primary is the only required group. **Suggest companions** fills empty Secondary/Grey fields with editable suggestions. Status colors and custom groups are optional.
4. Choose **6 tints** or **10 tones**. Open Preview to inspect exactly the colors that will be created, edit individual tones or test any foreground/background pair.
5. Click **Review & Generate**, inspect the counts and destination, then generate the reviewed palette. Existing assets not owned by this version need an explicit update choice. Cancel returns without writing.
6. In Export, switch CSS/SCSS/JSON/DTCG, copy or download. **Export current draft only** writes no Figma assets. Editing the palette identifies previous output as stale.

No build is required to run the supplied `code.js` and `ui.html`. Source edits require `npm run build` or `node build.cjs`. Do not edit the generated files directly.

## Designer workflow

- **Palette:** base colors, optional status/custom groups, saved palettes, imports and generation settings.
- **Preview:** exact generated tones, individual tone edits, white/black ratios, foreground/background testing, passing alternatives and semantic theme examples.
- **Export:** a known generated/exported snapshot, format switching and downloads without regenerating the document.
- **Help:** in-plugin explanations for levels, themes, accessibility, conflict handling and snapshots.

Generation controls stay visible in a fixed footer. Inputs are locked during review/apply/export requests. The UI supports a 400×640 plugin window and has been checked at 320px width.

## Colors and palette generation

Six tints use 50, 100, 200, 300, 400, 500; ten tones add 600, 700, 800, 900. Preview, variables, styles and exports use the same shared engine and normalized 8-bit sRGB values. Level 500 stays locked to the base color. Other tone overrides are included in every output.

Pasted `3366FF`, `#3366FF`, `36F` and `#36F` are accepted and normalized. Alpha colors are rejected rather than truncated. Status “Warning” retains the legacy `Alert` asset/token group for compatibility.

RGB mixing preserves the previous palette algorithm. The optional OKLCH algorithm adjusts perceptual lightness/chroma, keeps the base exact and reduces chroma to fit sRGB. Neither algorithm guarantees accessible pairings; repeated tones are reported in Preview.

Custom groups use unique names of up to 32 ASCII letters, numbers, spaces, hyphens or underscores. Primary/Secondary/Grey/status names and Palette/Theme/Gradients are reserved.

## Variables, namespaces and themes

New palette collections start with one **Value** mode. Adding darker tones does not add a Dark mode or require another mode allowance.

Optional semantic themes require Grey, ten tones and Variables. They create a separate `Collection Theme` with Light/Dark aliases for Background/Default, Surface/Default, Text/Primary, Border/Default, Action/Primary and Action/Text. Review and edit the alias mappings before generating; Preview flags example text pairs below AA. Figma may reject a second theme mode due to a plan limit; the plugin reports that error and attempts rollback.

Palette variables have stable names such as `Primary/500`. For existing multi-mode palette collections, only the default mode changes; other mode values are preserved and may differ from the exported canonical snapshot. The asset review explains this. Semantic themes require a single-mode palette collection to avoid ambiguous primitive resolution; choose a fresh destination such as `Color v2` when migrating a legacy multi-mode collection.

The **Style namespace** separates paint styles for different brands. A separate variable collection name alone does not separate paint styles. Examples:

- Default style: `Primary / 500`; alternate style: `brand.primary.500`.
- With namespace Brand B: `Brand B / Primary / 500`; alternate: `brand-b.brand.primary.500`.
- Variable: `Primary/500` in the selected collection.
- CSS token: `--primary-500`, independent of the Figma style namespace.

Matching plugin-owned styles and variables retain their IDs. Foreign assets or styles owned under another collection scope appear as conflicts. Duplicate same-name styles/collections and incompatible variable types block generation rather than choosing one arbitrarily.

Turning Variables off preserves existing style bindings when the resolved default value matches the requested color. Changing such a style to a different color is blocked: enable Variables to update it or turn off Styles for export only. The plugin never silently detaches that binding.

## Guides, recovery and exports

Palette guides and optional token frames are **static snapshots**. Swatch colors are unbound so their hex/contrast annotations cannot drift after later variable edits. Regeneration replaces this version's previous snapshot for the same collection on the current page, preserving its position. Frames from old versions remain untouched because their ownership is unknown. Locate guide is an explicit action; generation does not force a viewport jump.

Writes are journaled. Font loading and asset checks happen before updates; errors attempt to restore changed styles/variables and remove staged new assets. Existing snapshots remain until all requested outputs succeed. Incomplete recovery or failed old-frame cleanup is reported. Closing the plugin or an editor crash during writes cannot guarantee rollback; verify integration behavior in a disposable file before production use.

CSS and SCSS include palette values and optional theme references. Simple JSON retains resolved theme values and alias paths. DTCG JSON uses typed sRGB color values and aliases under separate Light/Dark groups; validate interoperability with your intended token tooling. Changing the export format reserializes the same snapshot without changing Figma.

## Imports and persistence

**Use frame colors** scans the selected frame and all nested layers. The detected count updates automatically on selection changes. The inventory includes fills, strokes, mixed text fills, shadow colors, gradient stops and complete linear/radial/angular/diamond paints, including hidden paints. Colors are deduplicated by RGB and paint/stop alpha, with no 50-color or 20-gradient truncation. Image/video pixels and layer compositing are not sampled.

Review and assign detected RGB bases to palette groups; opacity is displayed, while generated base palettes remain opaque RGB. Applying the import includes its gradients by default; they can be renamed or excluded. Cancelling leaves the current palette and prior gradient snapshot intact. CSS gradient geometry is approximate, especially radial/diamond; paint opacity and stop alpha are retained, and JSON/DTCG preserve raw Figma paints. Structured exports are the fidelity reference.

**Load base colors from collection** reads direct color values at `Group/500` from the collection default mode. It does not resolve arbitrary aliases or import unrelated naming schemes.

Drafts/settings and up to 30 named palettes are saved through Figma client storage. Palette JSON settings can be exported/imported. Saved/imported settings do not contain selected gradient paints: re-import those from the document. Reset clears the draft, preserving named palettes. Reusing a saved palette name replaces that saved entry.

## Development and verification

Source:

- `src/core.js`: shared normalization, palette algorithms, contrast, theme mappings and token serializers.
- `src/main.js`: Figma planning, conflict detection, mutations, recovery, imports and snapshot builders.
- `src/ui.html` / `src/ui.js`: interface and local workflow state.
- `build.cjs`: produces manifest artifacts and syntax-checks both JavaScript contexts.

Commands:

```sh
npm run build
npm test
npm run test:ui
```

Logic/build tests need Node only. Browser tests need Playwright: install development dependencies and its Chromium browser, or set `COLORSTYLE_BROWSER` to a compatible existing browser executable. `COLORSTYLE_PLAYWRIGHT` can point to an existing module. The bundled test uses a simulated Figma API connected to the real HTML through message passing, not the live desktop editor.

Before release, verify in actual Figma: variable/style bindings, alias mode switching, existing same-name asset review, repeat snapshots, mode quotas, undo/recovery, font loading, canvas wrapping, downloads/clipboard and saved state. Live Figma verification remains pending because computer-use access was not approved earlier.

See `CHANGELOG.md` for implemented audit items. `AUDIT.md` and `UX-FUNCTIONALITY-AUDIT.md` record the earlier versions' findings and recommendations.
