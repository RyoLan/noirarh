import * as THREE from 'three';

/** Small deterministic RNG so every rock keeps its shape between reloads. */
export function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash3(x: number, y: number, z: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}
function fbm3(x: number, y: number, z: number): number {
  let v = 0, a = 0.5;
  for (let i = 0; i < 4; i++) { v += a * noise3(x, y, z); x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; }
  return v;
}

/**
 * A rock chipped out of a sphere: the radius in every direction is the nearest
 * of a dozen random cutting planes, which leaves broad flat facets and sharp
 * edges like broken amethyst, then a little noise roughens the faces.
 */
export function rockGeometry(seed: number, detail = 4): THREE.BufferGeometry {
  const r = rng(seed);
  const planes: { n: THREE.Vector3; d: number }[] = [];
  const count = 10 + Math.floor(r() * 8);
  for (let i = 0; i < count; i++) {
    const n = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize();
    planes.push({ n, d: 0.66 + r() * 0.34 });
  }
  const stretch = new THREE.Vector3(1, 0.7 + r() * 0.3, 0.8 + r() * 0.35);
  const off = r() * 100;

  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const d = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    let rad = 1.2;
    for (const p of planes) {
      const k = d.dot(p.n);
      if (k > 0.02) rad = Math.min(rad, p.d / k);
    }
    rad *= 1 + (fbm3(d.x * 3 + off, d.y * 3, d.z * 3) - 0.5) * 0.09 + (noise3(d.x * 14, d.y * 14 + off, d.z * 14) - 0.5) * 0.025;
    d.multiplyScalar(rad).multiply(stretch);
    pos.setXYZ(i, d.x, d.y, d.z);
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/** Grainy height field used as the rocks' bump and roughness map. */
export function grainTexture(size = 512): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm3(x / 38, y / 38, 0.5) * 0.7 + noise3(x / 5, y / 5, 3.1) * 0.3;
      const v = Math.max(0, Math.min(255, n * 255));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}
