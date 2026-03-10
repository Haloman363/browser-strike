# Phase 08: Competitive Gameplay - Research

**Researched:** 2026-03-09
**Domain:** Competitive Bomb Defusal Loop
**Confidence:** HIGH

## Summary

This phase implements the core "Competitive Bomb Defusal" loop, shifting the game from a free-for-all deathmatch to a round-based tactical shooter. The implementation focuses on a robust Finite State Machine (FSM) to manage round phases, host-authoritative timers, and interaction mechanics for planting and defusing the C4.

**Primary recommendation:** Use a centralized `RoundSystem` on the Host to manage transitions between `PREROUND` (Freeze), `ROUND_RUNNING`, and `POST_ROUND` (Round End), broadcasting state changes via the `NetworkSystem` to ensure synchronization across all clients.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Fixed Freeze Time (15s)**: Tactical pause for buying and planning. Movement lock in `PlayerControllerSystem`.
- **Defusal Interaction (Key Hold B + Kits)**: Holding 'B' to defuse. Kits halve the timer from 10s to 5s.
- **Clean Teleport Reset**: 5-second delay between rounds for announcements, followed by a teleport to spawn points.
- **Dynamic Bomb Feedback**: Pulsing HUD indicators synchronized with audio beeps.

### Claude's Discretion
- **Round Timer Synchronization**: Recommend host-authoritative timer for consistency.
- **Win Condition Detection**: Determine the most efficient way to check for team elimination.
- **UI Progress Bars**: Use CSS-based width transitions for the 'B' key hold interaction.

### Deferred Ideas (OUT OF SCOPE)
- **Buy Menu (Phase 9)**: While 'B' is shared, the Buy Menu logic itself is deferred.
- **Advanced Ranking**: Matchmaking and Elo systems are deferred.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GAME-01 | Competitive Bomb Defusal Loop | Standardized Round FSM (PREROUND, ACTIVE, POST) ensures structured gameplay. |
| SUCCESS-1 | Rounds begin with a countdown and allow for C4 planting | `BOMB_SETTINGS` and `RoundSystem` update loop. |
| SUCCESS-2 | Round ends when C4 explodes, is defused, or a team is eliminated | Win condition logic in `RoundSystem`. |
| SUCCESS-3 | Scoreboard updates automatically at the end of each round | `GameState` score tracking + `UISystem` triggers. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `GameState` | Custom | State Management | Centralized reactive store for round status and timers. |
| `RoundSystem` | New | Round Logic | Encapsulates the FSM and win conditions. |
| `PeerJS` | 1.5.2 | P2P Networking | Used to broadcast authoritative round state from Host to Clients. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|--------------|
| `UISystem` | Custom | HUD / Feedback | Displaying the round timer, bomb alerts, and defusal progress. |
| `SoundEngine` | Custom | Audio Feedback | Triggering bomb beeps and round start/end sounds. |

## Architecture Patterns

### Recommended Round State Machine
A Finite State Machine (FSM) should be implemented within a new `RoundSystem` (Host-only logic) and mirrored in `GameState`.

| State | Duration | Behavior | Transition Trigger |
|-------|----------|----------|--------------------|
| `PREROUND` | 15s | Movement locked, Buy Menu open | Timer reaches 0 |
| `ROUND_RUNNING` | 115s | Full movement, Bomb sites active | Timer 0, Bomb Explode/Defuse, or Elimination |
| `POST_ROUND` | 5s | Movement locked, Winner announced | Timer reaches 0 -> `PREROUND` |

### Pattern 1: Host-Authoritative Timer
To prevent desync, the Host maintains the "true" `roundTimeLeft`. 
1. Host broadcasts `ROUND_STATE` message (state + timer) every 1 second or on state change.
2. Clients update their local `GameState` and UI based on this authoritative data.

