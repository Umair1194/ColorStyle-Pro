figma.showUI(__html__, { visible: true, width: 400, height: 640 });
const OWNER='colorstyle-v2';
const copy=value=>JSON.parse(JSON.stringify(value));
const owned=asset=>asset.getPluginData('owner')===OWNER;
const mark=asset=>asset.setPluginData('owner',OWNER);
let busy=false,pending=null,lastModel=null,importedGradients=[];
let reviewEpoch=0,selectionClientId=null,selectionCandidate=null,selectionSerial=0;
let transaction=null;
function track(node){if(transaction)transaction.created.push(node);return node;}
class Transaction {
  constructor(){this.created=[];this.undo=[];}
  snapshotStyle(style){const paints=copy(style.paints),description=style.description,owner=style.getPluginData('owner'),scope=style.getPluginData('scope');this.undo.push(()=>{style.paints=paints;style.description=description;style.setPluginData('owner',owner);style.setPluginData('scope',scope);});}
  snapshotVariable(variable){const values=copy(variable.valuesByMode),description=variable.description,owner=variable.getPluginData('owner');this.undo.push(()=>{for(const id of Object.keys(values))variable.setValueForMode(id,values[id]);variable.description=description;variable.setPluginData('owner',owner);});}
  async rollback(){const errors=[];for(const undo of this.undo.reverse())try{await undo();}catch(e){errors.push(e.message);}for(const asset of this.created.reverse())try{if(!asset.removed)asset.remove();}catch(e){errors.push(e.message);}return errors;}
}
function readSnapshot(plan){return JSON.stringify({styles:plan.styles.map(s=>[s.id,s.name,s.paints,s.description,s.getPluginData('owner'),s.getPluginData('scope')]),variables:plan.variables.map(v=>[v.id,v.name,v.valuesByMode,v.description,v.getPluginData('owner')]),collections:plan.collections.map(c=>[c.id,c.name,c.modes]),frames:plan.oldFrames.map(f=>[f.id,f.removed,f.x,f.y])});}
function attachGradients(model,request){
  const gradients=request.options.includeGradients===true?copy(importedGradients):[];
  const gradientNames=new Set();
  for(let i=0;i<gradients.length;i++){const name=request.gradientNames?.[i]||gradients[i].name;if(typeof name!=='string'||!/^\w[\w -]{0,39}$/.test(name.trim()))throw new Error('Gradient names use letters, numbers, spaces, hyphens or underscores (up to 40).');const slug=name.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-');if(gradientNames.has(slug))throw new Error('Use unique gradient names.');gradientNames.add(slug);gradients[i].name=name.trim();}
  model.gradients=gradients;
  return model;
}

async function planFor(request){
  request=copy(request);
  const model=ColorStyle.build(request),o=model.options;
  const outputs={styles:o.createStyles!==false,variables:o.createVariables===true,guide:o.createGuide!==false,tokens:o.createTokenFrame===true};
  attachGradients(model,request);
  const gradients=model.gradients;
  if(!Object.values(outputs).some(Boolean))throw new Error('Choose a Figma output, or use Export current draft only.');
  const [styles,variables,collections]=await Promise.all([figma.getLocalPaintStylesAsync(),figma.variables.getLocalVariablesAsync(),figma.variables.getLocalVariableCollectionsAsync()]);
  const styleNames=model.entries.map(e=>e.styleName).concat(gradients.map(g=>'Gradient / '+g.name));
  const targetCollections=[model.collection,...(model.theme?[model.collection+' Theme']:[])];
  for(const name of targetCollections)if(collections.filter(c=>c.name===name).length>1)throw new Error('Multiple collections named '+name+'. Choose another destination or rename duplicates.');
  const primitive=collections.find(c=>c.name===model.collection),theme=collections.find(c=>c.name===model.collection+' Theme');
  if(model.theme&&primitive&&primitive.modes.length>1)throw new Error('Semantic themes need a single-mode palette collection. Choose a new destination, such as Color v2.');
  if(model.theme&&theme&&!theme.modes.some(m=>m.name==='Light'))throw new Error('Existing theme collection has no Light mode. Choose a new collection name.');
  const targets=model.entries.map(e=>({name:e.path,collection:primitive})).concat(model.theme?ColorStyle.roleNames.map(name=>({name,collection:theme})):[]);
  const conflicts=[],counts={styles:{create:0,update:0},variables:{create:0,update:0},guide:outputs.guide?1:0,tokens:outputs.tokens?1:0};
  if(outputs.variables&&model.theme&&theme&&!owned(theme)&&!theme.modes.some(m=>m.name==='Dark'))conflicts.push('Collection: '+theme.name+' (add Dark mode)');
  const relevantStyles=[];
  if(outputs.styles)for(const name of styleNames){const found=styles.filter(s=>s.name===name);if(found.length>1)throw new Error('Duplicate paint styles named '+name+'. Resolve duplicates before generation.');if(found.length){counts.styles.update++;relevantStyles.push(found[0]);if(!owned(found[0])||found[0].getPluginData('scope')!==model.collection)conflicts.push('Style: '+name);}else counts.styles.create++;}
  const relevantVariables=[];
  if(outputs.variables)for(const target of targets){const found=target.collection?variables.filter(v=>v.variableCollectionId===target.collection.id&&v.name===target.name):[];if(found.length>1)throw new Error('Duplicate variable: '+target.name);if(found.length){if(found[0].resolvedType!=='COLOR')throw new Error('Variable '+target.name+' is not a color. Choose a new collection.');counts.variables.update++;relevantVariables.push(found[0]);if(!owned(found[0]))conflicts.push('Variable: '+target.name);}else counts.variables.create++;}
  // Keeping a variable alias means its resolved value remains the source of truth.
  // Reject mismatched output instead of silently detaching or exporting a false value.
  if(outputs.styles&&!outputs.variables)for(const entry of model.entries){const existing=relevantStyles.find(s=>s.name===entry.styleName),bound=existing?.paints?.[0]?.boundVariables?.color;if(bound){const v=variables.find(v=>v.id===bound.id),c=collections.find(c=>c.id===v?.variableCollectionId),value=v&&c?v.valuesByMode[c.defaultModeId]:null;if(!value||value.type==='VARIABLE_ALIAS'||ColorStyle.hex(value)!==ColorStyle.hex(entry.color))throw new Error('Style '+entry.styleName+' is variable-bound. Enable Variables to update it, or turn off Styles for export only.');}}
  const scope=model.collection;
  const oldFrames=figma.currentPage.children.filter(n=>n.type==='FRAME'&&owned(n)&&n.getPluginData('scope')===scope&&['guide','tokens'].includes(n.getPluginData('kind')));
  const plan={page:figma.currentPage,request:copy(request),model,outputs,counts,conflicts,styles:relevantStyles,variables:relevantVariables,collections:[primitive,theme].filter(Boolean),oldFrames};
  plan.paletteMode=primitive?.modes.find(m=>m.modeId===primitive.defaultModeId)?.name||'Value';
  plan.warnings=primitive&&primitive.modes.length>1?['Only the '+plan.paletteMode+' palette mode changes. Other mode values are preserved and may differ from this exported snapshot.']:[];
  plan.snapshot=readSnapshot(plan);return plan;
}
async function getCollection(name,theme){
  let collection=(await figma.variables.getLocalVariableCollectionsAsync()).find(c=>c.name===name);
  if(!collection){collection=track(figma.variables.createVariableCollection(name));collection.renameMode(collection.defaultModeId,theme?'Light':'Value');mark(collection);}
  if(theme&&!collection.modes.some(m=>m.name==='Dark')){
    let id;try{id=collection.addMode('Dark');}catch(e){throw new Error('Figma cannot add Dark mode. Check your mode limit or turn off semantic themes. '+e.message);}
    transaction.undo.push(()=>collection.removeMode(id));
  }
  return collection;
}
async function applyPlan(plan){
  const {model,outputs}=plan,tx=new Transaction();transaction=tx;
  try{
    if(figma.currentPage.id!==plan.page.id)throw new Error('The current page changed. Review again on the destination page.');
    if(readSnapshot(plan)!==plan.snapshot)throw new Error('The document changed since the review. Review the assets again.');
    if(outputs.guide||outputs.tokens){await figma.loadFontAsync({family:'Inter',style:'Regular'});await figma.loadFontAsync({family:'Inter',style:'Bold'});}
    if(figma.currentPage.id!==plan.page.id)throw new Error('The page changed while loading fonts. Review again.');
    let paletteCollection=null,themeCollection=null;
    if(outputs.variables){paletteCollection=await getCollection(model.collection,false);if(model.theme)themeCollection=await getCollection(model.collection+' Theme',true);}
    const paletteVariables=new Map();
    if(outputs.variables){
      for(const entry of model.entries){
        let variable=plan.variables.find(v=>v.variableCollectionId===paletteCollection.id&&v.name===entry.path);
        if(variable)tx.snapshotVariable(variable);else variable=track(figma.variables.createVariable(entry.path,paletteCollection,'COLOR'));
        const modes=Object.keys(variable.valuesByMode).length?[paletteCollection.defaultModeId]:paletteCollection.modes.map(m=>m.modeId);
        for(const mode of modes)variable.setValueForMode(mode,entry.color);
        variable.description=describeSolid(entry.color);mark(variable);paletteVariables.set(entry.path,variable);
      }
      if(model.theme){for(const [role,pair]of Object.entries(model.mappings)){
        let variable=plan.variables.find(v=>v.variableCollectionId===themeCollection.id&&v.name===role);
        const isNew=!variable;
        if(variable)tx.snapshotVariable(variable);else variable=track(figma.variables.createVariable(role,themeCollection,'COLOR'));
        for(const mode of themeCollection.modes){const index=mode.name==='Dark'?1:0;if(mode.name==='Light'||mode.name==='Dark'||isNew)variable.setValueForMode(mode.modeId,figma.variables.createVariableAlias(paletteVariables.get(pair[index])));}
        variable.description='Semantic '+role+'; Light → '+pair[0]+', Dark → '+pair[1];mark(variable);
      }}
    }
    if(outputs.styles){
      for(const entry of model.entries){
        let style=plan.styles.find(s=>s.name===entry.styleName);
        if(style)tx.snapshotStyle(style);else{style=track(figma.createPaintStyle());style.name=entry.styleName;}
        let paint={type:'SOLID',color:entry.color};
        if(outputs.variables)paint=figma.variables.setBoundVariableForPaint(paint,'color',paletteVariables.get(entry.path));
        else if(style.paints?.[0]?.boundVariables?.color)paint={...paint,boundVariables:copy(style.paints[0].boundVariables)};
        style.paints=[paint];style.description=describeSolid(entry.color);mark(style);style.setPluginData('scope',model.collection);
      }
      for(const gradient of model.gradients){const name='Gradient / '+gradient.name;let style=plan.styles.find(s=>s.name===name);if(style)tx.snapshotStyle(style);else{style=track(figma.createPaintStyle());style.name=name;}style.paints=[gradient.fill];style.description='Original Figma paint; CSS geometry is approximate.';mark(style);style.setPluginData('scope',model.collection);}
    }
    if(figma.currentPage.id!==plan.page.id)throw new Error('The page changed during generation. Review again.');
    // Snapshot documentation uses raw paints, never aliases beside static labels.
    const guideMap=copy(model.map);if(model.gradients.length)guideMap.Gradients=model.gradients;
    let guide=null,tokens=null;
    if(outputs.guide){guide=await createVisualGuide(guideMap);guide.name='ColorStyle · '+model.collection+' · Palette snapshot';const old=plan.oldFrames.find(f=>f.getPluginData('kind')==='guide');if(old){guide.x=old.x;guide.y=old.y;}tagFrame(guide,'guide',model);}
    if(figma.currentPage.id!==plan.page.id)throw new Error('The page changed during generation. Review again.');
    if(outputs.tokens){tokens=await createTokensFrame(guideMap,model.options,plan.request.format||'css',guide||{x:figma.viewport.center.x-480,y:figma.viewport.center.y,height:0},model);const old=plan.oldFrames.find(f=>f.getPluginData('kind')==='tokens');if(old){tokens.x=old.x;tokens.y=old.y;}tagFrame(tokens,'tokens',model);}
    transaction=null;
    // Old snapshots are retained until every requested write has succeeded.
    const cleanup=[];
    for(const frame of plan.oldFrames)if((frame.getPluginData('kind')==='guide'&&guide)||(frame.getPluginData('kind')==='tokens'&&tokens)){try{frame.remove();}catch(e){cleanup.push(frame.name);}}
    lastModel=copy(model);
    return {model,cleanup};
  }catch(error){const errors=await tx.rollback();transaction=null;throw new Error(error.message+(errors.length?' Some changes could not be restored: '+errors.join('; '):' No generated changes were kept.'));}
}
function tagFrame(frame,kind,model){mark(frame);frame.setPluginData('kind',kind);frame.setPluginData('scope',model.collection);frame.setPluginData('generatedAt',model.generatedAt);}
const hexToRgb=ColorStyle.rgb,rgbToHex=ColorStyle.hex,contrastRatio=ColorStyle.contrast;
const generateShades=ColorStyle.shades,gradientTokenValue=ColorStyle.gradientCSS;
function describeSolid(c){return 'Hex: '+ColorStyle.hex(c)+' • White: '+ColorStyle.contrast(c,{r:1,g:1,b:1}).toFixed(2)+':1 • Black: '+ColorStyle.contrast(c,{r:0,g:0,b:0}).toFixed(2)+':1';}
function wcagBadgeText(c){const w=ColorStyle.contrast(c,{r:1,g:1,b:1}),b=ColorStyle.contrast(c,{r:0,g:0,b:0});return (w>=b?'White':'Black')+' text: '+(Math.max(w,b)>=7?'AAA':'AA');}
// Walk every descendant once. Inventory stored paints, including hidden ones.
// Alpha is paint/stop alpha, not a composited screenshot color.
function scanSelection(){
  const records=new Map(),gradients=[],gradientKeys=new Map(),seen=new Set(),warnings=[];
  let imagePaints=0;
  const roots=Array.from(figma.currentPage.selection);
  const stack=roots.slice().reverse();
  function addColor(color,alpha,source){
    if(!color||!['r','g','b'].every(key=>Number.isFinite(color[key])))return;
    const hex=ColorStyle.hex(color),opacity=Math.max(0,Math.min(1,alpha??1));
    const key=hex+':'+opacity;
    if(!records.has(key))records.set(key,{hex,alpha:opacity,sources:[]});
    const record=records.get(key);
    if(!record.sources.includes(source))record.sources.push(source);
  }
  function paints(list,source){
    if(!Array.isArray(list))return;
    for(const paint of list){
      if(paint.type==='SOLID')addColor(paint.color,paint.opacity??1,source);
      else if(typeof paint.type==='string'&&paint.type.startsWith('GRADIENT_')){
        const key=JSON.stringify(paint);
        if(!gradientKeys.has(key)){const gradient={name:'Selected gradient '+(gradients.length+1),fill:copy(paint),sources:[source]};gradientKeys.set(key,gradient);gradients.push(gradient);}
        else {const existing=gradientKeys.get(key);if(!existing.sources.includes(source))existing.sources.push(source);}
        for(const stop of paint.gradientStops||[])addColor(stop.color,(stop.color.a??1)*(paint.opacity??1),source+' · gradient stop');
      }else if(paint.type==='IMAGE'||paint.type==='VIDEO')imagePaints++;
    }
  }
  while(stack.length){
    const node=stack.pop();if(seen.has(node.id))continue;seen.add(node.id);
    const name=node.name||node.type||'Layer';
    try{
      paints(node.fills,name+' · fill');
      paints(node.strokes,name+' · stroke');
      if(!Array.isArray(node.fills)&&typeof node.getStyledTextSegments==='function'){
        for(const segment of node.getStyledTextSegments(['fills']))paints(segment.fills,name+' · text '+segment.start+'–'+segment.end);
      }
      if(Array.isArray(node.effects))for(const effect of node.effects){
        if(effect.color)addColor(effect.color,effect.color.a??1,name+' · '+effect.type.toLowerCase().replace(/_/g,' '));
      }
      if(node.children)for(let i=node.children.length-1;i>=0;i--)stack.push(node.children[i]);
    }catch(error){warnings.push('Could not read '+name+': '+error.message);}
  }
  const detectedColors=Array.from(records.values());
  return {colors:Array.from(new Set(detectedColors.map(c=>c.hex))),detectedColors,gradients,nodeCount:seen.size,selectionNames:roots.map(n=>n.name||n.type||'Layer'),imagePaints,warnings};
}
function selectionSummary(clientId){
  if(!clientId)return;
  try{const found=scanSelection();send({type:'selection-detected',clientId,colorCount:found.detectedColors.length,gradientCount:found.gradients.length,nodeCount:found.nodeCount,selectionNames:found.selectionNames,imagePaints:found.imagePaints,warnings:found.warnings});}
  catch(error){send({type:'selection-detected',clientId,colorCount:0,gradientCount:0,nodeCount:0,selectionNames:[],warnings:[error.message]});}
}
figma.on('selectionchange',()=>selectionSummary(selectionClientId));
function send(message){figma.ui.postMessage(message);}
figma.ui.onmessage=async message=>{
  if(!message||typeof message!=='object')return;
  const type=message.type;
  const reply=value=>send({...value,clientId:message.clientId,requestId:message.requestId});
  try{
    if(type==='init'){selectionClientId=message.clientId;reply({type:'settings-loaded',state:await figma.clientStorage.getAsync('workspace-v2')||null});selectionSummary(selectionClientId);return;}
    if(type==='save-settings'){const text=JSON.stringify(message.state);if(text.length>250000)throw new Error('Saved palette data is too large.');await figma.clientStorage.setAsync('workspace-v2',copy(message.state));return;}
    if(type==='import-selection'){const found=scanSelection();selectionCandidate={id:String(++selectionSerial),found};reply({type:'selection-imported',importId:selectionCandidate.id,...found});return;}
    if(type==='confirm-selection'){if(!selectionCandidate||selectionCandidate.id!==message.importId)throw new Error('Scan the selected frame again before importing.');importedGradients=selectionCandidate.found.gradients;selectionCandidate=null;return;}
    if(type==='cancel-selection'){selectionCandidate=null;return;}
    if(type==='import-document'){const all=await figma.variables.getLocalVariablesAsync('COLOR'),collections=await figma.variables.getLocalVariableCollectionsAsync();const name=message.collection||'Color',collection=collections.find(c=>c.name===name);if(!collection)throw new Error('No collection named '+name+'.');const colors={};for(const key of ColorStyle.groups){const path=key[0].toUpperCase()+key.slice(1)+'/500',v=all.find(v=>v.variableCollectionId===collection.id&&v.name===path);const value=v?.valuesByMode[collection.defaultModeId];if(value&&value.type!=='VARIABLE_ALIAS')colors[key]=ColorStyle.hex(value);}if(!Object.keys(colors).length)throw new Error('No base palette colors found in '+name+'.');reply({type:'document-imported',colors});return;}
    if(type==='locate-guide'){const scope=message.collection||'Color',frames=figma.currentPage.children.filter(n=>n.type==='FRAME'&&owned(n)&&n.getPluginData('scope')===scope);if(frames.length){figma.currentPage.selection=frames;figma.viewport.scrollAndZoomIntoView(frames);}else throw new Error('No generated guide on this page.');return;}
    if(type==='preview-export'){const model=attachGradients(ColorStyle.build(message.request),message.request);reply({type:'export-complete',model,exports:ColorStyle.exportsFor(model),revision:message.revision,source:'Draft export · no document changes'});return;}
    if(type==='review-generation'){
      if(busy)throw new Error('Generation is already running. Wait for it to finish.');
      const epoch=++reviewEpoch;
      reply({type:'operation-progress',operation:type,message:'Reading local styles and variables…'});
      const plan=await planFor(message.request);
      if(epoch!==reviewEpoch)return;plan.id=String(Date.now())+'-'+Math.random().toString(36).slice(2);plan.revision=message.revision;pending=plan;
      reply({type:'generation-review',id:plan.id,revision:plan.revision,counts:plan.counts,conflicts:plan.conflicts,collection:plan.model.collection,theme:plan.model.theme,paletteMode:plan.paletteMode,warnings:plan.warnings,gradients:plan.model.gradients.length});return;
    }
    if(type==='cancel-review'){reviewEpoch++;pending=null;return;}
    if(type!=='apply-generation'&&type!=='generate-and-export')return;
    if(busy)throw new Error('Generation is already running. Wait for it to finish.');
    busy=true;
    try{
      let plan;
      if(type==='apply-generation'){plan=pending;if(!plan||plan.id!==message.id)throw new Error('Review this palette before generating.');if(plan.conflicts.length&&message.updateConflicts!==true)throw new Error('Choose a new collection/name or explicitly allow updating the listed existing assets.');}
      else {plan=await planFor(message);if(plan.conflicts.length)throw new Error('Existing assets need a review before updating.');}
      pending=null;
      // Refresh all affected identities to detect assets added or renamed after review.
      reply({type:'operation-progress',operation:type,message:'Verifying the reviewed assets…'});
      const fresh=await planFor(plan.request);if(fresh.snapshot!==plan.snapshot||JSON.stringify(fresh.counts)!==JSON.stringify(plan.counts))throw new Error('The document changed after review. Review again.');
      reply({type:'operation-progress',operation:type,message:'Creating the reviewed palette and snapshot…'});
      const result=await applyPlan(plan);reply({type:'generation-complete',model:result.model,exports:ColorStyle.exportsFor(result.model),revision:plan.revision,source:'Generated '+new Date(result.model.generatedAt).toLocaleString(),message:'Palette generated.'+(result.cleanup.length?' Old frames could not be removed: '+result.cleanup.join(', '):'')});figma.notify('ColorStyle palette generated.');
    }finally{busy=false;}
  }catch(error){console.error(error);reply({type:type==='apply-generation'||type==='generate-and-export'?'generation-error':'operation-error',operation:type,message:error.message||String(error)});}
};

// Create Visual Guide frame and return it (fixed width, hug height, no TDZ)
async function createVisualGuide(styleMap) {

  // constants used later (declared before use → no TDZ)
  const GUIDE_W = 960;
  const PAD = 40;
  const INNER_W = GUIDE_W - PAD * 2; // 880
  const TILE_W = 140;
  const TILE_SWATCH = 60;

  // guide
  const guide = track(figma.createFrame());
  guide.name = 'Palette snapshot · '+new Date().toLocaleString();
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
  const hdr = track(figma.createText());
  hdr.fontName = { family: 'Inter', style: 'Bold' };
  hdr.characters = 'Palette snapshot · '+new Date().toLocaleString();
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
    const section = track(figma.createFrame());
    section.layoutMode = 'VERTICAL';
    section.primaryAxisSizingMode = 'AUTO';  // height hugs
    section.counterAxisSizingMode = 'FIXED'; // fixed width
    section.resize(INNER_W, section.height || 0);
    section.itemSpacing = 8;
    section.fills = [];
    section.clipsContent = false;
    guide.appendChild(section);

    // title
    const title = track(figma.createText());
    title.fontName = { family: 'Inter', style: 'Bold' };
    title.characters = sectionName;
    title.fontSize = 18;
    title.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
    section.appendChild(title);

    // row
    const row = track(figma.createFrame());
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

      const sw = track(figma.createFrame());
      sw.layoutMode = 'VERTICAL';
      sw.primaryAxisSizingMode = 'AUTO';   // height hugs
      sw.counterAxisSizingMode = 'FIXED';  // fixed width = tile width
      sw.resize(TILE_W, sw.height || 0);
      sw.itemSpacing = 4;
      sw.fills = [];
      sw.clipsContent = false;
      row.appendChild(sw);

      const rect = track(figma.createRectangle());
      rect.resize(TILE_SWATCH, TILE_SWATCH);
      rect.cornerRadius = 8;
      if (isGrad) rect.fills = [it.fill];
      else {
        rect.fills = [{ type: 'SOLID', color: it.color }];
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

      const label1 = track(figma.createText());
      label1.fontName = { family: 'Inter', style: 'Regular' };
      label1.fontSize = 10;
      label1.characters = isGrad ? it.name : String(it.level);
      label1.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
      label1.textAutoResize = 'HEIGHT';
      label1.resize(TILE_W, label1.height);
      sw.appendChild(label1);

      if (!isGrad) {
        const hexText = track(figma.createText());
        hexText.fontName = { family: 'Inter', style: 'Regular' };
        hexText.fontSize = 10;
        hexText.characters = rgbToHex(it.color);
        hexText.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
        hexText.textAutoResize = 'HEIGHT';
        hexText.resize(TILE_W, hexText.height);
        sw.appendChild(hexText);

        const cw = contrastRatio(it.color, whiteRgb);
        const cb = contrastRatio(it.color, blackRgb);

        const ratio = track(figma.createText());
        ratio.fontName = { family: 'Inter', style: 'Regular' };
        ratio.fontSize = 11;
        ratio.characters = `WCAG W:${cw.toFixed(2)} B:${cb.toFixed(2)}`;
        ratio.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
        ratio.textAutoResize = 'HEIGHT';
        ratio.resize(TILE_W, ratio.height);
        sw.appendChild(ratio);
        const badge = track(figma.createText());
        badge.fontName = { family: 'Inter', style: 'Bold' };
        badge.fontSize = 11;
        badge.characters = wcagBadgeText(it.color);
        badge.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
        badge.textAutoResize = 'HEIGHT';
        badge.resize(TILE_W, badge.height);
        sw.appendChild(badge);
      }
    }
  }

  figma.currentPage.appendChild(guide);

  return guide;
}


// Create a tokens frame with spacing and include gradients (aligned to guide)
async function createTokensFrame(styleMap, options, format, guideFrame, model) {

  const frame = track(figma.createFrame());
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

  const heading = track(figma.createText());
  heading.fontName = { family: 'Inter', style: 'Bold' };
  heading.characters = 'Tokens available for Devs';
  heading.fontSize = 18;
  heading.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
  frame.appendChild(heading);

  const tokenString = ColorStyle.serialize(model, format);

  const textNode = track(figma.createText());
  textNode.fontName = { family: 'Inter', style: 'Regular' };
  textNode.fontSize = 12;
  textNode.characters = tokenString;
  textNode.textAutoResize = 'HEIGHT';
  textNode.resize(920, textNode.height);
  frame.appendChild(textNode);

  figma.currentPage.appendChild(frame);
  return frame;
}

