const $=id=>document.getElementById(id);
const state={custom:[],overrides:{},mappings:{},saved:[],gradients:[]};
let revision=0,busy=false,review=null,result=null,model=null,persistTimer=null,view='palette',selectionCandidate=null;
// Figma's desktop bridge may dispatch MessageEvents with source === null.
// Correlate replies to this UI session/request instead of comparing Window objects.
const clientId='colorstyle-'+Date.now()+'-'+Math.random().toString(36).slice(2);
let requestSerial=0,activeRequest=null;
const requestTimeoutMs=20000;
function clearRequest(){if(activeRequest?.timer)clearTimeout(activeRequest.timer);activeRequest=null;}
const touched=new Set(),invalidTones=new Set();
function post(message){
  const requestId=clientId+'-'+(++requestSerial);
  if(['review-generation','apply-generation','preview-export'].includes(message.type)){
    clearRequest();
    const operation=message.type;
    activeRequest={id:requestId,operation,timer:setTimeout(()=>{
      if(activeRequest?.id!==requestId)return;
      if(operation==='apply-generation'){
        status('Figma has not confirmed completion yet. Keep this window open; do not start another generation.',true);
        return;
      }
      clearRequest();
      post({type:'cancel-review'});
      review=null;setBusy(false);
      status(operation==='review-generation'?'Figma did not finish checking assets. Nothing was generated. Try again or close and reopen the plugin.':'The export did not respond. Try again or reopen the plugin.',true);
    },requestTimeoutMs)};
  }
  parent.postMessage({pluginMessage:{...message,clientId,requestId}},'*');
}

