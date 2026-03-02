import * as THREE from 'three';
import { System } from '../core/System.js';
import { PHYSICS } from '../Constants.js';

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
        this._box3.min.set(pos.x - radius, pos.y - height, pos.z - radius);
        this._box3.max.set(pos.x + radius, pos.y, pos.z + radius);

        for (let i = 0; i < this.objects.length; i++) {
            const obj = this.objects[i];
            if (obj.userData.isSolid) {
                const box = obj.userData.boundingBox;
                if (box) {
                    if (this._box3.min.y < (box.max.y - 1) && this._box3.max.y > box.min.y) {
                        if (this._box3.intersectsBox(box)) return true;
                    }
                }
            }
        }
        return false;
    }
}
