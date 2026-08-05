// Capture animation as contact-sheet strips so motion can actually be judged.
// A single still cannot show janky timing; eight evenly-spaced frames can.
//
//   node anim.mjs walk        one cycle of the walk, side + three-quarter
//   node anim.mjs             all strips
//   node anim.mjs vm-         only the VIEWMODEL strips (see VM_STRIPS below)
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

// Prime capture mode once. The first __shot call also hides the HUD and stops
// the frame loop, so without this frame 0 of every strip is captured mid-
// transition and does not match the rest.
await page.evaluate(() => window.__shot([0, 2, 5], [0, 1, 0], 45));
await page.waitForTimeout(500);

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

// ---------------------------------------------------------------------------
// VIEWMODEL strips
// ---------------------------------------------------------------------------
// weapon.js implements draw, idle sway, fire kick, a two-phase reload, a
// shell-at-a-time reload, a bolt cycle, scope, inspect and knife slash/stab.
// None of it had ever been rendered. Every one of those is a TIMING, and a
// timing is exactly what a still frame cannot show, so each gets a strip.
//
// These do NOT go through window.__shot like the strips above. A Weapon owns
// its own vmScene and vmCamera; driving one directly with a FIXED dt is both
// simpler than posing the real player and deterministic -- the frame at t=0.4s
// is the same frame every run, which is what makes two sheets comparable after
// a change. The page's own weapon and frame loop are left alone.
//
// Each scenario is [name, weaponId, totalSeconds, action]. The strip samples
// FRAMES points evenly across totalSeconds, stepping the weapon in small fixed
// increments up to each sample so the springs integrate properly -- sampling by
// jumping dt straight to the sample time would give the kick spring one huge
// step and render a completely different curve.
//
// `action` is a NAME, applied by a switch inside the page (see VM_SETUP), not a
// function shipped across and rebuilt there. Serialising a closure into the
// browser needs new Function() on the far side, and a harness is not worth an
// eval path even when the strings are local literals.
const VM_STRIPS = [
  // Fire. Five AK shots at 600rpm land inside 0.5s, so the strip has to be
  // short or every frame shows a settled gun. The whole story is the first
  // 0.35s: the punch and the recovery.
  // 0.18s, not a full auto burst: the kick spring peaks about 40ms after the
  // shot and is 90% recovered by 0.30s, so a longer window spends most of its
  // frames on a settled gun. Note the kick is SMALL by design -- a single AK
  // shot displaces the viewmodel 2.5mm and 0.31deg, because animate() scales
  // the spring by 0.055/0.035. Those constants and the impulses feeding them
  // are copied from rifle.js lines 995-1083 exactly, so this is the reference
  // weapon's tuned recoil, not a weapon.js regression. It reads as a tremor
  // rather than a punch on the sheet; changing it means changing rifle.js.
  ['vm-ak-fire', 'ak47', 0.18, 'fire'],

  // Two-phase reload: OUT (mag leaves) then IN (new mag seats), 0.75 + 1.15s.
  // The magazine should visibly LEAVE the well and a new one rise back into it.
  ['vm-ak-reload', 'ak47', 1.90, 'reload'],

  // AWP bolt cycle: the re-chamber between shots. 41rpm means a 1.46s shot
  // interval and an 0.85 fraction of it cycling, so ~1.2s of visible bolt.
  ['vm-awp-bolt', 'awp', 1.30, 'oneshot'],

  // Scope-in. A step change rather than a curve -- the strip is here to prove
  // the weapon actually drops out of frame and stays there, and to show what
  // the transition does (or does not) look like.
  ['vm-awp-scope', 'awp', 1.00, 'scope'],

  // Shell-at-a-time. The Nova's 0.5s pump then 0.45s PER SHELL, six shells
  // from two rounds loaded -- the strip must show a repeating jab, not one arc.
  ['vm-nova-shells', 'nova', 2.60, 'reload'],

  // Knife, both attacks. Different timings on purpose: the slash is 0.4s and
  // whips across, the stab is 0.75s and thrusts down the bore. If these two
  // sheets look alike, the distinction in animate() is not landing.
  ['vm-knife-slash', 'knife', 0.42, 'slash'],
  ['vm-knife-stab', 'knife', 0.78, 'stab'],

  // Draw: the weapon swings up from below and rolls level over 0.7s.
  ['vm-ak-draw', 'ak47', 0.72, 'draw'],

  // Inspect: 2.2s roll-over-and-back. The longest animation in the game and
  // the one most likely to leave the frame.
  ['vm-ak-inspect', 'ak47', 2.20, 'inspect'],
];

// Viewmodel strips want a different frame from the 420x620 portrait used for
// the third-person strips. The viewmodel camera derives its aspect from the
// canvas, and the gun is posed in the LOWER RIGHT -- at 16:9 the receiver and
// magazine fall off the bottom edge, which hides exactly the parts a reload
// strip exists to show. 4:3 keeps the whole weapon in frame.
await page.setViewportSize({ width: 620, height: 465 });

