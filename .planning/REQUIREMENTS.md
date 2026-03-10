# Requirements: Browser Strike v1

## v1 Requirements

### Core & Networking (NET)
- [x] **NET-01**: Host-Authoritative P2P Networking (Input-based state sync)
- [x] **NET-02**: Client-Side Prediction (CSP) for zero-latency player movement
- [x] **NET-03**: Server Reconciliation (correction of CSP mispredictions)
- [x] **NET-04**: Lag Compensation (Rewind) for accurate hit registration

### Rendering & Visuals (WGPU)
- [x] **WGPU-01**: Migration to Three.js `WebGPURenderer`
- [x] **WGPU-02**: TSL-based Post-processing (Body-cam / CRT distortion effects)
- [x] **WGPU-03**: Node-based Material system (TSL) for all weapons and characters
- [x] **WGPU-04**: WebGPU-optimized particle systems (Muzzle flash, Smokes)

### Gameplay Mechanics (GAME)
- [x] **GAME-01**: Competitive Bomb Defusal Loop (Round timers, site logic, win conditions)
- [x] **GAME-02**: Buy Menu & Tactical Economy System
- [x] **GAME-03**: Deterministic Recoil Patterns (Learnable spray patterns)
- [x] **GAME-04**: Movement Inaccuracy (Inaccuracy while running/jumping)
- [ ] **GAME-05**: Dynamic Map Interaction (Destructible crates, opening doors)

### Tactical Utility (UTIL)
- [ ] **UTIL-01**: Smoke Grenades (Network-synced volumetric-style effects)
- [ ] **UTIL-02**: Flashbangs (Screen blinding with falloff logic)
- [ ] **UTIL-03**: Molotovs (Area denial with damage-over-time)

## Validated (Already in Code)
- ✓ **CORE-01**: Modular System Architecture (Engine/System)
- ✓ **PHYS-01**: Custom Collision Detection & Physics System
- ✓ **WEAP-01**: Basic Weapon Logic (AK47, Knife, HE Grenade)
- ✓ **AI-01**: Basic Bot AI & Ragdoll Physics
- ✓ **UI-01**: HUD (Health, Ammo, Kill Feed)
- ✓ **DEBUG-01**: MCP Debug Bridge for live state manipulation

## v2 / Future (Deferred)
- **RANK-01**: Competitive Ranking System
- **SKIN-01**: Weapon Skin System & Marketplace
- **MAPS-02**: Community Map Editor
- **AUDIO-02**: Advanced HRTF (Binaural) Spatial Audio

## Out of Scope
- **VR-01**: Virtual Reality support (Focus on Desktop)
- **MMO-01**: Large-scale matches > 16 players (Focus on 5v5 / DM)

## Traceability (Mapping to Roadmap)

| Requirement | Phase | Status |
|-------------|-------|--------|
| NET-01 | Phase 1 | Complete |
| NET-02 | Phase 2 | Complete |
| NET-03 | Phase 2 | Complete |
| NET-04 | Phase 3 | Complete |
| WGPU-01 | Phase 4 | Complete |
| WGPU-02 | Phase 5 | Complete |
| WGPU-03 | Phase 5 | Complete |
| WGPU-04 | Phase 6 | Complete |
| GAME-01 | Phase 8 | Complete |
| GAME-02 | Phase 9 | Complete |
| GAME-03 | Phase 7 | Complete |
| GAME-04 | Phase 7 | Complete |
| GAME-05 | Phase 11 | Pending |
| UTIL-01 | Phase 10 | Pending |
| UTIL-02 | Phase 10 | Pending |
| UTIL-03 | Phase 10 | Pending |
