# Phase 7: Gunplay Refinement - Research

**Researched:** 2026-03-08
**Domain:** Tactical Ballistics & UI Feedback
**Confidence:** HIGH

## Summary
Refining gunplay to match high-tier tactical shooters (CS:GO/Valorant). Focuses on skill-based recoil management and punishing movement during combat.

## Standard Stack
| Library | Version | Purpose |
|---------|---------|---------|
| Three.js | Latest | Camera and Raycasting |
| Custom Math | N/A | Box-Muller Transform for Gaussian Distribution |

## Architecture Patterns
- **State Integration**: `WeaponSystem` tracks `shotIndex` (reset on release) and `spreadHeat` (decays over time).
- **Movement Hook**: `WeaponSystem` queries `PlayerControllerSystem.velocity.length()` for real-time inaccuracy scaling.
- **UI Reactive**: `UISystem` listens for accuracy state changes to update crosshair gap.

## Implementation Strategy
- **Recoil Patterns**: Store weapon-specific coordinate arrays in `WeaponRecipes.js`.
- **Gaussian Spread**: Use Box-Muller Transform for bullet distribution within the crosshair.
- **Dynamic Inaccuracy**: `TotalSpread = Base + (Velocity * Scalar) + (InAir ? Penalty : 0)`.
- **View Punch**: Apply transient rotations to the camera during `shoot()`, with exponential decay recovery.

## Code Examples (Box-Muller)
```javascript
function getGaussian(stdDev) {
    const u = 1 - Math.random(); 
    const v = 1 - Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v) * stdDev;
}
```

## Validation Architecture
- **REQ-GAME-03**: Verify shot pattern consistency in non-moving state.
- **REQ-GAME-04**: Verify spread radius increases linearly with player velocity.
