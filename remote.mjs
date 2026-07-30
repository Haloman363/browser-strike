// Visual harness for RemotePlayer: contact sheets of a networked avatar driven
// ONLY by synthetic snapshot state, exactly as it would be over the wire.
//
//   node remote.mjs              all strips
//   node remote.mjs walk         only matching ones
//
// This exists separately from anim.mjs because anim.mjs drives bots[0] through
// main.js's __animPose, and the whole point here is to prove the remote path
// animates without any AI, collision world or Bot instance in play.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';

const OUT = 'shots/remote';
mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
const want = (n) => only.length === 0 || only.some((a) => n.startsWith(a));

const FRAMES = 8;

// Player eye height in this game is 1.28m, NOT 1.7m. An earlier session
// invalidated a whole pass of visual judgements by framing shots from 1.7m, so
// every camera below is placed relative to this.
const EYE = 1.28;

// [name, camera, lookAt, fov, per-frame state builder]
// Each builder returns the RemoteState struct for frame i of FRAMES.
const STRIPS = [
  // Walking straight across the view. The gait is DISTANCE-driven, so the
  // harness advances position by velocity*dt and lets the solver do the rest —
  // if the feet skate, they skate here.
  ['walk-side', [4.6, 1.05, -2], [0, 0.80, -2], 42, (i) => ({
    scenario: 'walk', speed: 3.0, yaw: Math.PI / 2, frame: i,
  })],
  ['walk-3q', [3.6, 1.15, 0.9], [0, 0.80, -2], 42, (i) => ({
    scenario: 'walk', speed: 3.0, yaw: Math.PI * 0.75, frame: i,
  })],
  // Running: different gait KIND, not just a faster walk.
  ['run-side', [4.8, 1.05, -2], [0, 0.80, -2], 42, (i) => ({
    scenario: 'walk', speed: 4.4, yaw: Math.PI / 2, frame: i,
  })],
  // THE off-axis aim case: the body walks along +X while the player looks
  // increasingly toward the camera. Legs must keep pointing where they travel
  // while the torso and weapon come round.
  ['aim-offaxis', [4.2, 1.9, 2.6], [0, 0.85, -2], 45, (i) => ({
    scenario: 'walk', speed: 2.6, yaw: Math.PI / 2, frame: i,
    // Sweep the aim across a full 1.3rad relative to the body over the strip.
    aimOffset: -0.65 + (i / (FRAMES - 1)) * 1.3,
    pitch: -0.25 + (i / (FRAMES - 1)) * 0.5,
  })],
  // Crouch: standing at frame 0, fully crouched by the end, walking throughout.
  ['crouch', [4.2, 1.05, -2], [0, 0.75, -2], 42, (i) => ({
    scenario: 'walk', speed: 1.4, yaw: Math.PI / 2, frame: i,
    crouching: i >= FRAMES / 2,
  })],
  // Death collapse across its 1.6s. Camera is deliberately raised and pulled
  // back: at eye height a low wall occludes the corpse's lower half, which
  // once hid a body settling 34cm THROUGH the floor and made it read as fine.
  ['death', [5.2, 2.6, -2], [0, 0.35, -2], 48, (i) => ({
    scenario: 'death', yaw: Math.PI / 2, frame: i,
  })],
  // Idle standing, so a stationary remote player is not a statue.
  ['idle', [3.8, 1.05, -2], [0, 0.85, -2], 40, (i) => ({
    scenario: 'idle', yaw: Math.PI / 2, frame: i,
  })],
];

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 420, height: 620 } });
page.setDefaultTimeout(300000);
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 300)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300));
});

await page.goto('http://localhost:5173/?lowspec=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__ready === true');

// Prime capture mode: the first __shot hides the HUD and stops the frame loop.
await page.evaluate(() => window.__shot([0, 2, 5], [0, 1, 0], 45));
await page.waitForTimeout(500);

