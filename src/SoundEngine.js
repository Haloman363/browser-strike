class SoundEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.bgmGain = null;
        this.bgmSource = null;
        this.bgmBuffer = null;
        this.enabled = false;
        this.volume = 0.2;
        this.whiteNoiseBuffer = null;
        this.pinkNoiseBuffer = null;
    }

    init() {
        if (this.ctx) return;
        
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.connect(this.ctx.destination);
            this.masterGain.gain.value = this.volume;

            this.bgmGain = this.ctx.createGain();
            this.bgmGain.connect(this.masterGain);
            this.bgmGain.gain.value = 1.0; // Music is relative to master volume
            
            this.createNoiseBuffers();
            
            this.enabled = true;
            console.log("Sound Engine Initialized with Procedural HD Audio");
        } catch (e) {
            console.error("Web Audio API not supported", e);
        }
    }

    async playBGM(url, loop = true) {
        if (!this.enabled) return;
        this.resume();

        // Stop existing BGM if playing
        this.stopBGM();

        try {
            // Wait if currently loading this URL
            if (this._loadingBGM === url) {
                await this._bgmPromise;
            }

            // Check preloaded first
            if (this._preloadedUrl === url && this._preloadedArrayBuffer) {
                this.bgmBuffer = await this.ctx.decodeAudioData(this._preloadedArrayBuffer);
                this.bgmBuffer.url = url;
                this._preloadedArrayBuffer = null; // Free memory
                this._preloadedUrl = null;
            } else if (!this.bgmBuffer || this.bgmBuffer.url !== url) {
                // Fetch normally if not preloaded
                this._loadingBGM = url;
                this._bgmPromise = (async () => {
                    const response = await fetch(url);
                    const arrayBuffer = await response.arrayBuffer();
                    this.bgmBuffer = await this.ctx.decodeAudioData(arrayBuffer);
                    this.bgmBuffer.url = url;
                    this._loadingBGM = null;
                })();
                await this._bgmPromise;
            }

            this.bgmSource = this.ctx.createBufferSource();
            this.bgmSource.buffer = this.bgmBuffer;
            this.bgmSource.loop = loop;
            this.bgmSource.connect(this.bgmGain);
            this.bgmSource.start(0);
        } catch (e) {
            console.error("Failed to play BGM:", e);
        }
    }

    // Pre-load a track before AudioContext is initialized
    async preloadBGM(url) {
        if (this._loadingBGM === url) return this._bgmPromise;
        
        this._loadingBGM = url;
        this._bgmPromise = (async () => {
            try {
                const response = await fetch(url);
                this._preloadedArrayBuffer = await response.arrayBuffer();
                this._preloadedUrl = url;
                this._loadingBGM = null; // Finished pre-loading to buffer
            } catch (e) {
                console.error("Preload BGM failed:", e);
                this._loadingBGM = null;
            }
        })();
        return this._bgmPromise;
    }

    stopBGM() {
        if (this.bgmSource) {
            try {
                this.bgmSource.stop();
            } catch (e) {}
            this.bgmSource.disconnect();
            this.bgmSource = null;
        }
    }

    createNoiseBuffers() {
        const bufferSize = this.ctx.sampleRate * 2;
        
        // White Noise
        this.whiteNoiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const whiteData = this.whiteNoiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            whiteData[i] = Math.random() * 2 - 1;
        }

        // Pink Noise (using Voss algorithm approximation)
        this.pinkNoiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const pinkData = this.pinkNoiseBuffer.getChannelData(0);
        let b0, b1, b2, b3, b4, b5, b6;
        b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0.0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            pinkData[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
            pinkData[i] *= 0.11; // (roughly) scale to -1 to 1
            b6 = white * 0.115926;
        }
    }

    setVolume(value) {
        this.volume = value;
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05);
        }
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    // Helper to create a noise source
    createNoiseSource(type = 'white') {
        const source = this.ctx.createBufferSource();
        source.buffer = type === 'pink' ? this.pinkNoiseBuffer : this.whiteNoiseBuffer;
        source.loop = true;
        return source;
    }

    playWeaponSwitch() {
        if (!this.enabled) return;
        this.resume();
        const now = this.ctx.currentTime;
        
        // Cloth rustle
        const rustle = this.createNoiseSource('pink');
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1200;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        rustle.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        rustle.start(now);
        rustle.stop(now + 0.15);

        // Metallic slide click
        this.playMechanicalClick(now + 0.05, 1500, 0.05);
    }

    playUIClick() {
        if (!this.enabled) return;
        this.resume();
        const now = this.ctx.currentTime;
        
        // Crisp UI Tick
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2400, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.05);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.05);

        // High end click
        const click = this.createNoiseSource('white');
        const clickFilter = this.ctx.createBiquadFilter();
        clickFilter.type = 'highpass';
        clickFilter.frequency.value = 5000;
        const clickGain = this.ctx.createGain();
        clickGain.gain.setValueAtTime(0.05, now);
        clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.01);
        click.connect(clickFilter);
        clickFilter.connect(clickGain);
        clickGain.connect(this.masterGain);
        click.start(now);
        click.stop(now + 0.01);
    }

    playUIHover() {
        if (!this.enabled) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1600, now);
        gain.gain.setValueAtTime(0.03, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.05);
    }

    playShoot(weaponData = {}) {
        if (!this.enabled) return;
        this.resume();
        const now = this.ctx.currentTime;
        
        const type = weaponData.type || 'rifle';
        const isSniper = type === 'sniper';
        const isShotgun = type === 'shotgun';
        const isPistol = type === 'pistol';
        
        // 1. TRANSIENT (The sharp "pop" or "crack")
        const transient = this.createNoiseSource('white');
        const transFilter = this.ctx.createBiquadFilter();
        transFilter.type = 'highpass';
        transFilter.frequency.setValueAtTime(isSniper ? 3000 : 5000, now);
        
        const transGain = this.ctx.createGain();
        transGain.gain.setValueAtTime(isSniper ? 0.8 : 0.6, now);
        transGain.gain.exponentialRampToValueAtTime(0.01, now + 0.03);
        
        transient.connect(transFilter);
        transFilter.connect(transGain);
        transGain.connect(this.masterGain);
        transient.start(now);
        transient.stop(now + 0.03);

        // 2. BODY (The "thump" and mid-range blast)
        const bodyNoise = this.createNoiseSource('pink');
        const bodyFilter = this.ctx.createBiquadFilter();
        bodyFilter.type = 'lowpass';
        bodyFilter.frequency.setValueAtTime(isShotgun ? 1200 : 800, now);
        bodyFilter.frequency.exponentialRampToValueAtTime(isSniper ? 100 : 300, now + 0.15);
        
        const bodyGain = this.ctx.createGain();
        bodyGain.gain.setValueAtTime(isShotgun ? 0.9 : 0.7, now);
        bodyGain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        
        bodyNoise.connect(bodyFilter);
        bodyFilter.connect(bodyGain);
        bodyGain.connect(this.masterGain);
        bodyNoise.start(now);
        bodyNoise.stop(now + 0.2);

        // Sub Thump
        const thump = this.ctx.createOscillator();
        const thumpGain = this.ctx.createGain();
        thump.type = 'sine';
        thump.frequency.setValueAtTime(isSniper ? 80 : 120, now);
        thump.frequency.exponentialRampToValueAtTime(40, now + 0.1);
        thumpGain.gain.setValueAtTime(isSniper ? 0.5 : 0.3, now);
        thumpGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        thump.connect(thumpGain);
        thumpGain.connect(this.masterGain);
        thump.start(now);
        thump.stop(now + 0.1);

        // 3. TAIL (The reverb/environment reflection)
        const tail = this.createNoiseSource('pink');
        const tailFilter = this.ctx.createBiquadFilter();
        tailFilter.type = 'lowpass';
        tailFilter.frequency.setValueAtTime(1500, now);
        tailFilter.frequency.linearRampToValueAtTime(200, now + (isSniper ? 1.5 : 0.8));
        
        const tailGain = this.ctx.createGain();
        tailGain.gain.setValueAtTime(0.2, now);
        tailGain.gain.linearRampToValueAtTime(0, now + (isSniper ? 1.5 : 0.8));
        
        tail.connect(tailFilter);
        tailFilter.connect(tailGain);
        tailGain.connect(this.masterGain);
        tail.start(now);
        tail.stop(now + (isSniper ? 1.5 : 0.8));

        // 4. MECHANICAL (Action noise)
        const mech = this.ctx.createOscillator();
        const mechGain = this.ctx.createGain();
        mech.type = 'square';
        mech.frequency.setValueAtTime(isPistol ? 1500 : 800, now);
        mechGain.gain.setValueAtTime(0.05, now);
        mechGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
        mech.connect(mechGain);
        mechGain.connect(this.masterGain);
        mech.start(now);
        mech.stop(now + 0.02);
    }

    playExplosion() {
        if (!this.enabled) return;
        this.resume();
        const now = this.ctx.currentTime;
        
        // Initial Crack
        const crack = this.createNoiseSource('white');
        const crackGain = this.ctx.createGain();
        crackGain.gain.setValueAtTime(1.0, now);
        crackGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        crack.connect(crackGain);
        crackGain.connect(this.masterGain);
        crack.start(now);
        crack.stop(now + 0.1);

        // The Blast
        const blast = this.createNoiseSource('pink');
        const blastFilter = this.ctx.createBiquadFilter();
        blastFilter.type = 'lowpass';
        blastFilter.frequency.setValueAtTime(1000, now);
        blastFilter.frequency.exponentialRampToValueAtTime(40, now + 2.0);
        const blastGain = this.ctx.createGain();
        blastGain.gain.setValueAtTime(1.2, now);
        blastGain.gain.linearRampToValueAtTime(0, now + 2.0);
        blast.connect(blastFilter);
        blastFilter.connect(blastGain);
        blastGain.connect(this.masterGain);
        blast.start(now);
        blast.stop(now + 2.0);

        // Sub-Rumble
        const rumble = this.ctx.createOscillator();
        rumble.type = 'sine';
        rumble.frequency.setValueAtTime(60, now);
        rumble.frequency.linearRampToValueAtTime(20, now + 1.5);
        const rumbleGain = this.ctx.createGain();
        rumbleGain.gain.setValueAtTime(0.8, now);
        rumbleGain.gain.linearRampToValueAtTime(0, now + 1.5);
        rumble.connect(rumbleGain);
        rumbleGain.connect(this.masterGain);
        rumble.start(now);
        rumble.stop(now + 1.5);
    }

    playFlashbang() {
        if (!this.enabled) return;
        this.resume();
        const now = this.ctx.currentTime;
        
        const pop = this.createNoiseSource('white');
        const popGain = this.ctx.createGain();
        popGain.gain.setValueAtTime(0.6, now);
        popGain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        pop.connect(popGain);
        popGain.connect(this.masterGain);
        pop.start(now);
        pop.stop(now + 0.05);

        const ring = this.ctx.createOscillator();
        ring.type = 'sine';
        ring.frequency.setValueAtTime(3000, now);
        const ringGain = this.ctx.createGain();
        ringGain.gain.setValueAtTime(0.3, now);
        ringGain.gain.linearRampToValueAtTime(0, now + 3.0);
        ring.connect(ringGain);
        ringGain.connect(this.masterGain);
        ring.start(now);
        ring.stop(now + 3.0);
    }

    playSmoke() {
        if (!this.enabled) return;
        this.resume();
        const now = this.ctx.currentTime;
        const hiss = this.createNoiseSource('white');
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(1000, now);
        filter.frequency.linearRampToValueAtTime(500, now + 4.0);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0, now + 4.0);
        hiss.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        hiss.start(now);
        hiss.stop(now + 4.0);
    }

    playShatter() {
        if (!this.enabled) return;
        this.resume();
        const now = this.ctx.currentTime;
        for (let i = 0; i < 5; i++) {
            const burst = this.createNoiseSource('white');
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.value = 2000 + Math.random() * 3000;
            const gain = this.ctx.createGain();
            const time = now + Math.random() * 0.1;
            gain.gain.setValueAtTime(0.3, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
            burst.connect(filter);
            filter.connect(gain);
            gain.connect(this.masterGain);
            burst.start(time);
            burst.stop(time + 0.05);
        }
    }

    // --- ENHANCED RELOAD SYSTEM ---

    playReload(weaponData = {}) {
        if (!this.enabled) return;
        this.resume();
        const now = this.ctx.currentTime;
        const reloadTime = (weaponData.reloadTime || 2500) / 1000;
        const type = weaponData.type || 'rifle';
        
        // Base handling noise (cloth/plastic rustle)
        this.playHandlingNoise(now, reloadTime);

        if (type === 'shotgun') {
            // Shotgun Tube reload (multiple shell inserts)
            const numShells = Math.min(weaponData.magSize || 8, 4);
            for (let i = 0; i < numShells; i++) {
                const shellTime = now + (reloadTime * 0.2) + (i * 0.4);
                if (shellTime < now + reloadTime - 0.2) {
                    this.playShellInsert(shellTime);
                }
            }
            this.playSlidePull(now + reloadTime * 0.85, 0.15); // Final pump
        } else if (type === 'sniper') {
            // Heavy Bolt Action
            this.playMagOut(now + 0.1, true);
            this.playMagIn(now + reloadTime * 0.5, true);
            this.playBoltAction(now + reloadTime * 0.8, 0.2);
        } else if (type === 'pistol') {
            // Light Pistol
            this.playMagOut(now + 0.1, false);
            this.playMagIn(now + reloadTime * 0.4, false);
            this.playSlidePull(now + reloadTime * 0.8, 0.1);
        } else {
            // Standard Rifle/SMG
            this.playMagOut(now + 0.1, true);
            this.playMagIn(now + reloadTime * 0.45, true);
            this.playChargingHandle(now + reloadTime * 0.85, 0.15);
        }
    }

    playHandlingNoise(time, duration) {
        const noise = this.createNoiseSource('pink');
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.02, time + 0.1);
        gain.gain.linearRampToValueAtTime(0.02, time + duration - 0.1);
        gain.gain.linearRampToValueAtTime(0, time + duration);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start(time);
        noise.stop(time + duration);
    }

    playMagOut(time, heavy = false) {
        // Friction sound
        const noise = this.createNoiseSource('white');
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1200, time);
        filter.frequency.exponentialRampToValueAtTime(800, time + 0.15);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.05, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start(time);
        noise.stop(time + 0.15);

        // Click
        this.playMechanicalClick(time, heavy ? 600 : 900, 0.1);
    }

    playMagIn(time, heavy = false) {
        // Heavy thud
        const thud = this.ctx.createOscillator();
        thud.type = 'sine';
        thud.frequency.setValueAtTime(heavy ? 150 : 250, time);
        const thudGain = this.ctx.createGain();
        thudGain.gain.setValueAtTime(0.15, time);
        thudGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
        thud.connect(thudGain);
        thudGain.connect(this.masterGain);
        thud.start(time);
        thud.stop(time + 0.1);

        // Solid click
        this.playMechanicalClick(time, heavy ? 400 : 700, 0.2);
    }

    playSlidePull(time, duration) {
        // Pull back
        this.playMechanicalClick(time, 1200, 0.15);
        // Release
        this.playMechanicalClick(time + duration * 0.5, 800, 0.2);
        
        // Metallic slide scrape
        const noise = this.createNoiseSource('white');
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 2000;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.03, time);
        gain.gain.linearRampToValueAtTime(0.05, time + duration * 0.5);
        gain.gain.linearRampToValueAtTime(0, time + duration);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start(time);
        noise.stop(time + duration);
    }

    playChargingHandle(time, duration) {
        this.playMechanicalClick(time, 1000, 0.15);
        this.playMechanicalClick(time + duration, 600, 0.2);
        
        // Springy metal sound
        const ring = this.ctx.createOscillator();
        ring.type = 'triangle';
        ring.frequency.setValueAtTime(1500, time);
        ring.frequency.exponentialRampToValueAtTime(800, time + duration);
        const ringGain = this.ctx.createGain();
        ringGain.gain.setValueAtTime(0.05, time);
        ringGain.gain.exponentialRampToValueAtTime(0.001, time + duration);
        ring.connect(ringGain);
        ringGain.connect(this.masterGain);
        ring.start(time);
        ring.stop(time + duration);
    }

    playBoltAction(time, duration) {
        // Lift, Pull, Push, Lock
        this.playMechanicalClick(time, 1500, 0.1);
        this.playMechanicalClick(time + duration * 0.3, 1000, 0.1);
        this.playMechanicalClick(time + duration * 0.6, 800, 0.1);
        this.playMechanicalClick(time + duration * 0.9, 400, 0.2);
    }

    playShellInsert(time) {
        // Plastic shell slide
        const noise = this.createNoiseSource('white');
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1500;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.05, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start(time);
        noise.stop(time + 0.1);

        // Spring click
        this.playMechanicalClick(time + 0.05, 800, 0.1);
    }

    playMechanicalClick(time, freq = 800, volume = 0.1) {
        const osc = this.ctx.createOscillator();
        const noise = this.createNoiseSource('white');
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, time);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(freq * 2, time);
        gain.gain.setValueAtTime(volume, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
        osc.connect(gain);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        osc.start(time);
        osc.stop(time + 0.08);
        noise.start(time);
        noise.stop(time + 0.08);
    }

    playJump() {
        if (!this.enabled) return;
        this.resume();
        const now = this.ctx.currentTime;
        const rustle = this.createNoiseSource('pink');
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 800;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        rustle.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        rustle.start(now);
        rustle.stop(now + 0.15);
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
        const oomphGain = this.ctx.createGain();
        oomphGain.gain.setValueAtTime(0.15, now);
        oomphGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(oomphGain);
        oomphGain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.1);
    }

    playLand() {
        if (!this.enabled) return;
        this.resume();
        const now = this.ctx.currentTime;
        const thud = this.createNoiseSource('pink');
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 200;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        thud.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        thud.start(now);
        thud.stop(now + 0.2);
    }

    playHit() {
        if (!this.enabled) return;
        this.resume();
        const now = this.ctx.currentTime;
        const noise = this.createNoiseSource('pink');
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 600;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start(now);
        noise.stop(now + 0.1);
        const osc = this.ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.08);
        const oscGain = this.ctx.createGain();
        oscGain.gain.setValueAtTime(0.2, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(oscGain);
        oscGain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.08);
    }

    playDeath() {
        if (!this.enabled) return;
        this.resume();
        const now = this.ctx.currentTime;
        const noise = this.createNoiseSource('pink');
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, now);
        filter.frequency.linearRampToValueAtTime(100, now + 0.8);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.8);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start(now);
        noise.stop(now + 0.8);
    }

    playKnife() {
        if (!this.enabled) return;
        this.resume();
        const now = this.ctx.currentTime;
        const swish = this.createNoiseSource('white');
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2000, now);
        filter.frequency.exponentialRampToValueAtTime(4000, now + 0.1);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        swish.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        swish.start(now);
        swish.stop(now + 0.1);
        const ring = this.ctx.createOscillator();
        ring.type = 'sine';
        ring.frequency.setValueAtTime(3000, now);
        const ringGain = this.ctx.createGain();
        ringGain.gain.setValueAtTime(0.05, now);
        ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        ring.connect(ringGain);
        ringGain.connect(this.masterGain);
        ring.start(now);
        ring.stop(now + 0.2);
    }

    playFootstep(surface = 'concrete') {
        if (!this.enabled) return;
        this.resume();
        const now = this.ctx.currentTime;
        let freq = 150;
        let noiseType = 'pink';
        let noiseFreq = 800;
        let volume = 0.12;
        if (surface === 'sand') { freq = 80; noiseFreq = 400; volume = 0.18; }
        else if (surface === 'metal') { freq = 250; noiseFreq = 2000; volume = 0.1; }
        else if (surface === 'wood') { freq = 120; noiseFreq = 600; volume = 0.15; }
        const thump = this.ctx.createOscillator();
        thump.type = 'sine';
        thump.frequency.setValueAtTime(freq, now);
        thump.frequency.exponentialRampToValueAtTime(freq * 0.5, now + 0.1);
        const thumpGain = this.ctx.createGain();
        thumpGain.gain.setValueAtTime(volume, now);
        thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        thump.connect(thumpGain);
        thumpGain.connect(this.masterGain);
        thump.start(now);
        thump.stop(now + 0.1);
        const scuff = this.createNoiseSource(noiseType);
        const scuffFilter = this.ctx.createBiquadFilter();
        scuffFilter.type = 'bandpass';
        scuffFilter.frequency.value = noiseFreq;
        const scuffGain = this.ctx.createGain();
        scuffGain.gain.setValueAtTime(volume * 0.8, now);
        scuffGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        scuff.connect(scuffFilter);
        scuffFilter.connect(scuffGain);
        scuffGain.connect(this.masterGain);
        scuff.start(now);
        scuff.stop(now + 0.08);
        if (surface === 'metal') {
            const ring = this.ctx.createOscillator();
            ring.type = 'sine';
            ring.frequency.value = 1200;
            const ringGain = this.ctx.createGain();
            ringGain.gain.setValueAtTime(0.03, now);
            ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            ring.connect(ringGain);
            ringGain.connect(this.masterGain);
            ring.start(now);
            ring.stop(now + 0.05);
        }
    }

    playImpact(surface = 'concrete') {
        if (!this.enabled) return;
        this.resume();
        const now = this.ctx.currentTime;
        let freq = 1000;
        let noiseFreq = 2000;
        let volume = 0.2;
        let decay = 0.05;
        if (surface === 'sand') { freq = 400; noiseFreq = 800; volume = 0.3; decay = 0.1; }
        else if (surface === 'metal') { freq = 2500; noiseFreq = 5000; volume = 0.15; decay = 0.03; this.playRicochet(now); }
        else if (surface === 'wood') { freq = 800; noiseFreq = 1200; volume = 0.25; decay = 0.08; }
        const osc = this.ctx.createOscillator();
        const noise = this.createNoiseSource('white');
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + decay);
        filter.type = 'bandpass';
        filter.frequency.value = noiseFreq;
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + decay);
        osc.connect(gain);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + decay);
        noise.start(now);
        noise.stop(now + decay);
    }

    playRicochet(time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(3000 + Math.random() * 2000, time);
        osc.frequency.exponentialRampToValueAtTime(2000 + Math.random() * 1000, time + 0.2);
        gain.gain.setValueAtTime(0.05, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(time);
        osc.stop(time + 0.2);
    }
}

export const soundEngine = new SoundEngine();
