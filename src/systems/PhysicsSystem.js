import * as THREE from 'three';
import { System } from '../core/System.js';
import { PHYSICS } from '../Constants_v2.js';

export class PhysicsSystem extends System {
    constructor(engine) {
        super(engine);
        this.objects = [];
        this._box3 = new THREE.Box3();
    }

    init() {
        console.log("PhysicsSystem initialized");
        this.objects = this.engine.context.objects || [];
    }

    checkCollision(pos, radius = PHYSICS.PLAYER_RADIUS, height = PHYSICS.STANDING_HEIGHT) {
        const stepHeight = 10.0;
        this._box3.min.set(pos.x - radius, pos.y - height + stepHeight, pos.z - radius);
        this._box3.max.set(pos.x + radius, pos.y, pos.z + radius);

        for (let i = 0; i < this.objects.length; i++) {
            const obj = this.objects[i];
            if (obj.userData.isSolid) {
                const box = obj.userData.boundingBox;
                if (box) {
                    if (this._box3.intersectsBox(box)) return true;
                }
            }
        }
        return false;
    }

    getSurfaceUnderPlayer(pos) {
        // Simple raycast downwards to find the surface type
        const raycaster = new THREE.Raycaster(
            new THREE.Vector3(pos.x, pos.y, pos.z),
            new THREE.Vector3(0, -1, 0),
            0,
            25
        );

        const intersects = raycaster.intersectObjects(this.objects);
        if (intersects.length > 0) {
            const obj = intersects[0].object;
            if (obj.userData.surfaceType) return obj.userData.surfaceType;
            if (obj.userData.isGround) return 'sand';
            if (obj.material && obj.material.color) {
                const color = obj.material.color.getHex();
                if (color === 0xaaaaaa) return 'concrete';
                if (color === 0x8b4513) return 'wood';
            }
        }
        return 'concrete';
    }
}
