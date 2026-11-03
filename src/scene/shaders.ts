// GLSL for the Noira scene. Everything is procedural: no textures to download.

export const NOISE = /* glsl */ `
  float hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float noise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
  float fbm(vec3 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=0.5; } return v; }
  // distance to the nearest cell point: the bowls of craters
  float cells(vec3 p){ vec3 i=floor(p); vec3 f=fract(p); float m=1.0;
    for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) for(int z=-1;z<=1;z++){
      vec3 g=vec3(x,y,z); vec3 o=vec3(hash(i+g), hash(i+g+7.1), hash(i+g+13.7));
      m=min(m, length(g+o-f)); }
    return m; }
`;

const VIEW_VARYINGS = /* glsl */ `
  varying vec3 vN; varying vec3 vV; varying vec3 vP;
  void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix*mv; }
`;

export const planetVert = VIEW_VARYINGS;
export const planetFrag = /* glsl */ `
  uniform float uTime; uniform float uPulse;
  varying vec3 vN; varying vec3 vV; varying vec3 vP;
  ${NOISE}
  void main(){
    vec3 n = normalize(vN); vec3 v = normalize(vV);
    float ndv = max(dot(n,v), 0.0);
    vec3 L = normalize(vec3(-0.15, 1.0, -0.25));
    float diff = pow(max(dot(n,L), 0.0), 1.4);

    vec3 sp = vP * 0.16;
    float land = fbm(sp*1.6 + vec3(0.0, uTime*0.006, 0.0));
    float detail = fbm(sp*6.0);
    float c = cells(sp*2.2);
    float crater = smoothstep(0.42, 0.25, c) * 0.55 - smoothstep(0.5, 0.42, c) * smoothstep(0.38, 0.45, c) * 0.35;
    float h = land*0.8 + detail*0.25 + crater*0.4;

    vec3 deep = vec3(0.012,0.008,0.035);
    vec3 dusk = vec3(0.17,0.08,0.42);
    vec3 lit  = vec3(0.48,0.32,0.95);
    vec3 col = mix(deep, dusk, smoothstep(0.35, 0.85, h));
    col = mix(col, lit, smoothstep(0.55, 1.05, h) * diff);
    col *= 0.08 + 0.95*diff;

    // haze drifting over the lit hemisphere
    float haze = fbm(sp*2.5 + vec3(uTime*0.01, 0.0, uTime*0.004));
    col += vec3(0.55,0.42,1.0) * smoothstep(0.55, 0.85, haze) * diff * 0.18;

    // atmospheric limb: white at the top, violet down the sides
    float rim = pow(1.0 - ndv, 4.5);
    float top = smoothstep(0.0, 0.95, n.y);
    vec3 limb = mix(vec3(0.42,0.2,1.0), vec3(1.0,0.96,1.0), top);
    col += limb * rim * (0.15 + 1.7*top) * (1.0 + uPulse);
    col += vec3(0.8,0.68,1.0) * pow(1.0 - ndv, 18.0) * 2.2 * (0.25 + top);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export const atmoFrag = /* glsl */ `
  uniform vec3 uColor; uniform float uPulse;
  varying vec3 vN; varying vec3 vV; varying vec3 vP;
  void main(){
    float i = pow(clamp(-dot(vN, vV), 0.0, 1.0), 1.7);
    float top = 0.25 + 0.75*smoothstep(-0.4, 0.95, vN.y);
    gl_FragColor = vec4(uColor * i * top * (0.55 + uPulse), 1.0);
  }
`;

export const flameVert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
export const flameFrag = /* glsl */ `
  uniform float uTime; uniform float uI; uniform float uSeed; uniform float uFoot;
  varying vec2 vUv;
  ${NOISE}
  void main(){
    // the lowest uFoot of the plane is a run-out that fades to nothing, so the
    // plane's edge never shows as a hard line when the hero scrolls up
    float foot = smoothstep(0.0, 1.0, vUv.y / max(uFoot, 0.001));
    vec2 uv = vec2(vUv.x, max(0.0, (vUv.y - uFoot) / (1.0 - uFoot)));
    float t = uTime + uSeed*10.0;
    float warp = fbm(vec3(uv.x*2.6, uv.y*1.8 - t*0.45, t*0.12 + uSeed));
    float n = fbm(vec3(uv.x*5.5 + warp*1.8, uv.y*3.0 - t*1.15, t*0.28));
    float ridge = 1.0 - abs(n*2.0 - 1.0);
    float base = pow(1.0 - uv.y, 1.7);
    float xm = smoothstep(0.0, 0.4, uv.x) * smoothstep(1.0, 0.6, uv.x);
    float tongue = smoothstep(0.3, 1.0, ridge*base*1.35 + base*0.5 - 0.2) * xm;
    float core = smoothstep(0.75, 1.0, tongue);
    vec3 c = mix(vec3(0.28,0.06,0.9), vec3(0.85,0.42,1.0), tongue);
    c = mix(c, vec3(1.0,0.94,1.0), core);
    float a = tongue * foot * uI;
    gl_FragColor = vec4(c * a * 1.35, 1.0);
  }
