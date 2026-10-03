const fs=require('node:fs');
const core=fs.readFileSync('src/core.js','utf8').replace("if(typeof module!=='undefined'&&module.exports)module.exports=ColorStyle;",'');
fs.writeFileSync('code.js',core+'\n'+fs.readFileSync('src/main.js','utf8'));
fs.writeFileSync('ui.html',fs.readFileSync('src/ui.html','utf8').replace('/* SHARED_CORE */',()=>core).replace('/* UI_LOGIC */',()=>fs.readFileSync('src/ui.js','utf8')));
const vm=require('node:vm');
new vm.Script(fs.readFileSync('code.js','utf8'));
const html=fs.readFileSync('ui.html','utf8');
new vm.Script(html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>')));
console.log('Built and syntax-checked code.js and ui.html');
