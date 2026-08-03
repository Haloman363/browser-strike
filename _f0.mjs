import { chromium } from 'playwright';
const b = await chromium.launch({ args:['--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:620,height:465} });
p.setDefaultTimeout(300000);
await p.goto('http://localhost:5173/?lowspec=1',{waitUntil:'domcontentloaded'});
await p.waitForFunction('window.__ready === true');
await p.evaluate(()=>window.__shot([0,2,5],[0,1,0],45));
await p.waitForTimeout(500);
await p.evaluate(async ()=>{
  const {Weapon}=await import('/src/weapons/weapon.js');
  const models=await import('/src/weapons/models.js');
  const w=new Weapon('ak47',{modelFactory:(i,m,o)=>models.buildWeaponModel(i,m,o)});
  w.drawTimer=0; window.__w=w;
});
for (let i=0;i<3;i++){
  await p.evaluate(()=>{const {renderer}=window.__dbg;renderer.renderer.clear();window.__w.renderViewmodel(renderer.renderer);});
  await p.waitForTimeout(150);
  const buf = await p.screenshot({type:'png'});
  // crude non-black pixel count
  await p.evaluate(([d])=>{window.__probe=d;},[i]);
  const {writeFileSync}=await import('fs');
  writeFileSync(`/tmp/claude-1000/-home-jaymes-orca-projects-Browser-Strike/08d23b37-c92b-44de-b2d4-da5e13e71a31/scratchpad/f${i}.png`, buf);
  console.log('render',i,'bytes',buf.length);
}
await b.close();
