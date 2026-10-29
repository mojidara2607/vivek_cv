// Hero scene: a voxel "MV" monogram built from porcelain cubes.
// Cubes fly in and assemble, lean away from the cursor, and drift apart on scroll.
// Everything is two InstancedMeshes, so the whole scene is a handful of draw calls.
// Source file: `npm run build` bundles it (with three.js) into assets/js/scene.bundle.js,
// a classic script exposing window.CVScene, so the site also works when opened from disk.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const GLYPHS = [
  ['X...X', 'XX.XX', 'X.X.X', 'X...X', 'X...X'], // M
  ['X...X', 'X...X', 'X...X', '.X.X.', '..X..'], // V
];
const GAP = 1.15;
const LETTER_OFFSET = 6.3;
const MONOGRAM_WIDTH = (LETTER_OFFSET + 4) * GAP;
const MONOGRAM_HEIGHT = 4 * GAP;
const FLOOR_Y = -MONOGRAM_HEIGHT / 2 - 1.9;
const SHADOW_Y = -MONOGRAM_HEIGHT / 2 - 0.95;

const PORCELAIN = new THREE.Color('#F3F1EC');
const EMBER = new THREE.Color('#FF4F1A');
const INK = new THREE.Color('#1D1D1B');

// Seeded PRNG so the composition is the same on every visit.
let seed = 20230201;
const random = () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rand = (a, b) => a + random() * (b - a);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoothstep = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
const easeOutBack = (t) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

function buildLetters() {
  const cubes = [];
  GLYPHS.forEach((rows, letter) => rows.forEach((row, r) => [...row].forEach((cell, col) => {
    if (cell !== 'X') return;
    const x = (letter * LETTER_OFFSET + col) * GAP - MONOGRAM_WIDTH / 2;
    const y = (rows.length - 1 - r) * GAP - MONOGRAM_HEIGHT / 2;
    const accent = (letter === 1 && r === 4) || (letter === 0 && r === 2 && col === 2);
    cubes.push({ x, y, accent });
  })));

  return cubes.map((c, i) => {
    const from = new THREE.Vector3(rand(-1, 1), rand(-0.3, 1), rand(-0.6, 1)).normalize().multiplyScalar(rand(16, 24));
    return {
      target: new THREE.Vector3(c.x, c.y, rand(-0.28, 0.28)),
      from,
      fromQ: new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(-3, 3), rand(-3, 3), rand(-3, 3))),
      drift: new THREE.Vector3(c.x, c.y + 0.6, rand(2, 5)).normalize(),
      spin: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)),
      delay: 0.12 + i * 0.045 + rand(0, 0.1),
      phase: rand(0, Math.PI * 2),
      color: c.accent ? EMBER : PORCELAIN,
      hover: 0,
    };
  });
}

function buildSatellites(count) {
  const sats = [];
  let guard = 0;
  while (sats.length < count && guard++ < 2000) {
    // Kept right-weighted on x so no cube floats over the headline on wide screens.
    const p = new THREE.Vector3(rand(-8.8, 10.8), rand(FLOOR_Y + 1.2, 6), rand(-7, 2));
    const nearLetters = Math.abs(p.x) < MONOGRAM_WIDTH / 2 + 1.4 && Math.abs(p.y) < MONOGRAM_HEIGHT / 2 + 1.4 && p.z > -4;
    const crowded = sats.some((s) => s.base.distanceTo(p) < 2.4);
    if (nearLetters || crowded) continue;
    const i = sats.length;
    sats.push({
      base: p,
      size: rand(0.28, 0.66),
      color: i % 4 === 0 ? EMBER : i % 5 === 2 ? INK : PORCELAIN,
      axis: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(),
      speed: rand(0.25, 0.7),
      phase: rand(0, Math.PI * 2),
      delay: 1.25 + i * 0.07,
    });
  }
  return sats;
}

