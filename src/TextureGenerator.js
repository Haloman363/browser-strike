import * as THREE from 'three';

const loader = new THREE.TextureLoader();

export class TextureGenerator {
    static getTexture(name, fallbackFn, size = 512) {
        // Create the procedural texture first as our immediate return value
        const texture = fallbackFn(size);
        
        // Check for low-res preference (avoids 50MB+ downloads)
        const isLowRes = localStorage.getItem('bs_low_res_textures') === 'true';
        if (isLowRes) {
            console.log(`Low-res mode: using procedural fallback for ${name}`);
            return texture;
        }

        // Use the base URL from Vite to ensure correct paths in both dev and prod.
        // import.meta.env.BASE_URL always has a trailing slash (e.g. '/' or '/browser-strike/').
        const baseUrl = import.meta.env.BASE_URL;
        const path = `${baseUrl}assets/textures/${name}.png`;
        
        // Only attempt to load if it's not a hex color name (starting with #)
        if (!name.startsWith('#')) {
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
                }
            );
        }

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
            texture.colorSpace = THREE.SRGBColorSpace;
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
            texture.colorSpace = THREE.SRGBColorSpace;
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
            texture.colorSpace = THREE.SRGBColorSpace;
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
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            return texture;
        }, size);
    }


    static createCamoTexture(name = 'camo_ct', baseColor = '#556b2f', size = 256) {
        return this.getTexture(name, (s) => {
            const canvas = document.createElement('canvas');
            canvas.width = s;
            canvas.height = s;
            const ctx = canvas.getContext('2d');

            // Base color
            ctx.fillStyle = baseColor;
            ctx.fillRect(0, 0, s, s);

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
                    let x = Math.random() * s;
                    let y = Math.random() * s;
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
                const x = Math.random() * s;
                const y = Math.random() * s;
                ctx.fillStyle = `rgba(0,0,0,0.05)`;
                ctx.fillRect(x, y, 1, 1);
            }

            const texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            return texture;
        }, size);
    }

    static createSkinTexture(baseColor = '#dbac82', size = 128) {
        return this.getTexture('skin', (s) => {
            const canvas = document.createElement('canvas');
            canvas.width = s;
            canvas.height = s;
            const ctx = canvas.getContext('2d');

            // Base skin
            ctx.fillStyle = baseColor;
            ctx.fillRect(0, 0, s, s);

            // Subtle gradients for SSS (Subsurface Scattering) look
            const grad = ctx.createRadialGradient(s/2, s/2, 0, s/2, s/2, s);
            grad.addColorStop(0, 'rgba(255,100,100,0.05)'); // Warm reddish tint
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, s, s);

            // Skin noise/pores - finer and more varied
            for (let i = 0; i < 5000; i++) {
                const x = Math.random() * s;
                const y = Math.random() * s;
                const shade = Math.random() * 0.04;
                ctx.fillStyle = `rgba(0,0,0,${shade})`;
                ctx.fillRect(x, y, 1, 1);
            }
            
            // Subtle veins/irregularity
            ctx.lineWidth = 1;
            for (let i = 0; i < 4; i++) {
                ctx.strokeStyle = `rgba(100,120,200,${0.01 + Math.random() * 0.02})`;
                ctx.beginPath();
                ctx.moveTo(Math.random() * s, Math.random() * s);
                ctx.bezierCurveTo(
                    Math.random() * s, Math.random() * s,
                    Math.random() * s, Math.random() * s,
                    Math.random() * s, Math.random() * s
                );
                ctx.stroke();
            }

            const texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            return texture;
        }, size);
    }

    static createMetalTexture(name = 'steel', baseColor = '#222222', size = 256) {
        return this.getTexture(name, (s) => {
            const canvas = document.createElement('canvas');
            canvas.width = s;
            canvas.height = s;
            const ctx = canvas.getContext('2d');

            // Base metal
            ctx.fillStyle = baseColor;
            ctx.fillRect(0, 0, s, s);

            // Metallic grain/brushed effect
            for (let i = 0; i < 10000; i++) {
                const x = Math.random() * s;
                const y = Math.random() * s;
                const h = Math.random() * 2;
                ctx.fillStyle = `rgba(255,255,255,0.05)`;
                ctx.fillRect(x, y, Math.random() * 20, h);
            }

            // Wear and tear on edges
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 1;
            ctx.strokeRect(2, 2, s - 4, s - 4);

            const texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            return texture;
        }, size);
    }

    static createPolymerTexture(name = 'polymer', baseColor = '#111111', size = 128) {
        return this.getTexture(name, (s) => {
            const canvas = document.createElement('canvas');
            canvas.width = s;
            canvas.height = s;
            const ctx = canvas.getContext('2d');

            // Base polymer
            ctx.fillStyle = baseColor;
            ctx.fillRect(0, 0, s, s);

            // Stippling/Grip texture - more varied
            for (let i = 0; i < s; i += 1) {
                for (let j = 0; j < s; j += 1) {
                    const rand = Math.random();
                    if (rand > 0.95) {
                        ctx.fillStyle = 'rgba(255,255,255,0.05)';
                        ctx.fillRect(i, j, 1, 1);
                    } else if (rand < 0.1) {
                        ctx.fillStyle = 'rgba(0,0,0,0.15)';
                        ctx.fillRect(i, j, 1, 1);
                    }
                }
            }

            const texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            return texture;
        }, size);
    }

    static createGloveTexture(size = 256) {
        return this.getTexture('glove', (s) => {
            const canvas = document.createElement('canvas');
            canvas.width = s;
            canvas.height = s;
            const ctx = canvas.getContext('2d');

            // Base dark fabric/leather
            ctx.fillStyle = '#151515';
            ctx.fillRect(0, 0, s, s);

            // Fabric weave/grain
            for (let i = 0; i < s; i += 2) {
                for (let j = 0; j < s; j += 2) {
                    const noise = Math.random() * 20;
                    ctx.fillStyle = `rgb(${21 + noise}, ${21 + noise}, ${21 + noise})`;
                    ctx.fillRect(i, j, 1, 1);
                }
            }

            // Stitching/Seams
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            for (let i = 0; i < 4; i++) {
                ctx.beginPath();
                ctx.moveTo(0, (s / 4) * i);
                ctx.lineTo(s, (s / 4) * i);
                ctx.stroke();
            }
            ctx.setLineDash([]);

            // Hexagonal reinforcement pads
            ctx.fillStyle = '#0a0a0a';
            const hexSize = s / 8;
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    if ((r + c) % 2 === 0) {
                        ctx.beginPath();
                        const x = c * hexSize;
                        const y = r * hexSize;
                        ctx.moveTo(x + hexSize / 2, y);
                        ctx.lineTo(x + hexSize, y + hexSize / 4);
                        ctx.lineTo(x + hexSize, y + hexSize * 0.75);
                        ctx.lineTo(x + hexSize / 2, y + hexSize);
                        ctx.lineTo(x, y + hexSize * 0.75);
                        ctx.lineTo(x, y + hexSize / 4);
                        ctx.closePath();
                        ctx.fill();
                    }
                }
            }

            const texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            return texture;
        }, size);
    }

    static createSteelTexture(size = 256) {
        return this.getTexture('steel', (s) => {
            const canvas = document.createElement('canvas');
            canvas.width = s;
            canvas.height = s;
            const ctx = canvas.getContext('2d');

            // Base steel gradient
            const grad = ctx.createLinearGradient(0, 0, s, s);
            grad.addColorStop(0, '#888');
            grad.addColorStop(0.5, '#aaa');
            grad.addColorStop(1, '#888');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, s, s);

            // Brushed lines
            for (let i = 0; i < 500; i++) {
                ctx.strokeStyle = `rgba(255,255,255,${Math.random() * 0.1})`;
                ctx.beginPath();
                const y = Math.random() * s;
                ctx.moveTo(0, y);
                ctx.lineTo(s, y + (Math.random() - 0.5) * 10);
                ctx.stroke();
            }

            const texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            return texture;
        }, size);
    }

    static createC4Texture(size = 512) {
        return this.getTexture('c4', (s) => {
            const canvas = document.createElement('canvas');
            canvas.width = s;
            canvas.height = s;
            const ctx = canvas.getContext('2d');

            // Base Plastic/Polymer
            ctx.fillStyle = '#333';
            ctx.fillRect(0, 0, s, s);

            // Noise/Texture
            for (let i = 0; i < 10000; i++) {
                const x = Math.random() * s;
                const y = Math.random() * s;
                const shade = Math.random() * 20;
                ctx.fillStyle = `rgb(${51 + shade}, ${51 + shade}, ${51 + shade})`;
                ctx.fillRect(x, y, 1, 1);
            }

            // Keypad area
            ctx.fillStyle = '#111';
            ctx.fillRect(s/2, 50, s/2 - 50, s - 100);
            
            // Buttons
            ctx.fillStyle = '#444';
            for(let r=0; r<4; r++) {
                for(let c=0; c<3; c++) {
                    ctx.fillRect(s/2 + 30 + c * 50, 80 + r * 60, 40, 40);
                }
            }

            // Screen
            ctx.fillStyle = '#2a0000';
            ctx.fillRect(s/2 + 30, s - 140, s/2 - 110, 60);

            // Wires
            ctx.lineWidth = 15;
            ctx.strokeStyle = '#f00';
            ctx.beginPath();
            ctx.moveTo(50, 100);
            ctx.bezierCurveTo(150, 50, 150, 250, 250, 200);
            ctx.stroke();
            
            ctx.strokeStyle = '#00f';
            ctx.beginPath();
            ctx.moveTo(50, 150);
            ctx.bezierCurveTo(150, 100, 150, 300, 250, 250);
            ctx.stroke();

            const texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            return texture;
        }, size);
    }

    static createBombSiteTexture(siteLabel = 'A', size = 512) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Transparent background
        ctx.clearRect(0, 0, size, size);

        // Circular boundary
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 20;
        ctx.beginPath();
        ctx.arc(size/2, size/2, size/2 - 20, 0, Math.PI * 2);
        ctx.stroke();

        // Fill with subtle glow
        const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
        grad.addColorStop(0, 'rgba(0, 255, 0, 0.2)');
        grad.addColorStop(1, 'rgba(0, 255, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fill();

        // Label
        ctx.fillStyle = '#00ff00';
        ctx.font = `bold ${size/2}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(siteLabel, size/2, size/2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }

    static createWoodTexture(name = 'wood', baseColor = '#4a2c11', size = 512) {
        return this.getTexture(name, (s) => {
            const canvas = document.createElement('canvas');
            canvas.width = s;
            canvas.height = s;
            const ctx = canvas.getContext('2d');

            // Base wood color
            ctx.fillStyle = baseColor;
            ctx.fillRect(0, 0, s, s);

            // Wood grain lines
            for (let i = 0; i < 150; i++) {
                ctx.strokeStyle = `rgba(0,0,0,${0.1 + Math.random() * 0.15})`;
                ctx.lineWidth = 0.5 + Math.random() * 2;
                ctx.beginPath();
                let x = Math.random() * s;
                let y = 0;
                ctx.moveTo(x, y);
                for (let j = 0; j < 15; j++) {
                    y += s / 15;
                    x += (Math.random() - 0.5) * 20;
                    ctx.lineTo(x, y);
                }
                ctx.stroke();
            }

            // Knots
            for (let i = 0; i < 4; i++) {
                const kx = Math.random() * s;
                const ky = Math.random() * s;
                const grad = ctx.createRadialGradient(kx, ky, 0, kx, ky, 40);
                grad.addColorStop(0, 'rgba(0,0,0,0.3)');
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.ellipse(kx, ky, 15, 35, Math.random() * Math.PI, 0, Math.PI * 2);
                ctx.fill();
            }

            const texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            return texture;
        }, size);
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
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }
}
