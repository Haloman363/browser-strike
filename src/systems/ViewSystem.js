import * as THREE from 'three';
import { System } from '../core/System.js';
import { GameState } from '../GameState.js';

export class ViewSystem extends System {
    static systemName = 'ViewSystem';
    constructor(engine) {
        super(engine);
        this.bobCounter = 0;
        this.lastBobCounter = 0;
        this.swayX = 0;
        this.swayY = 0;
        this.adsProgress = 0;
        this.recoil = 0;
        this.recoilRotation = 0;
        
        this.restPos = new THREE.Vector3(0.25, -0.3, -0.5);
        this.adsPos = new THREE.Vector3(0, -0.125, -0.4);
        
        this.muzzleFlash = null;
    }

    init() {
        console.log("ViewSystem initialized");
        this.muzzleFlash = this.engine.context.muzzleFlash;
        
        // Listen for shooting events to trigger visual effects
        this.engine.on('weapon:fired', () => this.onWeaponFired());
    }

    onWeaponFired() {
        if (this.muzzleFlash) {
            this.muzzleFlash.visible = true;
            setTimeout(() => { if (this.muzzleFlash) this.muzzleFlash.visible = false; }, 50);
        }
        
        const isAiming = GameState.get('isAiming');
        this.recoil = isAiming ? 0.04 : 0.08;
        this.recoilRotation = isAiming ? 0.02 : 0.05;

        const crosshair = document.getElementById('crosshair');
        if (crosshair) {
            crosshair.classList.add('firing');
            setTimeout(() => crosshair.classList.remove('firing'), 100);
        }
    }

    update(delta, time) {
        const camera = this.engine.camera;
        const scene = this.engine.scene;

        // 1. Make sky follow camera
        const skydome = this.engine.context.skydome || scene.children.find(c => c.geometry instanceof THREE.SphereGeometry && c.material.side === THREE.BackSide);
        if (skydome) {
            skydome.position.copy(camera.position);
        }

        // 2. Weapon Animations
        const currentWeapon = GameState.get('currentWeapon');
        const gun = this.engine.context.gun;
        const knife = this.engine.context.knife;
        const grenade = this.engine.context.grenade;
        const c4 = this.engine.context.c4;
        
        let activeModel = null;
        if (currentWeapon === 'gun') activeModel = gun;
        else if (currentWeapon === 'knife') activeModel = knife;
        else if (currentWeapon === 'grenade') activeModel = grenade;
        else if (currentWeapon === 'c4') activeModel = c4;
        
        if (activeModel) {
            this.updateWeaponModel(activeModel, delta, currentWeapon);
        }
    }

    updateWeaponModel(model, delta, type) {
        // Recovery
        this.recoil = THREE.MathUtils.lerp(this.recoil, 0, 0.1);
        this.recoilRotation = THREE.MathUtils.lerp(this.recoilRotation, 0, 0.1);
        this.swayX = THREE.MathUtils.lerp(this.swayX, 0, 0.1);
        this.swayY = THREE.MathUtils.lerp(this.swayY, 0, 0.1);
        
        // ADS Transition
        const isAiming = GameState.get('isAiming');
        const isReloading = GameState.get('isReloading');
        const adsSpeed = 0.15;
        if (isAiming && !isReloading && type === 'gun') {
            this.adsProgress = THREE.MathUtils.lerp(this.adsProgress, 1, adsSpeed);
        } else {
            this.adsProgress = THREE.MathUtils.lerp(this.adsProgress, 0, adsSpeed);
        }

        // Bobbing
        const playerController = this.engine.getSystem('PlayerControllerSystem');
        const isMoving = playerController && (playerController.moveForward || playerController.moveBackward || playerController.moveLeft || playerController.moveRight) && playerController.canJump;
        
        if (isMoving) {
            const speed = playerController.isCrouching ? 4 : 8;
            this.bobCounter += delta * speed;

            if (Math.sin(this.bobCounter) < 0 && Math.sin(this.lastBobCounter) >= 0) {
                if (this.engine.context.soundEngine) {
                    const physics = this.engine.getSystem('PhysicsSystem');
                    const surface = physics ? physics.getSurfaceUnderPlayer(this.engine.camera.position) : 'concrete';
                    this.engine.context.soundEngine.playFootstep(surface);
                }
            }
            this.lastBobCounter = this.bobCounter;

        } else {
            this.bobCounter = THREE.MathUtils.lerp(this.bobCounter, Math.PI * 2, 0.1);
            if (this.bobCounter >= Math.PI * 2) this.bobCounter = 0;
        }

        const bobX = Math.cos(this.bobCounter) * (playerController?.isCrouching ? 0.005 : 0.01);
        const bobY = Math.abs(Math.sin(this.bobCounter)) * (playerController?.isCrouching ? 0.005 : 0.01);
        
        // Position
        const isUtility = type === 'knife' || type === 'grenade' || type === 'c4';
        const targetRestPos = type === 'gun' ? this.restPos : new THREE.Vector3(0.3, -0.4, -0.4);
        const currentBasePos = new THREE.Vector3().lerpVectors(targetRestPos, this.adsPos, this.adsProgress);
        
        model.position.copy(currentBasePos);
        
        const bobScale = 1 - (this.adsProgress * 0.8);
        model.position.x += bobX * bobScale + this.swayX * bobScale;
        model.position.y += bobY * bobScale + this.swayY * bobScale;
        model.position.z += this.recoil;
        
        // Rotation
        model.rotation.x = -this.recoilRotation;
    }
}
