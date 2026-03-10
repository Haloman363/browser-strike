# Research Summary: Browser Strike

**Domain:** Browser-based Tactical FPS
**Researched:** 2026-03-06
**Overall confidence:** HIGH

## Executive Summary

Browser Strike is well-positioned to leverage the cutting edge of web graphics by transitioning to **WebGPU** via Three.js's `WebGPURenderer` and **Three Shading Language (TSL)**. This move will unlock advanced visual effects and performance gains not possible with WebGL 2.0. However, the current networking implementation is naive and unsuited for competitive play. To achieve a "tactical shooter" feel, the architecture must evolve to a strict **Host-Authoritative** model with **Client-Side Prediction**, **Server Reconciliation**, and **Lag Compensation**.

## Key Findings

**Stack:** Three.js (WebGPURenderer + TSL), PeerJS (WebRTC DataChannels), Custom Physics.
**Architecture:** Modular ECS-lite (Engine/Systems) is sound. Network logic must be centralized into a `NetworkSystem` that manages state buffers and rewinding.
**Critical pitfall:** Naive P2P networking (trusting client transforms) invites cheating and creates a "floaty," unresponsive feel. Strict Host-Authority with prediction is mandatory.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Phase 1: Network Core Hardening** - The "Game Feel" Foundation.
   - Addresses: Client-side prediction, Server reconciliation, Interpolation.
   - Avoids: The "floaty" feel of naive networking and basic cheating.
   - *Note:* This is the hardest part. Do it before adding more gameplay features.

2. **Phase 2: WebGPU & TSL Migration** - The "Next-Gen" Visuals.
   - Addresses: Node-based materials, Compute shaders for particles/physics, Post-processing.
   - Avoids: Being locked into legacy WebGL patterns that are harder to upgrade later.

3. **Phase 3: Tactical Gameplay & Lag Compensation** - The "Competitive" Layer.
   - Addresses: Hit registration rewinding (Lag Comp), advanced weapon mechanics (spread, recoil patterns).
   - Avoids: "I shot him but he didn't die" frustration.

**Phase ordering rationale:**
- Networking fundamentals must be solved first; otherwise, every new feature (grenades, interactions) will need to be rewritten for the network model later. WebGPU can run in parallel or follow, as it's primarily visual.

**Research flags for phases:**
- Phase 1: Likely needs deeper research into **deterministic physics** in JavaScript for accurate prediction.
- Phase 2: Standard Three.js patterns, high confidence.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Three.js WebGPU is production-ready (r171+). |
| Features | HIGH | Standard FPS feature set is well-defined. |
| Architecture | HIGH | The Engine/System pattern is solid; Network logic placement is clear. |
| Pitfalls | HIGH | Common multiplayer FPS pitfalls are well-documented. |

## Gaps to Address

- **Deterministic Physics:** How to ensure the custom `Physics.js` behaves exactly the same on Host and Client for reconciliation?
- **WebGPU Fallback:** Ensuring a graceful degradation to WebGL for incompatible browsers (though TSL handles much of this).
