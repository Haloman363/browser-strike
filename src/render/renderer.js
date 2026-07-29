import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Mirage-style warm arid lighting. The numbers here are the whole look:
// a strong low sun, warm bounce off sand, cool sky fill for the shadows.
export const LOOK = {
  // Strong low sun. The sun/fill RATIO is what reads as sunlight — a bright
  // key with a dim fill gives deep directional shadows; raising the fill to
  // "see into" the shadows is what makes a scene look flat and overcast.
  sunColor: 0xfff0d4,
  sunIntensity: 5.4,
  sunAzimuth: 2.15,
  sunElevation: 0.62,

  skyTop: 0x5b93d6,
  skyHorizon: 0xe4d3ae,

  // Shadow fill. In desert light shadows are filled by warm bounce off sand,
  // not by blue sky — a saturated blue fill reads as cold and wrong.
  // Kept LOW on purpose: harsh sun means dark shadows, and a generous fill is
  // what makes a scene read as flat and overcast no matter how bright the key.
  // Sky term stays dim so shadows read dark; the ground term carries most of
  // the fill so what light does reach the shadows is warm bounce off paving.
  fillSky: 0x7d97bd,
  fillGround: 0xc8935a,
  fillIntensity: 0.3,

  fogColor: 0xe0cda8,
  fogDensity: 0.0042,
  exposure: 1.05,
};

