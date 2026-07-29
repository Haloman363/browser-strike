// Capture a fixed set of vantage points for iteration-to-iteration comparison.
// Usage: node shots.mjs <outdir> [--hud]
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const outDir = process.argv[2] || 'shots/pass1';
const showHud = process.argv.includes('--hud');
mkdirSync(outDir, { recursive: true });

// [name, cameraPos, lookAt, fov]
const VIEWS = [
  ['01-courtyard',  [14, 3.2, 16],   [0, 2.2, 0],     78],
  ['02-eye-level',  [8, 1.7, 12],    [-2, 1.7, -4],   90],
  ['03-arch',       [0, 1.7, 13],    [0, 2.4, -6],    90],
  ['04-balcony',    [-13, 4.6, 4],   [4, 1.5, -2],    85],
  ['05-material',   [-6.5, 1.5, 7],  [-9.5, 1.2, 3],  60],
  ['06-skyline',    [20, 8, 20],     [-4, 4, -6],     70],
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
  await page.evaluate(
    ([p, l, f]) => window.__shot(p, l, f), [pos, look, fov]);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/${name}.jpeg`, type: 'jpeg', quality: 92 });
  process.stdout.write(`  ${name}\n`);
}

const onScreenErr = await page.evaluate(
  () => document.getElementById('err').textContent.trim());

await browser.close();

if (errors.length) console.log('\nconsole errors:\n' + errors.join('\n'));
if (onScreenErr) console.log('\npage errors:\n' + onScreenErr);
console.log(`\n${VIEWS.length} shots -> ${outDir}`);
