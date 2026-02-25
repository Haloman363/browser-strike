import * as THREE from 'three';

export class WeaponBuilder {
    constructor() {
        this.group = new THREE.Group();
    }

    /**
     * Adds an extruded shape (e.g., receiver side profile).
     * Points are defined in 2D (x = length, y = height).
     * Extrusion depth becomes the width.
     */
    addExtrudedShape(points, width, material, position = {x:0, y:0, z:0}, rotation = {x:0, y:0, z:0}) {
        const shape = new THREE.Shape();
        if (points.length > 0) {
            shape.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                shape.lineTo(points[i].x, points[i].y);
            }
        }

        const extrudeSettings = {
            depth: width,
            bevelEnabled: true,
            bevelThickness: 0.002,
            bevelSize: 0.002,
            bevelSegments: 2
        };

        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        
        // Center the geometry on the Z axis (width) so it's symmetrical
        geometry.translate(0, 0, -width / 2);
        
        const mesh = new THREE.Mesh(geometry, material);
        
        // Align shape X (length) with gun Z (length)
        // By default, shape X is mesh X. We need to rotate 90 deg around Y.
        mesh.rotation.set(rotation.x, rotation.y + Math.PI / 2, rotation.z);
        mesh.position.set(position.x, position.y, position.z);
        
        this.group.add(mesh);
        return mesh;
    }

    /**
     * Adds a lathed part (e.g., barrel).
     * Profile points are (x = radius, y = length).
     */
    addLathedPart(profile, material, position = {x:0, y:0, z:0}, rotation = {x:0, y:0, z:0}) {
        const points = profile.map(p => new THREE.Vector2(p.x, p.y));
        const geometry = new THREE.LatheGeometry(points, 16);
        
        const mesh = new THREE.Mesh(geometry, material);
        
        // Lathe is Y-up. Rotate to Z-forward.
        mesh.rotation.set(rotation.x + Math.PI / 2, rotation.y, rotation.z);
        mesh.position.set(position.x, position.y, position.z);
        
        this.group.add(mesh);
        return mesh;
    }

    addBox(size, material, position = {x:0, y:0, z:0}, rotation = {x:0, y:0, z:0}) {
        const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(position.x, position.y, position.z);
        mesh.rotation.set(rotation.x, rotation.y, rotation.z);
        this.group.add(mesh);
        return mesh;
    }

    addTriggerGroup(position, material, guardMaterial) {
        const tg = new THREE.Group();
        
        // Simplified guard
        const guardGeo = new THREE.TorusGeometry(0.03, 0.005, 8, 12, Math.PI);
        const guard = new THREE.Mesh(guardGeo, guardMaterial);
        guard.rotation.z = Math.PI / 2;
        tg.add(guard);

        const trigGeo = new THREE.BoxGeometry(0.005, 0.02, 0.01);
        const trig = new THREE.Mesh(trigGeo, material);
        trig.position.y = 0.01;
        tg.add(trig);

        tg.position.set(position.x, position.y, position.z);
        this.group.add(tg);
    }

    addPicatinnyRail(length, width, position, material) {
        const railGroup = new THREE.Group();
        const baseGeo = new THREE.BoxGeometry(width, 0.01, length);
        const base = new THREE.Mesh(baseGeo, material);
        railGroup.add(base);

        const teethCount = Math.floor(length / 0.03);
        const toothGeo = new THREE.BoxGeometry(width, 0.012, 0.015);
        for (let i = 0; i < teethCount; i++) {
            const tooth = new THREE.Mesh(toothGeo, material);
            tooth.position.z = -length / 2 + (i * 0.03) + 0.015;
            tooth.position.y = 0.01;
            railGroup.add(tooth);
        }
        railGroup.position.copy(position);
        this.group.add(railGroup);
    }

    addCylinder(radiusTop, radiusBottom, height, material, position = {x:0, y:0, z:0}, rotation = {x:0, y:0, z:0}) {
        const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 16);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(position.x, position.y, position.z);
        mesh.rotation.set(rotation.x, rotation.y, rotation.z);
        this.group.add(mesh);
        return mesh;
    }

    addTorus(radius, tube, material, position = {x:0, y:0, z:0}, rotation = {x:0, y:0, z:0}) {
        const geometry = new THREE.TorusGeometry(radius, tube, 8, 16);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(position.x, position.y, position.z);
        mesh.rotation.set(rotation.x, rotation.y, rotation.z);
        this.group.add(mesh);
        return mesh;
    }

    addSlideSerrations(count, size, spacing, position, material) {
        const serrationGeo = new THREE.BoxGeometry(0.005, size.y, size.z);
        const group = new THREE.Group();
        for (let i = 0; i < count; i++) {
            const serration = new THREE.Mesh(serrationGeo, material);
            serration.position.z = i * spacing;
            group.add(serration);
        }
        group.position.copy(position);
        this.group.add(group);
        return group;
    }

    getGroup() {
        return this.group;
    }
}
