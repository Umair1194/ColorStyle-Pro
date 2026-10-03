# ColorStyle Pro

Updated local plugin, rebuilt from the three supplied screenshots and the original backup. No build step is required. The original plugin ID and offline manifest are preserved. Original sources are in `backup/`.

## Run in Figma

1. Open a disposable Figma Design file in the desktop app.
2. Open Plugins → Development → Import plugin from manifest, and select this folder's `manifest.json`.
3. Run ColorStyle Pro from Development. If already imported, rerun the development plugin to load these files. The published Community plugin is separate and is not updated by local edits.
4. Enter Primary, Secondary and Grey as six-digit hex colors (for example `#3366FF`). Info, Success, Alert and Danger are optional; leave them blank to omit them. White squares and `#FFFFFF` placeholders are not submitted values.
5. Choose light tints or additional dark shades, naming and CSS/SCSS/JSON export. Generate creates/updates paint styles, optionally creates/binds color variables, and creates a visual guide plus a token frame. Copy or download tokens from the result panel.

The Figma window title, logo and close control are native Figma chrome; the plugin body follows the screenshots at a 320px window width. The manifest name supplies the title. Community icon assets are managed separately in Figma.

## Palette and variables

Canonical levels are 50, 100, 200, 300, 400, 500 plus optional 600, 700, 800, 900. Level 500 is the base color. Total Steps changes only the preview, as stated in the reference screenshots; at the default six steps preview and generation match exactly. Values are rounded to 8-bit RGB so preview, styles and exports agree.

Variables use the `Color` collection, with stable names such as `Primary/500`, independent of the selected style naming convention. New collections start with Light; requesting dark shades adds Dark if it is absent. Figma plan limits can prevent creating another mode; errors are shown, and users can choose Light Tints or disable Variables.

**Mode assumption:** screenshots reveal no semantic mapping. These are primitive palette variables: all levels receive their own canonical RGB in Light and Dark. They do not automatically map light backgrounds to dark backgrounds. Existing default/Light/Dark values for matching palette names are updated; unrelated variables and additional existing modes are retained. New variables initialize every existing mode. A pre-existing Color collection without Light retains its default mode name. Existing styles with matching names are deliberately updated, retaining their IDs. Switching naming conventions creates the alternate style names and leaves the old ones intact. Turning off dark shades does not delete prior dark styles or variables.

## Accessibility and exports

Preview tiles report white and black text contrast separately and identify the better text color. AA for normal text is 4.5:1, AAA 7:1, and AA large text 3:1. Generated guide tiles include the same contrast information. These checks concern opaque colors; they do not certify a complete interface.

CSS and SCSS use names such as `--primary-500` and `$primary-500`; JSON uses stable group/level keys. Style naming does not change exported token identities. All generation and downloads happen locally.

The legacy selected-gradient workflow is retained. Identical selected gradients are deduplicated, original paints are retained in Figma, alpha stops are exported, and angular gradients use conic CSS. CSS gradient transforms are approximate; diamond gradients use a disclosed linear fallback. Exported gradients should be visually checked before handoff.

## Verification

Run `npm test` and `npm run check` with Node.js. Browser checks require Playwright (`npm install`, then `npx playwright install chromium`); run `npm run test:ui`. An existing compatible browser can be supplied with `COLORSTYLE_BROWSER=/absolute/path/to/browser`. `COLORSTYLE_PLAYWRIGHT` can specify an existing Playwright module path.

Before production use, verify in a disposable Figma file:

- Generate three required colors: 18 paint styles and 18 bound color variables, a readable guide and a token frame.
- Repeat with a changed Primary: the same style and variable IDs are updated.
- Enable dark shades: 30 styles/variables and a Dark mode when available.
- Disable Variables in a fresh file: styles and frames only.
- Try both naming schemes, all export formats, and an invalid optional color. Compare downloaded tokens to the guide's hex values.
- Test selected linear, radial, angular and diamond gradients; check disclosed CSS approximations.
- Check your file's existing Color collection, mode limits, and any existing same-name styles before using the plugin there.

Browser and simulated Plugin API tests passed locally. Live desktop Figma verification remains pending because computer-use access to Figma was not approved. See `AUDIT.md` for findings and improvement priorities.