function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error-status',error);}
function make(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function chooseView(name,focus=false){view=name;for(const tab of ['palette','preview','export','help']){const active=tab===name;$('tab-'+tab).setAttribute('aria-selected',String(active));$('tab-'+tab).tabIndex=active?0:-1;$(tab+'-panel').hidden=!active;}if(focus)$('tab-'+name).focus();}
const tabs=['palette','preview','export','help'];
for(const name of tabs){$('tab-'+name).onclick=()=>chooseView(name);$('tab-'+name).onkeydown=event=>{let next;if(event.key==='ArrowRight')next=(tabs.indexOf(name)+1)%4;if(event.key==='ArrowLeft')next=(tabs.indexOf(name)+3)%4;if(event.key==='Home')next=0;if(event.key==='End')next=3;if(next!==undefined){event.preventDefault();chooseView(tabs[next],true);}};}
for(const key of ColorStyle.groups){
  const field=make('div',undefined,'field'),label=make('label',ColorStyle.labels[key]+(key==='primary'?' *':' · optional'));label.htmlFor=key+'-hex';
  const wrapper=make('div',undefined,'input-wrapper'),picker=make('input'),hex=make('input'),error=make('div',undefined,'error');picker.type='color';picker.id=key+'-picker';picker.value='#ffffff';picker.setAttribute('aria-label',ColorStyle.labels[key]+' picker');hex.type='text';hex.id=key+'-hex';hex.placeholder=key==='primary'?'#3366FF':'Not included';hex.spellcheck=false;hex.autocomplete='off';hex.setAttribute('aria-describedby',key+'-error');if(key==='primary')hex.required=true;error.id=key+'-error';
  wrapper.append(picker,hex);field.append(label,wrapper,error);$(ColorStyle.groups.indexOf(key)<3?'core-fields':'status-fields').append(field);
  picker.oninput=()=>{hex.value=picker.value.toUpperCase();touched.add(key);changed();};
  hex.oninput=()=>{const value=ColorStyle.normalize(hex.value);if(value)picker.value=value;touched.add(key);changed();};
  hex.onblur=()=>{const value=ColorStyle.normalize(hex.value);if(value)hex.value=value;else hex.value=hex.value.trim();touched.add(key);renderValidation();};
}
function request(){return {colors:Object.fromEntries(ColorStyle.groups.map(k=>[k,$(k+'-hex').value.trim()])),custom:state.custom.map(g=>({...g})),overrides:{...state.overrides},mappings:JSON.parse(JSON.stringify(state.mappings)),gradientNames:state.gradients.map(g=>g.name),options:{darkShades:$('dark-shades-toggle').value,naming:$('naming-convention').value,collection:$('collection').value.trim(),stylePrefix:$('style-prefix').value.trim(),algorithm:$('algorithm').value,createVariables:$('create-variables').checked,createStyles:$('create-styles').checked,createGuide:$('create-guide').checked,createTokenFrame:$('create-token-frame').checked,createThemes:$('create-themes').checked,includeGradients:$('include-gradients').checked},format:$('token-format').value};}
function changed(){invalidTones.clear();revision++;review=null;render();persist();}
function setBusy(value){busy=value;$('editor').disabled=value;for(const id of ['export-draft','token-format','copy','download','locate-guide'])$(id).disabled=value||(['copy','download'].includes(id)&&!result);$('generate').textContent=value?'Working…':'Review & Generate';renderValidation();}
function renderValidation(){
  for(const key of ColorStyle.groups){const raw=$(key+'-hex').value.trim(),bad=!!raw&&!ColorStyle.normalize(raw);$(key+'-error').textContent=bad?'Use #3366FF or #36F. Alpha is not supported.':key==='primary'&&touched.has(key)&&!raw?'Enter a Primary color.':'';$(key+'-hex').setAttribute('aria-invalid',String(bad));}
  try{model=ColorStyle.build(request());const o=model.options,count=model.entries.length;$('generate').disabled=busy||invalidTones.size>0||![o.createVariables,o.createStyles,o.createGuide,o.createTokenFrame].some(Boolean);$('export-draft').disabled=busy||invalidTones.size>0;$('summary').textContent=count+' tones · '+(o.createVariables?'variables, ':'')+(o.createStyles?'styles, ':'')+(o.createGuide?'snapshot':'no guide')+(model.theme?' · Light/Dark aliases':'');if(![o.createVariables,o.createStyles,o.createGuide,o.createTokenFrame].some(Boolean))$('summary').textContent='No Figma outputs selected. Use Export current draft only.';if(invalidTones.size)$('summary').textContent='Fix the invalid tone edit before generating.';}catch(error){model=null;$('generate').disabled=true;$('export-draft').disabled=true;$('summary').textContent=error.message;}
}
function render(){renderValidation();$('naming-example').textContent='Style: '+($('style-prefix').value?$('style-prefix').value+' / ':'')+($('naming-convention').value==='group/level'?'Primary / 500':'brand.primary.500')+' · Variable: Primary/500 · CSS: --primary-500';renderMappings();renderPreview();renderExport();}
function renderCustom(){
  $('custom-list').replaceChildren();state.custom.forEach((group,index)=>{const row=make('div',undefined,'custom-item'),nameWrap=make('div'),colorWrap=make('div'),name=make('input'),color=make('input'),nameLabel=make('label','Name'),colorLabel=make('label','Base color'),remove=make('button','Remove');name.id='custom-name-'+index;nameLabel.htmlFor=name.id;name.value=group.name;name.maxLength=32;color.id='custom-color-'+index;colorLabel.htmlFor=color.id;color.value=group.color;color.placeholder='#3366FF';nameWrap.append(nameLabel,name);colorWrap.append(colorLabel,color);row.append(nameWrap,colorWrap,remove);$('custom-list').append(row);name.onchange=()=>{group.name=name.value.trim();changed();};color.onchange=()=>{group.color=ColorStyle.normalize(color.value)||color.value.trim();color.value=group.color;changed();};remove.onclick=()=>{state.custom.splice(index,1);renderCustom();changed();};});
}
$('add-group').onclick=()=>{if(state.custom.length>=20){status('Maximum 20 custom groups.',true);return;}let n=state.custom.length+1;while(state.custom.some(g=>g.name==='Accent '+n))n++;state.custom.push({name:'Accent '+n,color:''});renderCustom();changed();};
for(const id of ['dark-shades-toggle','naming-convention','algorithm','create-variables','create-styles','create-guide','create-token-frame','include-gradients','create-themes'])$(id).onchange=()=>{if(id==='create-themes'&&$('create-themes').checked){$('create-variables').checked=true;$('dark-shades-toggle').value='with-dark';if(!$('grey-hex').value)status('Add Grey or use Suggest companions to define theme aliases.');}changed();};
$('collection').oninput=changed;$('style-prefix').oninput=changed;
$('example').onclick=()=>{for(const [key,value]of Object.entries({primary:'#3366FF',secondary:'#00AA55',grey:'#64748B',info:'#0284C7',success:'#15803D',alert:'#D97706',danger:'#DC2626'})){$(key+'-hex').value=value;$(key+'-picker').value=value;}state.overrides={};state.mappings={};changed();status('Example loaded. Adjust the brand colors before generating.');};
$('suggest').onclick=()=>{if(!ColorStyle.normalize($('primary-hex').value)){status('Enter Primary first, or choose Try example.',true);return;}if(!$('secondary-hex').value)$('secondary-hex').value='#0F766E';if(!$('grey-hex').value)$('grey-hex').value='#64748B';for(const key of ['secondary','grey'])$(key+'-picker').value=ColorStyle.normalize($(key+'-hex').value)||'#ffffff';changed();status('Added editable companion suggestions to empty fields.');};
function paletteChoices(){return [{path:'White',color:{r:1,g:1,b:1}},{path:'Black',color:{r:0,g:0,b:0}},...(model?.entries||[]).map(e=>({path:e.path,color:e.color}))];}
function fillSelect(select,choices,value){select.replaceChildren();for(const choice of choices){const option=make('option',choice.label||choice.path);option.value=choice.path;select.append(option);}if(choices.some(c=>c.path===value))select.value=value;}
function renderMappings(){
  const container=$('theme-mappings');container.replaceChildren();$('theme-warning').textContent='';
  if(!$('create-themes').checked)return;
  let base;try{base=ColorStyle.build({...request(),mappings:{}});}catch(error){$('theme-warning').textContent=error.message;return;}
  const choices=base.entries.map(e=>({path:e.path}));
  for(const role of ColorStyle.roleNames){const row=make('div',undefined,'mapping');row.append(make('strong',role));const cols=make('div',undefined,'row');const current=state.mappings[role]||base.mappings[role];for(let i=0;i<2;i++){const wrap=make('div'),label=make('label',i?'Dark':'Light','help'),select=make('select');select.id='mapping-'+role.replace('/','-')+'-'+i;label.htmlFor=select.id;fillSelect(select,choices,current[i]);if(!choices.some(c=>c.path===current[i])){const missing=make('option','Unavailable: '+current[i]);missing.value=current[i];missing.disabled=true;select.prepend(missing);select.value=current[i];}wrap.append(label,select);cols.append(wrap);select.onchange=()=>{state.mappings[role]=[cols.children[0].querySelector('select').value,cols.children[1].querySelector('select').value];changed();};}row.append(cols);container.append(row);}
}
function renderPreview(){
  const root=$('swatch-grid');root.replaceChildren();$('duplicate-warning').replaceChildren();
  if(!model){root.append(make('p','Enter a valid palette to preview its exact output.','empty'));renderPair();$('theme-preview').hidden=true;return;}
  let duplicateCount=0;
  for(const [name,items]of Object.entries(model.map)){
    const section=make('section'),heading=make('h3',name==='Alert'?'Warning':name),grid=make('div',undefined,'swatch-grid');section.append(heading,grid);root.append(section);
    duplicateCount+=items.length-new Set(items.map(s=>ColorStyle.hex(s.color))).size;
    for(const item of items){const value=ColorStyle.hex(item.color),w=ColorStyle.contrast(item.color,{r:1,g:1,b:1}),b=ColorStyle.contrast(item.color,{r:0,g:0,b:0}),tile=make('div',undefined,'swatch'),chip=make('button',item.level+' · '+value,'chip'),body=make('div',undefined,'swatch-body');chip.type='button';chip.style.background=value;chip.style.color=w>=b?'white':'black';chip.setAttribute('aria-label','Copy '+name+'/'+item.level+' '+value);chip.onclick=()=>copyText(value);body.append(make('span','White '+w.toFixed(2)+':1 · Black '+b.toFixed(2)+':1'),make('span',(w>=b?'White':'Black')+' text: '+(Math.max(w,b)>=7?'AAA':'AA')));
      if(item.level===500)body.append(make('span','Base color · locked','help'));else{const label=make('label','Edit '+name+'/'+item.level),input=make('input');input.value=value;input.id='tone-'+name.replace(/[^\w]/g,'-')+'-'+item.level;label.htmlFor=input.id;input.setAttribute('aria-label','Edit '+name+'/'+item.level);input.onchange=()=>{const normalized=ColorStyle.normalize(input.value);if(!normalized){input.setAttribute('aria-invalid','true');invalidTones.add(name+'/'+item.level);renderValidation();status('Use a valid opaque hex for '+name+'/'+item.level,true);return;}state.overrides[name+'/'+item.level]=normalized;changed();};body.append(label,input);}
      tile.append(chip,body);grid.append(tile);
    }
  }
  if(duplicateCount)$('duplicate-warning').append(make('p',duplicateCount+' repeated tone'+(duplicateCount>1?'s':'')+'. Very light or dark bases can produce identical colors. Edit tones or try OKLCH.','notice warning'));
  renderPair();renderThemeExamples();
}
function renderPair(){
  const choices=paletteChoices(),fg=$('pair-foreground').value||'Black',bg=$('pair-background').value||'White';fillSelect($('pair-foreground'),choices,fg);fillSelect($('pair-background'),choices,bg);updatePair();
}
function updatePair(){
  const choices=paletteChoices(),foreground=choices.find(c=>c.path===$('pair-foreground').value),background=choices.find(c=>c.path===$('pair-background').value);if(!foreground||!background)return;
  const ratio=ColorStyle.contrast(foreground.color,background.color);$('pair-demo').style.color=ColorStyle.hex(foreground.color);$('pair-demo').style.background=ColorStyle.hex(background.color);$('pair-result').textContent=ratio.toFixed(2)+':1 · '+(ratio>=4.5?'AA normal text passes':'AA normal text fails');$('pair-flags').textContent='AAA normal: '+(ratio>=7?'Pass':'Fail')+' · AA large: '+(ratio>=3?'Pass':'Fail')+' · Applicable UI boundary: '+(ratio>=3?'Pass':'Fail');const passing=choices.filter(c=>ColorStyle.contrast(c.color,background.color)>=4.5).map(c=>({path:c.path,label:c.path+' · '+ColorStyle.contrast(c.color,background.color).toFixed(2)+':1'}));fillSelect($('passing-alternatives'),[{path:'',label:'Choose a passing text color'},...passing],'');
}
$('pair-foreground').onchange=updatePair;$('pair-background').onchange=updatePair;$('swap-pair').onclick=()=>{const fg=$('pair-foreground').value;$('pair-foreground').value=$('pair-background').value;$('pair-background').value=fg;updatePair();};$('passing-alternatives').onchange=()=>{if($('passing-alternatives').value){$('pair-foreground').value=$('passing-alternatives').value;updatePair();}};
function renderThemeExamples(){
  $('theme-preview').hidden=!model?.theme;if(!model?.theme)return;$('theme-examples').replaceChildren();const warnings=[];
  for(const [index,mode]of ['Light','Dark'].entries()){const color=role=>model.entries.find(e=>e.path===model.mappings[role][index]).color,card=make('div',undefined,'theme-card');card.style.background=ColorStyle.hex(color('Surface/Default'));card.style.color=ColorStyle.hex(color('Text/Primary'));card.style.borderColor=ColorStyle.hex(color('Border/Default'));card.append(make('strong',mode),make('p','Content on surface'));const button=make('button','Primary action');button.style.background=ColorStyle.hex(color('Action/Primary'));button.style.color=ColorStyle.hex(color('Action/Text'));card.append(button);const textRatio=ColorStyle.contrast(color('Text/Primary'),color('Surface/Default')),actionRatio=ColorStyle.contrast(color('Action/Text'),color('Action/Primary'));card.append(make('p','Text '+textRatio.toFixed(2)+':1 · Action '+actionRatio.toFixed(2)+':1'));$('theme-examples').append(card);if(textRatio<4.5||actionRatio<4.5)warnings.push(mode+' has a text pair below AA.');}
  $('theme-warning').textContent=warnings.join(' ')||'Review the Light/Dark examples in Preview. Aliases are suggestions, not an accessibility guarantee.';
}
$('reset-overrides').onclick=()=>{state.overrides={};changed();status('Tone edits reset.');};
function renderExport(){
  const format=$('token-format').value;$('tokens').value=result?.exports[format]||'';$('export-source').textContent=result?result.source+' · '+format.toUpperCase():'No export yet. Generate or export your draft.';$('stale-result').hidden=!result||result.revision===revision;for(const id of ['copy','download'])$(id).disabled=busy||!result;
}
$('token-format').onchange=()=>{renderExport();persist();};
async function copyText(text){try{await navigator.clipboard.writeText(text);status('Copied.');}catch(error){const active=document.activeElement,x=window.scrollX,y=window.scrollY;const field=make('textarea');field.style.position='fixed';field.style.opacity='0';field.value=text;document.body.append(field);field.select();const ok=document.execCommand('copy');field.remove();active?.focus({preventScroll:true});window.scrollTo(x,y);status(ok?'Copied.':'Copy is unavailable. Select the token text and press ⌘C or Ctrl+C.',!ok);}}
function downloadText(text,name,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type})),link=make('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('copy').onclick=()=>{if(result)copyText($('tokens').value);};$('download').onclick=()=>{if(result){const format=$('token-format').value;downloadText(result.exports[format],'colorstyle-tokens.'+(format==='dtcg'?'dtcg.json':format),['json','dtcg'].includes(format)?'application/json':'text/plain');}};
$('export-draft').onclick=()=>{if(!model)return;setBusy(true);status('Exporting this draft without changing Figma…');post({type:'preview-export',request:request(),revision});};
$('locate-guide').onclick=()=>post({type:'locate-guide',collection:$('collection').value.trim()});
$('generate').onclick=()=>{if(!model||busy)return;setBusy(true);status('Checking assets before generation…');post({type:'review-generation',request:request(),revision});};
function showReview(message){
  review=message;$('review-summary').replaceChildren();for(const kind of ['styles','variables'])$('review-summary').append(make('p',kind[0].toUpperCase()+kind.slice(1)+': '+message.counts[kind].create+' new, '+message.counts[kind].update+' updated.'));$('review-summary').append(make('p','Destination: '+message.collection+(message.theme?' + '+message.collection+' Theme (Light/Dark)':'')),make('p',(message.counts.guide?'Palette snapshot replaced/created. ':'')+(message.counts.tokens?'Token frame replaced/created.':'')));
  if(message.counts.variables.create+message.counts.variables.update)$('review-summary').append(make('p','Palette values target mode: '+message.paletteMode+'.'));for(const warning of message.warnings||[])$('review-summary').append(make('p',warning,'notice warning'));
  if(message.gradients)$('review-summary').append(make('p',message.gradients+' selected gradients. CSS geometry is approximate.','notice warning'));
  $('review-conflicts').replaceChildren();for(const conflict of message.conflicts)$('review-conflicts').append(make('li',conflict));$('review-update-label').hidden=!message.conflicts.length;$('review-update').checked=false;$('review-apply').disabled=!!message.conflicts.length;$('review-dialog').showModal();status('Review the planned changes.');
}
$('review-update').onchange=()=>{$('review-apply').disabled=review?.conflicts.length&&!$('review-update').checked;};
function cancelReview(){clearRequest();if($('review-dialog').open)$('review-dialog').close();post({type:'cancel-review'});review=null;setBusy(false);status('Generation cancelled; no document changes.');}
$('review-cancel').onclick=cancelReview;$('review-dialog').addEventListener('cancel',event=>{event.preventDefault();cancelReview();});
$('review-apply').onclick=()=>{if(!review)return;$('review-dialog').close();status('Applying reviewed assets…');post({type:'apply-generation',id:review.id,updateConflicts:$('review-update').checked});};
$('import-selection').onclick=()=>post({type:'import-selection'});$('import-document').onclick=()=>post({type:'import-document',collection:$('collection').value.trim()});
function showSelection(message){
  selectionCandidate=message;
  $('import-list').replaceChildren();
  const records=message.detectedColors||message.colors.map(hex=>({hex,alpha:1,sources:[]}));
  $('import-count').textContent=records.length+' unique colors · '+(message.gradients||[]).length+' gradients · '+(message.nodeCount||0)+' layers.'+(message.imagePaints?' '+message.imagePaints+' image/video paints not sampled.':'')+(message.warnings?.length?' '+message.warnings.join(' '):'');
  for(const [index,record]of records.entries()){
    const color=record.hex,row=make('div',undefined,'import-item'),dot=make('span',undefined,'color-dot'),select=make('select');
    dot.style.background=color;dot.style.opacity=record.alpha;select.dataset.color=color;
    const label=color+(record.alpha<1?' · '+Math.round(record.alpha*100)+'% opacity':'');
    select.setAttribute('aria-label','Use '+label+' as');
    fillSelect(select,[{path:'',label:'Skip'},...ColorStyle.groups.map(key=>({path:key,label:ColorStyle.labels[key]}))],index<3?ColorStyle.groups[index]:'');
    const text=make('span',label);text.title=(record.sources||[]).join('\n');row.append(dot,text,select);$('import-list').append(row);
  }
  if(!records.length)$('import-list').append(make('p',message.gradients?.length?'Gradients detected and included. Review names under Selected gradients.':'No stored paint colors or gradients found.','help'));
  $('import-dialog').showModal();
}
function applyDetectedGradients(message){
  state.gradients=message.gradients||[];$('gradients').hidden=!state.gradients.length;$('gradient-count').textContent='· '+state.gradients.length;$('gradient-list').replaceChildren();state.gradients.forEach((g,index)=>{const field=make('div',undefined,'field'),label=make('label','Gradient '+(index+1)),input=make('input');input.id='gradient-name-'+index;label.htmlFor=input.id;input.value=g.name;input.maxLength=40;input.onchange=()=>{g.name=input.value.trim();changed();};field.append(label,input);$('gradient-list').append(field);});
  $('include-gradients').checked=state.gradients.length>0;
}
function cancelSelection(){selectionCandidate=null;post({type:'cancel-selection'});$('import-dialog').close();}
$('import-cancel').onclick=cancelSelection;$('import-dialog').addEventListener('cancel',event=>{event.preventDefault();cancelSelection();});$('import-apply').onclick=()=>{const chosen=new Set();for(const select of $('import-list').querySelectorAll('select')){if(!select.value)continue;if(chosen.has(select.value)){status('Choose each destination only once.',true);return;}chosen.add(select.value);}for(const select of $('import-list').querySelectorAll('select'))if(select.value){$(select.value+'-hex').value=select.dataset.color;$(select.value+'-picker').value=select.dataset.color;}post({type:'confirm-selection',importId:selectionCandidate.importId});
  applyDetectedGradients(selectionCandidate);selectionCandidate=null;
  $('import-dialog').close();changed();status('Selected colors and gradients applied.');};
function snapshot(){return {version:2,request:request()};}
function persist(){clearTimeout(persistTimer);persistTimer=setTimeout(()=>{const workspace={draft:snapshot(),saved:state.saved};try{localStorage.setItem('colorstyle-v2',JSON.stringify(workspace));}catch(error){}post({type:'save-settings',state:workspace});},300);}
function restore(snapshotValue,allowInvalidDraft=false){
  if(snapshotValue?.version!==2||!snapshotValue.request)throw new Error('Use a ColorStyle Pro v2 settings file.');
  const data=snapshotValue.request;
  // Validate before replacing the current draft. Empty saved drafts are allowed.
  if(data.colors?.primary&&!allowInvalidDraft)ColorStyle.build(data);
  if(!data.colors||!data.options||!Array.isArray(data.custom)||data.custom.length>20)throw new Error('Invalid palette settings.');
  for(const key of ColorStyle.groups){const raw=data.colors[key]||'';if(typeof raw!=='string')throw new Error('Invalid saved colors.');$(key+'-hex').value=raw;$(key+'-picker').value=ColorStyle.normalize(raw)||'#ffffff';}
  state.custom=data.custom.map(g=>({name:String(g.name),color:String(g.color||'')}));state.overrides={...(data.overrides||{})};state.mappings=JSON.parse(JSON.stringify(data.mappings||{}));state.gradients=[];$('gradients').hidden=true;$('include-gradients').checked=false;
  const o=data.options;$('dark-shades-toggle').value=o.darkShades;$('naming-convention').value=o.naming;$('collection').value=o.collection||'Color';$('style-prefix').value=o.stylePrefix||'';$('algorithm').value=o.algorithm||'rgb';for(const [id,key,defaultValue]of [['create-variables','createVariables',true],['create-styles','createStyles',true],['create-guide','createGuide',true],['create-token-frame','createTokenFrame',false],['create-themes','createThemes',false]])$(id).checked=o[key]??defaultValue;
  if(['css','scss','json','dtcg'].includes(data.format))$('token-format').value=data.format;touched.clear();renderCustom();changed();
}
function renderSaved(){fillSelect($('saved-palettes'),[{path:'',label:'Choose a palette'},...state.saved.map((s,i)=>({path:String(i),label:s.name}))],'');}
$('save-palette').onclick=()=>{const name=$('saved-name').value.trim();if(!name){status('Enter a palette name.',true);return;}if(!model){status('Fix the palette before saving.',true);return;}const existing=state.saved.findIndex(s=>s.name===name);const item={name,snapshot:snapshot()};if(existing>=0)state.saved[existing]=item;else{if(state.saved.length>=30){status('Maximum 30 saved palettes.',true);return;}state.saved.push(item);}renderSaved();persist();status('Saved '+name+'.');};
$('load-palette').onclick=()=>{const value=$('saved-palettes').value;if(value==='')return;try{restore(state.saved[Number(value)].snapshot);status('Saved palette loaded.');}catch(error){status(error.message,true);}};
$('delete-palette').onclick=()=>{const value=$('saved-palettes').value;if(value==='')return;state.saved.splice(Number(value),1);renderSaved();persist();status('Removed the saved palette. Current draft is unchanged.');};
$('reset').onclick=()=>{restore({version:2,request:{colors:{primary:''},custom:[],options:{darkShades:'light-only',naming:'group/level',collection:'Color',algorithm:'rgb',createVariables:true,createStyles:true,createGuide:true},format:'css'}});status('Draft reset. Saved palettes remain available.');};
$('export-settings').onclick=()=>downloadText(JSON.stringify(snapshot(),null,2),'colorstyle-palette.json');$('import-settings').onclick=()=>$('settings-file').click();$('settings-file').onchange=async()=>{const file=$('settings-file').files[0];if(!file)return;try{if(file.size>250000)throw new Error('Settings file is too large.');restore(JSON.parse(await file.text()));status('Palette settings imported.');}catch(error){status(error.message,true);}finally{$('settings-file').value='';}};
window.addEventListener('message',event=>{
  const message=event.data?.pluginMessage;
  if(!message||typeof message!=='object'||message.clientId!==clientId)return;
  const operationReply=['operation-progress','generation-review','generation-complete','export-complete','generation-error'].includes(message.type)||(message.type==='operation-error'&&['review-generation','apply-generation','preview-export'].includes(message.operation));
  if(operationReply&&message.requestId!==activeRequest?.id)return;
  if(message.type==='operation-progress'){status(message.message);return;}
  if(operationReply)clearRequest();
  try {

  if(message.type==='settings-loaded'){if(revision===0&&!$('primary-hex').value&&message.state){try{state.saved=Array.isArray(message.state.saved)?message.state.saved.slice(0,30):[];renderSaved();if(message.state.draft)restore(message.state.draft,true);}catch(error){status('Saved settings could not be loaded: '+error.message,true);}}}
  if(message.type==='generation-review'){if(message.revision!==revision){cancelReview();return;}showReview(message);}
  if(message.type==='generation-complete'||message.type==='export-complete'){result={exports:message.exports,revision:message.revision,source:message.source};setBusy(false);review=null;renderExport();chooseView('export');status(message.message||'Draft exported without document changes.');}
  if(message.type==='generation-error'||message.type==='operation-error'){if(!['save-settings','init'].includes(message.operation)){if($('review-dialog').open)$('review-dialog').close();review=null;setBusy(false);}status(message.message,true);}
  if(message.type==='selection-detected'){
    $('selection-summary').textContent=message.nodeCount?message.colorCount+' colors · '+message.gradientCount+' gradients detected in '+message.nodeCount+' layers. Use frame colors to review them.':'Select a frame to detect its colors and gradients.';
    if(message.warnings?.length)$('selection-summary').textContent+=' '+message.warnings.join(' ');
  }
  if(message.type==='selection-imported')showSelection(message);
  if(message.type==='document-imported'){for(const [key,value]of Object.entries(message.colors))if(ColorStyle.groups.includes(key)){$(key+'-hex').value=value;$(key+'-picker').value=value;}state.overrides={};state.mappings={};changed();status('Base colors loaded. Review them before generating.');}
  }catch(error){
    clearRequest();review=null;
    if($('review-dialog').open)$('review-dialog').close();
    setBusy(false);status('Could not process Figma’s reply: '+error.message+'. Close and reopen the plugin if this continues.',true);
    console.error(error);
  }
});
render();post({type:'init'});
