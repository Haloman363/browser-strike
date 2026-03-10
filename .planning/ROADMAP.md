# Roadmap: Browser Strike

## Phases

- [x] **Phase 1: Networking Core** - Establish host-authoritative foundation (completed 2026-03-08)
- [x] **Phase 2: Game Feel** - Client-side prediction and server reconciliation (completed 2026-03-08)
- [x] **Phase 3: Hit Registration** - Lag compensation and hit confirmation (completed 2026-03-08)
- [x] **Phase 4: WebGPU Foundation** - Migrate to Three.js WebGPURenderer (completed 2026-03-08)
- [x] **Phase 5: Visual Fidelity** - TSL materials and post-processing (completed 2026-03-08)
- [x] **Phase 6: FX Overhaul** - WebGPU compute-shader particle systems (completed 2026-03-08)
- [x] **Phase 7: Gunplay Refinement** - Recoil patterns and movement inaccuracy (completed 2026-03-10)
- [x] **Phase 8: Game Mode** - Competitive bomb defusal loop (completed 2026-03-10)
- [x] **Phase 9: Strategic Layer** - Buy menu and tactical economy (completed 2026-03-10)
- [x] **Phase 10: Tactical Utility** - Grenades and area-of-effect items (completed 2026-03-10)
- [x] **Phase 11: World Interaction** - Ladders and destructible environment elements (completed 2026-03-10)
- [x] **Phase 12: Polish & Performance** - Optimization and final stabilization (completed 2026-03-10)
- [x] **Phase 13: Map Expansion** - Implementing Mirage and Inferno with enhanced procedural tools (completed 2026-03-10)

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Networking Core | 3/3 | Complete   | 2026-03-08 |
| 2. Game Feel | 2/2 | Complete   | 2026-03-08 |
| 3. Hit Registration | 2/2 | Complete   | 2026-03-08 |
| 4. WebGPU Foundation | 2/2 | Complete   | 2026-03-08 |
| 5. Visual Fidelity | 1/1 | Complete   | 2026-03-08 |
| 6. FX Overhaul | 2/2 | Complete   | 2026-03-08 |
| 7. Gunplay Refinement | 2/2 | Complete   | 2026-03-10 |
| 8. Game Mode | 2/2 | Complete   | 2026-03-10 |
| 9. Strategic Layer | 2/2 | Complete   | 2026-03-10 |
| 10. Tactical Utility | 2/2 | Complete   | 2026-03-10 |
| 11. World Interaction | 2/2 | Complete   | 2026-03-10 |
| 12. Polish & Performance | 2/2 | Complete   | 2026-03-10 |
| 13. Map Expansion | 3/3 | Complete   | 2026-03-10 |

## Phase Details

### Phase 1: Networking Core
**Goal**: Establish a stable, host-authoritative P2P networking foundation.
**Depends on**: Nothing
**Requirements**: NET-01
**Success Criteria**:
  1. Host can spawn and control a player character.
  2. Client can join the host's session via PeerJS and see the host moving.
  3. Host maintains the "source of truth" for all player positions and states.
**Plans**:
- [ ] 01-01-PLAN.md — Foundation & Infrastructure (PeerJS, Vitest)
- [ ] 01-02-PLAN.md — Lobby & Connection Management (Handshake, Channels)
- [ ] 01-03-PLAN.md — State Sync & Snapshots (Fixed loop, Interpolation)

### Phase 2: Game Feel
**Goal**: Implement client-side prediction and server reconciliation to eliminate perceived latency.
**Depends on**: Phase 1
**Requirements**: NET-02, NET-03
**Success Criteria**:
  1. Client movement feels instantaneous even with simulated network latency (e.g., 100ms).
  2. Client position is corrected by the host only when a significant desync occurs.
  3. Other players' movements appear smooth via interpolation.
**Plans**:
- [ ] 02-01-PLAN.md — Client-Side Prediction & Input Buffering
- [ ] 02-02-PLAN.md — Server Reconciliation & Host Echo

### Phase 3: Hit Registration
**Goal**: Implement lag compensation (backtracking) for fair and accurate hit registration.
**Depends on**: Phase 2
**Requirements**: NET-04
**Success Criteria**:
  1. Host correctly registers hits when a client shoots at their local visual representation of a moving target.
  2. Blood splatters and damage numbers appear correctly on both client and host upon impact.
**Plans**:
- [ ] 03-01-PLAN.md — Clock Synchronization and State Vaulting
- [ ] 03-02-PLAN.md — Authoritative Hit Registration (Backtracking)