export class Renderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // SMAA handles this in post
      powerPreference: 'high-performance',
      stencil: false,
    });
    // ?lowspec=1 trims cost for software-rasterized capture (WSL/headless),
    // where a 4k shadow map plus SSAO is seconds per frame.
    this.lowSpec = new URLSearchParams(location.search).has('lowspec');

    this.renderer.setPixelRatio(this.lowSpec ? 1 : Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    // VSM gives soft penumbrae without PCFSoft, which r185 deprecated.
    this.renderer.shadowMap.type = THREE.VSMShadowMap;
    // ACES filmic is the single biggest lever on "does this look like a game
    // or like a WebGL demo" — it rolls off highlights instead of clipping.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = LOOK.exposure;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(LOOK.fogColor, LOOK.fogDensity);
    this.setupSky();

    this.camera = new THREE.PerspectiveCamera(
      90, innerWidth / innerHeight, 0.05, 400);

    this.setupLighting();
    this.setupComposer();

    addEventListener('resize', () => this.resize());
  }

  /**
   * Sky dome plus a matching environment map. The env map matters as much as
   * the dome: without it every metal and every glancing highlight reflects
   * black, which is the classic "WebGL demo" tell.
   */
  setupSky() {
    const sunDir = new THREE.Vector3(
      Math.cos(LOOK.sunElevation) * Math.cos(LOOK.sunAzimuth),
      Math.sin(LOOK.sunElevation),
      Math.cos(LOOK.sunElevation) * Math.sin(LOOK.sunAzimuth),
    ).normalize();

    const shader = {
      uniforms: {
        top: { value: new THREE.Color(LOOK.skyTop) },
        horizon: { value: new THREE.Color(LOOK.skyHorizon) },
        ground: { value: new THREE.Color(LOOK.groundBounce) },
        sunDir: { value: sunDir },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          // Strip translation so the dome never moves relative to the camera.
          gl_Position = projectionMatrix * mat4(mat3(modelViewMatrix)) * vec4(position, 1.0);
          gl_Position.z = gl_Position.w; // force to far plane
        }`,
      fragmentShader: `
        uniform vec3 top, horizon, ground;
        uniform vec3 sunDir;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          // Sharpen the gradient near the horizon; a linear ramp reads as haze.
          vec3 sky = mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.42));
          sky = mix(sky, ground, pow(clamp(-h * 2.2, 0.0, 1.0), 0.7));
          // Sun disc plus a wide warm scatter halo around it.
          float cd = max(dot(d, sunDir), 0.0);
          sky += vec3(1.0, 0.86, 0.62) * pow(cd, 900.0) * 12.0;
          sky += vec3(1.0, 0.72, 0.42) * pow(cd, 12.0) * 0.30;
          gl_FragColor = vec4(sky, 1.0);
        }`,
    };

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 16),
      new THREE.ShaderMaterial({ ...shader, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    sky.frustumCulled = false;
    sky.renderOrder = -1000;
    this.scene.add(sky);
    this.sky = sky;

    // Environment map for reflections. Painted on a canvas as an equirect
    // rather than rendered through CubeCamera+PMREM: those cost six GPU passes
    // plus convolution, which stalls indefinitely on a software rasterizer.
    // A blurry sky gradient is all that specular response actually needs.
    this.scene.environment = this.buildEnvMap(sunDir);
    // Enough for specular response on metal and glancing highlights, but not
    // so much that it acts as a second ambient light and flattens the shadows.
    this.scene.environmentIntensity = 0.3;
  }

  /**
   * Paint the sky gradient into an equirectangular canvas texture. Mirrors the
   * dome shader's maths so reflections match what you see overhead.
   */
  buildEnvMap(sunDir) {
    const W = 128, H = 64;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(W, H);

    const top = new THREE.Color(LOOK.skyTop);
    const hor = new THREE.Color(LOOK.skyHorizon);
    const grd = new THREE.Color(LOOK.fillGround);

    for (let y = 0; y < H; y++) {
      const theta = (y / (H - 1)) * Math.PI;       // 0 at zenith
      const dy = Math.cos(theta);
      for (let x = 0; x < W; x++) {
        const phi = (x / W) * Math.PI * 2;
        const s = Math.sin(theta);
        const dx = s * Math.cos(phi), dz = s * Math.sin(phi);

        const c = hor.clone().lerp(top, Math.pow(Math.max(dy, 0), 0.42));
        if (dy < 0) c.lerp(grd, Math.pow(Math.min(-dy * 2.2, 1), 0.7));

        // Broad warm glow around the sun; the disc itself is too small to
        // matter once this is used as diffuse-ish environment light.
        const cd = Math.max(dx * sunDir.x + dy * sunDir.y + dz * sunDir.z, 0);
        const glow = Math.pow(cd, 12) * 0.3;
        const i = (y * W + x) * 4;
        img.data[i] = Math.min(255, (c.r + glow) * 255);
        img.data[i + 1] = Math.min(255, (c.g + glow * 0.72) * 255);
        img.data[i + 2] = Math.min(255, (c.b + glow * 0.42) * 255);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  setupLighting() {
    const sun = new THREE.DirectionalLight(LOOK.sunColor, LOOK.sunIntensity);
    const el = LOOK.sunElevation, az = LOOK.sunAzimuth;
    sun.position.set(
      Math.cos(el) * Math.cos(az) * 60,
      Math.sin(el) * 60,
      Math.cos(el) * Math.sin(az) * 60,
    );
    sun.castShadow = true;
    // Tight ortho box around the playable area keeps texel density high;
    // a loose box is the usual cause of soft, blobby shadows.
    // Must cover the full 60x60m map (±30) or the perimeter loses cast shadows.
    const S = 34;
    sun.shadow.camera.left = -S;
    sun.shadow.camera.right = S;
    sun.shadow.camera.top = S;
    sun.shadow.camera.bottom = -S;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 140;
    sun.shadow.mapSize.setScalar(this.lowSpec ? 1024 : 4096);
    // VSM blurs in shadow space, so it wants ~0 depth bias; the PCF-style
    // negative bias leaks light under objects here.
    sun.shadow.bias = 0;
    sun.shadow.normalBias = 0.02;
    // Tight penumbra: the sun is a half-degree disc, so its shadows are nearly
    // hard. Wide blur is what makes outdoor shadows look like soft indoor ones.
    sun.shadow.radius = 1.2;
    sun.shadow.blurSamples = this.lowSpec ? 4 : 8;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    // Sky/bounce fill. Without this, shadowed faces go dead black under ACES.
    const hemi = new THREE.HemisphereLight(
      LOOK.fillSky, LOOK.fillGround, LOOK.fillIntensity);
    this.scene.add(hemi);
    this.hemi = hemi;

    // Warm bounce from the sunlit ground, aimed back up into the shadows from
    // the sun side. Real GI would do this; one cheap opposing light is 90% of
    // the read for none of the cost.
    // ponytail: static bounce light, not GI. Bake an irradiance volume if the
    // map ever gets interiors that need it.
    const bounce = new THREE.DirectionalLight(0xe0aa77, 0.75);
    bounce.position.set(-sun.position.x, 12, -sun.position.z);
    this.scene.add(bounce);
    this.bounce = bounce;
  }

  setupComposer() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    // SSAO is the most expensive pass by far on a software rasterizer.
    if (!this.lowSpec) {
      const ssao = new SSAOPass(this.scene, this.camera, size.x, size.y);
      ssao.kernelRadius = 0.35;
      ssao.minDistance = 0.0008;
      ssao.maxDistance = 0.12;
      this.composer.addPass(ssao);
      this.ssao = ssao;
    }

    // Subtle bloom only — enough to bloom the sky and hot sand, not a haze.
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y), 0.28, 0.6, 0.92);
    this.composer.addPass(bloom);
    this.bloom = bloom;

    this.composer.addPass(new SMAAPass(size.x, size.y));
    this.composer.addPass(new OutputPass());
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
  }

  render() {
    this.composer.render();
  }
}
