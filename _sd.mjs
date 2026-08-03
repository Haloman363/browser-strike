import * as THREE from 'three';
import { buildWeaponModel } from './src/weapons/models.js';
const sz={};
for (const id of ['m4a4','m4a1s','mp9','p90','ak47','awp','usp','deagle','nova','sawedoff','bizon','m249']) {
  const g=buildWeaponModel(id,null,{viewmodel:false}); g.updateMatrixWorld(true);
  const bb=new THREE.Box3(); g.traverse(c=>{if(c.isMesh)bb.union(new THREE.Box3().setFromObject(c));});
  const s=bb.getSize(new THREE.Vector3()); sz[id]=[Math.max(s.x,s.z),s.y,Math.min(s.x,s.z)];
}
const d=(a,b)=>{let t=0;for(let i=0;i<3;i++){const s=Math.max(sz[a][i],sz[b][i],1e-4);t+=Math.abs(sz[a][i]-sz[b][i])/s;}return t;};
for (const [a,b] of [['m4a4','m4a1s'],['mp9','p90'],['ak47','awp'],['usp','deagle'],['nova','sawedoff'],['mp9','bizon'],['m249','mp9']])
  console.log(a,b,'shapeDist',d(a,b).toFixed(3));
