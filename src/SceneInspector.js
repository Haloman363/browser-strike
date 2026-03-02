/**
 * SceneInspector.js
 * Tool for AI agents to "see" and traverse the Three.js scene graph.
 * Returns hierarchical JSON data for analysis and debugging.
 */

export const SceneInspector = {
    summarize(scene) {
        if (!scene) return { error: "No scene provided" };

        const getInfo = (obj) => {
            const info = {
                type: obj.type,
                name: obj.name || "unnamed",
                id: obj.id,
                visible: obj.visible,
                pos: { x: obj.position.x.toFixed(2), y: obj.position.y.toFixed(2), z: obj.position.z.toFixed(2) },
                children: obj.children.map(c => getInfo(c))
            };

            if (obj.isMesh) {
                info.geometry = obj.geometry.type;
                info.material = Array.isArray(obj.material) 
                    ? obj.material.map(m => m.type) 
                    : obj.material.type;
                
                // Track memory usage/poly count
                if (obj.geometry.index) {
                    info.triangles = obj.geometry.index.count / 3;
                } else if (obj.geometry.attributes.position) {
                    info.triangles = obj.geometry.attributes.position.count / 3;
                }
            }

            return info;
        };

        return getInfo(scene);
    },

    findObjectByName(scene, name) {
        return scene.getObjectByName(name);
    },

    listRogueObjects(scene) {
        // Identifies objects without names or redundant groups
        const rogues = [];
        scene.traverse(obj => {
            if (!obj.name && obj.type !== 'Scene') {
                rogues.push({ type: obj.type, id: obj.id, pos: obj.position });
            }
        });
        return rogues;
    }
};
