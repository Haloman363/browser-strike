import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.setDefaultTimeout(300000);
await page.goto('http://localhost:5173/?lowspec=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__ready === true');
const r = await page.evaluate(() => {
  const { THREE } = window.__dbg;
  const World = window.__dbg.world.constructor;
  const Ctl = window.__dbg.movement.constructor;
  const mk=()=>{ const w=new World();
    w.addBox(new THREE.Vector3(0,-1,0), new THREE.Vector3(80,2,80));
    return w; };
  // yaw=0 => wishDir (0,0,-1): travels toward -z. Start at +z, post at origin.
  const run=(w,yaw,jump,startZ=6)=>{
    const m=new Ctl(w,new THREE.Vector3(0,0.685,startZ));
    let pin=-1, minDist=1e9;
    for(let t=0;t<900;t++){ const b=m.position.clone();
      m.update({forward:1,right:0,jump:jump&&t%40===39,crouch:false},yaw,1/60);
      minDist=Math.min(minDist,Math.hypot(m.position.x,m.position.z));
      if(m.grounded&&m.position.distanceTo(b)<1e-6&&pin<0) pin=t; }
    return {pin,end:[+m.position.x.toFixed(2),+m.position.z.toFixed(2)],
      spd:+Math.hypot(m.velocity.x,m.velocity.z).toFixed(3)}; };

  const post=mk(); post.addBox(new THREE.Vector3(0,1.3,0), new THREE.Vector3(0.28,2.6,0.28));
  const wall=mk(); wall.addBox(new THREE.Vector3(0,1.3,0), new THREE.Vector3(12,2.6,0.28));
  return {
    thinPost_headOn:   run(post,0,false),
    thinPost_jump:     run(post,0,true),
    thinPost_offset:   run(post,0,false,6.0001),
    thinPost_yawOff:   run(post,0.02,false),
    wall_headOn:       run(wall,0,false),
    wall_jump:         run(wall,0,true),
  };
});
console.log(JSON.stringify(r,null,1));
await browser.close();
