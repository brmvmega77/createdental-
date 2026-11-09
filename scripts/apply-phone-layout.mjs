// Keep width-based cabinet breakpoints stable when a touch phone rotates.
// Run against a source checkout before deployment: node scripts/apply-phone-layout.mjs [root].
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(process.argv[2]||'.');
const phone='(pointer: coarse) and (hover: none) and (orientation: landscape) and (max-height: 560px)';
const files=['styles.css','orders-overrides.css','public/assets/auth-layout.css','public/assets/order-prosthetic-addons.css','public/assets/clinic-banner.css','public/assets/mobile-cabinets.css','public/assets/clinic-mobile-ui.css','public/assets/cabinet-layout.css','public/assets/button-sizing.css'];
for(const file of files){
 let original;try{original=await fs.readFile(path.join(root,file),'utf8')}catch(error){if(error.code==='ENOENT')continue;throw error}
 const marker='/* Phone breakpoints follow the short screen side. */';
 if(original.includes(marker))continue;
 const next=original.replace(/@media\s*([^{}]+)\{/g,(whole,query)=>{
  if(/orientation\s*:\s*landscape/.test(query)&&file.endsWith('mobile-cabinets.css')&&!query.includes(','))return `@media (${query.trim()}) and (not (${phone})) {`;
  if(file.endsWith('clinic-mobile-ui.css')&&/orientation\s*:\s*landscape/.test(query))return `@media (${query.trim()}) and (not (${phone})) {`;
  return '@media '+query.replace(/\((min|max)-width\s*:\s*(\d+)px\)/g,(_,bound,size)=>bound==='max'
   ?`((max-width: ${size}px) or ((${phone}) and (max-height: ${size}px)))`
   :`(((min-width: ${size}px) and (not (${phone}))) or ((${phone}) and (min-height: ${size}px)))`)+'{';
 });
 if(next!==original)await fs.writeFile(path.join(root,file),marker+'\n'+next);
}
for(const file of ['app.js','public/assets/clinic-mobile-ui.js','index.html']){
 let original;try{original=await fs.readFile(path.join(root,file),'utf8')}catch(error){if(error.code==='ENOENT')continue;throw error}
 let next=original;
 if(file.endsWith('clinic-mobile-ui.js'))next=next.replace("'(max-width: 900px)'",`'(max-width: 900px), (${phone})'`);
 if(file==='app.js')next=next.replace(/clinic-mobile-ui\.js\?v=[^'"\s]+/g,'clinic-mobile-ui.js?v=phone-stable-1');
 if(file==='index.html'){
  next=next.replace(/(href="[^"?]+\.css)\?v=[^"]*/g,'$1?v=phone-stable-1');
  next=next.replace(/\/app\.js\?v=[^"\s]+/g,'/app.js?v=phone-stable-1');
  if(!next.includes('/assets/cabinet-phone.css'))next=next.replace('</head>','<link rel="stylesheet" href="/assets/cabinet-phone.css?v=phone-stable-1">\n</head>');
 }
 if(next!==original)await fs.writeFile(path.join(root,file),next);
}
