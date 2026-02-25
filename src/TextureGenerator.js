import * as THREE from 'three';

const loader = new THREE.TextureLoader();

export class TextureGenerator {
    static getTexture(name, fallbackFn, size = 512) {
        // Create the procedural texture first as our immediate return value
        const texture = fallbackFn(size);
        
        // Use the absolute path relative to the root for the Vite server
        const path = `/browser-strike/assets/textures/${name}.png`;
        
        // Attempt to load the real texture from nanobanana output
        loader.load(path, 
            (loadedTex) => {
                // When successfully loaded, swap the procedural image with the real one
                texture.image = loadedTex.image;
                texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
                texture.needsUpdate = true;
                console.log(`Successfully swapped with nanobanana texture: ${name}`);
            },
            undefined,
            (err) => {
                // Silently keep using the procedural fallback
                // console.warn(`Texture ${name} not found at ${path}. Using procedural.`);
            }
        );

        return texture;
    }

    static createSandTexture(size = 512) {
        return this.getTexture('sand', (s) => {
            const canvas = document.createElement('canvas');
            canvas.width = s;
            canvas.height = s;
            const ctx = canvas.getContext('2d');

            // Base sand color
            ctx.fillStyle = '#edc9af';
            ctx.fillRect(0, 0, s, s);

            // Add noise/grains
            for (let i = 0; i < 50000; i++) {
                const x = Math.random() * s;
                const y = Math.random() * s;
                const sizeMult = Math.random() * 2;
                const shade = Math.random() * 20 - 10;
                ctx.fillStyle = `rgb(${237 + shade}, ${201 + shade}, ${175 + shade})`;
                ctx.fillRect(x, y, sizeMult, sizeMult);
            }

            // Add some "dune" variations
            for (let i = 0; i < 10; i++) {
                const x = Math.random() * s;
                const y = Math.random() * s;
                const r = Math.random() * 100 + 50;
                const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
                grad.addColorStop(0, 'rgba(0,0,0,0.05)');
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, s, s);
            }

            const texture = new THREE.CanvasTexture(canvas);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            return texture;
        }, size);
    }

    static createWallTexture(size = 512) {
        return this.getTexture('wall', (s) => {
            const canvas = document.createElement('canvas');
            canvas.width = s;
            canvas.height = s;
            const ctx = canvas.getContext('2d');

            // Base stone color
            ctx.fillStyle = '#c2b280';
            ctx.fillRect(0, 0, s, s);

            // Add grit/noise
            for (let i = 0; i < 20000; i++) {
                const x = Math.random() * s;
                const y = Math.random() * s;
                const shade = Math.random() * 30 - 15;
                ctx.fillStyle = `rgb(${194 + shade}, ${178 + shade}, ${128 + shade})`;
                ctx.fillRect(x, y, 1, 1);
            }

            // Draw bricks
            ctx.strokeStyle = 'rgba(0,0,0,0.1)';
            ctx.lineWidth = 2;
            const rows = 8;
            const cols = 4;
            const rowH = s / rows;
            const colW = s / cols;

            for (let r = 0; r < rows; r++) {
                const offset = (r % 2) * (colW / 2);
                for (let c = -1; c <= cols; c++) {
                    ctx.strokeRect(c * colW + offset, r * rowH, colW, rowH);
                    
                    // Bevel/Highlights
                    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
                    ctx.beginPath();
                    ctx.moveTo(c * colW + offset, r * rowH + rowH);
                    ctx.lineTo(c * colW + offset, r * rowH);
                    ctx.lineTo(c * colW + offset + colW, r * rowH);
                    ctx.stroke();
                    
                    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
                }
            }

            const texture = new THREE.CanvasTexture(canvas);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            return texture;
        }, size);
    }

    static createCrateTexture(size = 512) {
        return this.getTexture('crate', (s) => {
            const canvas = document.createElement('canvas');
            canvas.width = s;
            canvas.height = s;
            const ctx = canvas.getContext('2d');

            // Base wood color
            ctx.fillStyle = '#8b4513';
            ctx.fillRect(0, 0, s, s);

            // Wood grain
            for (let i = 0; i < s; i += 2) {
                ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`;
                ctx.fillRect(0, i, s, Math.random() * 2);
            }

            // Frame
            ctx.strokeStyle = 'rgba(0,0,0,0.4)';
            ctx.lineWidth = 20;
            ctx.strokeRect(10, 10, s - 20, s - 20);

            // Cross brace
            ctx.beginPath();
            ctx.moveTo(10, 10);
            ctx.lineTo(s - 10, s - 10);
            ctx.stroke();

            // Planks
            ctx.lineWidth = 2;
            const planks = 5;
            for (let i = 1; i < planks; i++) {
                ctx.beginPath();
                ctx.moveTo(10, (s / planks) * i);
                ctx.lineTo(s - 10, (s / planks) * i);
                ctx.stroke();
            }

            // Nails
            ctx.fillStyle = '#333';
            const corners = [20, s - 20];
            corners.forEach(x => {
                corners.forEach(y => {
                    ctx.beginPath();
                    ctx.arc(x, y, 4, 0, Math.PI * 2);
                    ctx.fill();
                });
            });

            const texture = new THREE.CanvasTexture(canvas);
            return texture;
        }, size);
    }

    static createConcreteTexture(size = 512) {
        return this.getTexture('concrete', (s) => {
            const canvas = document.createElement('canvas');
            canvas.width = s;
            canvas.height = s;
            const ctx = canvas.getContext('2d');

            // Base concrete
            ctx.fillStyle = '#888';
            ctx.fillRect(0, 0, s, s);

            // Noise
            for (let i = 0; i < 30000; i++) {
                const x = Math.random() * s;
                const y = Math.random() * s;
                const shade = Math.random() * 40 - 20;
                ctx.fillStyle = `rgb(${136 + shade}, ${136 + shade}, ${136 + shade})`;
                ctx.fillRect(x, y, 1, 1);
            }

            // Cracks
            ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            ctx.lineWidth = 1;
            for (let i = 0; i < 5; i++) {
                ctx.beginPath();
                let x = Math.random() * s;
                let y = Math.random() * s;
                ctx.moveTo(x, y);
                for (let j = 0; j < 10; j++) {
                    x += (Math.random() - 0.5) * 40;
                    y += (Math.random() - 0.5) * 40;
                    ctx.lineTo(x, y);
                }
                ctx.stroke();
            }

            const texture = new THREE.CanvasTexture(canvas);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            return texture;
        }, size);
    }


    static createCamoTexture(baseColor = '#556b2f', size = 256) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Base color
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, size, size);

        // Add splotches
        const colors = [
            'rgba(0,0,0,0.2)',
            'rgba(255,255,255,0.1)',
            'rgba(50,30,10,0.3)',
            'rgba(100,120,50,0.2)'
        ];

        colors.forEach(color => {
            ctx.fillStyle = color;
            for (let i = 0; i < 15; i++) {
                ctx.beginPath();
                let x = Math.random() * size;
                let y = Math.random() * size;
                ctx.moveTo(x, y);
                
                // Draw irregular blob
                for (let j = 0; j < 8; j++) {
                    x += (Math.random() - 0.5) * 60;
                    y += (Math.random() - 0.5) * 60;
                    ctx.lineTo(x, y);
                }
                ctx.fill();
            }
        });

        // Fabric texture noise
        for (let i = 0; i < 5000; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            ctx.fillStyle = `rgba(0,0,0,0.05)`;
            ctx.fillRect(x, y, 1, 1);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    static createSkinTexture(baseColor = '#dbac82', size = 128) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Base skin
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, size, size);

        // Skin noise/pores
        for (let i = 0; i < 3000; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const shade = Math.random() * 10 - 5;
            ctx.fillStyle = `rgba(0,0,0,0.03)`;
            ctx.fillRect(x, y, 1, 1);
        }

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    static createMetalTexture(baseColor = '#222222', size = 256) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Base metal
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, size, size);

        // Metallic grain/brushed effect
        for (let i = 0; i < 10000; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const h = Math.random() * 2;
            ctx.fillStyle = `rgba(255,255,255,0.05)`;
            ctx.fillRect(x, y, Math.random() * 20, h);
        }

        // Wear and tear on edges
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.strokeRect(2, 2, size - 4, size - 4);

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    static createPolymerTexture(baseColor = '#111111', size = 128) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Base polymer
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, size, size);

        // Stippling/Grip texture
        for (let i = 0; i < size; i += 2) {
            for (let j = 0; j < size; j += 2) {
                if (Math.random() > 0.5) {
                    ctx.fillStyle = 'rgba(255,255,255,0.03)';
                    ctx.fillRect(i, j, 1, 1);
                } else {
                    ctx.fillStyle = 'rgba(0,0,0,0.1)';
                    ctx.fillRect(i, j, 1, 1);
                }
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }

    static createSteelTexture(size = 256) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Base steel gradient
        const grad = ctx.createLinearGradient(0, 0, size, size);
        grad.addColorStop(0, '#888');
        grad.addColorStop(0.5, '#aaa');
        grad.addColorStop(1, '#888');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);

        // Brushed lines
        for (let i = 0; i < 500; i++) {
            ctx.strokeStyle = `rgba(255,255,255,${Math.random() * 0.1})`;
            ctx.beginPath();
            const y = Math.random() * size;
            ctx.moveTo(0, y);
            ctx.lineTo(size, y + (Math.random() - 0.5) * 10);
            ctx.stroke();
        }

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    static createSkyTexture(size = 1024) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size / 2;
        const ctx = canvas.getContext('2d');

        // Sky Gradient (Zenith to Horizon)
        const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        grad.addColorStop(0, '#2e5d8a');   // Deep blue top
        grad.addColorStop(0.5, '#74b9ff'); // Mid blue
        grad.addColorStop(1, '#e1f5fe');   // Lighter horizon
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Procedural Clouds
        for (let i = 0; i < 40; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * (canvas.height * 0.7); // Clouds mostly in upper sky
            const w = Math.random() * 200 + 100;
            const h = w * 0.4;
            
            const cloudGrad = ctx.createRadialGradient(x, y, 0, x, y, w / 2);
            cloudGrad.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
            cloudGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            
            ctx.fillStyle = cloudGrad;
            // Draw elongated cloud puffs
            ctx.beginPath();
            ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Add some haze near horizon
        const hazeGrad = ctx.createLinearGradient(0, canvas.height * 0.7, 0, canvas.height);
        hazeGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
        hazeGrad.addColorStop(1, 'rgba(255, 255, 255, 0.3)');
        ctx.fillStyle = hazeGrad;
        ctx.fillRect(0, canvas.height * 0.7, canvas.width, canvas.height * 0.3);

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }
}
