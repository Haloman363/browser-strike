// Renders every weapon model so the arsenal can actually be LOOKED at.
//
// The models suite asserts 617 things and still cannot tell you whether an
// AWP reads as a sniper rifle or whether four SMGs are the same gun with
// different numbers. That judgement needs eyes, and in this project three of
// the last four real bugs were found in a screenshot.
//
//   node arsenal.mjs           every weapon, one grid page per archetype
//   node arsenal.mjs smg       only that archetype
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = 'shots/arsenal';
mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.setDefaultTimeout(240000);
page.on('pageerror', (e) => console.log('  PAGEERROR', String(e).slice(0, 200)));

await page.goto('http://localhost:5173/?lowspec=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__ready === true', { timeout: 240000 });

// The start overlay and HUD sit ON TOP of the canvas, so a screenshot catches
// the menu rather than the guns. Hide every DOM layer before capturing.
await page.evaluate(() => {
  document.getElementById('start')?.classList.add('hidden');
  for (const id of ['hud', 'err']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
  for (const el of document.querySelectorAll('body > *:not(canvas)')) {
    el.style.display = 'none';
  }
});

// Group by archetype so like is compared with like -- the distinctness problem is
// always "do the four SMGs look the same", never "does a knife look like a
// rifle". Laying them out mixed hides exactly the problem worth seeing.
const groups = await page.evaluate(async () => {
  const s = await import('/src/weapons/specs.js');
  const byKind = {};
  for (const id of s.WEAPON_IDS) {
    const spec = s.getSpec(id);
    (byKind[spec.kind] ??= []).push(id);
  }
  return byKind;
});

for (const [kind, ids] of Object.entries(groups)) {
  if (only.length && !only.includes(kind)) continue;

  const diag = await page.evaluate(async ([kind, ids]) => {
    const THREE = window.__dbg.THREE;
    const { renderer } = window.__dbg;
    const models = await import('/src/weapons/models.js');

    // A dedicated scene: the map's lighting and geometry would just be clutter.
    // Bright by studio standards: the renderer applies ACES tonemapping and a
    // low exposure tuned for a sunlit map, which crushes a normally-lit product
    // shot to near-black. These values are chosen against that curve, not in a
    // vacuum -- an earlier pass rendered the whole arsenal as dark smudges.
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x6a6864);
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x6b6155, 6.0));
    const key = new THREE.DirectionalLight(0xfff2dd, 9.0);
    key.position.set(2.5, 4, 3);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 4.0);
    fill.position.set(-2.0, 2.0, 3.5);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xaaccff, 3.5);
    rim.position.set(-3, 1.5, -2.5);
    scene.add(rim);

    // Grid, not a single row: eight pistols in a line renders each one tiny.
    // Space by the ACTUAL model size, not a constant: pistols are a third the
    // length of rifles, so one spacing either collides the rifles or scatters
    // the pistols across an empty frame.
    const built = ids.map((id) => {
      const g = models.buildWeaponModel(id, null, { viewmodel: false });
      // Models are built along -Z (barrel forward), so a small yaw points the
      // muzzle AT the camera and the whole gun collapses to a nose-on stub.
      // Yaw ~90deg to lay the length across the frame, minus a little so the
      // near side still catches light and the shape reads in three dimensions.
      g.rotation.y = Math.PI / 2 - 0.30;
      const bb = new THREE.Box3().setFromObject(g);
      return { id, g, size: bb.getSize(new THREE.Vector3()) };
    });
    const maxLen = Math.max(...built.map((b) => Math.max(b.size.x, b.size.z)));
    const maxH = Math.max(...built.map((b) => b.size.y));
    const cols = ids.length <= 4 ? Math.min(2, ids.length) : 3;
    const rows = Math.ceil(ids.length / cols);
    const SPACING = maxLen * 1.25;
    const VSPACING = maxH * 2.2;

    const out = [];
    built.forEach(({ id, g }, i) => {
      const cx = i % cols, cy = Math.floor(i / cols);
      g.position.set(
        (cx - (cols - 1) / 2) * SPACING,
        ((rows - 1) / 2 - cy) * VSPACING,
        0,
      );
      scene.add(g);
      const bb = new THREE.Box3().setFromObject(g);
      const size = bb.getSize(new THREE.Vector3());
      out.push({
        id,
        len: +Math.max(size.x, size.z).toFixed(3),
        h: +size.y.toFixed(3),
        muzzle: !!g.getObjectByName('muzzle'),
      });
    });

    // Frame to the actual laid-out extent rather than a guessed distance: an
    // earlier constant put every gun in a thin strip across the middle of a
    // 1600x900 frame, which is not something you can judge a silhouette from.
    const all = new THREE.Box3();
    scene.traverse((o) => { if (o.isMesh) all.expandByObject(o); });
    const size = all.getSize(new THREE.Vector3());
    const centre = all.getCenter(new THREE.Vector3());
    const cam = new THREE.PerspectiveCamera(38, 1600 / 900, 0.05, 100);
    // Fit the wider of the two axes, with a little margin.
    const fitH = (size.y * 1.5) / (2 * Math.tan((38 * Math.PI / 180) / 2));
    const fitW = (size.x * 1.06) / (2 * Math.tan((38 * Math.PI / 180) / 2) * (1600 / 900));
    cam.position.set(centre.x, centre.y + size.y * 0.35, Math.max(fitH, fitW));
    cam.lookAt(centre.x, centre.y, 0);

    window.__captureMode = true;
    renderer.renderer.render(scene, cam);
    return out;
  }, [kind, ids]);

  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${kind}.jpeg`, type: 'jpeg', quality: 94 });

  // Print the measured lengths: two guns within a couple of cm will look like
  // the same gun no matter how different their stat blocks are.
  const lens = diag.map((d) => `${d.id}:${d.len}`).join(' ');
  const noMuzzle = diag.filter((d) => !d.muzzle).map((d) => d.id);
  console.log(`${kind.padEnd(8)} ${diag.length} models`);
  console.log(`         ${lens}`);
  if (noMuzzle.length) console.log(`         !! NO MUZZLE MARKER: ${noMuzzle.join(', ')}`);
}

await browser.close();
console.log(`\n-> ${OUT}/`);
