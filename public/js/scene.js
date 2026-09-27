/* =====================================================================
   ADEGAN 3D (Three.js r128): bioreaktor floating drum, jalur gas, dapur SPPG
   Membaca global: S (keadaan), SIM
   ===================================================================== */
(function () {
'use strict';
const R = SIM.R, clamp = SIM.clamp, statusOf = k => SIM.statusOf(k);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const canvas = document.getElementById('c3d');
const vp = document.getElementById('viewport');
if (!window.THREE || !canvas) return;
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); }
catch (e) { vp.classList.add('no-webgl'); return; }
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;

const scene = new THREE.Scene();
const SKY_DAY = new THREE.Color(0xdcecf2), SKY_NIGHT = new THREE.Color(0x1a1420);
scene.background = SKY_DAY.clone();
scene.fog = new THREE.Fog(0xdcecf2, 45, 140);
const camera = new THREE.PerspectiveCamera(42, 1, .05, 200);
const hemi = new THREE.HemisphereLight(0xfff6e6, 0x5b6b4a, .75); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 1.0);
sun.position.set(6, 11, 5); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -8, right: 10, top: 8, bottom: -8, near: 1, far: 40 });
scene.add(sun);
const kitchenLamp = new THREE.PointLight(0xffdf9e, 0, 7); kitchenLamp.position.set(5.9, 2.2, -.2); scene.add(kitchenLamp);
const siteLamp = new THREE.PointLight(0xfff0d0, 0, 6); siteLamp.position.set(1.0, 2.2, -.5); scene.add(siteLamp);

