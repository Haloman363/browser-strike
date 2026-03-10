# Phase 9: Tactical Economy - Research

**Researched:** 2026-03-09
**Domain:** Tactical Economy, Buy Menu UI, Inventory Persistence
**Confidence:** HIGH

## Summary

This phase implements the strategic layer of `browser-strike`, introducing a round-based economy that rewards tactical performance. Players will earn cash for kills and round completions, which they can spend on weapons and equipment via a radial buy menu. The system restricts buying to designated spawn zones during the early phase of the round. Inventory will persist across rounds for surviving players, adding a high-stakes survival element to the competitive loop.

**Primary recommendation:** Use an SVG-based Radial Menu in `UISystem.js` for fast keyboard-driven (1-9) purchases, and move inventory management from `main.js` into a more robust `GameState` structure to support persistence.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Buy Menu UI**: Radial Wheel. Optimized for fast keyboard navigation (1-9), maintaining the high-intensity feel of a competitive shooter.
- **Buy Zones**: Spawn Zone Only. Adds tactical importance to the start of the round and prevents mid-map equipment upgrades.
- **Persistence**: Full Persistence. Survival becomes a strategic objective, allowing players to "save" expensive equipment for subsequent rounds.
- **Weapon Dropping**: Manual Drop. Encourages teamplay and allows for flexible resource sharing on the fly.

### Claude's Discretion
- Circular SVG or canvas-based overlay in `UISystem.js`.
- Check player position against spawn volumes in `UISystem` before allowing the menu to open.
- `GameState` will not reset weapon slots during the `round:reset` sequence if the player is alive.
- New 'G' key binding that spawns a physicalized weapon pickup in the world.

### Deferred Ideas (OUT OF SCOPE)
- Loss streak bonus (plus loss streak bonus if possible - marked as possible, will implement if time permits but primary focus is base rewards).
- Advanced Ranking System (RANK-01).
- Weapon Skins (SKIN-01).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GAME-02 | Buy Menu & Tactical Economy System | Detailed reward values ($300/$3250/$1400) and Radial UI approach identified. |
| PERSIST | Full Inventory Persistence | `RoundSystem.resetRound` logic analyzed to allow conditional inventory retention. |
| DROP | Manual Weapon Dropping ('G') | `Factory.js` and `main.js` pickup logic verified for manual spawning. |
| ZONE | Spawn Zone Restricted Buying | Map coordinates for Dust2 spawns identified for AABB volume checks. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SVG | N/A | Buy Menu UI | Zero-dependency, lightweight, and perfect for circular layouts. |
| GameState | Internal | Economy Tracking | Centralized source of truth for cash and inventory. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|--------------|
| Three.js | r160+ | Pickup Spawning | Used to render the dropped weapon models in 3D space. |

## Architecture Patterns

### Recommended Project Structure
```
src/
├── systems/
│   ├── UISystem.js        # Radial Buy Menu rendering & Zone checks
│   ├── RoundSystem.js     # End-of-round cash rewards
│   └── InputSystem.js     # Key bindings for 'B' and 'G'
└── GameState.js           # Cash & Inventory persistence
```

### Pattern 1: SVG Radial Segments
**What:** Using SVG paths to create a 6-8 segment wheel for categories (Pistols, Rifles, etc.).
**When to use:** For the primary Buy Menu interface.
**Example:**
```javascript
// Circular segment calculation
const x = Math.cos(angle) * radius;
const y = Math.sin(angle) * radius;
// SVG Path: M 0 0 L x1 y1 A r r 0 0 1 x2 y2 Z
```

### Anti-Patterns to Avoid
- **Hardcoded Coordinates:** Avoid hardcoding "Buy Zone" coordinates directly in `UISystem`. Define them in `Maps_v2.js` as metadata or bounding boxes.
- **Mid-Round Buying:** Ensure buying is disabled once the `BUY_PERIOD` (e.g. 30s) expires or the player leaves the zone.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Collision in Buy Zone | Custom overlap logic | AABB vs Point check | Simple, fast, and already supported by `Physics.js` patterns. |
| UI Icons | Custom SVG icons for every gun | FontAwesome or Text | Keep the build size small; use weapon names/abbreviations for v1. |

