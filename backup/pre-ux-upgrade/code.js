// code.js
figma.showUI(__html__, { visible: true, width: 320, height: 600 });

// Utility: Hex ⇄ RGB
function hexToRgb(hex) {
  const parsed = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!parsed) return null;
  return { r: parseInt(parsed[1], 16) / 255, g: parseInt(parsed[2], 16) / 255, b: parseInt(parsed[3], 16) / 255 };
}
function rgbToHex({ r, g, b }) {
  const toHex = v => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

// Read once per run; preserve existing style IDs.
let styleIndex = new Map();
async function upsertPaintStyle(name, paints) {
  let style = styleIndex.get(name);
  if (!style) {
    style = figma.createPaintStyle();
    style.name = name;
    styleIndex.set(name, style);
  }
  style.paints = paints;
  return style;
}

// WCAG Contrast Ratio
function contrastRatio(rgb1, rgb2) {
  const lum = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const L1 = lum(rgb1.r) * 0.2126 + lum(rgb1.g) * 0.7152 + lum(rgb1.b) * 0.0722;
  const L2 = lum(rgb2.r) * 0.2126 + lum(rgb2.g) * 0.7152 + lum(rgb2.b) * 0.0722;
  const light = Math.max(L1, L2), dark = Math.min(L1, L2);
  return (light + 0.05) / (dark + 0.05);
}

// Describe a solid style for dev handoff
function describeSolid(color) {
  const hex = rgbToHex(color);
  const cw = contrastRatio(color, { r:1,g:1,b:1 });
  const cb = contrastRatio(color, { r:0,g:0,b:0 });
  return `Hex: ${hex} • WCAG vs White: ${cw.toFixed(2)} • vs Black: ${cb.toFixed(2)}`;
}

// AA/AAA quick badge string
function wcagBadgeText(rgb) {
  const w = parseFloat(contrastRatio(rgb, { r:1, g:1, b:1 }));
  const b = parseFloat(contrastRatio(rgb, { r:0, g:0, b:0 }));
  const best = Math.max(w, b);
  return `${w >= b ? 'White' : 'Black'} text: ${best >= 7 ? 'AAA' : best >= 4.5 ? 'AA' : best >= 3 ? 'AA large' : 'Fail'}`;
}

// Preserve gradient kind + angle in tokens
function gradientTokenValue(paint) {
  try {
    const kind = (paint.type || '').toLowerCase().replace('gradient_', ''); // linear, radial, angular, diamond
    const m = paint.gradientTransform;
    let angle = '180deg';
    if (m && m[0] && typeof m[0][0] === 'number' && typeof m[0][1] === 'number') {
      angle = Math.round(Math.atan2(m[0][1], m[0][0]) * 180 / Math.PI) + 'deg';
    }
    const stops = (paint.gradientStops || [])
      .map(gs => `${gs.color.a !== undefined && gs.color.a < 1 ? 'rgba(' + [Math.round(gs.color.r * 255), Math.round(gs.color.g * 255), Math.round(gs.color.b * 255), gs.color.a].join(', ') + ')' : rgbToHex(gs.color)} ${Math.round(gs.position * 100)}%`)
      .join(', ');
    if (kind === 'linear') return `linear-gradient(${angle}, ${stops})`;
    if (kind === 'radial') return `radial-gradient(${stops})`;
    if (kind === 'angular') return `conic-gradient(from ${angle}, ${stops})`;
    // CSS has no diamond gradient; disclosed approximation.
    return `linear-gradient(${angle}, ${stops})`;
  } catch (e) {
    return '';
  }
}

// Generate canonical tints (50–500) and optional shades (600–900)
function generateShades(base, includeDark, _stepsUI) {
  const lightLevels = [50, 100, 200, 300, 400, 500];
  const darkLevels  = [600, 700, 800, 900];

  const mix = (c1, c2, w) => ({
    r: c1.r * (1 - w) + c2.r * w,
    g: c1.g * (1 - w) + c2.g * w,
    b: c1.b * (1 - w) + c2.b * w
  });

  const white = { r: 1, g: 1, b: 1 };
  const black = { r: 0, g: 0, b: 0 };

  const lightWeights = { 50: 0.95, 100: 0.85, 200: 0.70, 300: 0.55, 400: 0.35, 500: 0.00 };
  const darkWeights  = { 600: 0.10, 700: 0.20, 800: 0.30, 900: 0.45 };

  const shades = [];
  for (const lv of lightLevels) {
    const w = lightWeights[lv];
    shades.push({ level: lv, color: hexToRgb(rgbToHex(mix(base, white, w))) });
  }
  if (includeDark) {
    for (const lv of darkLevels) {
      const w = darkWeights[lv];
      shades.push({ level: lv, color: hexToRgb(rgbToHex(mix(base, black, w))) });
    }
  }
  return shades;
}

// Scan selection for gradients
function scanGradients() {
  const grads = [];
  const seen = new Set();
  function walk(node) {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    if ('fills' in node && Array.isArray(node.fills)) {
      node.fills.forEach(f => {
        if (f.type && typeof f.type === 'string' && f.type.includes('GRADIENT') && f.visible !== false) grads.push(f);
      });
    }
    if (node.children) node.children.forEach(walk);
  }
  figma.currentPage.selection.forEach(walk);
  return grads;
}

// Create Visual Guide frame and return it (fixed width, hug height, no TDZ)
async function createVisualGuide(styleMap) {
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

  // constants used later (declared before use → no TDZ)
  const GUIDE_W = 960;
  const PAD = 40;
  const INNER_W = GUIDE_W - PAD * 2; // 880
  const TILE_W = 106;
  const TILE_SWATCH = 60;

  // guide
  const guide = figma.createFrame();
  guide.name = '🎨 Color Style Guide';
  guide.layoutMode = 'VERTICAL';
  guide.primaryAxisSizingMode = 'AUTO';   // height hugs
  guide.counterAxisSizingMode = 'FIXED';  // fixed width
  guide.resize(GUIDE_W, guide.height || 0);
  guide.itemSpacing = 40;
  guide.paddingTop = guide.paddingBottom = 56; // a bit more bottom room
  guide.paddingLeft = guide.paddingRight = PAD;
  guide.counterAxisAlignItems = 'MIN';
  guide.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  guide.x = figma.viewport.center.x - GUIDE_W / 2;
  guide.y = figma.viewport.center.y;
  guide.clipsContent = true; // contain everything

  // header
  const hdr = figma.createText();
  hdr.fontName = { family: 'Inter', style: 'Bold' };
  hdr.characters = '🎨 Color Style Guide';
  hdr.fontSize = 24;
  hdr.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
  guide.appendChild(hdr);

  const whiteRgb = { r: 1, g: 1, b: 1 };
  const blackRgb = { r: 0, g: 0, b: 0 };
  const desiredOrder = ['Primary','Secondary','Grey','Info','Success','Alert','Danger','Gradients'];
  const keys = Object.keys(styleMap);
  const ordered = desiredOrder.filter(function(k){ return keys.indexOf(k) > -1; })
    .concat(keys.filter(function(k){ return desiredOrder.indexOf(k) === -1; }));

  for (let i = 0; i < ordered.length; i++) {
    const sectionName = ordered[i];
    const items = styleMap[sectionName] || [];
    if (!items.length) continue;

    // section
    const section = figma.createFrame();
    section.layoutMode = 'VERTICAL';
    section.primaryAxisSizingMode = 'AUTO';  // height hugs
    section.counterAxisSizingMode = 'FIXED'; // fixed width
    section.resize(INNER_W, section.height || 0);
    section.itemSpacing = 8;
    section.fills = [];
    section.clipsContent = false;
    guide.appendChild(section);

    // title
    const title = figma.createText();
    title.fontName = { family: 'Inter', style: 'Bold' };
    title.characters = sectionName;
    title.fontSize = 18;
    title.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
    section.appendChild(title);

    // row
    const row = figma.createFrame();
    row.layoutMode = 'HORIZONTAL';
    row.layoutWrap = 'WRAP';
    row.primaryAxisSizingMode = 'FIXED';   // fixed width so wrap works
    row.counterAxisSizingMode = 'AUTO';    // height hugs content
    row.resize(INNER_W, row.height || 0);
    row.itemSpacing = 16;
    row.counterAxisSpacing = 16;
    row.fills = [];
    row.clipsContent = false;
    section.appendChild(row);

    const isGrad = sectionName === 'Gradients';

    // swatches
    for (let j = 0; j < items.length; j++) {
      const it = items[j];

      const sw = figma.createFrame();
      sw.layoutMode = 'VERTICAL';
      sw.primaryAxisSizingMode = 'AUTO';   // height hugs
      sw.counterAxisSizingMode = 'FIXED';  // fixed width = tile width
      sw.resize(TILE_W, sw.height || 0);
      sw.itemSpacing = 4;
      sw.fills = [];
      sw.clipsContent = false;
      row.appendChild(sw);

      const rect = figma.createRectangle();
      rect.resize(TILE_SWATCH, TILE_SWATCH);
      rect.cornerRadius = 8;
      if (isGrad) rect.fills = [it.fill];
      else {
        rect.fills = [it.paint || { type: 'SOLID', color: it.color }];
        rect.effects = [{
          type: 'DROP_SHADOW',
          color: { r: 0, g: 0, b: 0, a: 0.06 },
          offset: { x: 0, y: 2 },
          radius: 4,
          visible: true,
          blendMode: 'NORMAL'
        }];
      }
      sw.appendChild(rect);

      const label1 = figma.createText();
      label1.fontName = { family: 'Inter', style: 'Regular' };
      label1.fontSize = 10;
      label1.characters = isGrad ? it.name : String(it.level);
      label1.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
      label1.textAutoResize = 'HEIGHT';
      label1.resize(TILE_W, label1.height);
      sw.appendChild(label1);

      if (!isGrad) {
        const hexText = figma.createText();
        hexText.fontName = { family: 'Inter', style: 'Regular' };
        hexText.fontSize = 10;
        hexText.characters = rgbToHex(it.color);
        hexText.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
        hexText.textAutoResize = 'HEIGHT';
        hexText.resize(TILE_W, hexText.height);
        sw.appendChild(hexText);

        const cw = contrastRatio(it.color, whiteRgb);
        const cb = contrastRatio(it.color, blackRgb);

        const ratio = figma.createText();
        ratio.fontName = { family: 'Inter', style: 'Regular' };
        ratio.fontSize = 8;
        ratio.characters = `WCAG W:${cw.toFixed(2)} B:${cb.toFixed(2)}`;
        ratio.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
        ratio.textAutoResize = 'HEIGHT';
        ratio.resize(TILE_W, ratio.height);
        sw.appendChild(ratio);
        const badge = figma.createText();
        badge.fontName = { family: 'Inter', style: 'Bold' };
        badge.fontSize = 8;
        badge.characters = wcagBadgeText(it.color);
        badge.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
        badge.textAutoResize = 'HEIGHT';
        badge.resize(TILE_W, badge.height);
        sw.appendChild(badge);
      }
    }
  }

  figma.currentPage.appendChild(guide);
  figma.viewport.scrollAndZoomIntoView([guide]);
  return guide;
}

function serializeTokens(styleMap, format) {
  let tokenString = '';
  if (format === 'css') {
    tokenString += ':root {\n';
    for (const section in styleMap) {
      if (section === 'Gradients') {
        styleMap[section].forEach(function(it){
          const value = gradientTokenValue(it.fill);
          const nameSlug = it.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          tokenString += '  --gradient-' + nameSlug + ': ' + value + ';\n';
        });
      } else {
        styleMap[section].forEach(function(it){
          const varName = '--' + section.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + it.level;
          tokenString += '  ' + varName + ': ' + rgbToHex(it.color) + ';\n';
        });
      }
    }
    tokenString += '}';
  } else if (format === 'scss') {
    for (const section in styleMap) {
      if (section === 'Gradients') {
        styleMap[section].forEach(function(it){
          const value = gradientTokenValue(it.fill);
          const nameSlug = it.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          tokenString += '$gradient-' + nameSlug + ': ' + value + ';\n';
        });
      } else {
        styleMap[section].forEach(function(it){
          const varName = '$' + section.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + it.level;
          tokenString += varName + ': ' + rgbToHex(it.color) + ';\n';
        });
      }
    }
  } else if (format === 'json') {
    const obj = {};
    for (const section in styleMap) {
      obj[section] = {};
      if (section === 'Gradients') {
        styleMap[section].forEach(function(it){
          obj[section][it.name] = gradientTokenValue(it.fill);
        });
      } else {
        styleMap[section].forEach(function(it){
          obj[section][it.level] = rgbToHex(it.color);
        });
      }
    }
    tokenString = JSON.stringify(obj, null, 2);
  }

  return tokenString;
}

// Create a tokens frame with spacing and include gradients (aligned to guide)
async function createTokensFrame(styleMap, options, format, guideFrame) {
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });

  const frame = figma.createFrame();
  frame.name = 'Tokens available for Devs';
  frame.layoutMode = 'VERTICAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'FIXED';
  frame.resize(960, frame.height || 0);
  frame.itemSpacing = 8;
  frame.paddingTop = frame.paddingBottom = frame.paddingLeft = frame.paddingRight = 20;
  frame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];

  // Position below the guide with 100px margin
  frame.x = guideFrame.x;
  frame.y = guideFrame.y + guideFrame.height + 100;

  const heading = figma.createText();
  heading.fontName = { family: 'Inter', style: 'Bold' };
  heading.characters = 'Tokens available for Devs';
  heading.fontSize = 18;
  heading.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
  frame.appendChild(heading);

  const tokenString = serializeTokens(styleMap, format);

  const textNode = figma.createText();
  textNode.fontName = { family: 'Inter', style: 'Regular' };
  textNode.fontSize = 12;
  textNode.characters = tokenString;
  textNode.textAutoResize = 'HEIGHT';
  textNode.resize(920, textNode.height);
  frame.appendChild(textNode);

  figma.currentPage.appendChild(frame);
  figma.viewport.scrollAndZoomIntoView([frame]);
}

