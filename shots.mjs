// Capture a fixed set of vantage points for iteration-to-iteration comparison.
// Usage: node shots.mjs <outdir> [--hud]
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const outDir = process.argv[2] || 'shots/pass1';
const showHud = process.argv.includes('--hud');
mkdirSync(outDir, { recursive: true });

// The player's eye is at 1.28m, NOT 1.7m: PlayerMovement puts it at
// position.y + height/2 - 0.09, and a standing player settles at y=0.685.
// Every earlier capture used 1.7, i.e. 42cm above the player's own head,
// which flatters every sightline in the map.
const EYE = 1.28;

// [name, cameraPos, lookAt, fov]
// Vantage points along the map's real playable space. The long axis runs
// north-south (spawns sit at z=+-24), so most views look down it.
const VIEWS = [
  ['01-approach',   [0, EYE, 18],       [0, EYE, 0],        90],
  ['02-courtyard',  [3.5, EYE, 8],      [-2, EYE, -6],      90],
  ['03-centre',     [0, EYE, -6],       [6, EYE, 10],       90],
  ['04-balcony',    [-13, 3.0 + EYE, 4], [4, 1.5, -2],      85],
  ['05-material',   [-6.5, EYE, 7],     [-9.5, 1.1, 3],     60],
  ['06-skyline',    [0, 11, 26],        [0, 3, -4],         72],
];

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.setDefaultTimeout(180000);

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto('http://localhost:5173/?lowspec=1', { waitUntil: 'domcontentloaded' });
// Shader compilation under SwiftShader is minutes-slow; on a real GPU this is
// near-instant. Be generous rather than flaky.
await page.waitForFunction('window.__ready === true', { timeout: 180000 });

if (showHud) await page.evaluate('window.__keepHud = true');

for (const [name, pos, look, fov] of VIEWS) {
  const diag = await page.evaluate(([p, l, f]) => {
    window.__shot(p, l, f);
    // Flag cameras sitting inside geometry: a shot of a wall face teaches
    // nothing, and it is easy to lose a whole pass before noticing.
    const { renderer, world, THREE } = window.__dbg;
    const eye = new THREE.Vector3(p[0], p[1], p[2]);
    const inside = world.overlaps(eye, new THREE.Vector3(0.05, 0.05, 0.05));
    const dir = new THREE.Vector3(l[0] - p[0], l[1] - p[1], l[2] - p[2]).normalize();
    const hit = world.raycast(eye, dir, 60);
    return { inside, clear: hit ? +hit.distance.toFixed(1) : '60+' };
  }, [pos, look, fov]);

  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/${name}.jpeg`, type: 'jpeg', quality: 92 });
  const warn = diag.inside ? '  !! CAMERA INSIDE GEOMETRY'
    : (typeof diag.clear === 'number' && diag.clear < 2.5 ? `  !! wall at ${diag.clear}m` : '');
  process.stdout.write(`  ${name.padEnd(14)} clear:${diag.clear}${warn}\n`);
}

const onScreenErr = await page.evaluate(
  () => document.getElementById('err').textContent.trim());

await browser.close();

if (errors.length) console.log('\nconsole errors:\n' + errors.join('\n'));
if (onScreenErr) console.log('\npage errors:\n' + onScreenErr);
console.log(`\n${VIEWS.length} shots -> ${outDir}`);
