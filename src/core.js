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
if(typeof module!=='undefined'&&module.exports)module.exports=ColorStyle;