### Phase 4: WebGPU Foundation
**Goal**: Complete the migration of the rendering engine from WebGL to WebGPU.
**Depends on**: Nothing (parallelizable)
**Requirements**: WGPU-01, WGPU-03
**Success Criteria**:
  1. The game successfully initializes and runs using the Three.js `WebGPURenderer`.
  2. Basic scene lighting and shadow mapping work without WebGL fallback errors.
**Plans**:
- [ ] 04-01-PLAN.md — Core Infrastructure & Renderer Migration
- [ ] 04-02-PLAN.md — TSL Material Overhaul

### Phase 5: Visual Fidelity
**Goal**: Implement advanced materials and post-processing using Three Shading Language (TSL).
**Depends on**: Phase 4
**Requirements**: WGPU-02, WGPU-03
**Success Criteria**:
  1. Weapons and characters use node-based materials with realistic metallic/roughness properties.
  2. CRT distortion post-processing effects are active across the entire viewport.
**Plans**:
- [ ] 05-01-PLAN.md — PBR Materials & CRT Post-processing

### Phase 6: FX Overhaul
**Goal**: Develop performant, high-fidelity particle systems optimized for WebGPU compute shaders.
**Depends on**: Phase 4
**Requirements**: WGPU-04
**Success Criteria**:
  1. Muzzle flashes produce high-performance sparks using WebGPU compute shaders.
  2. Smoke grenades produce dense, performant volumetric-style particles.
**Plans**:
- [ ] 06-01-PLAN.md — Foundation & Muzzle Flash (Wave 1)
- [ ] 06-02-PLAN.md — Smoke Tech & Soft Particles (Wave 2)

### Phase 7: Gunplay Refinement
**Goal**: Implement advanced weapon mechanics for a competitive feel.
**Depends on**: Phase 3
**Requirements**: GAME-03, GAME-04
**Success Criteria**:
  1. Firing weapons results in consistent, learnable recoil patterns.
  2. Movement (running/jumping) significantly increases crosshair size and shot spread.
**Plans**:
- [ ] 07-01-PLAN.md — Foundation: Gunplay Math & Data (Wave 1)
- [ ] 07-02-PLAN.md — Implementation: Advanced Weapon Mechanics (Wave 2)

### Phase 8: Game Mode
**Goal**: Build the core competitive bomb defusal loop.
**Depends on**: Phase 7
**Requirements**: GAME-01
**Success Criteria**:
  1. Rounds begin with a countdown and allow for C4 planting at designated sites.
  2. Round ends when C4 explodes, is defused, or a team is eliminated.
  3. Scoreboard updates automatically at the end of each round.
**Plans**:
- [ ] 08-01-PLAN.md — Round FSM & Movement Locking (Wave 1)
- [ ] 08-02-PLAN.md — Bomb Defusal & Reset (Wave 2)

### Phase 9: Strategic Layer
**Goal**: Implement the tactical economy and buy menu system.
**Depends on**: Phase 8
**Requirements**: GAME-02
**Success Criteria**:
  1. Players can access a Buy Menu during the buy period at round start.
  2. Currency is granted for kills and round completions, which can be spent on equipment.
**Plans**:
- [ ] 09-01-PLAN.md — Economy Logic & Persistence (Wave 1)
- [ ] 09-02-PLAN.md — Radial Buy Menu UI (Wave 2)

### Phase 10: Tactical Utility
**Goal**: Implement functional and networked tactical utility items.
**Depends on**: Phase 8, Phase 6
**Requirements**: UTIL-01, UTIL-02, UTIL-03
**Success Criteria**:
  1. Smoke grenades bloom and correctly block line-of-sight for players and bots.
  2. Flashbangs blind players based on proximity and orientation to the blast.
  3. Molotovs create fire patches that deal damage-over-time to players.
**Plans**: TBD

### Phase 11: World Interaction
**Goal**: Add dynamic and destructible elements to the environment.
**Depends on**: Phase 8
**Requirements**: GAME-05
**Success Criteria**:
  1. Players can interact with doors to open/close them.
  2. Designated environment objects (e.g., crates) can be destroyed by gunfire or explosives.
**Plans**: TBD

### Phase 12: Polish & Performance
**Goal**: Finalize optimization and polish for the v1 release.
**Depends on**: Phase 1 through 11
**Requirements**: All v1 requirements
**Success Criteria**:
  1. Game maintains 60 FPS on target hardware with all features enabled.
  2. No major memory leaks or crashes during extended play sessions.
**Plans**: TBD
