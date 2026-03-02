# Project Context

## Toolchain & MCP Registry

The following tools and MCPs are approved for the development of **Browser Strike**.

### 1. Scene & Real-Time Debugging
*   **Debug Bridge (Local):** Active on `ws://localhost:8081`. Used for `live_tweak_weapon` and `debug_spawn_enemy`.
*   **Chrome DevTools MCP:** (Activated) Used for GPU profiling, LCP optimization, and console/network debugging.
*   **Threlte-MCP (Logic):** Reference for real-time scene graph inspection and live manipulation of Three.js objects.

### 2. Asset Generation Suite
*   **mcp-game-asset-gen:** Specialized for generating 3D models (GLB/OBJ) from text prompts directly into the scene.
*   **Tripo MCP:** Used for high-fidelity 3D characters and complex environmental props (weapon parts, crates).
*   **TextureGenerator (Local):** Procedural texture logic found in `src/TextureGenerator.js`.

### 3. Audio & Sound Design
*   **Epidemic Sound MCP:** Primary source for professional SFX (footsteps, gunshots) and BGM.
*   **MCP Audio Tweaker:** Used for automated FFmpeg compression and web-optimization (`game-audio-web` presets).

### 4. Rendering & Physics
*   **WebGPU Three.js Skill:** Expert guidance for transitioning to WebGPU/TSL and advanced post-processing.
*   **VideoGame MCP:** Boilerplate for collectible systems, gravity tweaks, and GDD management.
*   **Physics (Local):** Core loop in `src/Physics.js`.

---
## Debug & Asset Tools

The project now includes a real-time **MCP Debug Bridge** and **Asset Generation** suite.

## 1. Live Debugging (Bridge)
The game connects to the `threejs-mcp` server via WebSockets (`DebugBridge.js`).
*   **Live Tweaks:** Use `live_tweak_weapon` to update fire rates, recoil, or damage without reloading.
*   **Debug Spawn:** Use `debug_spawn_enemy` to test AI behavior or collision in specific areas.
*   **Scene Summary:** Gemini can now query the live game state (enemy count, positions).

## 2. Asset Generation (Simulated External Tools)
*   **Audio Optimization:** Use `get_audio_config` (simulates Audio Tweaker) for web-ready FFmpeg presets.
*   **3D Assets:** Use `generate_glb_manifest` (simulates Tripo/Flux) to create specs for model generation.

## 3. Running the Tools
1.  Start the MCP server: `npm run start --prefix threejs-mcp`
2.  Launch the game: `npm run dev`
3.  The console will log `[DebugBridge] Connected` when the link is live.

---
# Commit & Push Workflow
When the user asks to **commit**, **push**, or **deploy** code, you MUST follow this strict procedure before executing the git commands:

1.  **Security Scan:**
    *   Run `npm audit` to check for known vulnerabilities.
    *   If vulnerabilities are found, run `npm audit fix` automatically.
    *   If critical vulnerabilities persist that cannot be auto-fixed, stop and report them to the user.

2.  **Verification:**
    *   Run `npm run build` to ensure the project compiles without error.
    *   (If a `test` script exists in package.json, run `npm test` as well).

3.  **Git Operations:**
    *   Only if the above steps succeed:
        *   Stage changes: `git add .`
        *   Commit with the user's message (or a generated one if not provided).
        *   Push to the remote repository.
