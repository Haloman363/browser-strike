---
phase: 01-networking-core
plan: 03
type: execute
wave: 3
depends_on: [01-02]
files_modified: [src/systems/NetworkSystem.js, src/systems/NetworkSystem.test.js]
autonomous: false
requirements: [NET-01]
must_haves:
  truths:
    - "Host broadcasts world state snapshots at a fixed rate (20Hz)"
    - "Client can receive and interpolate snapshots"
    - "Manual verification confirms character position synchronization"
  artifacts:
    - path: "src/systems/NetworkSystem.js"
      provides: "Update loop for broadcasting and SI interpolation"
  key_links:
    - from: "src/systems/NetworkSystem.js"
      to: "@geckos.io/snapshot-interpolation"
      via: "SI instantiation and snapshot.add()"
---

<objective>
Implement the host's authoritative broadcast loop and client-side interpolation.

Purpose: To ensure all players see a consistent and smooth representation of the world.
Output: Fixed-timestep networking loop with snapshot interpolation.
</objective>

<execution_context>
@/home/jaymes/.gemini/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/phases/01-networking-core/01-02-SUMMARY.md
@.planning/phases/01-networking-core/01-CONTEXT.md
@.planning/phases/01-research/ARCHITECTURE.md
@src/systems/NetworkSystem.js
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Authoritative Fixed-Timestep Broadcast Loop</name>
  <files>src/systems/NetworkSystem.js, src/systems/NetworkSystem.test.js</files>
  <behavior>
    - Host runs a `setInterval` or accumulator-based loop at 20Hz (50ms).
    - `broadcastSnapshot()`: Gathers world state and sends it to all peers via 'unreliable' channel.
  </behavior>
  <action>
    Implement a fixed-rate loop in `NetworkSystem` specifically for the Host role. This loop will broadcast a snapshot of the current state of all networked entities (at this stage, just player positions).
  </action>
  <verify>
    <automated>npx vitest src/systems/NetworkSystem.test.js</automated>
  </verify>
  <done>Host broadcasts snapshots at a consistent 20Hz rate.</done>
</task>

<task type="auto">
  <name>Task 2: Snapshot Interpolation Integration</name>
  <files>src/systems/NetworkSystem.js</files>
  <action>
    1. Integrate `SnapshotInterpolation` into `NetworkSystem`.
    2. When a snapshot message is received on the client (unreliable channel), add it to the SI instance.
    3. Implement interpolation logic in `update()` for clients to smooth out entity movement based on calculated SI state.
  </action>
  <verify>
    <automated>npx vitest src/systems/NetworkSystem.test.js</automated>
  </verify>
  <done>Clients correctly buffer and interpolate incoming world snapshots.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Host-Authoritative P2P Networking Foundation</what-built>
  <how-to-verify>
    1. Start the game in Tab A and click "Host Lobby".
    2. Copy the 6-character Lobby Code displayed in the console/debug UI.
    3. Open the game in Tab B, paste the code, and click "Join Lobby".
    4. Move the player in Tab A (Host) and verify smooth movement in Tab B (Client).
  </how-to-verify>
  <resume-signal>approved</resume-signal>
</task>

</tasks>

<verification>
Automated unit tests ensure the loop runs and snapshots are added. Human verification confirms visual synchronization and smoothness.
</verification>

<success_criteria>
- Host broadcasts snapshots at 20Hz.
- Clients display smooth movement via interpolation.
- Round-trip position sync confirmed in manual test.
</success_criteria>

<output>
After completion, create `.planning/phases/01-networking-core/01-03-SUMMARY.md`
</output>
