# Three.js Browser-Strike Project Patterns

## Coordinate Systems & Alignments

### Weapon Building (`WeaponBuilder.js`)
- **Group Base**: All weapon parts are added to a `THREE.Group`.
- **Extruded Shapes**: 
  - Defined in 2D (X=Length, Y=Height).
  - Extrusion depth is Width (Z).
  - Geometry is centered on Z: `geometry.translate(0, 0, -width / 2)`.
  - Mesh rotation: `mesh.rotation.set(rotation.x, rotation.y + Math.PI / 2, rotation.z)` to align Shape X with Weapon Z.
- **Lathed Parts**:
  - Profile points: (X=Radius, Y=Length).
  - Mesh rotation: `mesh.rotation.set(rotation.x - Math.PI / 2, rotation.y, rotation.z)` because Lathe is Y-up by default.
- **Cylinders**:
  - Default orientation: Horizontal along Z axis (`-Math.PI / 2` on X).

## Textures & Materials

### Procedural Fallbacks (`TextureGenerator.js`)
- **Mechanism**: Returns a `THREE.CanvasTexture` immediately and attempts to `loader.load` a high-res replacement from `/browser-strike/assets/textures/`.
- **Canvas Textures**: Always set `texture.wrapS = texture.wrapT = THREE.RepeatWrapping` for tiled textures like sand, wall, concrete.
- **Sizing**: Default size is 512x512 for environmental textures, 128x128 or 256x256 for weapon parts (metal, polymer).

## Optimization
- **Geometries**: Reuse geometries where possible (though current implementation often creates new ones for simplicity).
- **Materials**: Use `MeshPhongMaterial` for shiny surfaces (metal) and `MeshBasicMaterial` for simple particles.
- **Cloning**: Use `.clone()` on materials when individual adjustments (like color) are needed for particles.
