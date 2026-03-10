# Phase Context: 08-Competitive Gameplay

## Domain
Implementing the core "Bomb Defusal" competitive loop, including round phases, interaction mechanics, and state-driven transitions.

## Decisions

### Round Structure
- **Decision**: Fixed Freeze Time (15s)
- **Rationale**: Provides a tactical pause for buying weapons and planning strategy, essential for the CS-like experience.
- **Implementation**: Movement lock in `PlayerControllerSystem` during the first 15 seconds of a round.

### Defusal Interaction
- **Decision**: Key Hold (B) + Kits
- **Rationale**: User preference for using the 'B' key. Holding the key creates risk/reward tension during defusal. Kits add economic strategy.
- **Implementation**: Track 'B' key state in `BombSystem`; progress bar visible during hold. Kits halve the timer from 10s to 5s.

### Round Reset
- **Decision**: Clean Teleport (Recommended)
- **Rationale**: Fast transitions between rounds without reloading assets. 5-second delay allows for "Team Win" announcements and score review.
- **Implementation**: `GameState` reset routine that moves player entities to spawn points and clears temporary scene objects (like grenades).

### Bomb Feedback
- **Decision**: Dynamic Feedback (Recommended)
- **Rationale**: Maximizes player awareness through pulsing HUD indicators synchronized with audio beeps.
- **Implementation**: `UISystem` will pulse the bomb icon and timer based on the beep interval calculated in `BombSystem`.

## Specifics
- **Key Binding**: 'B' will be used for both the Buy Menu (if implemented) and Defusing.
- **Win Conditions**: 
  - Bomb explodes (Terrorists Win)
  - Bomb defused (Counter-Terrorists Win)
  - All enemies eliminated (Surviving team Wins)
  - Time runs out before plant (Counter-Terrorists Win)

## Code Context
- `src/systems/BombSystem.js`: Primary logic for planting/defusing and timers.
- `src/systems/UISystem.js`: Dynamic feedback and progress bars.
- `src/GameState.js`: Managing high-level round states (FREEZE, ACTIVE, OVER).
