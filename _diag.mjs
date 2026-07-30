import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.setDefaultTimeout(300000);
await page.goto('http://localhost:5173/?lowspec=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__ready === true');
const r = await page.evaluate(() => {
  const { world, THREE } = window.__dbg;
  const Ctl = window.__dbg.movement.constructor;
  const settle=(x,z)=>{const m=new Ctl(world,new THREE.Vector3(x,3,z));
    for(let t=0;t<150;t++)m.update({forward:0,right:0,jump:false,crouch:false},0,1/60);return m;};
  // Reproduce a "stuck" case and describe the surroundings.
  const cases=[[-13,0,1.57],[0,0,1.57],[13,0,0],[6.5,0,1.57],[-6.5,0,1.57]];
  return cases.map(([sx,sz,yaw])=>{
    const seed=settle(sx,sz);
    const m=new Ctl(world,seed.position.clone());
    const t0=m.position.clone();
    let stall=null;
    for(let t=0;t<420;t++){
      const b=m.position.clone();
      m.update({forward:1,right:0,jump:t%40===39,crouch:false},yaw,1/60);
      if(m.grounded && m.position.distanceTo(b)<0.004 && !stall)
        stall={t, at:m.position.toArray().map(v=>+v.toFixed(2))};
    }
    const fwd=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
    // what's around the stall point at various heights
    const probe=(y,dist)=>{
      const o=new THREE.Vector3(m.position.x,y,m.position.z);
      const h=world.raycast(o,fwd,dist); return h?+h.distance.toFixed(2):null; };
    return {start:[sx,sz],yaw,travelled:+m.position.distanceTo(t0).toFixed(2),
      end:m.position.toArray().map(v=>+v.toFixed(2)), stall,
      ahead:{ankle:probe(0.15,3),knee:probe(0.5,3),chest:probe(1.1,3),head:probe(1.6,3)},
      grounded:m.grounded};
  });
});
console.log(JSON.stringify(r,null,1));
await browser.close();
