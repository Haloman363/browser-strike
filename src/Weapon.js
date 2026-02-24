import * as THREE from 'three';

export function createBloodSplatter(position, scene, bloodParticles) {
    const particleCount = 8;
    const geo = new THREE.SphereGeometry(0.5, 4, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xaa0000 });

    for (let i = 0; i < particleCount; i++) {
        const particle = new THREE.Mesh(geo, mat.clone());
        particle.position.copy(position);
        
        // Random velocity
        particle.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 10,
            (Math.random() * 5) + 2,
            (Math.random() - 0.5) * 10
        );
        particle.userData.life = 1.0; // Life from 1.0 to 0.0

        scene.add(particle);
        bloodParticles.push(particle);
    }
}
