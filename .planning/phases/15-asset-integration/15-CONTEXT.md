# Phase Context: 15-Asset Integration

## Domain
Transitioning from purely procedural geometry to high-fidelity external assets (GLTF/GLB) for weapons, characters, and key map props.

## Decisions
- **Hybrid System**: Support both procedural models (for low-bandwidth/low-res) and external assets (for high-fidelity).
- **Format Standard**: Standardize on GLB/GLTF with KHR_mesh_quantization and WebP textures for web optimization.
- **Loading Strategy**: Implement a centralized `AssetManager` to handle asynchronous loading and caching.

## Strategy
- **Wave 1**: External Weapon Loading (Desert Eagle, AWP).
- **Wave 2**: External Character Loading (Arctic Avenger).
- **Wave 3**: High-Fidelity Map Props & Textures.

## Code Context
- `src/factory/WeaponFactory.js`: Integration point for external gun models.
- `src/factory/CharacterFactory.js`: Integration point for external player models.
- `src/TextureGenerator.js`: Coordinate with high-res texture settings.
- `public/assets/models/`: Target directory for processed assets.
