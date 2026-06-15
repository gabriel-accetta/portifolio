import * as THREE from "three";

/**
 * A subtle, near-monochrome interactive starfield for the hero.
 * - Stars twinkle softly and drift with parallax as the pointer moves.
 * - Stars near the cursor brighten (illumination) and gain a faint warm tint.
 * - Faint constellation lines weave between the nearest stars around the cursor.
 * Designed to stay discreet: white/warm whites with one restrained accent.
 */

type Options = { reduceMotion: boolean };

const VERT = /* glsl */ `
  uniform float uTime;
  uniform vec2  uMouse;     // pointer in NDC (-1..1)
  uniform float uRadius;    // glow radius (NDC, aspect corrected)
  uniform float uAspect;
  uniform float uSize;      // global size multiplier
  uniform float uPixelRatio;

  attribute float aSize;
  attribute float aPhase;
  attribute float aBright;

  varying float vBright;
  varying float vGlow;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vec4 clip = projectionMatrix * mvPosition;

    vec2 ndc = clip.xy / clip.w;
    vec2 d = vec2((ndc.x - uMouse.x) * uAspect, ndc.y - uMouse.y);
    float glow = 1.0 - smoothstep(0.0, uRadius, length(d));
    vGlow = glow;

    float tw = 0.6 + 0.4 * sin(uTime * (0.4 + aPhase * 0.6) + aPhase * 6.2831);
    float bright = aBright * tw + glow * 0.7;
    vBright = bright;

    float size = aSize * uSize * (1.0 + glow * 1.1);
    gl_PointSize = size * uPixelRatio * (34.0 / -mvPosition.z);
    gl_Position = clip;
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uColorA;  // warm white
  uniform vec3 uColorB;  // faint amber (near cursor)
  varying float vBright;
  varying float vGlow;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.0, d);
    float alpha = soft * clamp(vBright, 0.0, 1.5);
    vec3 col = mix(uColorA, uColorB, vGlow * 0.45);
    gl_FragColor = vec4(col, alpha);
  }
`;

export class Starfield {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private group: THREE.Group;
  private points!: THREE.Points;
  private material!: THREE.ShaderMaterial;

  private lines!: THREE.LineSegments;
  private lineGeo!: THREE.BufferGeometry;
  private lineMax = 80; // max vertices
  private candidatePositions: THREE.Vector3[] = [];

  private lastTime = 0;
  private elapsed = 0;
  private raf = 0;
  private running = false;
  private reduceMotion: boolean;
  private coarse: boolean;