// Build the remote player in-page from the real module.
const setup = await page.evaluate(async () => {
  const mod = await import('/src/net/remoteplayer.js');
  const { renderer, bots } = window.__dbg;
  // Hide the AI bots so the only humanoid in frame is the networked one — this
  // is what makes the sheet evidence about RemotePlayer rather than about Bot.
  for (const b of bots) if (b.model) b.model.visible = false;

  const rp = new mod.RemotePlayer(renderer.scene, 'peer-test');
  window.__rp = rp;

  // Drive it EXACTLY as the network would: build a RemoteState and hand it to
  // applyState. No direct poking of joints, phase or velocity anywhere.
  window.__driveRemote = (cfg) => {
    const dt = 1 / 60;
    const at = [0, 0, -2];
    const yaw = cfg.yaw ?? 0;

    if (cfg.scenario === 'death') {
      // Settle upright first, then send alive:false and step the collapse.
      rp.respawn();
      rp.position.set(at[0], at[1], at[2]);
      for (let k = 0; k < 30; k++) {
        rp.applyState({ position: { x: at[0], y: at[1], z: at[2] }, yaw,
          velocity: { x: 0, y: 0, z: 0 }, alive: true }, dt);
      }
      rp.applyState({ position: { x: at[0], y: at[1], z: at[2] }, yaw, alive: false }, dt);
      // 1.6s of collapse spread over the strip.
      const steps = Math.round((cfg.frame / 7) * 1.6 * 60);
      for (let k = 0; k < steps; k++) {
        rp.applyState({ position: { x: at[0], y: at[1], z: at[2] }, yaw, alive: false }, dt);
      }
      return { deathTime: +rp.deathTime.toFixed(2), alive: rp.alive,
        rootRotX: +rp.model.rotation.x.toFixed(3) };
    }

    if (cfg.scenario === 'idle') {
      rp.respawn();
      rp.position.set(at[0], at[1], at[2]);
      const steps = Math.round((cfg.frame / 8) * 6.0 * 60);
      for (let k = 0; k < steps + 40; k++) {
        rp.applyState({ position: { x: at[0], y: at[1], z: at[2] }, yaw,
          velocity: { x: 0, y: 0, z: 0 }, alive: true }, dt);
      }
      return { speedNorm: +rp.speedNorm.toFixed(3), phase: +rp.phase.toFixed(2) };
    }

    // --- Walking. Integrate a real position along the yaw direction and feed
    // successive positions in, so the distance-driven gait sees genuine travel.
    rp.respawn();
    const speed = cfg.speed ?? 3.0;
    const vx = Math.sin(yaw) * speed, vz = Math.cos(yaw) * speed;
    // Start far enough back that the settle does not walk it out of frame, then
    // bring it to `at` at the end.
    let px = at[0], pz = at[2];
    rp.position.set(px, at[1], pz);

    // Settle: 60 frames so every damped joint reaches steady state for this
    // speed, otherwise frame 0 shows the rig still easing in from rest.
    for (let k = 0; k < 60; k++) {
      px += vx * dt; pz += vz * dt;
      rp.applyState({
        position: { x: px, y: 0, z: pz }, yaw,
        aimYaw: yaw + (cfg.aimOffset ?? 0),
        pitch: cfg.pitch ?? 0,
        velocity: { x: vx, y: 0, z: vz },
        crouching: !!cfg.crouching, alive: true,
      }, dt);
    }
    // Advance to the requested fraction of ONE gait cycle. Stride length is
    // what the solver picked, so walk exactly that far to span a full cycle.
    const stride = rp.strideLength;
    const frac = cfg.frame / 8;
    const extra = Math.round((frac * stride / speed) * 60);
    for (let k = 0; k < extra; k++) {
      px += vx * dt; pz += vz * dt;
      rp.applyState({
        position: { x: px, y: 0, z: pz }, yaw,
        aimYaw: yaw + (cfg.aimOffset ?? 0),
        pitch: cfg.pitch ?? 0,
        velocity: { x: vx, y: 0, z: vz },
        crouching: !!cfg.crouching, alive: true,
      }, dt);
    }
    // Park the MODEL at the fixed spot for the camera without touching the
    // gait state — the phase came from real distance travelled.
    rp.model.position.set(at[0], rp.model.position.y, at[2]);

    // Report the things a broken solver would give away.
    const J = rp.joints;
    const footY = ['L', 'R'].map((s) => {
      const v = new window.__dbg.THREE.Vector3();
      J[`ankle${s}`].getWorldPosition(v);
      return +(v.y - rp.model.position.y).toFixed(3);
    });
    return {
      phase: +rp.phase.toFixed(2),
      speedNorm: +rp.speedNorm.toFixed(2),
      stride: +rp.strideLength.toFixed(2),
      ankleY: footY,
      hipY: +J.hips.position.y.toFixed(3),
      chestYaw: +J.chest.rotation.y.toFixed(3),
      scaleY: +rp.model.scale.y.toFixed(3),
    };
  };
  return { built: !!rp.model, joints: Object.keys(rp.joints).length };
});
console.log('  setup', JSON.stringify(setup));

for (const [name, cam, look, fov, build] of STRIPS) {
  if (!want(name)) continue;
  const shots = [];
  const diags = [];
  for (let i = 0; i < FRAMES; i++) {
    diags.push(await page.evaluate((c) => window.__driveRemote(c), build(i)));
    await page.evaluate(([c, l, f]) => window.__shot(c, l, f), [cam, look, fov]);
    await page.waitForTimeout(140);
    shots.push((await page.screenshot({ type: 'jpeg', quality: 90 })).toString('base64'));
  }
  await page.evaluate(async (imgs) => {
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
      cx.fillStyle = '#0f0'; cx.font = 'bold 14px monospace';
      cx.fillText(String(i), i * w + 8, 15);
    });
    window.__sheet = c.toDataURL('image/jpeg', 0.9);
  }, shots);
  const data = await page.evaluate(() => window.__sheet);
  writeFileSync(`${OUT}/${name}.jpeg`, Buffer.from(data.split(',')[1], 'base64'));
  console.log(`  ${name.padEnd(14)} ${JSON.stringify(diags)}`);
}

await browser.close();
if (errors.length) console.log('\nerrors:\n' + errors.slice(0, 10).join('\n'));
