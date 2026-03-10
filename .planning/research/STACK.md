# Technology Stack

**Project:** Browser Strike
**Researched:** 2026-03-06

## Recommended Stack

### Core Framework
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Three.js | r171+ | Rendering Engine | The standard for Web 3D. New `WebGPURenderer` and TSL are future-proof. |
| PeerJS | Latest | Networking (WebRTC) | Simplifies WebRTC signaling and DataChannels. Adequate for P2P. |

### Rendering & Shaders
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| WebGPURenderer | Three.js | Graphics Pipeline | Unlocks Compute Shaders, lower driver overhead, and better performance than WebGL 2.0. |
| Three Shading Language (TSL) | Three.js | Materials/Shaders | JavaScript-based shader authoring. Transpiles to WGSL (WebGPU) and GLSL (WebGL). Easier to maintain than raw strings. |

### Physics & Logic
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Custom (Current) | N/A | Collision/Physics | Lightweight, control over determinism. Keep until it limits gameplay. |
| Rapier.js (Future) | Latest | Physics Engine | WASM-based, deterministic, fast. If custom physics becomes a bottleneck. |

### Infrastructure
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Vite | Latest | Build Tool | Fast HMR, native ES modules support. |
| Node.js | Latest | Signaling Server (Optional) | If PeerJS cloud service is insufficient, a custom `peerjs-server` may be needed. |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Networking | PeerJS | Socket.io | Socket.io is TCP-based (slow for FPS movement). WebRTC (UDP-like) is required. |
| Networking | PeerJS | Geckos.io | Geckos is great but requires a node backend. PeerJS fits the "serverless P2P" vision better for now. |
| Physics | Custom | Cannon.js | Cannon is old, unmaintained, and slow. Rapier is the modern choice if we switch. |
| Shaders | TSL | Raw WGSL | Raw WGSL is verbose and hard to maintain. TSL provides a higher-level abstraction and WebGL fallback. |

## Installation

```bash
# Core
npm install three peerjs

# Dev dependencies
npm install -D vite
```

## Sources

- [Three.js WebGPU Migration Guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)
- [PeerJS Documentation](https://peerjs.com/docs/)
- [High Performance Browser Networking](https://hpbn.co/)