## Common Pitfalls

### Pitfall 1: Ghost Money
**What goes wrong:** Clients buying weapons when they don't have enough money due to sync latency.
**Why it happens:** Local state and server state getting out of sync.
**How to avoid:** Host-authoritative buying. Client sends "BUY_REQUEST", Host verifies cash and sends "BUY_SUCCESS" or "BUY_FAILURE".

### Pitfall 2: Inventory Overwrite
**What goes wrong:** Dropping a weapon but still having it in hand.
**Why it happens:** UI state not updating after the drop event.
**How to avoid:** Centralize `inventory` in `GameState`. When `inventory[slot]` is set to `null`, `UISystem` and `WeaponSystem` must immediately react.

## Code Examples

### Buy Zone AABB Check (Concept)
```javascript
// In UISystem.js or PhysicsSystem.js
const buyZone = { min: {x: -300, z: 600}, max: {x: 300, z: 950} }; // CT Dust2
function isInBuyZone(pos) {
    return pos.x >= buyZone.min.x && pos.x <= buyZone.max.x &&
           pos.z >= buyZone.min.z && pos.z <= buyZone.max.z;
}
```

### Cash Rewards in RoundSystem
```javascript
// src/systems/RoundSystem.js
onRoundWin(winner) {
    const players = this.engine.getPlayers(); // Simplified
    players.forEach(p => {
        const reward = (p.team === winner) ? 3250 : 1400;
        p.cash += reward;
    });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Reset all on round end | Full Persistence | Phase 9 | Higher tactical stakes; players must survive to keep gear. |
| Global `droppedGuns` array | Integrated Pickups | Phase 9 | Cleaner networking and object lifecycle management. |

## Open Questions

1. **Loss Streak Bonus?**
   - What we know: CS:GO uses a $1400 + $500n bonus.
   - What's unclear: If we want to implement this complexity in v1.
   - Recommendation: Start with flat rewards ($1400 loss); add streak tracking in `RoundSystem` only if time permits.

2. **Buy Period Duration?**
   - What we know: Preround is 15s.
   - What's unclear: Should buying be allowed after the round starts?
   - Recommendation: Allow buying for 30s total (15s preround + first 15s of round) as long as player is in zone.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `vitest.config.js` |
| Quick run command | `npm test` |
| Full suite command | `npm run test:full` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GAME-02 | Cash deduction on purchase | unit | `npx vitest src/systems/EconomySystem.test.js` | ❌ Wave 0 |
| PERSIST | Inventory remains if alive | unit | `npx vitest src/systems/RoundSystem.test.js` | ✅ (Update) |
| ZONE | Buy menu disabled outside zone | unit | `npx vitest src/systems/UISystem.test.js` | ❌ Wave 0 |
| DROP | Drop key spawns pickup | unit | `npx vitest src/systems/InventorySystem.test.js` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest src/systems/{ModifiedSystem}.test.js`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/systems/EconomySystem.test.js` — covers REQ-GAME-02
- [ ] `src/systems/InventorySystem.test.js` — covers manual drop logic
- [ ] Update `src/GameState.js` to include `inventory` and `cash` events.

## Sources

### Primary (HIGH confidence)
- `src/GameState.js` - Current cash tracking logic.
- `src/Maps_v2.js` - Dust2 spawn coordinates.
- `src/systems/RoundSystem.js` - Round lifecycle FSM.

### Secondary (MEDIUM confidence)
- CS:GO Economy Official Wiki - For reward/price balance reference.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - SVG is stable and ideal for this.
- Architecture: HIGH - Fits perfectly into existing System/GameState pattern.
- Pitfalls: MEDIUM - Sync issues are common in P2P; requires careful authority logic.

**Research date:** 2026-03-09
**Valid until:** 2026-04-09