  private mouseNDC = new THREE.Vector2(0, 0);
  private targetNDC = new THREE.Vector2(0, 0);
  private parallax = new THREE.Vector2(0, 0);
  private lastPointerMove = -10;

  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private cursorWorld = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, opts: Options) {
    this.canvas = canvas;
    this.reduceMotion = opts.reduceMotion;
    this.coarse = window.matchMedia("(pointer: coarse)").matches;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    this.camera.position.z = 6;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.buildStars();
    this.buildLines();
    this.resize();

    window.addEventListener("resize", this.resize, { passive: true });
    window.addEventListener("pointermove", this.onPointerMove, { passive: true });

    // Pause rendering when the hero scrolls out of view.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) this.start();
          else this.stop();
        }
      },
      { threshold: 0 }
    );
    io.observe(canvas);

    this.start();
  }

  private get count() {
    if (this.coarse) return 520;
    return window.innerWidth < 1100 ? 900 : 1500;
  }

  private buildStars() {
    const count = this.count;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const brights = new Float32Array(count);

    const spreadX = 16;
    const spreadY = 11;

    for (let i = 0; i < count; i++) {
      const x = (Math.random() * 2 - 1) * spreadX;
      const y = (Math.random() * 2 - 1) * spreadY;
      const z = -Math.random() * 10 - 4; // -4 .. -14
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      // Mostly tiny stars, a few brighter ones.
      const big = Math.random() < 0.07;
      sizes[i] = big ? 1.0 + Math.random() * 1.4 : 0.3 + Math.random() * 0.6;
      phases[i] = Math.random();
      brights[i] = big ? 0.8 + Math.random() * 0.35 : 0.32 + Math.random() * 0.4;

      // Use the closer, brighter stars as constellation candidates.
      if (big && z > -7 && this.candidatePositions.length < 130) {
        this.candidatePositions.push(new THREE.Vector3(x, y, z));
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geo.setAttribute("aBright", new THREE.BufferAttribute(brights, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMouse: { value: new THREE.Vector2(0, 0) },
        uRadius: { value: 0.34 },
        uAspect: { value: 1 },
        uSize: { value: 1 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uColorA: { value: new THREE.Color(0xf3eee2) },
        uColorB: { value: new THREE.Color(0xe2603a) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, this.material);
    this.group.add(this.points);
  }

  private buildLines() {
    this.lineGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(this.lineMax * 3);
    const col = new Float32Array(this.lineMax * 3);
    this.lineGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.lineGeo.setAttribute("color", new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    this.lineGeo.setDrawRange(0, 0);

    const mat = new THREE.LineBasicMaterial({
      transparent: true,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.9,
    });

    this.lines = new THREE.LineSegments(this.lineGeo, mat);
    this.lines.frustumCulled = false;
    this.scene.add(this.lines);
  }

  private onPointerMove = (e: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    this.targetNDC.set(x, y);
    this.lastPointerMove = this.elapsed;
  };

  private resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.material.uniforms.uAspect.value = w / h;
    this.material.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
  };

  private updateConstellation(strength: number) {
    if (this.coarse || this.reduceMotion || strength < 0.02) {
      this.lineGeo.setDrawRange(0, 0);
      return;
    }

    // Cursor anchor on the z=0 plane in world space.
    this.raycaster.setFromCamera(this.mouseNDC, this.camera);
    this.raycaster.ray.intersectPlane(this.plane, this.cursorWorld);

    this.group.updateMatrixWorld();
    const m = this.group.matrixWorld;
    const aspect = this.material.uniforms.uAspect.value as number;
    const selRadius = 0.3;

    type Near = { world: THREE.Vector3; dist: number };
    const near: Near[] = [];
    const tmp = new THREE.Vector3();
    const ndc = new THREE.Vector3();

    for (const base of this.candidatePositions) {
      tmp.copy(base).applyMatrix4(m);
      ndc.copy(tmp).project(this.camera);
      const dx = (ndc.x - this.mouseNDC.x) * aspect;
      const dy = ndc.y - this.mouseNDC.y;
      const dist = Math.hypot(dx, dy);
      if (dist < selRadius) near.push({ world: tmp.clone(), dist });
    }

    near.sort((a, b) => a.dist - b.dist);
    const picked = near.slice(0, 6);

    const posAttr = this.lineGeo.getAttribute("position") as THREE.BufferAttribute;
    const colAttr = this.lineGeo.getAttribute("color") as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;
    const colArr = colArr_(colAttr);
    let v = 0;

    const pushSeg = (a: THREE.Vector3, b: THREE.Vector3, intensity: number) => {
      if ((v + 2) * 3 > posArr.length) return;
      posArr[v * 3] = a.x; posArr[v * 3 + 1] = a.y; posArr[v * 3 + 2] = a.z;
      // warm white fading with proximity / intensity
      const c = intensity;
      colArr[v * 3] = 0.92 * c; colArr[v * 3 + 1] = 0.78 * c; colArr[v * 3 + 2] = 0.6 * c;
      v++;
      posArr[v * 3] = b.x; posArr[v * 3 + 1] = b.y; posArr[v * 3 + 2] = b.z;
      colArr[v * 3] = 0.92 * c; colArr[v * 3 + 1] = 0.78 * c; colArr[v * 3 + 2] = 0.6 * c;
      v++;
    };

    for (let i = 0; i < picked.length; i++) {
      const fade = (1 - picked[i].dist / selRadius) * strength;
      pushSeg(this.cursorWorld, picked[i].world, fade * 1.05);
      if (i > 0) {
        const chain = (1 - picked[i].dist / selRadius) * strength * 0.7;
        pushSeg(picked[i - 1].world, picked[i].world, chain);
      }
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    this.lineGeo.setDrawRange(0, v);
  }

  private render = () => {
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    this.elapsed += dt;
    const t = this.elapsed;

    // Idle auto-drift when the pointer is quiet (and on touch).
    const idle = t - this.lastPointerMove > 2.2;
    if (idle || this.coarse) {
      this.targetNDC.set(Math.sin(t * 0.12) * 0.55, Math.cos(t * 0.09) * 0.4);
    }

    // Smooth the pointer + parallax.
    const ease = this.reduceMotion ? 1 : 1 - Math.pow(0.0015, dt);
    this.mouseNDC.lerp(this.targetNDC, ease);
    this.parallax.lerp(this.targetNDC, 1 - Math.pow(0.002, dt));

    this.material.uniforms.uTime.value = this.reduceMotion ? 0 : t;
    (this.material.uniforms.uMouse.value as THREE.Vector2).copy(this.mouseNDC);

    if (!this.reduceMotion) {
      this.group.rotation.y = this.parallax.x * 0.14;
      this.group.rotation.x = -this.parallax.y * 0.1;
      this.group.position.x = this.parallax.x * 0.5;
      this.group.position.y = this.parallax.y * 0.3;
    }

    // Constellation strength fades out when pointer is idle.
    const strength = idle ? 0 : 1;
    this.updateConstellation(strength);

    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.render);
  };

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.render);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  dispose() {
    this.stop();
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("pointermove", this.onPointerMove);
    this.renderer.dispose();
    this.points.geometry.dispose();
    this.material.dispose();
    this.lineGeo.dispose();
    (this.lines.material as THREE.Material).dispose();
  }
}

// Small helper to satisfy the type checker for the color attribute array.
function colArr_(attr: THREE.BufferAttribute): Float32Array {
  return attr.array as Float32Array;
}