// Primitive palette values are identical in every mode. Dark levels extend the
// palette; semantic Light/Dark remapping is deliberately not invented here.
async function prepareVariables(enabled, includeDark) {
  if (!enabled) return null;
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const matches = collections.filter(c => c.name === 'Color');
  if (matches.length > 1) throw new Error('Multiple collections named Color. Rename duplicates before generating.');
  let collection = matches[0];
  if (!collection) {
    collection = figma.variables.createVariableCollection('Color');
    collection.renameMode(collection.defaultModeId, 'Light');
  }
  if (includeDark && !collection.modes.some(m => m.name === 'Dark')) {
    try { collection.addMode('Dark'); }
    catch (error) {
      throw new Error('Figma could not add a Dark mode to Color. Check your mode limit or choose Light Tints. ' + error.message);
    }
  }
  const all = await figma.variables.getLocalVariablesAsync();
  const index = new Map();
  for (const variable of all.filter(v => v.variableCollectionId === collection.id)) {
    if (index.has(variable.name)) throw new Error('Duplicate variable: ' + variable.name);
    index.set(variable.name, variable);
  }
  return { collection, index };
}

function bindShade(context, name, color) {
  const paint = { type: 'SOLID', color };
  if (!context) return paint;
  let variable = context.index.get(name);
  const isNew = !variable;
  if (variable && variable.resolvedType !== 'COLOR') throw new Error('Variable ' + name + ' already exists with a non-color type.');
  if (!variable) {
    variable = figma.variables.createVariable(name, context.collection, 'COLOR');
    context.index.set(name, variable);
  }
  for (const mode of context.collection.modes) {
    if (isNew || mode.name === 'Light' || mode.name === 'Dark' || mode.modeId === context.collection.defaultModeId) {
      variable.setValueForMode(mode.modeId, color);
    }
  }
  variable.description = describeSolid(color);
  return figma.variables.setBoundVariableForPaint(paint, 'color', variable);
}