for (const [name, id, total, action] of VM_STRIPS) {
  if (!want(name)) continue;

  // Build the weapon and apply the scenario's opening action.
  await page.evaluate(async ([id, action]) => {
    const { Weapon } = await import('/src/weapons/weapon.js');
    const models = await import('/src/weapons/models.js');

    // A real model, not the stub: the point is to see the actual gun move.
    const w = new Weapon(id, {
      modelFactory: (wid, mats, o) => models.buildWeaponModel(wid, mats, o),
    });

    // Every scenario except 'draw' clears drawTimer first: a weapon starts
    // mid-deploy, and leaving that running would overlay the draw arc on top of
    // whatever the strip is supposed to be showing.
    if (action !== 'draw') w.drawTimer = 0;
    switch (action) {
      case 'fire':    w.setTriggerHeld(true); break;
      // Start near-empty so the reload has something to do and the mag-swap
      // actually runs to completion rather than being refused.
      case 'reload':  w.ammo = 2; w.reload(); break;
      case 'oneshot': w.fire(() => 0.5); break;   // fixed rand: deterministic
      case 'scope':   w.setScope(1); break;
      case 'slash':   w.meleeAttack(false); break;
      case 'stab':    w.meleeAttack(true); break;
      case 'draw':    w.deploy(); break;
      case 'inspect': w.startInspect(); break;
      default: throw new Error('unknown action ' + action);
    }
    window.__vmWeapon = w;
    window.__vmT = 0;
    // Warm-up render, discarded. renderViewmodel() corrects vmCamera.aspect on
    // its FIRST call, so the t=0 frame would otherwise be projected with the
    // 16/9 fallback the camera was constructed with rather than this viewport.
    const { renderer } = window.__dbg;
    renderer.renderer.clear();
    w.renderViewmodel(renderer.renderer);
  }, [id, action]);

  // Step and capture one frame at a time.
  //
  // The frames are grabbed with page.screenshot rather than canvas.toDataURL:
  // the renderer is constructed without preserveDrawingBuffer, so reading the
  // canvas back after the compositor has had it returns a blank image, and
  // renderer.js is not this harness's to change. A real screenshot goes through
  // the compositor and always has pixels.
  const shots = [];
  const diag = [];
  for (let i = 0; i < FRAMES; i++) {
    const target = (i / (FRAMES - 1)) * total;
    diag.push(await page.evaluate(async ([target]) => {
      const w = window.__vmWeapon;
      const { renderer } = window.__dbg;
      // Fixed 120Hz integration. Small enough that the kick spring (stiff 190,
      // damp 21) is stable -- at 30Hz it visibly rings differently, which would
      // make this sheet a picture of the sampler rather than of the animation.
      const STEP = 1 / 120;
      while (window.__vmT < target - 1e-6) {
        const dt = Math.min(STEP, target - window.__vmT);
        w.update(dt, { fire: w.triggerDown }, null);
        window.__vmT += dt;
      }
      renderer.renderer.clear();
      w.renderViewmodel(renderer.renderer);
      // The numbers behind the pixels: if a strip looks static this says
      // whether the animation state is actually changing or the render is.
      return {
        t: +window.__vmT.toFixed(3),
        st: w.reloadState, ammo: w.ammo,
        sw: w.swing, ch: +w.chambering.toFixed(3),
        py: +w.gun.position.y.toFixed(4),
        pz: +w.gun.position.z.toFixed(4),
        rz: +w.gun.rotation.z.toFixed(3),
        rx: +w.gun.rotation.x.toFixed(3),
      };
    }, [target]));
    // Let the compositor pick the freshly-rendered buffer up before grabbing it.
    await page.waitForTimeout(80);
    shots.push((await page.screenshot({ type: 'jpeg', quality: 92 })).toString('base64'));
  }

  await page.evaluate(() => { window.__vmWeapon?.dispose(); window.__vmWeapon = null; });

  // Stitch, labelling each frame with its TIME rather than its index -- an
  // index tells you nothing about whether a 0.4s slash is too fast.
  await page.evaluate(async ([imgs, times]) => {
    // decode() rather than an onload handler. With a data: URL the image can
    // finish decoding before the handler is attached, and that onload then
    // never fires -- which silently dropped frame 0 of every strip and drew it
    // as an empty cell. decode() resolves whether or not it already happened.
    const loaded = await Promise.all(imgs.map(async (d) => {
      const im = new Image();
      im.src = 'data:image/jpeg;base64,' + d;
      await im.decode();
      return im;
    }));
    const w = loaded[0].width, h = loaded[0].height;
    const cols = 4, rows = Math.ceil(loaded.length / cols);
    const c = document.createElement('canvas');
    c.width = w * cols; c.height = h * rows;
    const cx = c.getContext('2d');
    cx.fillStyle = '#1b1d20'; cx.fillRect(0, 0, c.width, c.height);
    loaded.forEach((im, i) => {
      const x = (i % cols) * w, y = Math.floor(i / cols) * h;
      cx.drawImage(im, x, y);
      cx.strokeStyle = '#000'; cx.lineWidth = 2;
      cx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      cx.fillStyle = 'rgba(0,0,0,0.75)'; cx.fillRect(x, y, 86, 22);
      cx.fillStyle = '#fff'; cx.font = 'bold 14px monospace';
      cx.fillText(`${i}  ${times[i]}s`, x + 6, y + 16);
    });
    window.__sheet = c.toDataURL('image/jpeg', 0.92);
  }, [shots, diag.map((d) => d.t)]);

  const data = await page.evaluate(() => window.__sheet);
  const { writeFileSync } = await import('fs');
  writeFileSync(`${OUT}/${name}.jpeg`, Buffer.from(data.split(',')[1], 'base64'));
  console.log(`  ${name}  (${FRAMES} frames over ${total}s)`);
  for (const d of diag) {
    console.log(`      t=${String(d.t).padEnd(6)} state=${String(d.st).padEnd(6)}`
      + ` ammo=${String(d.ammo).padEnd(3)} swing=${String(d.sw).padEnd(6)}`
      + ` pos.y=${d.py} pos.z=${d.pz} rot.x=${d.rx} rot.z=${d.rz}`);
  }
}

await browser.close();
