// Visual inspection harness. Named scenarios that pose the scene, capture it,
// and report anything that looks structurally wrong.
//
//   node inspect.mjs            all scenarios
//   node inspect.mjs bot gun    only the named ones
//
// Scenarios run in-page against window.__dbg, so they can drive game objects
// directly rather than trying to play the game from outside.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = 'shots/inspect';
mkdirSync(OUT, { recursive: true });

const only = process.argv.slice(2);
const want = (name) => only.length === 0 || only.some((a) => name.startsWith(a));

// Each scenario: [name, in-page setup returning diagnostics]
const SCENARIOS = [
  // The bot's model is driven from its physics body every update, so pose it
  // by moving the body and letting one update tick sync the model.
  ['bot-front', () => {
    const { bots } = window.__dbg;
    if (!bots.length) return { skip: 'no bots' };
    const b = window.__poseBot(bots[0], { at: [0, 0, -2], yaw: Math.PI });
    window.__shot([0, 1.35, 1.6], [0, 1.05, -2], 42);
    return b;
  }],
  ['bot-side', () => {
    const { bots } = window.__dbg;
    if (!bots.length) return { skip: 'no bots' };
    const b = window.__poseBot(bots[0], { at: [0, 0, -2], yaw: Math.PI });
    window.__shot([3.4, 1.35, -2], [0, 1.05, -2], 42);
    return b;
  }],
  ['bot-walk', () => {
    const { bots } = window.__dbg;
    if (!bots.length) return { skip: 'no bots' };
    const b = window.__poseBot(bots[0], { at: [0, 0, -2], yaw: Math.PI, walk: 3.2 });
    window.__shot([2.6, 1.4, 0.6], [0, 1.0, -2], 42);
    return b;
  }],
  ['gun-viewmodel', () => {
    const { rifle, renderer } = window.__dbg;
    if (!rifle) return { skip: 'no rifle' };
    // Point at open sky so only the weapon is in frame.
    window.__shot([0, 3, 10], [0, 14, -10], 90);
    rifle.renderViewmodel(renderer.renderer);
    return { parts: rifle.vmRoot ? rifle.vmRoot.children.length : 0 };
  }],
  ['gun-in-world', () => {
    const { rifle, renderer } = window.__dbg;
    if (!rifle) return { skip: 'no rifle' };
    window.__shot([0, 1.7, 18], [0, 1.6, 0], 90);
    rifle.renderViewmodel(renderer.renderer);
    return {};
  }],
  // The actual gameplay frame: weapon up, enemy downrange, map behind. This
  // is the only view that shows whether the parts work together.
  ['gameplay', () => {
    const { rifle, renderer, bots } = window.__dbg;
    if (!rifle || !bots.length) return { skip: 'need rifle + bot' };
    window.__poseBot(bots[0], { at: [1.5, 0, 4], yaw: 0.4, walk: 3.0 });
    window.__shot([0, 1.7, 14], [1.2, 1.4, 3], 90);
    rifle.renderViewmodel(renderer.renderer);
    return {};
  }],
];

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
page.setDefaultTimeout(300000);

const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 200)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200));
});

await page.goto('http://localhost:5173/?lowspec=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__ready === true');

for (const [name, fn] of SCENARIOS) {
  if (!want(name)) continue;
  const diag = await page.evaluate(fn);
  if (diag?.skip) { console.log(`  -- ${name}: ${diag.skip}`); continue; }
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${name}.jpeg`, type: 'jpeg', quality: 92 });
  console.log(`  ${name.padEnd(16)} ${JSON.stringify(diag)}`);
}

await browser.close();
if (errors.length) console.log('\nerrors:\n' + errors.slice(0, 8).join('\n'));