`;

/** Full-screen silk swirl that also draws the framed "screen" from the reference. */
export const swirlVert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`;
export const swirlFrag = /* glsl */ `
  uniform float uTime; uniform vec2 uRes; uniform vec4 uFrame; uniform float uRadius;
  uniform float uOuter; uniform float uInner; uniform float uEdge;
  varying vec2 vUv;
  ${NOISE}
  float sdRoundBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
  void main(){
    vec2 px = vec2(vUv.x*uRes.x, (1.0 - vUv.y)*uRes.y);
    vec2 p = (vUv - 0.5) * vec2(uRes.x/uRes.y, 1.0) * 2.0;
    float t = uTime * 0.035;
    vec2 q = vec2(fbm(vec3(p*0.7, t)), fbm(vec3(p*0.7 + 5.2, t)));
    vec2 r = vec2(fbm(vec3(p*0.9 + 3.2*q + vec2(1.7, 9.2), t*1.3)), fbm(vec3(p*0.9 + 3.2*q + vec2(8.3, 2.8), t*1.1)));
    float f = fbm(vec3(p*0.6 + 2.8*r, t*0.7));
    float band = sin((f*5.0 + r.x*2.4) * 3.14159);
    float silk = pow(smoothstep(0.45, 1.0, band), 4.0);
    float glow = smoothstep(0.32, 0.86, f);

    vec3 deep = vec3(0.016, 0.008, 0.04);
    vec3 vio  = vec3(0.30, 0.11, 0.86);
    vec3 lav  = vec3(0.78, 0.66, 1.0);
    vec3 col = mix(deep, vio*0.65, glow);
    col += vio * pow(glow, 3.0) * 0.7;
    col += lav * silk * (0.12 + glow*0.75);

    vec2 c = uFrame.xy + uFrame.zw*0.5;
    float d = sdRoundBox(px - c, uFrame.zw*0.5, uRadius);
    float outside = smoothstep(-1.0, 1.5, d);
    float k = mix(uInner, uOuter, outside);
    vec3 inner = vec3(0.012, 0.007, 0.03);
    vec3 outc = mix(inner, col, k);
    // a hairline of light where the screen meets the swirl
    outc += vec3(0.7, 0.6, 1.0) * smoothstep(1.6, 0.0, abs(d)) * uEdge;
    // the outer world falls into shadow right next to the frame
    outc *= 1.0 - smoothstep(60.0, 0.0, d) * outside * 0.55 * uOuter;
    gl_FragColor = vec4(outc, 1.0);
  }
`;

export const envVert = /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
export const envFrag = /* glsl */ `
  varying vec3 vDir;
  void main(){
    vec3 d = normalize(vDir);
    vec3 col = vec3(0.012, 0.006, 0.03);
    col += vec3(0.5, 0.36, 1.0) * smoothstep(0.25, 1.0, d.y) * 2.2;
    col += vec3(0.45, 0.12, 1.0) * smoothstep(0.1, -1.0, d.y) * 1.4;
    col += vec3(1.0, 0.95, 1.0) * pow(max(0.0, dot(d, normalize(vec3(-0.5, 0.65, 0.45)))), 28.0) * 10.0;
    col += vec3(0.62, 0.32, 1.0) * pow(max(0.0, dot(d, normalize(vec3(0.85, 0.05, 0.5)))), 9.0) * 3.0;
    col += vec3(0.4, 0.2, 0.9) * pow(max(0.0, dot(d, normalize(vec3(0.0, -0.3, 1.0)))), 6.0) * 1.2;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** Final pass: slight lens fringing, vignette and film grain. */
export const cinemaShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: [1, 1] as [number, number] }, uGrain: { value: 0.045 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; uniform float uGrain;
    varying vec2 vUv;
    void main(){
      vec2 c = vUv - 0.5; float d = dot(c, c);
      vec2 off = c * d * 0.007;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col *= 1.0 - d * 0.85;
      float g = fract(sin(dot(floor(vUv*uRes) + fract(uTime)*91.7, vec2(12.9898, 78.233))) * 43758.5453);
      col += (g - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