const COLOR_KEYS = ['primary', 'secondary', 'grey', 'info', 'success', 'alert', 'danger'];
let generating = false;
figma.ui.onmessage = async (msg) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'cancel') { figma.closePlugin(); return; }
  if (msg.type !== 'generate-and-export' || generating) return;
  generating = true;
  try {
    const { colors, options, format } = msg;
    if (!colors || !options || !['css', 'scss', 'json'].includes(format) ||
        !['light-only', 'with-dark'].includes(options.darkShades) ||
        !['group/level', 'brand.group.level'].includes(options.naming)) {
      throw new Error('Invalid generation options.');
    }
    for (const key of COLOR_KEYS) {
      if ((!colors[key] && COLOR_KEYS.indexOf(key) < 3) ||
          (colors[key] && !/^#[0-9a-f]{6}$/i.test(colors[key]))) {
        throw new Error('Please set a valid hex for ' + key + ' (e.g. #3366FF).');
      }
    }
    const includeDark = options.darkShades === 'with-dark';
    // Preflight fonts and conflicting variable types before changing styles.
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
    const variableContext = await prepareVariables(options.createVariables === true, includeDark);
    if (variableContext) {
      for (const key of COLOR_KEYS.filter(k => colors[k])) {
        for (const shade of generateShades(hexToRgb(colors[key]), includeDark)) {
          const name = capitalize(key) + '/' + shade.level;
          const existing = variableContext.index.get(name);
          if (existing && existing.resolvedType !== 'COLOR') throw new Error('Variable ' + name + ' is not a color.');
        }
      }
    }
    styleIndex = new Map((await figma.getLocalPaintStylesAsync()).map(s => [s.name, s]));
    const styleMap = {};
    for (const key of COLOR_KEYS) {
      if (!colors[key]) continue;
      const section = capitalize(key);
      const shades = generateShades(hexToRgb(colors[key]), includeDark);
      styleMap[section] = [];
      for (const shade of shades) {
        const paint = bindShade(variableContext, section + '/' + shade.level, shade.color);
        const name = options.naming === 'brand.group.level'
          ? 'brand.' + key + '.' + shade.level : section + ' / ' + shade.level;
        const style = await upsertPaintStyle(name, [paint]);
        style.description = describeSolid(shade.color);
        styleMap[section].push({ ...shade, paint });
      }
    }
    // Preserve selection gradients in Figma; unsupported CSS geometry is explicit.
    const grads = scanGradients();
    if (grads.length) {
      const unique = [...new Map(grads.map(g => [JSON.stringify(g), g])).values()];
      styleMap.Gradients = [];
      for (let i = 0; i < unique.length; i++) {
        const fill = unique[i];
        const signature = JSON.stringify(fill);
        let hash = 2166136261;
        for (let j = 0; j < signature.length; j++) hash = Math.imul(hash ^ signature.charCodeAt(j), 16777619);
        const name = 'Gradient ' + (hash >>> 0).toString(16);
        styleMap.Gradients.push({ name, fill });
        const style = await upsertPaintStyle('Gradient / ' + name, [fill]);
        style.description = 'Selected Figma gradient. CSS geometry is approximate.';
      }
    }
    const guide = await createVisualGuide(styleMap);
    await createTokensFrame(styleMap, options, format, guide);
    figma.currentPage.selection = [guide];
    figma.viewport.scrollAndZoomIntoView([guide]);
    figma.ui.postMessage({ type: 'generation-complete', tokens: serializeTokens(styleMap, format), format,
      message: 'Styles, guide and tokens generated.' + (grads.length ? ' Gradient CSS geometry is approximate; diamond gradients use a linear fallback.' : '') });
    figma.notify('Styles & tokens generated!');
  } catch (err) {
    console.error(err);
    const message = (err && err.message) || String(err);
    figma.ui.postMessage({ type: 'generation-error', message });
    figma.notify('Error: ' + message, { timeout: 5000 });
  } finally { generating = false; }
};

function capitalize(str) { return str.charAt(0).toUpperCase() + str.slice(1); }
