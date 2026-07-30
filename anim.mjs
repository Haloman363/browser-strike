// Capture animation as contact-sheet strips so motion can actually be judged.
// A single still cannot show janky timing; eight evenly-spaced frames can.
//
//   node anim.mjs walk        one cycle of the walk, side + three-quarter
//   node anim.mjs             all strips
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = 'shots/anim';
mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
const want = (n) => only.length === 0 || only.some((a) => n.startsWith(a));

const FRAMES = 8;

// [name, camera, lookAt, fov, per-frame in-page poser]
const STRIPS = [
  ['walk-side', [3.2, 1.05, -2], [0, 0.95, -2], 42,
    (t) => window.__animPose({ at: [0, 0, -2], yaw: Math.PI / 2, speed: 3.2, t })],
  ['walk-3q', [2.4, 1.25, 0.4], [0, 0.95, -2], 42,
    (t) => window.__animPose({ at: [0, 0, -2], yaw: Math.PI * 0.75, speed: 3.2, t })],
  ['walk-front', [0, 1.15, 1.2], [0, 0.95, -2], 42,
    (t) => window.__animPose({ at: [0, 0, -2], yaw: Math.PI, speed: 3.2, t })],
  ['run-side', [3.4, 1.05, -2], [0, 0.95, -2], 42,
    (t) => window.__animPose({ at: [0, 0, -2], yaw: Math.PI / 2, speed: 4.6, t })],
  ['idle-side', [2.6, 1.15, -2], [0, 1.0, -2], 40,
    (t) => window.__animPose({ at: [0, 0, -2], yaw: Math.PI / 2, speed: 0, t })],
];

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 420, height: 620 } });
page.setDefaultTimeout(300000);
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 200)));

await page.goto('http://localhost:5173/?lowspec=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__ready === true');

for (const [name, cam, look, fov, poser] of STRIPS) {
  if (!want(name)) continue;
  const shots = [];
  for (let i = 0; i < FRAMES; i++) {
    await page.evaluate(poser, i / FRAMES);
    await page.evaluate(([c, l, f]) => window.__shot(c, l, f), [cam, look, fov]);
    await page.waitForTimeout(120);
    shots.push(await page.screenshot({ type: 'jpeg', quality: 90 }));
  }
  // Stitch the frames side by side into one contact sheet.
  const b64 = shots.map((b) => b.toString('base64'));
  await page.evaluate(async ([imgs, label]) => {
    const loaded = await Promise.all(imgs.map((d) => new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.src = 'data:image/jpeg;base64,' + d;
    })));
    const w = loaded[0].width, h = loaded[0].height;
    const c = document.createElement('canvas');
    c.width = w * loaded.length; c.height = h;
    const cx = c.getContext('2d');
    loaded.forEach((im, i) => {
      cx.drawImage(im, i * w, 0);
      cx.fillStyle = '#000'; cx.fillRect(i * w, 0, 26, 20);
      cx.fillStyle = '#fff'; cx.font = '14px monospace';
      cx.fillText(String(i), i * w + 8, 15);
    });
    window.__sheet = c.toDataURL('image/jpeg', 0.9);
  }, [b64, name]);

  const data = await page.evaluate(() => window.__sheet);
  const { writeFileSync } = await import('fs');
  writeFileSync(`${OUT}/${name}.jpeg`,
    Buffer.from(data.split(',')[1], 'base64'));
  console.log(`  ${name}  (${FRAMES} frames)`);
}

await browser.close();
