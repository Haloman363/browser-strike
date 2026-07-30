// Player-eye capture: every major area and route at y=1.7, the real standing
// eye height, looking where a player would actually look. Reports what the
// collision world says is in front, so a view can be judged numerically as
// well as visually.
//   node eyes.mjs [outdir]
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const outDir = process.argv[2] || 'shots/eyes';
mkdirSync(outDir, { recursive: true });

// The REAL standing eye height, not a guessed 1.7. PlayerMovement puts the
// eye at position.y + height/2 - 0.09, and a player resting on flat ground
// settles at y=0.685, so the eye is 1.28m. Shooting these from 1.7 flatters
// every sightline by 42cm and hides exactly the cover that matters.
const EYE = 0.685 + 1.37 / 2 - 0.09;   // 1.28
const B = 3.0 + EYE;    // balcony deck top is y=3.0
const R = 2.1 + EYE;    // shed-roof perch top is y=2.1

// [name, pos, lookAt, fov]
const VIEWS = [
  ['01-spawnN-south',    [0, EYE, -24],      [0, EYE - 0.1, -4],   90],
  ['02-spawnS-north',    [0, EYE, 24],       [0, EYE - 0.1, 4],    90],
  ['03-courtyard-centre',[0, EYE, 5],        [0, EYE - 0.1, -12],  90],
  ['04-courtyard-west',  [3, EYE, 2],        [-14, EYE - 0.1, 0],  90],
  ['05-N-archway',       [0, EYE, -9],       [0, EYE - 0.1, -20],  90],
  ['06-S-archway',       [0, 1.635 + 0.595, 12], [0, 1.635 + 0.495, 22], 90],
  ['07-W-archway',       [-9, EYE, 0],       [-24, EYE - 0.1, 0],  90],
  ['08-E-archway',       [9, EYE, 0.25],     [24, EYE - 0.1, 0.25],90],
  ['09-west-flank-N',    [-24, EYE, -12],    [-24, EYE - 0.1, 8],  90],
  ['10-west-flank-S',    [-25.75, EYE, 14],  [-25.75, EYE - 0.1, -8], 90],
  ['11-east-flank-N',    [24, EYE, -12],     [24, EYE - 0.1, 8],   90],
  ['12-east-flank-S',    [24, EYE, 11.25],   [24, EYE - 0.1, -8],  90],
  ['13-market-row',      [-7.5, EYE, 10],    [8, EYE - 0.1, 13],   90],
  ['14-market-facing-ct',[0, EYE, 13],       [0, EYE - 0.1, -2],   90],
  ['15-balcony-south',   [-19.5, B, 3],      [4, B - 1.2, -2],     90],
  ['16-balcony-north',   [-19.5, B, -2],     [6, B - 1.0, -10],    90],
  ['17-balcony-stairs',  [-22, 1.585 + 0.595, 8], [-22, 2.6, -2],  90],
  ['18-shed-roof',       [-13.5, R, 8.5],    [6, R - 1.0, 2],      90],
  ['19-mid-past-shed',   [-8, EYE, -8],      [14, EYE - 0.1, -7],  90],
  ['20-SE-plaza',        [10, EYE, 10],      [-6, EYE - 0.1, 2],   90],
];

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://localhost:5173/?lowspec=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__ready === true', { timeout: 180000 });

for (const [name, pos, look, fov] of VIEWS) {
  const diag = await page.evaluate(([p, l, f]) => {
    window.__shot(p, l, f);
    const { world, THREE } = window.__dbg;
    const eye = new THREE.Vector3(p[0], p[1], p[2]);
    // Is the eye itself buried, and can a player actually STAND here?
    const inside = world.overlaps(eye, new THREE.Vector3(0.05, 0.05, 0.05));
    // "Standable" must be judged against the floor actually under this spot,
    // not a flat-ground assumption: the market wall and the stairs both raise
    // the deck, so a body derived by subtracting a constant from the eye ends
    // up inside them and reports a good view as broken. Drop a real player in
    // and let gravity find the surface, then check THAT box.
    const HALF = new THREE.Vector3(0.42, 0.685, 0.42);
    const Ctl = window.__dbg.movement.constructor;
    const probe = new Ctl(world, new THREE.Vector3(p[0], p[1] + 2.0, p[2]));
    for (let i = 0; i < 150; i++)
      probe.update({ forward: 0, right: 0, jump: false, crouch: false }, 0, 1 / 60);
    const standable = probe.position.y > 0.2 && !world.overlaps(probe.position, HALF);
    // How far the requested eye sits above the head of a player standing here.
    const eyeErr = +(p[1] - (probe.position.y + HALF.y - 0.09)).toFixed(2);
    const dir = new THREE.Vector3(l[0] - p[0], l[1] - p[1], l[2] - p[2]).normalize();
    const hit = world.raycast(eye, dir, 70);
    return { inside, standable, eyeErr, clear: hit ? +hit.distance.toFixed(1) : 70 };
  }, [pos, look, fov]);

  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/${name}.jpeg`, type: 'jpeg', quality: 92 });
  const warn = diag.inside ? '  !! EYE INSIDE GEOMETRY'
    : !diag.standable ? '  !! NOT STANDABLE'
    : Math.abs(diag.eyeErr) > 0.25 ? `  !! eye off floor by ${diag.eyeErr}m`
    : diag.clear < 2.0 ? `  !! wall at ${diag.clear}m` : '';
  process.stdout.write(`  ${name.padEnd(20)} clear:${String(diag.clear).padStart(5)}m eyeErr:${String(diag.eyeErr).padStart(5)}${warn}\n`);
}

await browser.close();
if (errors.length) console.log('\nerrors:\n' + errors.slice(0, 6).join('\n'));
console.log(`\n${VIEWS.length} shots -> ${outDir}`);
