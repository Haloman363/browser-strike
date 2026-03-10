# Feature Landscape

**Domain:** Browser-based Tactical FPS
**Researched:** 2026-03-06

## Table Stakes

Features users expect. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Client-Side Prediction** | Without it, movement feels laggy/floaty. | High | Requires decoupling rendering from network updates. |
| **Lag Compensation** | Players hate "I shot him but missed". | High | "Rewind" mechanic on the authoritative host. |
| **Scoreboard & Killfeed** | Standard feedback loop. | Low | Already partially implemented. |
| **Spectator Mode** | For dead players/observers. | Medium | Essential for tactical modes (Round-based). |

## Differentiators

Features that set product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **WebGPU Rendering** | "Next-gen" graphics in browser. | High | Dynamic lighting, advanced shadows, compute-driven particles. |
| **Node-Based Materials** | easy-to-tweak, high-fidelity surfaces. | Medium | Using Three.js TSL system. |
| **Instant Join (P2P)** | No server setup/downloads. | Medium | Leverage PeerJS lobby system. |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Complex Rigid Body Physics** | Hard to sync over network, expensive. | Use simplified Character Controllers (capsule vs world). |
| **Vehicles** | Drastically increases map/physics scope. | Focus on tight infantry combat. |
| **Full Server-Side Auth** | Costs money to host. | Use Host-Authoritative P2P (one player is server). |

## Feature Dependencies

```
Input System → Client-Side Prediction
Networking (DataChannels) → Host-Authoritative State → Interpolation
WebGPURenderer → TSL Materials → Visual Effects
```

## MVP Recommendation

Prioritize:
1. **Solid Networking:** Prediction + Reconciliation.
2. **Core Loop:** Move, Shoot, Kill, Respawn (with lag comp).
3. **Basic WebGPU Visuals:** Textures, Lighting.

Defer:
- **Ranked Matchmaking:** Too complex for MVP.
- **Inventory/Economy persistence:** Focus on session gameplay first.

## Sources

- [Gabriel Gambetta's Fast-Paced Multiplayer](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html)
- [Valve's Source Engine Networking](https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking)
