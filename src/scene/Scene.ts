import * as THREE from 'three';
import gsap from 'gsap';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { grainTexture, rng, rockGeometry } from './rock';
import { atmoFrag, cinemaShader, envFrag, envVert, flameFrag, flameVert, planetFrag, planetVert, swirlFrag, swirlVert } from './shaders';

interface Rock {
  mesh: THREE.Mesh;
  base: THREE.Vector3;
  /** fraction down the page for rocks that live below the hero; null for hero rocks */
  frac: number | null;
  off: THREE.Vector2;
  spinAxis: THREE.Vector3;
  spin: number;
  phase: number;
  speed: number;
  size: number;
  appear: number;
  pop: number;
}

export interface FrameState {
  /** the hero screen in CSS pixels */
  rect: { x: number; y: number; w: number; h: number };
  radius: number;
  /** brightness of the silk swirl outside the screen, 0..1 */
  outer: number;
  /** brightness of the swirl inside the screen, 0..1 */
  inner: number;
  edge: number;
}

const FOV = 40;
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));

export class NoiraScene {
  readonly ok: boolean;
  private renderer!: THREE.WebGLRenderer;
  private composer!: EffectComposer;
  private bloom!: UnrealBloomPass;
  private cinema!: ShaderPass;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 400);
  private uTime = { value: 0 };
  private uPulse = { value: 0 };
  private swirl!: THREE.ShaderMaterial;
  private hero = new THREE.Group();
  private planetB = new THREE.Group();
  private flames: THREE.ShaderMaterial[] = [];
  private embers!: THREE.Points;
  private emberVel!: Float32Array;
  private rocks: Rock[] = [];
  private meshes: THREE.Mesh[] = [];
  private ray = new THREE.Raycaster();
  private mouse = { x: 0, y: 0, tx: 0, ty: 0, inside: false };
  private dist = 16;
  private k = 0.01;
  private total = 0;
  private mobile = matchMedia('(max-width: 760px)').matches;
  private reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private intro = { z: 0, rise: 0, flame: 1 };
  private heroRect = { top: 0, height: 1, scale: 1 };
  private crystalCb: ((n: number) => void) | null = null;
  private crystals = 0;
  private last = performance.now();
  private hoverTick = 0;

  constructor(canvas: HTMLCanvasElement) {
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    } catch {
      this.ok = false;
      return;
    }
    this.ok = true;
    const r = this.renderer;
    r.setPixelRatio(Math.min(devicePixelRatio, this.mobile ? 1.5 : 1.6));
    r.setClearColor(0x030208, 1);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;

    this.scene.fog = new THREE.FogExp2(0x05030c, 0.012);
    this.scene.add(this.camera);
    this.buildEnvironment();
    this.buildSwirl();
    this.buildHero();
    this.buildPlanetB();
    this.buildStars();
    this.buildRocks();
    this.buildLights();
    this.buildPost();
    this.layout();
    addEventListener('resize', () => this.layout());
    this.bindInput();
  }

  /* ------------------------------------------------------------------ build */

  private buildEnvironment() {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), new THREE.ShaderMaterial({ vertexShader: envVert, fragmentShader: envFrag, side: THREE.BackSide })));
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(env, 0.02).texture;
    pmrem.dispose();
  }

  private buildSwirl() {
    this.swirl = new THREE.ShaderMaterial({
      uniforms: {
        uTime: this.uTime,
        uRes: { value: new THREE.Vector2(1, 1) },
        uFrame: { value: new THREE.Vector4(0, 0, 1, 1) },
        uRadius: { value: 30 },
        uOuter: { value: 1 },
        uInner: { value: 0 },
        uEdge: { value: 0.35 },
      },
      vertexShader: swirlVert,
      fragmentShader: swirlFrag,
      depthWrite: false,
      depthTest: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.swirl);
    quad.frustumCulled = false;
    quad.renderOrder = -10;
    this.scene.add(quad);
  }

  private planet(radius: number): THREE.Group {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(
      new THREE.SphereGeometry(radius, 160, 120),
      new THREE.ShaderMaterial({ uniforms: { uTime: this.uTime, uPulse: this.uPulse }, vertexShader: planetVert, fragmentShader: planetFrag }),
    ));
    g.add(new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.1, 96, 64),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(0.62, 0.46, 1.0) }, uPulse: this.uPulse },
        vertexShader: planetVert,
        fragmentShader: atmoFrag,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    ));
    return g;
  }

  private buildHero() {
    const p = this.planet(8);
    p.position.set(0, -4.3, -6);
    p.rotation.z = -0.08;
    this.hero.add(p);

    // two layers of flame: a wide soft glow and the bright tongues. Each plane
    // reaches `foot` units further down than the flame itself so it can fade out.
    const foot = 3.5;
    const layers: [number, number, number, number, number][] = [[18, 8, -3.2, 0.2, 0.55], [13, 6.5, -3.9, 0.8, 1.0]];
    for (const [w, h, y, z, seed] of layers) {
      const m = new THREE.ShaderMaterial({
        uniforms: { uTime: this.uTime, uI: { value: 1 }, uSeed: { value: seed }, uFoot: { value: foot / (h + foot) } },
        vertexShader: flameVert, fragmentShader: flameFrag,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h + foot), m);
      mesh.position.set(0, y - foot / 2, z);
      this.flames.push(m);
      this.hero.add(mesh);
    }

    const n = this.mobile ? 140 : 320;
    const pos = new Float32Array(n * 3);
    this.emberVel = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 13;
      pos[i * 3 + 1] = -8 + Math.random() * 9;
      pos[i * 3 + 2] = Math.random() * 4 - 1;
      this.emberVel[i] = 0.35 + Math.random() * 1.2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.embers = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.075, map: this.dotTexture(), color: 0xcdb0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.hero.add(this.embers);
    this.scene.add(this.hero);
  }

  private buildPlanetB() {
    const p = this.planet(9.5);
    p.rotation.z = 0.25;
    this.planetB.add(p);
    this.scene.add(this.planetB);
  }

  private dotTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.28, 'rgba(205,175,255,.8)');
    g.addColorStop(1, 'rgba(110,60,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  private buildStars() {
    const n = this.mobile ? 900 : 2200;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 150;
      pos[i * 3 + 1] = 40 - Math.random() * 340;
      pos[i * 3 + 2] = -25 - Math.random() * 60;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.16, map: this.dotTexture(), color: 0xb9a8ff, transparent: true, opacity: 0.65, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
  }

  private buildRocks() {
    const grain = grainTexture();
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x2a1c66,
      metalness: 0.12,
      roughness: 0.34,
      roughnessMap: grain,
      bumpMap: grain,
      bumpScale: 1.6,
      clearcoat: 1,
      clearcoatRoughness: 0.16,
      flatShading: true,
      envMapIntensity: 1.35,
      sheen: 0.4,
      sheenColor: new THREE.Color(0x8b5cff),
      sheenRoughness: 0.5,
      iridescence: 0.22,
      iridescenceIOR: 1.6,
      emissive: new THREE.Color(0x0c0428),
    });
    const detail = this.mobile ? 3 : 4;
    const shapes = Array.from({ length: 7 }, (_, i) => rockGeometry(31 + i * 17, i < 4 ? detail : 3));

    const aspect = innerWidth / innerHeight;
    const xs = Math.max(0.5, Math.min(1, aspect / 1.5));
    // the crystals of the reference shot: two either side of the title, two big ones at the foot, small debris above the planet
    const hero: [number, number, number, number][] = this.mobile
      ? [[-3.1, -1.5, 2.5, 0.55], [3.0, 1.7, 1, 0.36], [-3.6, -5.4, 3.2, 1.05], [3.8, -5.2, 2.6, 0.95], [1.4, 4.9, -2, 0.22]]
      : [[-5.8, -0.7, 2.6, 0.8], [5.2, -0.3, 1.6, 0.55], [-7.6, -4.2, 3.6, 1.45], [7.7, -4.4, 3.2, 1.3], [3.4, 3.6, -1, 0.26], [-3.9, 4.3, -3, 0.32], [9.8, 1.8, -2, 0.48], [-10.2, 2.4, -4, 0.6]];
    const add = (x: number, y: number, z: number, s: number, i: number, frac: number | null) => {
      const r = rng(900 + i);
      const mesh = new THREE.Mesh(shapes[i % shapes.length], material);
      mesh.rotation.set(r() * 6.28, r() * 6.28, r() * 6.28);
      mesh.scale.setScalar(s);
      this.scene.add(mesh);
      this.meshes.push(mesh);
      this.rocks.push({
        mesh, base: new THREE.Vector3(x, y, z), frac, off: new THREE.Vector2(),
        spinAxis: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(),
        spin: 0, phase: r() * 6.28, speed: 0.35 + r() * 0.45, size: s, appear: 1, pop: 1,
      });
    };
    hero.forEach((d, i) => add(d[0], d[1], d[2], d[3], i, null));
    const below = this.mobile ? 12 : 24;
    for (let i = 0; i < below; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (this.mobile ? 2.1 + Math.random() * 2.3 : (5.2 + Math.random() * 5.5) * xs);
      add(x, 0, Math.random() * 8 - 5, 0.22 + Math.random() * 1.15, i + 3, (i + Math.random() * 0.8) / below);
    }
  }

  private buildLights() {
    this.scene.add(new THREE.AmbientLight(0x2c1f66, 0.5));
    const key = new THREE.DirectionalLight(0xe6dcff, 2.6);
    key.position.set(-4, 10, -3);
    this.scene.add(key);
    const flame = new THREE.PointLight(0x8a4dff, 110, 0, 2);
    flame.position.set(0, -5.5, 3);
    this.hero.add(flame);
    const magenta = new THREE.PointLight(0xc55cff, 45, 0, 2);
    magenta.position.set(8, -1, 5);
    this.scene.add(magenta);
    const follow = new THREE.PointLight(0xb39bff, 38, 0, 2);
    follow.position.set(-5, 6, -8);
    this.camera.add(follow);
  }

  private buildPost() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), this.mobile ? 0.5 : 1.05, this.mobile ? 0.45 : 0.62, this.mobile ? 0.55 : 0.4);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.cinema = new ShaderPass(cinemaShader);
    this.composer.addPass(this.cinema);
  }

  /* ----------------------------------------------------------------- layout */

  layout() {
    const w = innerWidth, h = innerHeight, a = w / h;
    this.camera.aspect = a;
    this.dist = 16 * Math.min(1.7, Math.max(1, 0.75 / a));
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w, h);
    (this.swirl.uniforms.uRes!.value as THREE.Vector2).set(w, h);
    this.cinema.uniforms.uRes!.value = [w, h];
    this.k = (2 * this.dist * TAN / h) * 0.6;
    this.total = Math.max(0, document.documentElement.scrollHeight - h) * this.k;
    for (const r of this.rocks) if (r.frac !== null) r.base.y = -9 - r.frac * (this.total + 2);
    const fin = document.getElementById('open');
    const finScroll = fin ? fin.offsetTop + fin.offsetHeight * 0.5 - h / 2 : this.total / this.k;
    this.planetB.position.set(0, -finScroll * this.k - 12.6, -8);
  }

  private bindInput() {
    addEventListener('pointermove', e => {
      this.mouse.tx = (e.clientX / innerWidth) * 2 - 1;
      this.mouse.ty = -((e.clientY / innerHeight) * 2 - 1);
      this.mouse.inside = true;
    }, { passive: true });
    document.addEventListener('pointerleave', () => { this.mouse.inside = false; });
    addEventListener('click', e => {
      if (this.busy(e.target)) return;
      const r = this.hit(e.clientX, e.clientY);
      if (!r) return;
      r.spin = 10;
      gsap.fromTo(r, { pop: 1.3 }, { pop: 1, duration: 1.1, ease: 'elastic.out(1, 0.45)' });
      this.crystalCb?.(++this.crystals);
    });
  }

  private busy(el: EventTarget | null): boolean {
    return el instanceof Element && !!el.closest('a,button,input,textarea,select,label,iframe,pre,.panel,.install,.hero-copy');
  }

  private hit(cx: number, cy: number): Rock | null {
    this.ray.setFromCamera(new THREE.Vector2((cx / innerWidth) * 2 - 1, -((cy / innerHeight) * 2 - 1)), this.camera);
    const h = this.ray.intersectObjects(this.meshes, false)[0];
    return h ? this.rocks.find(r => r.mesh === h.object) ?? null : null;
  }

  /* ------------------------------------------------------------- public API */

  onCrystal(cb: (n: number) => void) { this.crystalCb = cb; }

  /** Where the hero screen is on the page, so the planet and the swirl's frame follow it. */
  setFrame(f: FrameState) {
    const u = this.swirl.uniforms;
    (u.uFrame!.value as THREE.Vector4).set(f.rect.x, f.rect.y, f.rect.w, f.rect.h);
    u.uRadius!.value = f.radius;
    u.uOuter!.value = f.outer;
    u.uInner!.value = f.inner;
    u.uEdge!.value = f.edge;
    this.heroRect.top = f.rect.y;
    this.heroRect.height = f.rect.h;
    this.heroRect.scale = f.rect.w / Math.max(1, innerWidth - 28);
  }

  /** A brief flare of the planet's limb, e.g. when a launch escapes as signal. */
  pulse(strength = 1.2) {
    gsap.fromTo(this.uPulse, { value: strength }, { value: 0, duration: 1.8, ease: 'power3.out' });
  }

  /** Opening shot: the camera falls in, the planet rises, the crystals assemble. */
  introTimeline(): gsap.core.Timeline {
    const tl = gsap.timeline();
    if (this.reduce) return tl;
    this.intro.z = 26; this.intro.rise = -5; this.intro.flame = 0;
    this.rocks.forEach(r => { r.appear = 0; });
    tl.to(this.intro, { z: 0, duration: 2.6, ease: 'expo.out' }, 0)
      .to(this.intro, { rise: 0, duration: 2.4, ease: 'expo.out' }, 0.15)
      .to(this.intro, { flame: 1, duration: 1.8, ease: 'power2.out' }, 0.6)
      .to(this.rocks.map(r => r), { appear: 1, duration: 1.6, ease: 'back.out(1.6)', stagger: 0.05 }, 0.5);
    return tl;
  }

  render() {
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    const t = this.reduce ? 4 : now / 1000;
    this.uTime.value = t;
    this.cinema.uniforms.uTime!.value = t;

    const m = this.mouse;
    m.x += (m.tx - m.x) * 0.045;
    m.y += (m.ty - m.y) * 0.045;
    const mx = this.reduce ? 0 : m.x, my = this.reduce ? 0 : m.y;
    const baseY = -scrollY * this.k;
    this.camera.position.set(mx * 0.9, baseY + my * 0.5, this.dist + this.intro.z);
    this.camera.lookAt(mx * 0.25, baseY, 0);

    // the hero group rides with the hero screen in the page
    const wpp = (2 * (this.dist + 3) * TAN) / innerHeight;
    const offPx = this.heroRect.top + this.heroRect.height / 2 - innerHeight / 2;
    this.hero.position.y = baseY - offPx * wpp + this.intro.rise;
    this.hero.scale.setScalar(this.heroRect.scale);
    this.hero.children[0]!.rotation.y = t * 0.018;
    this.planetB.rotation.y = -t * 0.012;
    // the flame burns at the foot of the hero screen and dies down as that screen leaves
    const heroBottom = (this.heroRect.top + this.heroRect.height) / innerHeight;
    const flameLife = THREE.MathUtils.smoothstep(heroBottom, 0.15, 0.85);
    // on a narrow screen the flame planes are wider than the view and their glow washes over everything
    const flameGain = this.camera.aspect < 0.8 ? 0.35 : 1;
    for (const f of this.flames) f.uniforms.uI!.value = this.intro.flame * flameLife * flameGain;
    (this.embers.material as THREE.PointsMaterial).opacity = this.intro.flame * flameLife;

    const tmp = new THREE.Vector3();
    for (const r of this.rocks) {
      tmp.copy(r.mesh.position).project(this.camera);
      const dx = tmp.x - m.tx, dy = tmp.y - m.ty;
      const d = Math.hypot(dx * this.camera.aspect, dy);
      const R = 0.3;
      let ox = 0, oy = 0;
      if (m.inside && !this.reduce && d < R && tmp.z < 1) {
        const f = ((R - d) / R) * 1.7;
        ox = (dx / (d || 1)) * f; oy = (dy / (d || 1)) * f;
      }
      r.off.x += (ox - r.off.x) * 0.06;
      r.off.y += (oy - r.off.y) * 0.06;
      const bob = Math.sin(t * r.speed + r.phase) * 0.22;
      r.mesh.position.set(r.base.x + r.off.x, r.base.y + r.off.y + bob - (1 - r.appear) * 3, r.base.z);
      r.mesh.scale.setScalar(r.size * Math.max(0.001, r.appear) * r.pop);
      if (!this.reduce) r.mesh.rotateOnAxis(r.spinAxis, dt * (0.12 + r.spin));
      r.spin *= 0.965;
    }

    if (!this.reduce) {
      const p = this.embers.geometry.attributes.position!.array as Float32Array;
      for (let i = 0; i < this.emberVel.length; i++) {
        p[i * 3 + 1] += this.emberVel[i]! * dt;
        p[i * 3] += Math.sin(t * 1.3 + i) * dt * 0.15;
        if (p[i * 3 + 1]! > 2.5) { p[i * 3 + 1] = -8; p[i * 3] = (Math.random() - 0.5) * 13; }
      }
      this.embers.geometry.attributes.position!.needsUpdate = true;
    }

    if ((this.hoverTick++ & 3) === 0 && m.inside) {
      const el = document.elementFromPoint(((m.tx + 1) / 2) * innerWidth, ((1 - m.ty) / 2) * innerHeight);
      const over = !this.busy(el) && !!this.hit(((m.tx + 1) / 2) * innerWidth, ((1 - m.ty) / 2) * innerHeight);
      document.body.classList.toggle('over-crystal', over);
    }

    this.composer.render();
  }
}