### Pattern 2: Interaction Hold Logic ('B' Key)
The 'B' key defusal uses a "gate" pattern in the `InputSystem` / `BombSystem`:
```javascript
// Logic in BombSystem.update()
if (input.isKeyPressed('KeyB') && isNearPlantedBomb && !isDefusing) {
    startDefusing();
} else if (!input.isKeyPressed('KeyB') && isDefusing) {
    stopDefusing();
}
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UI Progress Bars | Canvas/Three.js drawing | CSS Transitions | Performance and ease of styling (consistent with existing UI). |
| Timer Sync | Custom NTP-like sync | `NetworkSystem` Snapshot | Existing `TIME_SYNC` and `Snapshot` infrastructure handles clock offsets. |
| Entity Reset | Scene Destroy/Rebuild | Teleport + Property Reset | Faster transitions, no asset flickering or reload time. |

## Common Pitfalls

### Pitfall 1: Movement Lock Bypass
**What goes wrong:** Players can still jump or crouch during `PREROUND` if only horizontal movement is locked.
**How to avoid:** Explicitly check `GameState.get('roundState') !== 'PREROUND'` in all branches of `PlayerControllerSystem.handleKeyDown`.

### Pitfall 2: 'B' Key Conflict
**What goes wrong:** Phase 9 will use 'B' for the Buy Menu. If a player is standing in Spawn *and* near a planted bomb (rare but possible), the Buy Menu might block defusal.
**How to avoid:** Prioritize Defusal over Buy Menu in the input handler. If `atPlantedBomb` is true, 'B' always triggers defuse.

### Pitfall 3: Late Joiner Desync
**What goes wrong:** A player joins during `ROUND_RUNNING` and their local timer starts at the full duration instead of the current time.
**How to avoid:** Include current `roundState` and `roundTimeLeft` in the initial `JOIN_ACK` payload.

## Code Examples

### Round Transition Logic (Host)
```javascript
// Inside RoundSystem.js (Simplified)
update(delta) {
    if (!this.isHost) return;

    this.timer -= delta;
    
    switch(this.state) {
        case 'PREROUND':
            if (this.timer <= 0) this.transition('ROUND_RUNNING', 115);
            break;
        case 'ROUND_RUNNING':
            const winner = this.checkWinConditions();
            if (winner || this.timer <= 0) {
                this.declareWinner(winner || 'CT'); // CT wins on time
                this.transition('POST_ROUND', 5);
            }
            break;
        case 'POST_ROUND':
            if (this.timer <= 0) this.startNewRound();
            break;
    }
}
```

### Defusal Time Calculation
```javascript
// Inside BombSystem.js
const defuseDuration = GameState.get('hasDefuseKit') ? 
    BOMB_SETTINGS.DEFUSE_TIME_KIT : 
    BOMB_SETTINGS.DEFUSE_TIME;
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Client-side Timers | Host-Authoritative | Eliminates desync where round ends for some but not others. |
| Physics-based Reset | Teleport + Velocity Null | Prevents "jitter" or physics glitches during round transitions. |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `vite.config.js` |
| Quick run command | `npm test src/systems/BombSystem.test.js` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GAME-01 | Round state transitions (PREROUND -> ACTIVE) | Integration | `npm test src/systems/RoundSystem.test.js` | ❌ Wave 0 |
| SUCCESS-1 | Movement locked during PREROUND | Unit | `npm test src/systems/PlayerControllerSystem.test.js` | ✅ |
| SUCCESS-2 | Bomb defusal reduces timer correctly | Unit | `npm test src/systems/BombSystem.test.js` | ✅ |
| SUCCESS-3 | Score updates on round end | Integration | `npm test src/systems/RoundSystem.test.js` | ❌ Wave 0 |

### Wave 0 Gaps
- [ ] `src/systems/RoundSystem.js` — Core FSM logic.
- [ ] `src/systems/RoundSystem.test.js` — Verification for state transitions and win conditions.
- [ ] `GameState` updates — Add `roundState`, `roundTimeLeft`, `teamScores`, `hasDefuseKit`.

## Sources

### Primary (HIGH confidence)
- `src/systems/BombSystem.js` - Existing bomb planting/timer logic.
- `src/GameState.js` - Existing reactive state management.
- Source Engine `RoundState` Enum - Industry standard for competitive round structures.

### Secondary (MEDIUM confidence)
- CS:GO Competitive Ruleset - Reference for freeze time (15s) and bomb timer (40s).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Extends existing modular architecture.
- Architecture: HIGH - FSM is the standard pattern for this domain.
- Pitfalls: HIGH - Common issues in networked multiplayer shooters identified.

**Research date:** 2026-03-09
**Valid until:** 2026-04-09
