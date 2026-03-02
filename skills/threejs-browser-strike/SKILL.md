---
name: threejs-browser-strike
description: Expert guidance for Three.js development in the browser-strike project. Includes specialized tools for modeling weapons, map design, gameplay tweaks, physics verification, and performance analysis.
---

# Three.js Browser-Strike Skill (v1.1)

This skill provides specialized knowledge and MCP tools for the Three.js architecture used in the Browser-Strike FPS.

## Core Workflows

### 1. Modeling & Mesh Generation
Use MCP tools to generate boilerplate and handle math:
- `generate_mesh_code`: Quick geometry setup (Box, Cylinder, etc).
- `calculate_bounding_box`: Logic for physics-ready bounding boxes.
- **mcp-game-asset-gen:** 3D model generation (GLB/OBJ) from text.
- **Tripo MCP:** High-fidelity props and characters.
- Follow `WeaponBuilder.js` coordinate conventions: Shape X -> Gun Z.

### 2. Map Design
- `generate_map_object`: Creates walls, crates, or floors with pre-configured textures and collision metadata.
- **VideoGame MCP:** Collectibles and GDD scaffolding.
- Textures: Always use `TextureGenerator.getTexture()` for high-res swap support.

### 3. Gameplay & Physics
- `get_physics_constants`: Reference gravity, player radius, and speeds.
- `suggest_weapon_tweak`: Guidance for balancing fire rates, recoil, and spread.
- **Live Debugging:** `live_tweak_weapon` via WebSocket bridge (`ws://localhost:8081`).

### 4. Testing & Verification
- `generate_unit_test`: Boilerplate for Vitest/Jest physics tests.
- `estimate_complexity`: Vertex count estimates for performance budgeting.
- **Chrome DevTools MCP:** LCP and GPU profiling.

### 5. Rendering & Audio
- `generate_shader_boilerplate`: Standard `ShaderMaterial` setup.
- **WebGPU Three.js Skill:** Transition to WebGPU/TSL.
- **Epidemic Sound MCP:** SFX/BGM sourcing.
- **MCP Audio Tweaker:** Asset optimization (FFmpeg).

## Command Line Tools
- `node ./threejs-mcp/dist/index.js`: Start the MCP server.
- `node ./skills/threejs-browser-strike/scripts/check-three-imports.cjs`: Verify project import standards.

## Reference
- See [project-patterns.md](./references/project-patterns.md) for detailed coordinate math and alignment rules.
