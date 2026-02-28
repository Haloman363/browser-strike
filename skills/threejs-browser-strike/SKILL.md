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
- Follow `WeaponBuilder.js` coordinate conventions: Shape X -> Gun Z.

### 2. Map Design
- `generate_map_object`: Creates walls, crates, or floors with pre-configured textures and collision metadata.
- Textures: Always use `TextureGenerator.getTexture()` for high-res swap support.

### 3. Gameplay & Physics
- `get_physics_constants`: Reference gravity, player radius, and speeds.
- `suggest_weapon_tweak`: Guidance for balancing fire rates, recoil, and spread.

### 4. Testing & Verification
- `generate_unit_test`: Boilerplate for Vitest/Jest physics tests.
- `estimate_complexity`: Vertex count estimates for performance budgeting.

### 5. Rendering & Shaders
- `generate_shader_boilerplate`: Standard `ShaderMaterial` setup with `uTime` and `uResolution`.

## Command Line Tools
- `node ./threejs-mcp/dist/index.js`: Start the MCP server.
- `node ./skills/threejs-browser-strike/scripts/check-three-imports.cjs`: Verify project import standards.

## Reference
- See [project-patterns.md](./references/project-patterns.md) for detailed coordinate math and alignment rules.
