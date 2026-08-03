import * as THREE from 'three';
import { buildWeaponModel } from '/home/jaymes/orca/projects/Browser-Strike/src/weapons/models.js';
import { WEAPON_IDS, getSpec } from '/home/jaymes/orca/projects/Browser-Strike/src/weapons/specs.js';
const ids = process.argv.slice(2);
for (const id of (ids.length?ids:WEAPON_IDS)) {
  const g = buildWeaponModel(id, null, {viewmodel:false});
  g.updateMatrixWorld(true);
  const bb = new THREE.Box3();
  g.traverse(c=>{ if(c.isMesh) bb.union(new THREE.Box3().setFromObject(c)); });
  const s = bb.getSize(new THREE.Vector3());
  console.log(id.padEnd(10), getSpec(id).kind.padEnd(8),
    'len', s.z.toFixed(3), 'h', s.y.toFixed(3), 'w', s.x.toFixed(3),
    'ymin', bb.min.y.toFixed(3), 'ymax', bb.max.y.toFixed(3),
    'zmin', bb.min.z.toFixed(3), 'zmax', bb.max.z.toFixed(3));
}
