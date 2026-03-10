# Phase Context: 13-Map Expansion

## Domain
Expanding the game's playable content with iconic tactical layouts (Mirage, Inferno) and refining the existing procedural map system for higher fidelity and better performance.

## Decisions
- **Layout Fidelity**: Focus on preserving tactical "callouts" and sightlines from original references.
- **System Evolution**: Enhance `Factory.js` tools to support more complex verticality and slanted geometry.
- **Default Map**: Maintain Dust 2 as the primary testing ground but ensure all new maps support both DM and Defusal modes.

## Strategy
- **Reference-Driven**: Use standardized block dimensions (e.g., 1 unit = 1cm or specific grid sizing) to match iconic layouts.
- **Wave-Based Implementation**:
    - Wave 1: Mirage Layout & Geometry.
    - Wave 2: Inferno Layout & Geometry.
    - Wave 3: Global Map Optimization & Prop Dressing.

## Code Context
- `src/Maps_v2.js`: Main definition file for map builds.
- `src/factory/EnvironmentFactory.js`: Procedural tools for walls, crates, and ladders.
- `main.js`: Map loading and clearing logic.
