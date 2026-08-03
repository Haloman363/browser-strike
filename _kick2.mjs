import { Weapon } from './src/weapons/weapon.js';
const w = new Weapon('ak47', { viewmodel: false });
w.buildViewmodel();
w.drawTimer=0;
w.triggerKick(()=>0.5, 1);
console.log('after one kick impulse: kickVel.z', w.kickVel.z.toFixed(3), 'kickRotVel.x', w.kickRotVel.x.toFixed(3));
let t=0; const S=1/240; let maxz=0,maxrx=0;
for(let i=0;i<120;i++){ w.animate(S,0,null); t+=S;
  maxz=Math.max(maxz,Math.abs(w.kickPos.z)); maxrx=Math.max(maxrx,Math.abs(w.kickRot.x));
  if(i%6===0) console.log(t.toFixed(3),'kickPos.z',w.kickPos.z.toFixed(4),'kickRot.x',w.kickRot.x.toFixed(4)); }
console.log('peak kickPos.z',maxz.toFixed(4),'-> applied', (maxz*0.055).toFixed(5),'m');
console.log('peak kickRot.x',maxrx.toFixed(4),'-> applied', (maxrx*0.035).toFixed(5),'rad =', (maxrx*0.035*57.3).toFixed(2),'deg');
