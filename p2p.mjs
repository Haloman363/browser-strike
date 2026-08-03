// Two real browsers, one real WebRTC connection, through the real lobby UI.
//
// This harness exists because the unit suite cannot see any of it: every bug it
// has caught so far passed 105 green checks first. The list, all found here --
// the host never left LOBBY so it never simulated or sent anything; snapshots
// encoded {position:Vector3} while the encoder reads flat x/y/z, so every
// packet arrived with a null position and was rejected; applyStates iterated an
// array with for...in and spawned a phantom player called "0"; and the render
// cursor outran the newest snapshot on a slow client, which zeroed the derived
// velocity and left remote players sliding with frozen legs.
//
// Usage: node p2p.mjs        (needs a dev server on :5173)
import { chromium } from 'playwright';

const URL = 'http://localhost:5173/?lowspec=1';
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const open = async () => {
  const p = await browser.newPage({ viewport: { width: 1000, height: 640 } });
  p.setDefaultTimeout(240000);
  p.on('pageerror', (e) => console.log('  PAGEERROR', String(e).slice(0, 180)));
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction('window.__ready === true', { timeout: 240000 });
  return p;
};

console.log('booting two clients (SwiftShader, ~20s each)...');
const host = await open();
const client = await open();

await host.click('#mp-host');
const code = await host.waitForFunction(() => {
  const m = document.getElementById('mp-status').textContent.match(/room ([A-Z0-9]{4,6})/);
  return m ? m[1] : null;
}, { timeout: 60000 }).then((h) => h.jsonValue());
console.log('room:', code);

await client.fill('#mp-code', code);
await client.click('#mp-join');
await client.waitForTimeout(6000);

for (const [name, pg] of [['host  ', host], ['client', client]]) {
  console.log(name, await pg.evaluate(() => {
    const m = window.__match;
    if (!m) return 'no match';
    return JSON.stringify({
      state: m.state, isHost: m.isHost, localId: m.localId,
      players: m.session.players.size, remotes: [...m.remotes.players.keys()],
    });
  }));
}

// Continuous motion, like a player holding W. Discrete teleports with gaps
// between them let the derived velocity decay to zero and read as a bug.
const walking = setInterval(() => host.evaluate(() => {
  const p = window.__dbg.movement.position; p.x += 0.12; p.z += 0.05;
}), 100);

console.log('\nhost walks; the gait phase must ADVANCE, not sit at 0:');
for (let i = 0; i < 5; i++) {
  await host.waitForTimeout(800);
  console.log(` t${i}:`, await client.evaluate(() => {
    const rp = [...window.__match.remotes.players.values()][0];
    return rp ? JSON.stringify({
      phase: +rp.phase.toFixed(2), speed: +rp.velocity.length().toFixed(2),
      x: +rp.model.position.x.toFixed(2),
    }) : 'no avatar';
  }));
}

console.log('replication:', await client.evaluate(() => {
  const s = window.__match.replication.debugStats;
  return `accepted:${s.accepted} rejected:${s.rejected}`;
}));

// Frame the remote player from the client's eye height (1.28m, not 1.7m).
await client.evaluate(() => {
  document.getElementById('start').classList.add('hidden');
  const rp = [...window.__match.remotes.players.values()][0];
  const p = rp.model.position;
  window.__captureMode = true;
  const cam = window.__dbg.renderer.camera;
  cam.position.set(p.x + 4.5, 1.28, p.z + 4.5);
  cam.lookAt(p.x, 0.95, p.z);
  window.__dbg.renderer.render();
});
await client.waitForTimeout(600);
await client.screenshot({ path: 'shots/mp-remote-player.jpeg', type: 'jpeg', quality: 92 });
console.log('screenshot -> shots/mp-remote-player.jpeg');

clearInterval(walking);
await browser.close();
