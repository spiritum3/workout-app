import * as THREE from './vendor/three.module.js';

const ACCENT = 0xc4102f, HOT = 0xff2a52, AMBER = 0xff6f8a, INK = 0x0c0d0f;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

class Stage extends HTMLElement {
  connectedCallback() {
    if (this._on) return; this._on = true;
    this.style.cssText += ';display:block;width:100%;height:100%';
    const w = this.clientWidth || 300, h = this.clientHeight || 300;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.15;
    r.setSize(w, h, false);
    r.domElement.style.cssText = 'width:100%;height:100%;display:block';
    this.appendChild(r.domElement);
    const cam = this.camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 100);
    const sc = this.scene = new THREE.Scene();
    sc.add(new THREE.AmbientLight(0xffffff, 0.35));
    const KEY = this.keyColor || HOT, FILL = this.fillColor || AMBER;
    const k = new THREE.PointLight(KEY, 60, 30); k.position.set(3, 4, 5); sc.add(k);
    const f = new THREE.PointLight(FILL, 22, 30); f.position.set(-4, -3, 3); sc.add(f);
    const rim = new THREE.DirectionalLight(0x9aa8ff, 1.4); rim.position.set(-2, 2, -4); sc.add(rim);
    this.build(sc, cam);
    this._ro = new ResizeObserver(() => {
      const W = this.clientWidth, H = this.clientHeight;
      if (!W || !H) return;
      r.setSize(W, H, false); cam.aspect = W / H; cam.updateProjectionMatrix();
      this.fit && this.fit();
    });
    this._ro.observe(this);
    const t0 = performance.now();
    const loop = (t) => {
      this._raf = requestAnimationFrame(loop);
      const time = (t - t0) / 1000;
      if (!reduced || !this._settled) this.tick(time);
      if (reduced) this._settled = true;
      r.render(sc, cam);
    };
    this._raf = requestAnimationFrame(loop);
  }
  disconnectedCallback() {
    cancelAnimationFrame(this._raf); this._ro && this._ro.disconnect();
    this.renderer && this.renderer.dispose(); this._on = false; this.innerHTML = '';
  }
  build() {} tick() {}
}

const mat = (o) => new THREE.MeshStandardMaterial(o);

/* ── The gauge: a channel around the core, filled with liquid ─────
   The weekly percentage is the level; the liquid flows, glows and
   keeps a hot head where it stops.                                 */
const RING_VERT = `
varying vec2 vP;
void main(){
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const RING_FRAG = `
varying vec2 vP;
uniform vec3 cDeep, cMid, cHot, cEdge, cDone, cTrack;
uniform float uTime, uFill, uDone, uTrack, uInner, uOuter;
#define TAU 6.28318530718