const pickables = [];
const mat = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .7, metalness: .05 }, o));
function add(o, info, parent) { o.castShadow = true; o.receiveShadow = true; if (info) { o.userData.info = info; pickables.push(o); } (parent || scene).add(o); return o; }
function mesh(g, m, x = 0, y = 0, z = 0, info, parent) { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return add(o, info, parent); }
const box = (w, h, d, m, x, y, z, info, parent) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z, info, parent);
const cyl = (rt, rb, h, m, x, y, z, info, seg = 32, open = false, parent) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), m, x, y, z, info, parent);
function pipe(pts, r, m, info, parent) {
  const c = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', .02);
  const o = new THREE.Mesh(new THREE.TubeGeometry(c, Math.max(16, pts.length * 14), r, 10, false), m);
  o.userData.curve = c; return add(o, info, parent);
}
function textTex(lines, w = 512, h = 128, bg = '#7A1020', fg = '#F3D27A', size = 46) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg;
  g.font = `700 ${size}px "Plus Jakarta Sans", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const L = Array.isArray(lines) ? lines : [lines];
  L.forEach((s, i) => g.fillText(s, w / 2, h / 2 + (i - (L.length - 1) / 2) * size * 1.15));
  const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
}
function sign(lines, w, h, x, y, z, ry = 0, opt = {}) {
  const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: textTex(lines, opt.pw || 512, opt.ph || 128, opt.bg, opt.fg, opt.size) }));
  o.position.set(x, y, z); o.rotation.y = ry; scene.add(o); return o;
}
const wallPt = (deg, y, r = R.tankR) => V3(Math.cos(deg * Math.PI / 180) * r, y, Math.sin(deg * Math.PI / 180) * r);

const MT = {
  tank: new THREE.MeshPhysicalMaterial({ color: 0xd8eef5, transparent: true, opacity: .26, roughness: .15, depthWrite: false, side: THREE.DoubleSide }),
  tankSolid: mat(0x2f6b4f, { roughness: .55 }),
  slurry: mat(0x6b4a2a, { transparent: true, opacity: .55, roughness: .9, depthWrite: false }),
  sludge: mat(0x3a2716, { roughness: 1 }),
  drum: mat(0x1f5fa8, { metalness: .35, roughness: .45, side: THREE.DoubleSide }),
  steel: mat(0x9aa4a8, { metalness: .6, roughness: .35 }),
  pvc: mat(0xeceff1, { roughness: .5 }), pvcG: mat(0x7d868a, { roughness: .5 }),
  red: mat(0xb91c2c), blue: mat(0x2b6cc4), dark: mat(0x2a2f33, { roughness: .6 }),
  concrete: mat(0xc9c6bd, { roughness: .95 }), wood: mat(0x8a6441), tile: mat(0xe8e4dc, { roughness: .8 }),
  wall: mat(0xf7f3ea, { roughness: .9 }), grass: mat(0x86a066, { roughness: 1 }), soil: mat(0x5a3d22, { roughness: 1 }),
  green: mat(0x1f7a4d), gold: mat(0xc8962a, { metalness: .5, roughness: .35 }),
  water: mat(0x7fb7d9, { transparent: true, opacity: .55 }), rust: mat(0x9c5a2e, { roughness: .8 })
};

/* tanah */
const ground = mesh(new THREE.PlaneGeometry(80, 80), MT.grass); ground.rotation.x = -Math.PI / 2; ground.castShadow = false;
box(4.2, .06, 3.8, MT.concrete, -.3, .03, .1).castShadow = false;
box(1.6, .04, .9, MT.concrete, 3.3, .02, 0).castShadow = false;

/* digester */
const tank = cyl(R.tankR, R.tankR, R.tankH, MT.tank, 0, R.tankH / 2, 0, 'digester', 48, true); tank.castShadow = false;
cyl(R.tankR + .02, R.tankR + .02, .04, MT.concrete, 0, .08, 0, 'digester', 48);
mesh(new THREE.TorusGeometry(R.tankR, .015, 8, 48), MT.gold, 0, R.tankH, 0, 'digester').rotation.x = Math.PI / 2;
const slurry = cyl(R.tankR - .01, R.tankR - .01, R.slurryH - .1, MT.slurry, 0, .1 + (R.slurryH - .1) / 2, 0, 'digester', 48); slurry.castShadow = false; slurry.renderOrder = 2;
const sludge = cyl(R.tankR - .015, R.tankR - .015, 1, MT.sludge, 0, .1, 0, 'drain', 40);
sign(['BIOREAKTOR ±500 L'], .5, .1, 0, .35, R.tankR + .005, 0, { size: 52 });

const drum = new THREE.Group(); scene.add(drum);
cyl(R.drumR, R.drumR, R.drumH, MT.drum, 0, 0, 0, 'drum', 48, true, drum);
mesh(new THREE.CircleGeometry(R.drumR, 48), MT.drum, 0, R.drumH / 2, 0, 'drum', drum).rotation.x = -Math.PI / 2;
cyl(.05, .05, R.drumH, MT.steel, 0, 0, 0, 'drum', 16, false, drum);
cyl(.025, .025, .08, MT.steel, .18, R.drumH / 2 + .04, 0, 'drum', 12, false, drum);
const reliefV = cyl(.03, .03, .06, MT.red, -.18, R.drumH / 2 + .03, 0, 'relief', 12, false, drum);
const band = new THREE.Mesh(new THREE.CylinderGeometry(R.drumR + .002, R.drumR + .002, .09, 48, 1, true),
  new THREE.MeshBasicMaterial({ map: textTex(['GAS HOLDER  •  FLOATING DRUM'], 1024, 64, '#1f5fa8', '#F3D27A', 36), side: THREE.DoubleSide }));
band.position.y = R.drumH / 2 - .1; drum.add(band);
const drumY = () => R.drumRest + Math.min(S.Vg, R.VgMax) / R.area + R.drumH / 2;

cyl(.025, .025, 2.15, MT.steel, 0, 1.075, 0, 'drum', 12);
box(.05, 2.2, .05, MT.steel, -.62, 1.1, 0); box(.05, 2.2, .05, MT.steel, .62, 1.1, 0); box(1.3, .05, .05, MT.steel, 0, 2.18, 0);
box(.1, .06, .08, MT.dark, .22, 2.12, 0, 'level');
box(.08, .1, .06, MT.pvc, -.62, 1.55, .05, 'lel');

class Helix extends THREE.Curve {
  constructor(r, y0, y1, n) { super(); this.r = r; this.y0 = y0; this.y1 = y1; this.n = n; }
  getPoint(t, o = new THREE.Vector3()) { const a = t * this.n * Math.PI * 2 + Math.PI; return o.set(Math.cos(a) * this.r, this.y0 + (this.y1 - this.y0) * t, Math.sin(a) * this.r); }
}
const coilMat = mat(0x8a9499, { metalness: .5, roughness: .35, emissive: 0x000000 });
add(new THREE.Mesh(new THREE.TubeGeometry(new Helix(.31, .14, .27, 4), 220, .014, 8, false), coilMat), 'coil');

/* air panas & dingin */
box(.9, .04, .6, MT.dark, -2.25, .95, -1.35, 'solar').rotation.x = -.55;
(function () { const g = new THREE.Group(); for (let i = 0; i < 8; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(.02, .045, .56), MT.steel); r.position.x = -.4 + i * .114; g.add(r); } g.position.set(-2.25, .97, -1.35); g.rotation.x = -.55; scene.add(g); })();
box(.04, .7, .04, MT.steel, -2.25, .35, -1.1); box(.04, 1.0, .04, MT.steel, -2.25, .5, -1.6);
box(.5, .6, .5, MT.steel, -1.5, .3, -1.25);
cyl(.2, .2, .55, mat(0xb8412e, { roughness: .5 }), -1.5, .88, -1.25, 'hotwater');
box(.3, .25, .3, MT.dark, -1.5, .13, -.78, 'boiler');
const boilerFlame = mesh(new THREE.ConeGeometry(.06, .14, 12), new THREE.MeshBasicMaterial({ color: 0x4d8bff, transparent: true, opacity: .9 }), -1.5, .32, -.78); boilerFlame.visible = false;
cyl(.19, .19, .6, mat(0x2f7fd9, { roughness: .5 }), -.75, .32, -1.4, 'coldwater');
pipe([V3(-1.5, .6, -1.25), V3(-1.5, .14, -1.1), V3(-1.1, .14, -.35), V3(-.3, .14, 0)], .016, MT.red, 'coil');
pipe([V3(-.75, .06, -1.2), V3(-.9, .1, -.7), V3(-1.1, .14, -.36)], .016, MT.blue, 'coil');
pipe([V3(-.3, .27, 0), V3(-.8, .3, -.2), V3(-1.3, .6, -1.05)], .014, MT.pvcG, 'coil');
const hotValve = mesh(new THREE.TorusGeometry(.045, .01, 6, 16), MT.red, -1.5, .4, -1.2, 'coil');
const coldValve = mesh(new THREE.TorusGeometry(.045, .01, 6, 16), MT.blue, -.85, .12, -.85, 'coil');

/* inlet */
box(.5, .8, .5, MT.steel, -1.45, .4, .35);
cyl(.26, .23, .35, MT.pvc, -1.45, .98, .35, 'inlet');
pipe([V3(-1.45, .82, .35), V3(-.95, .5, .22), V3(-.41, .24, .08)], .045, MT.pvcG, 'inlet');

/* buffer */
cyl(.15, .15, .45, new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: .75, roughness: .3 }), -.95, .23, 1.05, 'buffer');
cyl(.13, .13, .3, MT.water, -.95, .17, 1.05, 'buffer');
box(.2, .12, .14, MT.dark, -.62, .07, .95, 'buffer');
const pumpRotor = cyl(.04, .04, .05, MT.red, -.62, .15, .95, 'buffer', 12);
const bufPipe = pipe([V3(-.62, .15, .95), V3(-.62, 1.12, .95), V3(-.45, 1.14, .5), V3(-.3, 1.12, .3)], .012, MT.pvc, 'buffer');
sign(['NaHCO₃'], .24, .07, -.95, .3, 1.201, 0, { bg: '#ffffff', fg: '#7A1020', size: 60 });

/* outlet & pupuk */
pipe([wallPt(-60, 1.02), V3(.55, 1.02, -.8), V3(.6, .52, -1.05)], .035, MT.pvcG, 'outlet');
box(.55, .5, .45, MT.concrete, .6, .25, -1.1, 'outlet'); box(.5, .02, .4, MT.soil, .6, .45, -1.1, 'outlet');
box(.18, .28, .12, MT.green, 1.02, .14, -1.15, 'outlet'); box(.18, .28, .12, MT.green, 1.25, .14, -1.15, 'outlet');
pipe([V3(0, .12, R.tankR - .02), V3(0, .12, .9)], .04, MT.pvcG, 'drain');
const drainWheel = mesh(new THREE.TorusGeometry(.07, .012, 6, 20), MT.red, 0, .12, .66, 'drain');
cyl(.012, .012, .1, MT.steel, 0, .12, .66, 'drain', 8).rotation.x = Math.PI / 2;
box(1.2, .18, .08, MT.concrete, 0, .09, 1.05, 'bed'); box(1.2, .18, .08, MT.concrete, 0, .09, 1.85, 'bed');
box(.08, .18, .8, MT.concrete, -.6, .09, 1.45, 'bed'); box(.08, .18, .8, MT.concrete, .6, .09, 1.45, 'bed');
box(1.12, .05, .72, MT.soil, 0, .04, 1.45, 'bed');
const pile = mesh(new THREE.ConeGeometry(.3, .2, 20), mat(0x4a3119, { roughness: 1 }), 0, .06, 1.45, 'bed');

/* kontroler IoT */
cyl(.03, .03, 1.4, MT.steel, 1.0, .7, -.55);
box(.22, .28, .1, MT.pvc, 1.0, 1.3, -.49, 'esp');
const espLed = mesh(new THREE.SphereGeometry(.015, 8, 8), new THREE.MeshBasicMaterial({ color: 0x22dd66 }), 1.06, 1.4, -.435);
cyl(.006, .006, .18, MT.dark, .92, 1.53, -.49, null, 6);
const wifiRings = [0, 1, 2].map(() => { const r = new THREE.Mesh(new THREE.TorusGeometry(.1, .006, 6, 30), new THREE.MeshBasicMaterial({ color: 0xc8962a, transparent: true, opacity: 0 })); r.position.set(.92, 1.62, -.49); r.rotation.x = Math.PI / 2; scene.add(r); r.userData.t = 9; return r; });
let wifiQueue = 0;

const sensorDots = {};
function probe(key, deg, y, info) {
  const o = wallPt(deg, y, R.tankR + .07), i = wallPt(deg, y, R.tankR - .1);
  pipe([o, i], .01, MT.steel, info); box(.07, .07, .07, MT.dark, o.x, o.y, o.z, info);
  sensorDots[key] = mesh(new THREE.SphereGeometry(.025, 12, 12), new THREE.MeshBasicMaterial({ color: 0x2ecc71 }), o.x, o.y + .06, o.z, info);
  return o;
}
const pT = probe('T', 125, .5, 'tempSensor');
const pPH = probe('pH', 55, .72, 'phSensor');
sensorDots.lvl = mesh(new THREE.SphereGeometry(.022, 10, 10), new THREE.MeshBasicMaterial({ color: 0x2ecc71 }), .22, 2.2, 0, 'level');
sensorDots.lel = mesh(new THREE.SphereGeometry(.02, 10, 10), new THREE.MeshBasicMaterial({ color: 0x2ecc71 }), -.62, 1.63, .05, 'lel');

/* jalur gas */
const hoseMat = mat(0xf2c230, { roughness: .6 });
let hose = null, hoseY = -1;
function rebuildHose() {
  const y = drumY() + R.drumH / 2;
  if (Math.abs(y - hoseY) < .006) return; hoseY = y;
  if (hose) { scene.remove(hose); hose.geometry.dispose(); const i = pickables.indexOf(hose); if (i >= 0) pickables.splice(i, 1); }
  const c = new THREE.CatmullRomCurve3([V3(.18, y + .06, 0), V3(.3, y + .3, 0), V3(.85, Math.max(y, 1.4), 0), V3(1.2, .75, 0), V3(1.2, .47, 0)]);
  hose = new THREE.Mesh(new THREE.TubeGeometry(c, 40, .018, 8, false), hoseMat);
  hose.userData.info = 'hose'; hose.castShadow = true; scene.add(hose); pickables.push(hose);
}
cyl(.09, .09, .45, MT.water, 1.2, .225, 0, 'watertrap'); cyl(.095, .095, .02, MT.dark, 1.2, .46, 0, 'watertrap');
cyl(.12, .12, .85, MT.rust, 1.75, .425, 0, 'scrubber'); cyl(.125, .125, .03, MT.dark, 1.75, .86, 0, 'scrubber');
pipe([V3(1.29, .3, 0), V3(1.63, .3, 0)], .02, hoseMat, 'watertrap');
const gasMain = pipe([V3(1.75, .87, 0), V3(1.75, .95, 0), V3(2.1, .95, 0), V3(2.9, .95, 0), V3(2.95, .5, 0), V3(2.95, .09, 0), V3(3.6, .09, 0), V3(4.3, .09, 0), V3(4.9, .09, -.5), V3(5.05, .09, -1.1), V3(5.05, .7, -1.1), V3(5.2, .72, -1.1)], .02, hoseMat, 'gasline');
cyl(.07, .07, .03, MT.pvc, 2.2, .95, .03, 'pressure').rotation.x = Math.PI / 2;
mesh(new THREE.CircleGeometry(.06, 24), new THREE.MeshBasicMaterial({ map: textTex(['mbar'], 128, 128, '#ffffff', '#1A1D24', 30) }), 2.2, .95, .047, 'pressure');
const needle = box(.004, .05, .004, MT.red, 2.2, .95, .05);
sensorDots.P = mesh(new THREE.SphereGeometry(.022, 10, 10), new THREE.MeshBasicMaterial({ color: 0x2ecc71 }), 2.2, 1.05, .03, 'pressure');
box(.16, .12, .1, MT.pvc, 1.9, 1.07, .12, 'analyzer');
sensorDots.gasq = mesh(new THREE.SphereGeometry(.02, 10, 10), new THREE.MeshBasicMaterial({ color: 0x2ecc71 }), 1.9, 1.15, .12, 'analyzer');
cyl(.045, .045, .16, MT.dark, 2.6, .95, 0, 'arrester').rotation.z = Math.PI / 2;
box(.12, .02, .03, MT.red, 3.3, .14, 0, 'gasline');

/* dapur SPPG */
box(3.4, .06, 3.2, MT.tile, 5.9, .03, -.1).castShadow = false;
box(3.4, 2.4, .12, MT.wall, 5.9, 1.2, -1.7, 'kitchen'); box(.12, 2.4, 3.2, MT.wall, 7.6, 1.2, -.1, 'kitchen'); box(.12, .9, 3.2, MT.wall, 4.2, .45, -.1, 'kitchen');
box(3.4, .12, .14, MT.red, 5.9, 2.34, -1.62); box(3.4, .06, .14, MT.gold, 5.9, 2.25, -1.62);
sign(['DAPUR SPPG', 'Makan Bergizi Gratis'], 2.2, .5, 5.9, 1.9, -1.635, 0, { pw: 1024, ph: 232, size: 72 });
box(1.4, .68, .66, MT.steel, 5.6, .34, -1.1, 'stove');
const burnerX = [5.3, 5.9]; burnerX.forEach(x => cyl(.11, .11, .04, MT.dark, x, .7, -1.1, 'stove', 20));
cyl(.2, .16, .28, MT.steel, 5.3, .98, -1.1, 'stove', 28);
mesh(new THREE.SphereGeometry(.2, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), MT.dark, 5.9, 1.04, -1.1, 'stove');
const fA = new THREE.MeshBasicMaterial({ color: 0x3b7bff, transparent: true, opacity: .9, depthWrite: false });
const fB = new THREE.MeshBasicMaterial({ color: 0xffa640, transparent: true, opacity: .75, depthWrite: false });
const flames = burnerX.map(x => {
  const g = new THREE.Group(); g.position.set(x, .73, -1.1);
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const f = new THREE.Mesh(new THREE.ConeGeometry(.02, .1, 6), i % 3 ? fA : fB); f.position.set(Math.cos(a) * .1, .05, Math.sin(a) * .1); g.add(f); }
  g.visible = false; scene.add(g); return g;
});
const steam = []; for (let i = 0; i < 10; i++) { const s = mesh(new THREE.SphereGeometry(.03, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }), 5.3, 1.1, -1.1); s.castShadow = false; s.userData.p = Math.random(); steam.push(s); }
box(1.3, .74, .6, MT.wood, 6.7, .37, .3, 'kitchen');
for (let i = 0; i < 6; i++) {
  const x = 6.25 + (i % 3) * .42, z = .18 + Math.floor(i / 3) * .26;
  box(.34, .02, .22, MT.steel, x, .75, z);
  box(.14, .025, .09, mat(0xf2ecd8), x - .07, .77, z - .04); box(.12, .025, .09, mat(0x4c9a3a), x + .08, .77, z - .04); box(.28, .025, .07, mat(0xa0522d), x, .77, z + .06);
}
box(.4, .62, .4, MT.green, 4.75, .31, 1.05, 'smartbin'); box(.42, .04, .42, MT.dark, 4.75, .64, 1.05, 'smartbin');
cyl(.015, .015, .5, MT.steel, 4.95, .9, .9, 'smartbin', 8); box(.1, .07, .08, MT.dark, 4.85, 1.14, .98, 'smartbin');
const scanBeam = mesh(new THREE.ConeGeometry(.22, .45, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xc8962a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }), 4.78, .88, 1.02); scanBeam.castShadow = false;
let scanT = 9;

/* partikel */
function pool(n, g, m) { return Array.from({ length: n }, () => { const o = new THREE.Mesh(g, m); o.visible = false; o.userData = { p: Math.random() }; scene.add(o); return o; }); }
const bubbles = pool(55, new THREE.SphereGeometry(.013, 6, 6), new THREE.MeshBasicMaterial({ color: 0xe8f0ff, transparent: true, opacity: .8 }));
bubbles.forEach(b => { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * .32; b.userData.x = Math.cos(a) * r; b.userData.z = Math.sin(a) * r; });
const gasDots = pool(26, new THREE.SphereGeometry(.028, 8, 8), new THREE.MeshBasicMaterial({ color: 0x2f6fe4 }));
const drainDots = pool(10, new THREE.SphereGeometry(.03, 8, 8), MT.sludge);
const dropDots = pool(6, new THREE.SphereGeometry(.012, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
const leakPuffs = pool(8, new THREE.SphereGeometry(.05, 8, 8), new THREE.MeshBasicMaterial({ color: 0xd8e2e6, transparent: true, opacity: .5, depthWrite: false }));
const chunkGeo = new THREE.BoxGeometry(.05, .05, .05), chunks = [];
const FOODCOL = { campuran: 0xb08040, nasi: 0xf0ead0, sayur: 0x4caf50, lauk: 0xa0522d, buah: 0xffc107, sapi: 0x5d4037 };

/* kamera orbit */
const camS = { th: .32, ph: 1.1, r: 10.5, tgt: V3(2.9, .5, 0) };
const VIEWS = { all: { th: .32, ph: 1.1, r: 10.5, tgt: V3(2.9, .5, 0) }, reactor: { th: .15, ph: 1.15, r: 3.6, tgt: V3(-.2, .75, 0) },
  gas: { th: .12, ph: 1.15, r: 3.6, tgt: V3(1.9, .75, 0) }, kitchen: { th: .2, ph: .95, r: 6, tgt: V3(5.9, .6, -.3) } };
let camGoal = null;
function applyCam() {
  const { th, ph, tgt } = camS, r = camS.r * Math.max(1, 1.25 / camera.aspect);
  camera.position.set(tgt.x + r * Math.sin(ph) * Math.sin(th), tgt.y + r * Math.cos(ph), tgt.z + r * Math.sin(ph) * Math.cos(th));
  camera.lookAt(tgt);
}
const ptrs = new Map(); let pinch = 0, down = null, moved = false;
function pan(dx, dy) { const s = camS.r * .0015; const rt = V3(0, 0, 0).setFromMatrixColumn(camera.matrix, 0), up = V3(0, 0, 0).setFromMatrixColumn(camera.matrix, 1); camS.tgt.addScaledVector(rt, -dx * s).addScaledVector(up, dy * s); }
canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button }); down = { x: e.clientX, y: e.clientY }; moved = false; camGoal = null; });
canvas.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (ptrs.size === 1) { if (p.b === 2 || e.shiftKey) pan(dx, dy); else { camS.th -= dx * .006; camS.ph = clamp(camS.ph - dy * .006, .12, 1.52); } }
  else if (ptrs.size === 2) { const a = [...ptrs.values()]; const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); if (pinch) camS.r = clamp(camS.r * pinch / d, 1.2, 28); pinch = d; pan(dx / 2, dy / 2); }
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) moved = true;
});
function ptrEnd(e) { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = 0; if (!moved && ptrs.size === 0 && e.type === 'pointerup') pick(e); }
canvas.addEventListener('pointerup', ptrEnd); canvas.addEventListener('pointercancel', ptrEnd);
canvas.addEventListener('wheel', e => { e.preventDefault(); camGoal = null; camS.r = clamp(camS.r * (e.deltaY > 0 ? 1.1 : .9), 1.2, 28); }, { passive: false });
canvas.addEventListener('contextmenu', e => e.preventDefault());
const ray = new THREE.Raycaster();
function pick(e) {
  const rc = canvas.getBoundingClientRect();
  ray.setFromCamera({ x: (e.clientX - rc.left) / rc.width * 2 - 1, y: -(e.clientY - rc.top) / rc.height * 2 + 1 }, camera);
  const hit = ray.intersectObjects(pickables, false).find(h => h.object.visible && h.object.userData.info);
  if (hit && window.APP) APP.showInfo(hit.object.userData.info); else if (window.APP) APP.hideInfo();
}

/* label */
const labelsEl = document.getElementById('labels');
let labelMode = 1;
const worst = (...a) => a.includes('bad') ? 'bad' : a.includes('warn') ? 'warn' : 'ok';
const LBL = [
  { p: () => V3(pT.x, pT.y + .34, pT.z), h: () => `Suhu <b>${S.T.toFixed(1)} °C</b>`, st: () => statusOf('T'), i: 'tempSensor', s: 1 },
  { p: () => V3(pPH.x, pPH.y + .12, pPH.z), h: () => `pH <b>${S.pH.toFixed(2)}</b>`, st: () => statusOf('pH'), i: 'phSensor', s: 1 },
  { p: () => V3(.22, 2.3, 0), h: () => `Isi drum <b>${(S.Vg / R.VgMax * 100).toFixed(0)}%</b>`, st: () => worst(statusOf('full'), statusOf('gas')), i: 'level', s: 1 },
  { p: () => V3(2.2, 1.12, .03), h: () => `Tekanan <b>${S.press.toFixed(1)} mbar</b>`, st: () => statusOf('P'), i: 'pressure', s: 1 },
  { p: () => V3(1.85, 1.5, .12), h: () => `CH₄ <b>${(S.xCH4 * 100).toFixed(0)}%</b>`, st: () => worst(statusOf('ch4'), statusOf('h2s')), i: 'analyzer', s: 1 },
  { p: () => V3(-.62, 1.72, .05), h: () => `Bocor <b>${S.lel.toFixed(0)}% LEL</b>`, st: () => statusOf('lel'), i: 'lel', s: 1 },
  { p: () => V3(0, .3, .72), h: () => `Endapan <b>${S.sludgeL.toFixed(0)} L</b>`, st: () => statusOf('sl'), i: 'drain', s: 1 },
  { p: () => V3(5.6, 1.3, -1.1), h: () => S.stove ? `Kompor <b>menyala</b>` : 'Kompor mati', st: () => S.stove ? 'ok' : 'plain', i: 'stove', s: 1 },
  { p: () => V3(-1.5, 1.28, -1.25), h: () => S.hot ? 'Air panas <b>mengalir</b>' : 'Tangki air panas', st: () => S.hot ? 'ok' : 'plain', i: 'hotwater', s: 2 },
  { p: () => V3(-.75, .75, -1.4), h: () => S.cold ? 'Air dingin <b>mengalir</b>' : 'Tangki air dingin', st: () => S.cold ? 'ok' : 'plain', i: 'coldwater', s: 2 },
  { p: () => V3(-.95, .6, 1.05), h: () => S.doseG > 0 ? 'Buffer <b>memompa</b>' : 'Buffer NaHCO₃', st: () => 'plain', i: 'buffer', s: 2 },
  { p: () => V3(-1.45, 1.3, .35), h: () => 'Bak pencampur', st: () => 'plain', i: 'inlet', s: 2 },
  { p: () => V3(1.75, .98, 0), h: () => `Scrubber H₂S ${S.scrub.toFixed(0)}%`, st: () => statusOf('h2s') === 'ok' ? 'plain' : statusOf('h2s'), i: 'scrubber', s: 2 },
  { p: () => V3(1.0, 1.55, -.49), h: () => 'Kontroler IoT', st: () => 'plain', i: 'esp', s: 2 },
  { p: () => V3(0, .45, 1.45), h: () => `Pupuk padat <b>${S.cum.fert.toFixed(1)} kg</b>`, st: () => 'plain', i: 'bed', s: 2 },
  { p: () => V3(.6, .7, -1.1), h: () => `Pupuk cair <b>${S.cum.liq.toFixed(0)} L</b>`, st: () => 'plain', i: 'outlet', s: 2 },
  { p: () => V3(4.75, 1.3, 1.05), h: () => 'Smart bin + kamera AI', st: () => 'plain', i: 'smartbin', s: 2 },
  { p: () => V3(-1.5, .45, -.78), h: () => S.boiler ? 'Boiler <b>aktif</b>' : 'Boiler biogas', st: () => S.boiler ? 'ok' : 'plain', i: 'boiler', s: 2 }
];
LBL.forEach(l => { l.el = document.createElement('button'); l.el.type = 'button'; l.el.className = 'lbl'; l.el.addEventListener('click', () => window.APP && APP.showInfo(l.i)); labelsEl.appendChild(l.el); });
const tmpV = V3(0, 0, 0);
function updateLabels(w, h) {
  for (const l of LBL) {
    if (labelMode === 0 || l.s > labelMode) { l.el.style.display = 'none'; continue; }
    tmpV.copy(l.p()).project(camera);
    if (tmpV.z > 1 || Math.abs(tmpV.x) > 1.05 || Math.abs(tmpV.y) > 1.05) { l.el.style.display = 'none'; continue; }
    l.el.style.display = 'block';
    l.el.style.transform = `translate(${((tmpV.x + 1) / 2 * w).toFixed(0)}px, ${((1 - tmpV.y) / 2 * h).toFixed(0)}px) translate(-50%, calc(-100% - 8px))`;
    const hh = l.h(); if (l._h !== hh) { l.el.innerHTML = hh; l._h = hh; }
    const c = 'lbl ' + l.st(); if (l._c !== c) { l.el.className = c; l._c = c; }
  }
}
const DOTCOL = { ok: 0x2ecc71, warn: 0xf1b52b, bad: 0xff3b3b };

let xray = true, animT = 0;
function resize() { const w = vp.clientWidth, h = vp.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
if (window.ResizeObserver) new ResizeObserver(resize).observe(vp); window.addEventListener('resize', resize); resize();
let visible = true;
if (window.IntersectionObserver) new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(vp);

function frame(dtR) {
  animT += dtR;
  if (camGoal) {
    const k = Math.min(1, dtR * 4);
    camS.th += (camGoal.th - camS.th) * k; camS.ph += (camGoal.ph - camS.ph) * k; camS.r += (camGoal.r - camS.r) * k; camS.tgt.lerp(camGoal.tgt, k);
    if (Math.abs(camGoal.r - camS.r) < .01 && camS.tgt.distanceTo(camGoal.tgt) < .01) camGoal = null;
  }
  applyCam();
  const hr = S.t % 24, el = Math.sin(2 * Math.PI * (hr - 6) / 24), day = clamp(el * 1.8 + .3, 0, 1);
  scene.background.copy(SKY_NIGHT).lerp(SKY_DAY, day); scene.fog.color.copy(scene.background);
  hemi.intensity = .28 + .5 * day; sun.intensity = .08 + clamp(el, 0, 1);
  const az = 2 * Math.PI * (hr - 12) / 24; sun.position.set(6 * Math.sin(az) + 2, 3 + 9 * clamp(el, 0, 1), 5 * Math.cos(az));
  kitchenLamp.intensity = (1 - day) * 1.3 + (S.stove ? .6 : 0); siteLamp.intensity = (1 - day) * .9;

  drum.position.y = drumY(); rebuildHose();
  reliefV.material = S.relief ? MT.red : MT.dark;
  const sh = Math.max(.002, S.sludgeL / 1000 / (Math.PI * (R.tankR - .015) ** 2)); sludge.scale.y = sh; sludge.position.y = .1 + sh / 2;
  coilMat.color.setHex(S.hot ? (S.hotFail ? 0x9a8f86 : 0xff5a36) : S.cold ? 0x3a8cff : 0x8a9499);
  coilMat.emissive.setHex(S.hot && !S.hotFail ? 0x661a08 : S.cold ? 0x0a2a66 : 0);
  if (S.hot) hotValve.rotation.z += dtR * 3; if (S.cold) coldValve.rotation.z += dtR * 3;
  boilerFlame.visible = S.boiler; if (S.boiler) boilerFlame.scale.y = .8 + Math.random() * .4;

  const act = Math.round(bubbles.length * clamp(S.prod / .03, 0, 1)), topY = R.slurryH - .06;
  bubbles.forEach((b, i) => { b.visible = i < act; if (!b.visible) return; b.userData.p += dtR * (.35 + (i % 5) * .06); if (b.userData.p > 1) b.userData.p -= 1; b.position.set(b.userData.x + Math.sin(animT * 3 + i) * .01, .15 + b.userData.p * (topY - .15), b.userData.z); });
  const flow = S.use > 0 && S.stove;
  gasDots.forEach((d, i) => { d.visible = flow; if (!flow) return; d.userData.p = (d.userData.p + dtR * (.08 + .05 * S.burners)) % 1; d.position.copy(gasMain.userData.curve.getPointAt((d.userData.p + i / gasDots.length) % 1)); });
  flames.forEach((f, i) => { f.visible = S.stove && (i === 0 || S.burners === 2); if (f.visible) f.children.forEach(c => { c.scale.y = .7 + Math.random() * .7; }); });
  steam.forEach((s, i) => { if (!S.stove) { s.material.opacity = 0; return; } s.userData.p = (s.userData.p + dtR * .35) % 1; const p = s.userData.p; s.position.set(5.3 + Math.sin(i * 2 + p * 5) * .06, 1.15 + p * .6, -1.1 + Math.cos(i * 3) * .05); s.scale.setScalar(.6 + p * 1.6); s.material.opacity = .35 * (1 - p); });
  needle.rotation.z = -clamp(S.press / 20, 0, 1) * Math.PI * 1.5 + Math.PI * .75;
  const dosing = S.doseG > 0; if (dosing) pumpRotor.rotation.y += dtR * 12; bufPipe.material = dosing ? MT.water : MT.pvc;
  dropDots.forEach(d => { d.visible = dosing; if (!dosing) return; d.userData.p = (d.userData.p + dtR * 1.2) % 1; d.position.set(-.28, 1.1 - d.userData.p * .08, .28); });
  const draining = S.drainL > 0; if (draining) drainWheel.rotation.z += dtR * 4;
  drainDots.forEach((d, i) => { d.visible = draining; if (!draining) return; d.userData.p = (d.userData.p + dtR * .8) % 1; const p = (d.userData.p + i / drainDots.length) % 1; d.position.set(0, .12 - (p > .7 ? (p - .7) * .25 : 0), R.tankR + p * .65); });
  const ps = clamp(.3 + Math.sqrt(S.cum.fert) * .25, .3, 1.8); pile.scale.set(ps, ps, ps); pile.position.y = .06 + .1 * ps - .1;
  leakPuffs.forEach((p, i) => { p.visible = S.leak; if (!S.leak) return; p.userData.p = (p.userData.p + dtR * .6) % 1; const q = p.userData.p; p.position.set(1.05 + Math.sin(i) * .05, 1.0 + q * .5, Math.cos(i * 2) * .06 + q * .1); p.scale.setScalar(.4 + q * 1.8); p.material.opacity = .45 * (1 - q); });
  for (let i = chunks.length - 1; i >= 0; i--) { const c = chunks[i]; c.userData.v += dtR * 4; c.position.y -= c.userData.v * dtR; c.rotation.x += dtR * 3; if (c.position.y < 1.0) { scene.remove(c); c.material.dispose(); chunks.splice(i, 1); } }
  scanT += dtR; scanBeam.material.opacity = scanT < 2.5 ? .25 * (1 - scanT / 2.5) * (.6 + .4 * Math.sin(scanT * 12)) : 0;
  espLed.material.color.setHex(Math.sin(animT * 6) > 0 ? 0x22dd66 : 0x0b4a22);
  if (wifiQueue > 0 && wifiRings.every(r => r.userData.t > .9)) { wifiQueue--; wifiRings.forEach((r, i) => r.userData.t = -i * .18); }
  wifiRings.forEach(r => { r.userData.t += dtR; const t = r.userData.t; if (t < 0 || t > 1) { r.material.opacity = 0; return; } r.scale.setScalar(1 + t * 3); r.material.opacity = .8 * (1 - t); });
  const dotSt = { T: statusOf('T'), pH: statusOf('pH'), P: statusOf('P'), lvl: worst(statusOf('full'), statusOf('gas')), lel: statusOf('lel'), gasq: worst(statusOf('ch4'), statusOf('h2s')) };
  for (const k in sensorDots) { const st = dotSt[k] || 'ok'; sensorDots[k].material.color.setHex(st !== 'ok' && Math.sin(animT * 8) < 0 ? 0x333333 : DOTCOL[st]); }
  renderer.render(scene, camera);
  updateLabels(vp.clientWidth, vp.clientHeight);
}

window.SCENE = {
  frame: dt => { if (visible) frame(dt); },
  view: k => { camGoal = VIEWS[k]; },
  xray: on => { xray = on; tank.material = on ? MT.tank : MT.tankSolid; MT.slurry.opacity = on ? .55 : .95; },
  labels: () => { labelMode = (labelMode + 1) % 3; return labelMode; },
  wifi: () => { wifiQueue++; },
  scan: () => { scanT = 0; },
  chunks: (type, kg) => {
    const n = Math.min(14, 3 + Math.round(kg * 1.5));
    for (let i = 0; i < n; i++) {
      const c = new THREE.Mesh(chunkGeo, new THREE.MeshStandardMaterial({ color: FOODCOL[type] || 0xb08040 }));
      c.position.set(-1.45 + (Math.random() - .5) * .3, 1.6 + Math.random() * .6, .35 + (Math.random() - .5) * .3);
      c.userData.v = 0; c.rotation.set(Math.random() * 3, Math.random() * 3, 0); scene.add(c); chunks.push(c);
    }
  },
  resize
};
})();
