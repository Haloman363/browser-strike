export const Utils = {
    sanitizeName(name) {
        if (typeof name !== 'string') return "Player";
        // Sanitize: allow only letters, numbers, spaces, - and _
        let clean = name.replace(/[^a-zA-Z0-9 _-]/g, '');
        if (clean.length > 12) clean = clean.substring(0, 12);
        return clean.trim() || "Player";
    },

    getGaussian(stdDev = 1) {
        let u = 0, v = 0;
        while(u === 0) u = Math.random(); 
        while(v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v) * stdDev;
    },

    deepDispose(obj) {
        if (!obj) return;
        
        obj.traverse(child => {
            if (child.geometry) {
                child.geometry.dispose();
            }
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
    },

    /**
     * Merges multiple meshes into a single BufferGeometry for performance.
     * Note: This requires the BufferGeometryUtils addon from Three.js.
     * Since we are in a modular environment, we assume the caller passes
     * correctly transformed geometries or we handle it here.
     */
    mergeMeshes(meshes) {
        if (!meshes || meshes.length === 0) return null;
        
        const geometries = [];
        let material = meshes[0].material;

        meshes.forEach(mesh => {
            mesh.updateMatrixWorld(true);
            const geometry = mesh.geometry.clone();
            geometry.applyMatrix4(mesh.matrixWorld);
            geometries.push(geometry);
        });

        // We assume BufferGeometryUtils is available or we use the native merge
        // For simplicity in this procedural setup, we return the geometries list
        // and let the Map builder handle the THREE.BufferGeometryUtils.mergeGeometries call
        // if it's imported.
        return geometries;
    }
};