void main(){
  float r  = length(vP);
  float rt = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
  /* s: 0 at the top, growing clockwise */
  float s  = fract((1.57079632679 - atan(vP.y, vP.x)) / TAU);

  /* cross-section: full in the middle, fading at the lips → reads as a tube */
  float body = 1.0 - pow(abs(rt * 2.0 - 1.0), 1.9);
  float lips = smoothstep(0.0, 0.07, rt) * smoothstep(1.0, 0.93, rt);

  if (uTrack > 0.5) {
    float wall = smoothstep(0.16, 0.03, rt) + smoothstep(0.84, 0.97, rt);
    float a = 0.40 * (0.30 + 0.70 * body) + 0.20 * wall;
    gl_FragColor = vec4(mix(cTrack * 0.05, cTrack * 0.50, wall), clamp(a, 0.0, 1.0));
    return;
  }

  float fill = clamp(uFill, 0.0, 1.0);
  fill += (fill > 0.004 && fill < 0.998) ? sin(uTime * 2.4) * 0.0045 : 0.0;  /* slosh */
  float head = max(fill - s, 0.0);

  /* flow: waves along the channel + churn across it */
  float flow = sin(s * 11.0 - uTime * 1.55) * 0.50
             + sin(s * 19.0 + uTime * 0.95 + rt * 2.6) * 0.30
             + sin(rt * 6.0 - uTime * 1.25) * 0.20;
  flow = flow * 0.5 + 0.5;

  float prog = fill > 0.001 ? clamp(s / fill, 0.0, 1.0) : 0.0;
  vec3 col = mix(cDeep, cMid, smoothstep(0.0, 0.62, prog));
  col = mix(col, cHot, smoothstep(0.5, 1.0, prog));
  col = mix(col, cHot * 1.2, flow * 0.5);
  col += cEdge * exp(-pow((rt - 0.34) * 5.2, 2.0)) * 0.42;   /* sheen */
  col += cEdge * exp(-pow((rt - 0.52) * 3.2, 2.0)) * 0.26;   /* lit core of the stream */
  float bub = sin(s * 46.0 - uTime * 3.1 + sin(s * 8.0 + uTime * 0.8) * 2.2)
            * sin(rt * 3.14159 + uTime * 0.7);
  col += cEdge * pow(max(bub, 0.0), 7.0) * 0.85;              /* bubbles */
  col += cEdge * exp(-head * 46.0) * 1.25;                    /* hot head */
  col = mix(col, mix(cDone, vec3(1.0), 0.22), uDone);

  float eps  = 0.0035;
  float mask = fill >= 0.999 ? 1.0
             : smoothstep(fill + eps, fill - eps, s) * smoothstep(0.0, 0.008, s);
  float a = mask * lips * (0.24 + 0.92 * body) * (0.85 + 0.30 * flow);
  gl_FragColor = vec4(col * a, a);
}`;

/* ── LiftMate: the weekly-progress core ──────────────────────────── */
class Core extends Stage {
  static observedAttributes = ['value'];
  get keyColor() { return 0xff6b86; }
  get fillColor() { return 0x8e0f28; }
  attributeChangedCallback() {
    this._target = parseFloat(this.getAttribute('value') || 0) / 100;
    this._settled = false;
  }
  build(sc, cam) {
    this._target = parseFloat(this.getAttribute('value') || 0) / 100;
    this._p = 0;
    const g = this.g = new THREE.Group(); sc.add(g);
    const R = 2.25;

    // glass bubble
    const shellMat = new THREE.MeshPhysicalMaterial({ name: 'shell', color: 0x0a0a0c, roughness: .05, metalness: 0,
      transparent: true, opacity: .14, transmission: 0, thickness: .8, ior: 1.35, side: THREE.DoubleSide, depthWrite: false });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 64), shellMat);
    shell.name = 'core-shell'; g.add(shell); this.shell = shell;

    const rimRing = new THREE.Mesh(new THREE.TorusGeometry(R + .002, .005, 10, 320),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(rimRing); this.rimRing = rimRing;

    // swirling veils inside the orb
    const wire = new THREE.Group(); g.add(wire); this.wire = wire;
    const veilSpec = [
      [.990, 0xffffff, .10, 0.0, 2.6, 0.62, 0.42, .12],
      [.950, 0xe8194a, .14, 1.4, 2.4, 1.05, 0.55, -.16],
      [.900, 0xffffff, .07, 2.9, 3.0, 0.40, 0.38, .09],
      [.850, 0xb01234, .13, 4.2, 2.6, 1.30, 0.50, -.11],
      [.780, 0xffffff, .06, 5.3, 2.8, 0.85, 0.34, .14],
      [.700, 0xff2a52, .11, 0.7, 2.5, 1.55, 0.46, -.20],
      [.600, 0xffd8e0, .06, 3.6, 2.2, 0.70, 0.36, .18],
    ];
    this.veils = [];
    for (const [f, c, o, ps, pl, ts, tl, sp] of veilSpec) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(R * f, 72, 36, ps, pl, ts, tl),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending, depthWrite: false }));
      const holder = new THREE.Group();
      holder.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      holder.add(m); wire.add(holder);
      this.veils.push({ holder, speed: sp, base: o });
    }

    const inner = new THREE.Mesh(new THREE.SphereGeometry(.2, 48, 48),
      mat({ name: 'plasma', color: 0x1a0308, emissive: 0xffdfe6, emissiveIntensity: 1.5, roughness: .3, metalness: .1 }));
    g.add(inner); this.inner = inner;

    const corona = new THREE.Mesh(new THREE.SphereGeometry(R * 1.2, 64, 64),
      new THREE.MeshBasicMaterial({ color: 0xff5570, transparent: true, opacity: .05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide }));
    g.add(corona); this.corona = corona;

    // soft bloom behind the orb
    const cv = document.createElement('canvas'); cv.width = cv.height = 512;
    const cx = cv.getContext('2d');
    const grd = cx.createRadialGradient(256, 256, 0, 256, 256, 256);
    grd.addColorStop(0, 'rgba(255,120,150,.5)'); grd.addColorStop(.4, 'rgba(210,25,70,.16)'); grd.addColorStop(1, 'rgba(160,10,40,0)');
    cx.fillStyle = grd; cx.fillRect(0, 0, 512, 512);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(cv), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: .2 }));
    glow.scale.set(4.6, 4.6, 1); glow.position.z = -1; g.add(glow); this.glow = glow;

    // the gauge: a channel around the orb, filled with liquid
    const RIN = R * 1.138, ROUT = R * 1.238, AR = (RIN + ROUT) / 2; this._AR = AR;
    const ringGeo = new THREE.RingGeometry(RIN, ROUT, 220, 1);
    const ringUniforms = () => ({
      uTime: { value: 0 }, uFill: { value: 0 }, uDone: { value: 0 }, uTrack: { value: 0 },
      uInner: { value: RIN }, uOuter: { value: ROUT },
      cDeep: { value: new THREE.Color(0x7a0c22) },
      cMid: { value: new THREE.Color(0xff2a52) },
      cHot: { value: new THREE.Color(0xff8098) },
      cEdge: { value: new THREE.Color(0xffe6ec) },
      cDone: { value: new THREE.Color(0x30d158) },
      cTrack: { value: new THREE.Color(0xd8dbe6) }
    });
    const ringMaterial = () => new THREE.ShaderMaterial({
      vertexShader: RING_VERT, fragmentShader: RING_FRAG, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: ringUniforms()
    });
    this.trackMat = ringMaterial();
    this.trackMat.uniforms.uTrack.value = 1;
    this.trackMat.blending = THREE.NormalBlending;
    const track = new THREE.Mesh(ringGeo, this.trackMat); track.renderOrder = 3; g.add(track);
    this.ringMat = ringMaterial();
    this.ring = new THREE.Mesh(ringGeo, this.ringMat); this.ring.renderOrder = 4; g.add(this.ring);

    // the head of the liquid
    this.tip = new THREE.Mesh(new THREE.SphereGeometry(.03, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.tip.renderOrder = 5; g.add(this.tip);
    this.tipHalo = new THREE.Mesh(new THREE.SphereGeometry(.165, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0xff8fa4, transparent: true, opacity: .3, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tipHalo.renderOrder = 5; g.add(this.tipHalo);

    // nothing may leave the card, at any width
    this._fitR = ROUT + .16;
    this.fit();
  }

  /* pull the camera back until the gauge fits both axes */
  fit() {
    const cam = this.camera; if (!cam || !this._fitR) return;
    const half = Math.tan(cam.fov * Math.PI / 360);
    cam.position.z = Math.max(this._fitR / half, this._fitR / (half * cam.aspect));
    cam.updateProjectionMatrix();
  }
  tick(t) {
    this._p += (this._target - this._p) * (reduced ? 1 : .06);
    const AR = this._AR, u = this.ringMat.uniforms;
    u.uTime.value = t; u.uFill.value = this._p;
    u.uDone.value += ((this._target >= .999 ? 1 : 0) - u.uDone.value) * (reduced ? 1 : .05);
    this.trackMat.uniforms.uTime.value = t;
    const ang = Math.PI / 2 - Math.max(.012, this._p * Math.PI * 2);
    this.tip.position.set(Math.cos(ang) * AR, Math.sin(ang) * AR, 0);
    this.tip.material.color.setHex(this._p >= .999 ? 0xd9ffe4 : 0xffffff);
    this.tipHalo.material.color.setHex(this._p >= .999 ? 0x30d158 : 0xff8fa4);
    this.tipHalo.position.copy(this.tip.position);
    this.tipHalo.scale.setScalar(1 + Math.sin(t * 2.2) * .2);
    this.tipHalo.material.opacity = .26 + Math.sin(t * 2.2) * .08;
    const b = 1 + Math.sin(t * 1.1) * .022;
    this.shell.scale.setScalar(b); this.wire.scale.setScalar(b); this.rimRing.scale.setScalar(b);
    this.shell.rotation.y = t * .1; this.wire.rotation.y = t * .1;
    this.shell.rotation.x = Math.sin(t * .18) * .09; this.wire.rotation.x = this.shell.rotation.x;
    for (let i = 0; i < this.veils.length; i++) {
      const v = this.veils[i];
      v.holder.rotation.y += v.speed * .006;
      v.holder.rotation.z = Math.sin(t * .18 + i) * .5;
      v.holder.children[0].material.opacity = v.base * (.75 + .35 * Math.sin(t * .7 + i * 1.3));
    }
    this.rimRing.material.opacity = .5 + Math.sin(t * 1.1) * .12;
    this.corona.scale.setScalar(1 + Math.sin(t * 1.1) * .02);
    this.corona.material.opacity = .022 + Math.sin(t * 1.1 + .4) * .01;
    this.inner.scale.setScalar(1 + Math.sin(t * 1.1 + .6) * .14);
    this.inner.material.emissiveIntensity = this._p >= .999 ? 1.4 : .9 + Math.sin(t * 1.1 + .6) * .35;
    this.inner.material.emissive.setHex(this._p >= .999 ? 0x30D158 : 0xffdfe6);
    this.glow.material.opacity = .17 + Math.sin(t * 1.1) * .05;
  }
}

/* ── App icon: the mark, extruded ────────────────────────────────── */
class Icon extends Stage {
  build(sc, cam) {
    cam.position.set(0.5, 0.4, 6.2); cam.lookAt(0, 0, 0);
    const g = this.g = new THREE.Group(); sc.add(g);
    const steel = new THREE.MeshPhysicalMaterial({ name: 'steel', color: 0xffffff, roughness: .08, metalness: 0,
      transparent: true, opacity: .45, clearcoat: 1, clearcoatRoughness: .05 });
    const red = new THREE.MeshPhysicalMaterial({ name: 'accent', color: 0x8e0f28, emissive: 0xff2a52, emissiveIntensity: 1.1,
      roughness: .1, metalness: 0, transparent: true, opacity: .82, clearcoat: 1, clearcoatRoughness: .06 });
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, 3.1, 24), steel);
    bar.rotation.z = Math.PI / 2; bar.name = 'bar'; g.add(bar);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(.19, .19, .62, 24), red);
    band.rotation.z = Math.PI / 2; band.name = 'band'; g.add(band);
    [-1, 1].forEach((s) => {
      const p1 = new THREE.Mesh(new THREE.BoxGeometry(.26, 1.85, 1.85), steel);
      p1.position.x = s * 1.18; p1.name = 'plate-outer';
      const p2 = new THREE.Mesh(new THREE.BoxGeometry(.24, 1.3, 1.3), steel);
      p2.position.x = s * 0.83; p2.name = 'plate-inner';
      g.add(p1, p2);
    });
    this.g.rotation.x = -.18;
  }
  tick(t) { this.g.rotation.y = Math.sin(t * .5) * .55; }
}

/* ── Muscle map: worked groups light up ──────────────────────────── */
const GROUPS = {
  chest: [[.42, 1.02, .30, [.62, .5, .34], 0], [-.42, 1.02, .30, [.62, .5, .34], 0]],
  delts: [[.92, 1.42, .06, [.42, .42, .46], 0], [-.92, 1.42, .06, [.42, .42, .46], 0]],
  biceps: [[1.06, .72, .14, [.26, .5, .28], .18], [-1.06, .72, .14, [.26, .5, .28], -.18]],
  triceps: [[1.14, .74, -.16, [.24, .48, .24], .18], [-1.14, .74, -.16, [.24, .48, .24], -.18]],
  forearm: [[1.2, .04, .06, [.2, .5, .22], .1], [-1.2, .04, .06, [.2, .5, .22], -.1]],
  abs: [[0, .30, .30, [.44, .78, .26], 0]],
  obliques: [[.52, .34, .18, [.2, .66, .28], .06], [-.52, .34, .18, [.2, .66, .28], -.06]],
  lats: [[.72, .92, -.22, [.34, .76, .3], .1], [-.72, .92, -.22, [.34, .76, .3], -.1]],
  glutes: [[.38, -.52, -.22, [.36, .34, .3], 0], [-.38, -.52, -.22, [.36, .34, .3], 0]],
  quads: [[.42, -1.36, .14, [.34, .84, .34], 0], [-.42, -1.36, .14, [.34, .84, .34], 0]],
  hams: [[.42, -1.36, -.18, [.3, .8, .26], 0], [-.42, -1.36, -.18, [.3, .8, .26], 0]],
  calves: [[.42, -2.34, -.10, [.26, .58, .28], 0], [-.42, -2.34, -.10, [.26, .58, .28], 0]],
  traps: [[0, 1.62, -.14, [.86, .34, .3], 0]],
  lower_back: [[0, .58, -.30, [.5, .6, .24], 0]]
};
class Body extends Stage {
  static observedAttributes = ['active'];
  attributeChangedCallback() { this._act = (this.getAttribute('active') || '').split(',').map(s => s.trim()); }
  build(sc, cam) {
    cam.position.set(0, 0, 8.4);
    this._act = (this.getAttribute('active') || '').split(',').map(s => s.trim());
    const g = this.g = new THREE.Group(); sc.add(g); g.position.y = .1;
    const base = new THREE.MeshPhysicalMaterial({ name: 'body', color: 0x14141a, roughness: .12, metalness: 0,
      transparent: true, opacity: .34, clearcoat: 1, clearcoatRoughness: .1, side: THREE.DoubleSide, depthWrite: false });
    const skel = [
      ['head', 0, 2.06, 0, [.36, .44, .36]],
      ['neck', 0, 1.68, 0, [.2, .22, .2]],
      ['ribcage', 0, 1.02, 0, [.78, .62, .42]],
      ['waist', 0, .34, 0, [.6, .5, .34]],
      ['pelvis', 0, -.34, 0, [.72, .38, .4]],
      ['upperarm-r', 1.08, .74, 0, [.24, .56, .26]], ['upperarm-l', -1.08, .74, 0, [.24, .56, .26]],
      ['forearm-r', 1.2, .02, 0, [.2, .56, .22]], ['forearm-l', -1.2, .02, 0, [.2, .56, .22]],
      ['hand-r', 1.26, -.5, 0, [.14, .2, .12]], ['hand-l', -1.26, -.5, 0, [.14, .2, .12]],
      ['thigh-r', .42, -1.34, 0, [.34, .86, .36]], ['thigh-l', -.42, -1.34, 0, [.34, .86, .36]],
      ['shin-r', .42, -2.34, 0, [.26, .82, .28]], ['shin-l', -.42, -2.34, 0, [.26, .82, .28]],
      ['foot-r', .42, -3.16, .12, [.18, .12, .34]], ['foot-l', -.42, -3.16, .12, [.18, .12, .34]]
    ];
    skel.forEach(([n, x, y, z, s]) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), base);
      m.name = n; m.position.set(x, y, z); m.scale.set(...s); g.add(m);
    });
    this.parts = {};
    Object.entries(GROUPS).forEach(([key, defs]) => {
      const mm = new THREE.MeshPhysicalMaterial({ name: key, color: 0x1a1a20, roughness: .1, metalness: 0, transparent: true,
        opacity: .55, clearcoat: 1, clearcoatRoughness: .08, emissive: 0xff2a52, emissiveIntensity: 0, depthWrite: false });
      const meshes = defs.map(([x, y, z, s, rz]) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), mm);
        m.name = key; m.position.set(x, y, z); m.scale.set(...s); m.rotation.z = rz; g.add(m); return m;
      });
      this.parts[key] = mm; meshes[0].userData.g = key;
    });
    const wire = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.CylinderGeometry(2.4, 2.4, .02, 64)),
      new THREE.LineBasicMaterial({ color: 0xff2a52, transparent: true, opacity: .35 }));
    wire.position.y = -3.3; g.add(wire);
  }
  tick(t) {
    this.g.rotation.y = Math.sin(t * .28) * .62;
    const pulse = .55 + Math.sin(t * 2.2) * .28;
    Object.entries(this.parts).forEach(([k, m]) => {
      const on = this._act.includes(k);
      m.emissiveIntensity += ((on ? pulse : 0) - m.emissiveIntensity) * .12;
      m.color.setHex(on ? 0x4a0a18 : 0x1a1a20);
      m.opacity = on ? .78 : .5;
    });
  }
}

customElements.define('pr-core', Core);
customElements.define('pr-icon', Icon);
customElements.define('pr-body', Body);
