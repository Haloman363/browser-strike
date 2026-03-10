# Phase Context: 14-Gameplay Mechanics

## Domain
Implementing and refining core Counter-Strike gameplay loops, including the tactical economy, additional game modes (Hostage Rescue), and movement-based combat mechanics.

## Decisions
- **Economy Model**: Adopt a standard CS model with round win/loss bonuses, kill rewards, and equipment costs.
- **Movement Fidelity**: Implement counter-strafing (instant accuracy reset on opposite key press) and movement tagging (slowed when hit).
- **Game Modes**: Extend the current bomb defusal logic and implement hostage rescue mechanics.

## Strategy
- **Modular Systems**: Leverage and extend `RoundSystem.js`, `WeaponSystem.js`, and `PlayerControllerSystem.js`.
- **Wave-Based Implementation**:
    - Wave 1: Advanced Economy & Buy System.
    - Wave 2: Refined Movement (Counter-strafing, Tagging).
    - Wave 3: Hostage Rescue Mode.

## Code Context
- `src/systems/RoundSystem.js`: Core match flow and win conditions.
- `src/systems/WeaponSystem.js`: Accuracy and recoil logic.
- `src/systems/PlayerControllerSystem.js`: Movement and velocity handling.
- `src/GameState.js`: Tracking player money and round states.