export function initScene({ canvas, hero, reduceMotion = false }) {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const lowPower = coarse || (navigator.hardwareConcurrency || 8) <= 4;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.75;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 200);

  const rig = new THREE.Group();
  const group = new THREE.Group();
  rig.add(group);
  scene.add(rig);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d1c4, 0.65));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(-7, 14, 10);
  rig.add(key, key.target);

  // Soft contact shadow: one blurred ellipse instead of shadow maps (cleaner on white, and far cheaper).
  const shadowTexture = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(38,33,26,0.55)');
    g.addColorStop(0.45, 'rgba(38,33,26,0.22)');
    g.addColorStop(1, 'rgba(38,33,26,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(MONOGRAM_WIDTH + 5, 6),
    new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, opacity: 0, toneMapped: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = SHADOW_Y;
  shadow.renderOrder = -1;
  group.add(shadow);

  const geometry = new RoundedBoxGeometry(1, 1, 1, 4, 0.17);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.4, metalness: 0, clearcoat: 0.9, clearcoatRoughness: 0.22,
  });

  const letters = buildLetters();
  const sats = buildSatellites(lowPower ? 12 : 18);

  const letterMesh = new THREE.InstancedMesh(geometry, material, letters.length);
  const satMesh = new THREE.InstancedMesh(geometry, material, sats.length);
  for (const [mesh, items] of [[letterMesh, letters], [satMesh, sats]]) {
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    items.forEach((item, i) => mesh.setColorAt(i, item.color));
    mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }

  /* ---------- layout: fit the monogram to the canvas ---------- */
  let width = 1, height = 1;
  const layout = () => {
    width = Math.max(1, canvas.clientWidth);
    height = Math.max(1, canvas.clientHeight);
    const dprCap = lowPower ? 1.35 : 1.75;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap, 2600 / width);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);

    camera.aspect = width / height;
    const wide = camera.aspect > 1.05;
    const share = wide ? 0.42 : 0.8;               // share of canvas width the monogram should fill
    const visW = (MONOGRAM_WIDTH + 1.4) / share;
    const visH = visW / camera.aspect;
    const dist = visH / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    camera.position.set(0, dist * 0.14, dist);
    camera.lookAt(0, 0, 0);
    camera.far = dist + 80;
    camera.updateProjectionMatrix();
    rig.position.set(wide ? visW * 0.23 : 0, wide ? visH * 0.04 : -visH * 0.02, 0);
    if (reduceMotion) render(10);
  };

  /* ---------- pointer ---------- */
  const pointer = { x: 0, y: 0, nx: 0, ny: 0, active: false };
  addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = (e.clientY / innerHeight) * 2 - 1;
    const r = canvas.getBoundingClientRect();
    pointer.nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.ny = -((e.clientY - r.top) / r.height) * 2 + 1;
    pointer.active = e.pointerType === 'mouse' && e.clientY >= r.top && e.clientY <= r.bottom;
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { pointer.active = false; pointer.x = 0; pointer.y = 0; });

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const invGroup = new THREE.Matrix4();
  const localRay = new THREE.Ray();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();

  /* ---------- per-frame ---------- */
  const dummy = new THREE.Object3D();
  const tmpQ = new THREE.Quaternion();
  const tmpE = new THREE.Euler();
  const identity = new THREE.Quaternion();
  const start = performance.now();
  let last = start;
  let ready = false;

  function render(forcedElapsed) {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = forcedElapsed ?? (now - start) / 1000;
    const still = reduceMotion;

    const rect = hero.getBoundingClientRect();
    const scroll = still ? 0 : clamp01(-rect.top / (rect.height * 0.85));
    const burst = Math.pow(scroll, 1.4);

    // group orientation: pointer + idle sway + scroll twist
    const idle = still ? 0 : Math.sin(t * 0.32) * 0.07;
    const targetY = -0.12 + pointer.x * 0.34 + idle + scroll * 0.9;
    const targetX = 0.06 + pointer.y * 0.14 + scroll * 0.25;
    group.rotation.y = still ? targetY : THREE.MathUtils.damp(group.rotation.y, targetY, 3, dt);
    group.rotation.x = still ? targetX : THREE.MathUtils.damp(group.rotation.x, targetX, 3, dt);
    group.updateMatrixWorld(true);

    // where the cursor meets the monogram plane (in group space)
    let hasHit = false;
    if (pointer.active && !still && scroll < 0.3) {
      ndc.set(pointer.nx, pointer.ny);
      raycaster.setFromCamera(ndc, camera);
      invGroup.copy(group.matrixWorld).invert();
      localRay.copy(raycaster.ray).applyMatrix4(invGroup);
      hasHit = localRay.intersectPlane(plane, hit) !== null;
    }

    letters.forEach((c, i) => {
      const k = easeOutQuart(clamp01((t - c.delay) / 1.5));
      dummy.position.lerpVectors(c.from, c.target, k);
      dummy.quaternion.slerpQuaternions(c.fromQ, identity, k);

      let influence = 0, dx = 0, dy = 0;
      if (hasHit) {
        dx = c.target.x - hit.x; dy = c.target.y - hit.y;
        const d = Math.hypot(dx, dy);
        influence = 1 - smoothstep(0.2, 2.9, d);
        if (d > 0.001) { dx /= d; dy /= d; }
      }
      c.hover = THREE.MathUtils.damp(c.hover, influence, 7, dt);

      if (!still) {
        dummy.position.z += Math.sin(t * 1.15 + c.phase) * 0.07 * k + c.hover * 1.25;
        dummy.position.y += Math.sin(t * 0.9 + c.phase * 1.3) * 0.035 * k;
        tmpE.set(-dy * c.hover * 0.55, dx * c.hover * 0.55, 0);
        dummy.quaternion.multiply(tmpQ.setFromEuler(tmpE));
        if (burst > 0) {
          dummy.position.addScaledVector(c.drift, burst * 10);
          tmpE.set(c.spin.x * burst * 2.4, c.spin.y * burst * 2.4, c.spin.z * burst * 2.4);
          dummy.quaternion.multiply(tmpQ.setFromEuler(tmpE));
        }
      }
      dummy.scale.setScalar((0.55 + 0.45 * k) * (1 + c.hover * 0.06));
      dummy.updateMatrix();
      letterMesh.setMatrixAt(i, dummy.matrix);
    });
    letterMesh.instanceMatrix.needsUpdate = true;

    sats.forEach((s, i) => {
      const k = clamp01((t - s.delay) / 0.9);
      const pop = k === 0 ? 0 : easeOutBack(k);
      dummy.position.copy(s.base);
      if (!still) {
        dummy.position.y += Math.sin(t * s.speed + s.phase) * 0.35;
        dummy.position.x += Math.cos(t * s.speed * 0.7 + s.phase) * 0.2;
        dummy.position.multiplyScalar(1 + burst * 0.7);
      }
      dummy.quaternion.setFromAxisAngle(s.axis, s.phase + (still ? 0 : t * s.speed * 0.9));
      dummy.scale.setScalar(Math.max(0.0001, s.size * pop));
      dummy.updateMatrix();
      satMesh.setMatrixAt(i, dummy.matrix);
    });
    satMesh.instanceMatrix.needsUpdate = true;
    shadow.material.opacity = easeOutQuart(clamp01((t - 0.9) / 1.4)) * (1 - Math.min(1, burst * 2.5));

    renderer.render(scene, camera);
    if (!ready) { ready = true; canvas.classList.add('is-ready'); }
  }

  /* ---------- run only while the hero is on screen ---------- */
  let onScreen = true;
  const sync = () => {
    const run = onScreen && !document.hidden && !reduceMotion;
    if (run) last = performance.now();
    renderer.setAnimationLoop(run ? () => render() : null);
  };
  new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; sync(); }).observe(hero);
  document.addEventListener('visibilitychange', sync);

  new ResizeObserver(layout).observe(canvas);
  layout();
  if (reduceMotion) render(10);
  sync();

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); renderer.setAnimationLoop(null); });
  canvas.addEventListener('webglcontextrestored', () => { layout(); sync(); });
}
