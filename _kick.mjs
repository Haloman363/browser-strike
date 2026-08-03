import { Weapon } from './src/weapons/weapon.js';
const w = new Weapon('ak47', { viewmodel: false });
w.buildViewmodel();
w.drawTimer = 0; w.setTriggerHeld(true);
let t=0; const S=1/240;
const rows=[];
for(let i=0;i<0.36*240;i++){ w.update(S,{fire:true},null); t+=S;
  rows.push([t.toFixed(3), w.gun.position.z.toFixed(4), w.gun.rotation.x.toFixed(4), w.ammo]); }
// print every 6th
rows.filter((_,i)=>i%6===0).forEach(r=>console.log(r.join('  ')));
