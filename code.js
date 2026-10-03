/* Shared by Figma and the UI. Canonical colors have one source of truth. */
const ColorStyle = (() => {
  const groups = ['primary', 'secondary', 'grey', 'info', 'success', 'alert', 'danger'];
  const labels = { primary: 'Primary', secondary: 'Secondary', grey: 'Grey', info: 'Info', success: 'Success', alert: 'Warning', danger: 'Danger' };
  const weights = [[50,.95],[100,.85],[200,.70],[300,.55],[400,.35],[500,0],[600,-.10],[700,-.20],[800,-.30],[900,-.45]];
  const roleNames = ['Background/Default','Surface/Default','Text/Primary','Border/Default','Action/Primary','Action/Text'];
  const normalize = value => {
    if (typeof value !== 'string') return null;
    let s = value.trim().replace(/^#/, '');
    if (/^[a-f0-9]{3}$/i.test(s)) s = s.split('').map(c => c+c).join('');
    return /^[a-f0-9]{6}$/i.test(s) ? '#'+s.toUpperCase() : null;
  };
  const rgb = hex => { const h = normalize(hex); if (!h) throw new Error('Invalid color: '+hex); return {r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255}; };
  const hex = color => '#'+['r','g','b'].map(k=>Math.round(Math.max(0,Math.min(1,color[k]))*255).toString(16).padStart(2,'0')).join('').toUpperCase();
  const linear = v => v <= .04045 ? v/12.92 : Math.pow((v+.055)/1.055,2.4);
  const encoded = v => v <= .0031308 ? 12.92*v : 1.055*Math.pow(v,1/2.4)-.055;
  const luminance = c => .2126*linear(c.r)+.7152*linear(c.g)+.0722*linear(c.b);
  const contrast = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
  function lab(c) {
    const r=linear(c.r),g=linear(c.g),b=linear(c.b);
    const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
    return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];
  }
  function fromLab([L,a,b]) {
    const l=(L+.3963377774*a+.2158037573*b)**3,m=(L-.1055613458*a-.0638541728*b)**3,s=(L-.0894841775*a-1.291485548*b)**3;
    return {r:encoded(4.0767416621*l-3.3077115913*m+.2309699292*s),g:encoded(-1.2684380046*l+2.6097574011*m-.3413193965*s),b:encoded(-.0041960863*l-.7034186147*m+1.707614701*s)};
  }
  function perceptual(base,w) {
    const [L,a,b]=lab(base),C=Math.hypot(a,b),h=Math.atan2(b,a);
    const targetL=w>=0?L*(1-w)+w:L*(1+w),targetC=C*(1-Math.abs(w));
    let low=0,high=targetC,result;
    for(let i=0;i<24;i++) {const chroma=i===0?high:(low+high)/2;const c=fromLab([targetL,chroma*Math.cos(h),chroma*Math.sin(h)]);const inside=Object.values(c).every(v=>v>=-1e-7&&v<=1+1e-7);if(inside){low=chroma;result=c;if(i===0)break}else high=chroma;}
    return result||fromLab([targetL,0,0]);
  }
  function shades(base,dark,algorithm='rgb') {
    return weights.slice(0,dark?10:6).map(([level,w])=>{
      const c=algorithm==='oklch'&&level!==500?perceptual(base,w):Object.fromEntries(['r','g','b'].map(k=>[k,w>=0?base[k]*(1-w)+w:base[k]*(1+w)]));
      return {level,color:rgb(hex(c))};
    });
  }
  function build(input) {
    if (!input || typeof input !== 'object' || !input.colors || !input.options) throw new Error('Missing palette settings.');
    const {colors,options}=input;
    if (!['light-only','with-dark'].includes(options.darkShades)) throw new Error('Choose a palette size.');
    if (!['group/level','brand.group.level'].includes(options.naming)) throw new Error('Choose a naming convention.');
    if (options.algorithm && !['rgb','oklch'].includes(options.algorithm)) throw new Error('Unknown palette algorithm.');
    const collection=(options.collection||'Color').trim();
    if (!collection || collection.length>64 || /[\x00-\x1f]/.test(collection)) throw new Error('Collection name must contain 1–64 printable characters.');
    const custom=Array.isArray(input.custom)?input.custom:[];
    if(custom.length>20) throw new Error('Use no more than 20 custom groups.');
    const map={},entries=[],used=new Set([...groups,'warning','gradients','theme','palette']),overrides=input.overrides||{};
    for(const key of Object.keys(colors)) if(!groups.includes(key)) throw new Error('Unknown color group: '+key);
    const sources=groups.map(key=>({key,name:key[0].toUpperCase()+key.slice(1),value:colors[key]}));
    for(const group of custom){
      if(!group||typeof group.name!=='string'||!/^\w[\w -]{0,31}$/.test(group.name.trim()))throw new Error('Custom group names use letters, numbers, spaces, hyphens or underscores (up to 32).');
      const key=group.name.trim().toLowerCase().replace(/[ _]+/g,'-');
      if(used.has(key))throw new Error('Duplicate group: '+group.name);
      used.add(key);sources.push({key,name:group.name.trim(),value:group.color});
    }
    if(!normalize(colors.primary))throw new Error('Enter a valid Primary color.');
    for(const source of sources){
      if(!source.value)continue;
      const value=normalize(source.value);if(!value)throw new Error('Enter a valid hex for '+source.name+'; alpha colors are not supported.');
      map[source.name]=shades(rgb(value),options.darkShades==='with-dark',options.algorithm||'rgb');
      for(const item of map[source.name]){
        const path=source.name+'/'+item.level,override=overrides[path];
        if(override&&item.level!==500){const color=normalize(override);if(!color)throw new Error('Invalid override for '+path);item.color=rgb(color);}
        entries.push({path,key:source.key,name:source.name,level:item.level,color:item.color,styleName:options.naming==='brand.group.level'?'brand.'+source.key+'.'+item.level:source.name+' / '+item.level});
      }
    }
    const prefix=(options.stylePrefix||'').trim();
    if(prefix.length>40||/[\x00-\x1f]/.test(prefix))throw new Error('Style prefix must contain up to 40 printable characters.');
    if(prefix)for(const entry of entries)entry.styleName=options.naming==='brand.group.level'?slug(prefix)+'.'+entry.styleName:prefix+' / '+entry.styleName;
    const theme=options.createThemes===true;
    if(theme && (!options.createVariables || options.darkShades!=='with-dark' || !map.Grey))throw new Error('Theme modes require Variables, a Grey color and 10 tones.');
    const defaults={'Background/Default':['Grey/50','Grey/900'],'Surface/Default':['Grey/100','Grey/800'],'Text/Primary':['Grey/900','Grey/50'],'Border/Default':['Grey/300','Grey/600'],'Action/Primary':['Primary/500','Primary/300']};
    const paths=new Map(entries.map(e=>[e.path,e]));
    const mappings={};
    if(theme){
      for(const role of roleNames){
        let pair=defaults[role];
        if(role==='Action/Text')pair=['Light','Dark'].map((_,i)=>{const target=paths.get((input.mappings?.['Action/Primary']||defaults['Action/Primary'])[i]);if(!target)throw new Error('Invalid Action/Primary mapping.');const white=paths.get('Grey/50'),black=paths.get('Grey/900');return contrast(target.color,white.color)>=contrast(target.color,black.color)?white.path:black.path;});
        const chosen=input.mappings?.[role]||pair;
        if(!Array.isArray(chosen)||chosen.length!==2||chosen.some(path=>!paths.has(path)))throw new Error('Choose valid Light and Dark aliases for '+role);
        mappings[role]=chosen.slice();
      }
    }
    return {map,entries,mappings,theme,collection,options:{...options,collection},generatedAt:new Date().toISOString()};
  }
  const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  function gradientCSS(paint){
    const m=paint.gradientTransform||[[1,0,0],[0,1,0]];
    const angle=Math.round(Math.atan2(m[0][1],m[0][0])*180/Math.PI)+'deg';
    const opacity=paint.opacity??1;
    const stops=paint.gradientStops.map(stop=>{const a=(stop.color.a??1)*opacity;return (a<1?'rgba('+['r','g','b'].map(k=>Math.round(stop.color[k]*255)).join(', ')+', '+a+')':hex(stop.color))+' '+Math.round(stop.position*100)+'%';}).join(', ');
    return paint.type==='GRADIENT_RADIAL'?'radial-gradient('+stops+')':paint.type==='GRADIENT_ANGULAR'?'conic-gradient(from '+angle+', '+stops+')':'linear-gradient('+angle+', '+stops+')';
  }
  function exportsFor(model){return Object.fromEntries(['css','scss','json','dtcg'].map(format=>[format,serialize(model,format)]));}
  function serialize(model,format){
    if(!['css','scss','json','dtcg'].includes(format))throw new Error('Unsupported export format.');
    const gradientEntries=model.gradients||[];
    if(format==='dtcg'){
      const obj={Palette:{$type:'color'}};
      for(const e of model.entries){obj.Palette[e.name]??={};obj.Palette[e.name][e.level]={$value:{colorSpace:'srgb',components:[e.color.r,e.color.g,e.color.b],hex:hex(e.color)},$description:'Palette '+e.path};}
      if(model.theme){obj.Theme={};for(const [role,pair] of Object.entries(model.mappings)){const [group,name]=role.split('/');obj.Theme[group]??={};obj.Theme[group][name]={Light:{$type:'color',$value:'{Palette.'+pair[0].replace('/','.')+'}'},Dark:{$type:'color',$value:'{Palette.'+pair[1].replace('/','.')+'}'}};}}
      if(gradientEntries.length)obj.$extensions={'com.colorstyle-pro.gradients':gradientEntries.map(g=>({name:g.name,figmaPaint:g.fill,cssApproximation:gradientCSS(g.fill)}))};
      return JSON.stringify(obj,null,2);
    }
    if(format==='json'){
      const obj={};for(const e of model.entries){obj[e.name]??={};obj[e.name][e.level]=hex(e.color);}
      if(model.theme){obj.Theme={Light:{},Dark:{}};for(const [role,pair]of Object.entries(model.mappings)){obj.Theme.Light[role]={alias:pair[0],value:hex(model.entries.find(e=>e.path===pair[0]).color)};obj.Theme.Dark[role]={alias:pair[1],value:hex(model.entries.find(e=>e.path===pair[1]).color)};}}
      if(gradientEntries.length)obj.Gradients=Object.fromEntries(gradientEntries.map(g=>[g.name,{cssApproximation:gradientCSS(g.fill),figmaPaint:g.fill}]));
      return JSON.stringify(obj,null,2);
    }
    const lines=model.entries.map(e=>(format==='css'?'  --':'$')+e.key+'-'+e.level+': '+hex(e.color)+';');
    for(const g of gradientEntries)lines.push((format==='css'?'  --':'$')+'gradient-'+slug(g.name)+': '+gradientCSS(g.fill)+';');
    if(gradientEntries.length)lines.unshift('/* Gradient CSS geometry is approximate; JSON/DTCG preserve Figma paints. */');
    let text=format==='css'?':root {\n'+lines.join('\n')+'\n}':lines.join('\n');
    if(model.theme){
      for(const [i,mode]of ['light','dark'].entries()){
        const themeLines=Object.entries(model.mappings).map(([role,pair])=>{const e=model.entries.find(e=>e.path===pair[i]);return format==='css'?'  --'+slug(role)+': var(--'+e.key+'-'+e.level+');':'$'+mode+'-'+slug(role)+': $'+e.key+'-'+e.level+';';});
        text+='\n\n'+(format==='css'?'[data-theme="'+mode+'"] {\n'+themeLines.join('\n')+'\n}':themeLines.join('\n'));
      }
    }
    return text;
  }
  return {groups,labels,roleNames,normalize,rgb,hex,contrast,shades,build,serialize,exportsFor,gradientCSS};
})();


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

