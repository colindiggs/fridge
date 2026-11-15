// Low-poly 3D fridge, pantry and counter. Units are inches.
// Models: Kenney Food Kit (CC0) GLBs plus a few shapes built here (#box, #tub, #eggs, #butter).
// If anything here fails, the page keeps its plain tile view.
import * as THREE from "three";
import { GLTFLoader } from "../vendor/loaders/GLTFLoader.js";

const ease = t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;
const hash = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const rnd = (s, i) => ((hash(s + i) % 1000) / 1000);
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const day = s => new Date(s + "T12:00:00").toLocaleDateString("en-US", {month: "short", day: "numeric"});

// ---------- materials ----------
// One shader patch for every kit model: optional recolor (keeps the model's light and dark facets) and a "low" fade.
function kitMaterial(base, tint, low, ghost) {
  const m = base.clone();
  m.flatShading = true; m.roughness = .9; m.metalness = 0;
  m.userData.u = { uTint: { value: tint ? new THREE.Color(tint) : new THREE.Color(-1, -1, -1) }, uLow: { value: low ? .55 : 0 } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, m.userData.u);
    sh.fragmentShader = "uniform vec3 uTint; uniform float uLow;\n" + sh.fragmentShader.replace("#include <map_fragment>",
      `#include <map_fragment>
       float l0 = dot(diffuseColor.rgb, vec3(.2126, .7152, .0722));
       if (uTint.r >= 0.0) diffuseColor.rgb = uTint * (.62 + .55 * sqrt(l0));
       float g = dot(diffuseColor.rgb, vec3(.2126, .7152, .0722));
       diffuseColor.rgb = mix(diffuseColor.rgb, vec3(g * 1.05), uLow);`);
  };
  m.customProgramCacheKey = () => "kit";
  if (ghost) Object.assign(m, { transparent: true, opacity: .22, depthWrite: false });
  return m;
}
function flat(color, { low, ghost, opacity } = {}) {
  const c = new THREE.Color(color);
  if (low) { const g = c.r*.2126 + c.g*.7152 + c.b*.0722; c.lerp(new THREE.Color(g, g, g), .55); }
  const m = new THREE.MeshStandardMaterial({ color: c, roughness: .85, metalness: 0, flatShading: true });
  if (ghost) Object.assign(m, { transparent: true, opacity: .22, depthWrite: false });
  else if (opacity) Object.assign(m, { transparent: true, opacity, depthWrite: false });
  return m;
}

// ---------- labels ----------
const labelCache = new Map();
function labelTexture(text, bg = "#fbf7ea", ink = "#1d2b27") {
  const key = text + bg + ink;
  if (labelCache.has(key)) return labelCache.get(key);
  const cv = document.createElement("canvas"); cv.width = 256; cv.height = 96;
  const g = cv.getContext("2d");
  g.fillStyle = bg; g.fillRect(0, 0, 256, 96);
  g.fillStyle = ink; g.textAlign = "center"; g.textBaseline = "middle";
  let size = 56;
  do { g.font = `800 ${size}px "Bricolage Grotesque", system-ui, sans-serif`; size -= 2; } while (g.measureText(text).width > 232 && size > 16);
  g.fillText(text, 128, 50);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  labelCache.set(key, t); return t;
}
function addLabel(obj, text, ghost) {
  const b = new THREE.Box3().setFromObject(obj), s = b.getSize(new THREE.Vector3());
  let w = s.x * .82, h = w * .375;
  if (h > s.y * .42) { h = s.y * .42; w = h / .375; }
  const mat = new THREE.MeshStandardMaterial({ map: labelTexture(text), roughness: .8, polygonOffset: true, polygonOffsetFactor: -2 });
  if (ghost) Object.assign(mat, { transparent: true, opacity: .25, depthWrite: false });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  p.position.set((b.min.x + b.max.x) / 2, b.min.y + s.y * .45, b.max.z + .04);
  obj.add(p);
}

// ---------- shapes built in code ----------
const BOX = (w, h, d) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); return g; };
function mesh(geo, mat) { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; return m; }
const built = {
  box(s, o) {
    const g = new THREE.Group();
    g.add(mesh(BOX(s.w, s.h, s.d || 2.5), flat(s.color || "#c9a06a", o)));
    if (s.band) { const b = mesh(BOX(s.w + .04, s.h * .18, (s.d || 2.5) + .04), flat(s.band, o)); b.position.y = s.h * .14; g.add(b); }
    return g;
  },
  tub(s, o) {
    const r = (s.w || 4) / 2, h = s.h || 3, g = new THREE.Group();
    const body = new THREE.CylinderGeometry(r, r * .88, h, 12); body.translate(0, h / 2, 0);
    const lid = new THREE.CylinderGeometry(r * 1.04, r * 1.04, .45, 12); lid.translate(0, h + .2, 0);
    g.add(mesh(body, flat(s.color || "#f6f4ee", o)), mesh(lid, flat(s.lid || "#3f78c9", o)));
    return g;
  },
  prep(s, o) {
    const g = new THREE.Group(), w = s.w || 7, h = s.h || 3.4, d = s.d || 5;
    g.add(mesh(BOX(w, h, d), flat("#e6f1f3", { ...o, opacity: o.ghost ? 0 : .5 })));
    const food = mesh(BOX(w - .5, h * .62, d - .5), flat(s.color || "#f1e2a8", o)); food.position.y = .2; g.add(food);
    const lid = mesh(BOX(w + .2, .55, d + .2), flat(s.lid || "#d9483b", o)); lid.position.y = h; g.add(lid);
    return g;
  },
  butter(s, o) {
    const g = new THREE.Group();
    g.add(mesh(BOX(5, 2.6, 2.6), flat("#f6e08a", o)));
    const b = mesh(BOX(5.04, .8, 2.64), flat("#d9483b", o)); b.position.y = .9; g.add(b);
    return g;
  },
  eggs(s, o) {
    const g = new THREE.Group(), pulp = flat("#cfc5b1", o), egg = flat("#f1dcc2", o);
    g.add(mesh(BOX(11.5, 1.7, 4.2), pulp));
    const eg = new THREE.SphereGeometry(.9, 8, 6); eg.scale(1, 1.3, 1);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) {
      const e = mesh(eg, egg); e.position.set(-4.8 + i * 1.92, 2.1, -1 + j * 2.05); g.add(e);
    }
    const lid = new THREE.Group(), lg = BOX(11.5, .8, 4.2); lg.translate(0, 0, 2.1);
    lid.add(mesh(lg, flat("#d8cfbd", o)));
    lid.position.set(0, 1.7, -2.1); lid.rotation.x = -1.95; g.add(lid);
    return g;
  },
};

// ---------- the item-to-model map ----------
function resolve(MAP, it, loc) {
  const name = it.name, low = name.toLowerCase();
  const rule = (MAP.rules.find(([re]) => new RegExp(re, "i").test(low)) || [])[1];
  const s = Object.assign({}, MAP.locations[loc] || MAP.locations.fridge, MAP.categories[it.cat] || {}, rule || {}, MAP.items[name] || {});
  if (s.label === true) s.label = name.toUpperCase().slice(0, 12);
  return s;
}

const loader = new GLTFLoader();
const glbCache = new Map();
function loadGLB(url) {
  if (!glbCache.has(url)) glbCache.set(url, loader.loadAsync(url).then(g => g.scene).catch(() => null));
  return glbCache.get(url);
}

async function makeItem(MAP, it, s, base) {
  const o = { low: it.status === "low", ghost: !!it.ghost };
  const g = new THREE.Group();
  let one;
  const make = async () => {
    if (s.model.startsWith("#")) return built[s.model.slice(1)](s, o);
    const src = await loadGLB(base + "models/" + MAP.models[s.model]);
    if (!src) return built.box({ w: s.w || 3, h: s.h || 4, color: s.tint || "#c9a06a" }, o);
    const c = src.clone(true);
    c.traverse(n => { if (n.isMesh) { n.material = kitMaterial(n.material, s.tint, o.low, o.ghost); n.castShadow = !o.ghost; n.receiveShadow = true; } });
    if (s.lie) c.rotation.z = Math.PI / 2;
    const w = new THREE.Group(); w.add(c);
    const b = new THREE.Box3().setFromObject(w), sz = b.getSize(new THREE.Vector3());
    const k = s.h ? s.h / sz.y : (s.w || 4) / Math.max(sz.x, sz.z);
    c.scale.multiplyScalar(k);
    const b2 = new THREE.Box3().setFromObject(w);
    c.position.y -= b2.min.y; c.position.x -= (b2.min.x + b2.max.x) / 2; c.position.z -= (b2.min.z + b2.max.z) / 2;
    return w;
  };
  const n = Math.max(1, Math.min(s.count || 1, 6));
  let x = 0;
  for (let i = 0; i < n; i++) {
    const m = await make();
    if (s.label && i === 0) addLabel(m, s.label, o.ghost);
    const sz = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
    if (n > 1 && !s.label) m.rotation.y = (rnd(it.name, i) - .5) * 1.2;
    m.position.set(x + sz.x / 2, 0, (rnd(it.name, i + 9) - .5) * Math.min(sz.z, 2));
    x += sz.x * (n > 3 ? .8 : .95);
    g.add(m);
  }
  // recentre the group on x
  const b = new THREE.Box3().setFromObject(g);
  g.children.forEach(c => c.position.x -= (b.min.x + b.max.x) / 2);
  g.userData.item = it;
  if (o.ghost) g.traverse(c => { if (c.isMesh) c.castShadow = false; });
  g.traverse(c => c.userData.owner = g);
  return g;
}

// ---------- packing items onto shelves ----------
// zones: [{rows: [z...], x0, x1, y, maxH, parent}] ; returns items that did not fit
function pack(groups, zones) {
  const cursors = zones.map(z => z.rows.map(() => z.x0));
  const left = [];
  groups.sort((a, b) => (a.userData.item.ghost - b.userData.item.ghost) || (b.userData.h - a.userData.h));
  for (const g of groups) {
    const sz = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
    let placed = false;
    for (let pass = 0; pass < 2 && !placed; pass++) {
      for (let zi = 0; zi < zones.length && !placed; zi++) {
        const z = zones[zi];
        if (pass === 0 && sz.y > z.maxH) continue;
        for (let ri = 0; ri < z.rows.length && !placed; ri++) {
          const gap = .7, x = cursors[zi][ri];
          if (x + sz.x > z.x1) continue;
          if (sz.y > z.maxH) g.scale.multiplyScalar((z.maxH - .3) / sz.y);
          const w = sz.x * g.scale.x;
          g.position.set(x + w / 2, z.y, z.rows[ri]);
          cursors[zi][ri] = x + w + gap;
          (z.parent || z.scene).add(g); placed = true;
        }
      }
    }
    if (!placed) left.push(g);
  }
  return left;
}

// ---------- shared viewer ----------
function viewer(canvas, opts) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: !!opts.alpha });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  if (opts.bg) scene.background = new THREE.Color(opts.bg);
  const camera = new THREE.PerspectiveCamera(opts.fov || 36, 1, 1, 600);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9a88f, 1.6));
  const sun = new THREE.DirectionalLight(0xfff6e8, 1.7);
  sun.position.set(...(opts.sun || [-20, 70, 60])); sun.target.position.set(...(opts.sunTarget || [15, 20, -10]));
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -.0005; sun.shadow.normalBias = .04;
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 220 });
  scene.add(sun, sun.target);
  let pose = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const v = {
    renderer, scene, camera, canvas,
    setPose(p) { pose = p; camera.position.copy(p.pos); camera.lookAt(p.look); },
    size() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return false;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
      return true;
    },
    render() { renderer.render(scene, camera); },
    // a camera distance that fits a world box (x0,x1,y0,y1 at depth z) into the view
    fit(box, look, from = [0, 0, 1]) {
      const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const d = Math.max((box[3] - box[2]) / 2 / t, (box[1] - box[0]) / 2 / (t * camera.aspect));
      const dir = new THREE.Vector3(...from).normalize();
      return { pos: new THREE.Vector3(...look).addScaledVector(dir, d), look: new THREE.Vector3(...look) };
    },
    pick(ev) {
      const r = canvas.getBoundingClientRect();
      const p = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      const ray = new THREE.Raycaster(); ray.setFromCamera(p, camera);
      const hit = ray.intersectObjects(scene.children, true).find(h => h.object.userData.owner || h.object.userData.door);
      return hit ? (hit.object.userData.owner || hit.object) : null;
    },
    project(obj) {
      const b = new THREE.Box3().setFromObject(obj), c = b.getCenter(new THREE.Vector3());
      c.y = b.max.y; c.project(camera);
      return { x: (c.x + 1) / 2 * canvas.clientWidth, y: (1 - c.y) / 2 * canvas.clientHeight };
    },
  };
  return v;
}

function onTap(el, fn) {
  let d = null;
  el.addEventListener("pointerdown", e => { d = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  el.addEventListener("pointerup", e => {
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8 && performance.now() - d.t < 600) fn(e);
    d = null;
  });
}

function tagHTML(it) {
  const how = it.source === "photo" ? "Seen in a photo" : it.source === "receipt" ? "Bought" : "Noted";
  const lines = [];
  if (it.ghost) lines.push(`Out right now. Usually here (${esc(it.usual)}).`);
  else if (it.status === "low") lines.push("Probably running low.");
  if (it.last) lines.push(`Bought ${day(it.last)}${it.cost != null ? ` · $${Number(it.cost).toFixed(2)}` : ""}`);
  else lines.push(`${how} ${day(it.since)}`);
  if (!it.ghost && !/^0 /.test(it.usual || "")) lines.push(`On ${esc(it.usual)}`);
  return `<b>${esc(it.name)}</b>${lines.map(l => `<span>${l}</span>`).join("")}`;
}
function tagText(it) { return tagHTML(it).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }

// ---------- scenes ----------
// Colin's fridge: LG French doors over a freezer drawer. Inside, three glass shelves, two crispers and a
// full-width drawer; three bins in each door. His pantry is a closet with five shelves.
const C = { enamel: "#b9d9c8", enamel2: "#a5ccb8", liner: "#eef3f5", liner2: "#e2eaee", glass: "#cfe7ee", trim: "#d7e0e5", bin: "#d6ecf2" };
const FR = { W: 32, D: 24, H: 52, FH: 16, shelves: [40, 28.5, 17], doorW: 17.5, bins: [[40, 5], [22, 5], [2.5, 6]] };

function fridgeScene(v) {
  const s = v.scene, { W, D, H, FH } = FR;
  const add = (geo, mat, x, y, z, parent = s) => { const m = mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const liner = flat(C.liner), liner2 = flat(C.liner2), enamel = flat(C.enamel), trim = flat(C.trim);
  const z = (rows, x0, x1, y, maxH, parent) => ({ rows, x0, x1, y, maxH, scene: s, parent });
  const zones = {};

  // cabinet: liner walls inside an enamel frame
  add(BOX(W, H, .5), liner2, W / 2, 0, -D);
  add(BOX(.5, H, D), liner, .25, 0, -D / 2); add(BOX(.5, H, D), liner, W - .25, 0, -D / 2);
  add(BOX(W, .5, D), liner, W / 2, -.5, -D / 2); add(BOX(W, .5, D), liner, W / 2, H, -D / 2);
  add(BOX(1.5, H + FH + 6, D), enamel, -.75, -FH - 3, -D / 2 + .2); add(BOX(1.5, H + FH + 6, D), enamel, W + .75, -FH - 3, -D / 2 + .2);
  add(BOX(W + 3, 2.5, D), enamel, W / 2, H + .5, -D / 2 + .2);
  add(BOX(W + 3, 2.5, D), enamel, W / 2, -3, -D / 2 + .2);
  add(BOX(W, FH, .5), liner2, W / 2, -FH - 3, -D);                        // freezer cavity, seen behind the drawer
  add(BOX(W + 3, 2, D), enamel, W / 2, -FH - 5, -D / 2 + .2);
  const strip = add(BOX(W * .55, .5, 1.2), new THREE.MeshBasicMaterial({ color: 0xfffbea }), W / 2, H - .5, -D * .55);
  strip.castShadow = false;

  // glass shelves (top, middle, bottom) and the zones on them
  const glass = flat(C.glass, { opacity: .7 });
  FR.shelves.forEach((y, i) => {
    add(BOX(W - 1, .35, D - 1), glass, W / 2, y, -D / 2).receiveShadow = true;
    add(BOX(W - 1, .6, .4), trim, W / 2, y - .15, -.7);
    const top = i ? FR.shelves[i - 1] : H;
    zones[`shelf-${i + 1}`] = [z([-15, -6], 1, W - 1, y + .35, top - y - 1.2)];
  });
  // two crispers under the bottom shelf, a full-width drawer under those
  const clear = flat("#eef6f9", { opacity: .55 });
  add(BOX(W - 1, .5, D - 1), liner, W / 2, 7, -D / 2);
  for (const [x0, x1, side] of [[.8, W / 2 - .4, "left"], [W / 2 + .4, W - .8, "right"]]) {
    add(BOX(x1 - x0, 6.5, .35), clear, (x0 + x1) / 2, 7.5, -1.4);
    add(BOX(x1 - x0, .5, .5), trim, (x0 + x1) / 2, 13.6, -1.4);
    zones[`crisper-${side}`] = [z([-14, -6], x0 + .5, x1 - .5, 7.5, 9)];
  }
  add(BOX(.5, 9.5, D - 2), clear, W / 2, 7.5, -D / 2 - .5);
  add(BOX(W - 1.6, 4.6, .35), clear, W / 2, 0, -1.2);
  add(BOX(W - 1.6, .5, .5), trim, W / 2, 4.3, -1.2);
  zones.drawer = [z([-13, -5.5], 1, W - 1, 0, 6.2)];

  const lamp = new THREE.PointLight(0xfff3d6, 300, 80, 1.5); lamp.position.set(W / 2, H - 3, -6); s.add(lamp);
  const low = new THREE.PointLight(0xfff3d6, 70, 40, 1.6); low.position.set(W / 2, 13, -3); s.add(low);

  // French doors, hinged at the outer edges. Door space: x runs from the hinge toward the middle, the inner face is at z=0 facing -z.
  const doors = [];
  const mkDoor = (side) => {
    const sgn = side === "left" ? 1 : -1, dw = FR.doorW;
    const pivot = new THREE.Group(); pivot.position.set(side === "left" ? -1.5 : W + 1.5, 0, .6); s.add(pivot);
    pivot.userData.sign = sgn;
    const mid = sgn * dw / 2;
    const panel = add(BOX(dw - .15, H + 3.5, 2.4), enamel, mid, -1.5, 1.2, pivot); panel.userData.door = true;
    add(BOX(dw - 3, H - 1, .5), liner, mid, 0, -.25, pivot);
    add(BOX(1, H * .4, 1.2), flat("#e8eef0"), sgn * (dw - 2), H * .35, 2.8, pivot);
    FR.bins.forEach(([by, bh], i) => {
      add(BOX(dw - 3, .45, 4.6), flat(C.bin), mid, by, -2.7, pivot);
      add(BOX(dw - 3, bh, .3), flat(C.bin, { opacity: .5 }), mid, by, -5, pivot);
      add(BOX(dw - 3, .5, .5), flat("#bcdde6"), mid, by + bh - .4, -5, pivot);
      // contents face out of the door (-z in door space): a holder turned half a turn, so its +x runs the other way
      const holder = new THREE.Group(); holder.rotation.y = Math.PI; holder.position.set(0, 0, -2.7); pivot.add(holder);
      const [a, b] = side === "left" ? [-(dw - 2), -1.8] : [1.8, dw - 2];
      zones[`door-${side}-${i + 1}`] = [{ rows: [0], x0: a, x1: b, y: by + .45, maxH: i ? 13 : 11, parent: holder }];
    });
    doors.push(pivot);
  };
  mkDoor("left"); mkDoor("right");

  // freezer drawer: slides out when the doors open
  const drawer = new THREE.Group(); s.add(drawer);
  const fy = -FH - 2.5;
  add(BOX(W + 3, FH, 2.4), enamel, W / 2, fy, 1.2, drawer).userData.door = true;
  add(BOX(W * .6, 1, 1.2), flat("#e8eef0"), W / 2, fy + FH - 3, 2.9, drawer);
  const fbin = flat("#d5e6ef");
  add(BOX(W - 1, .4, 20), fbin, W / 2, fy + 1, -10, drawer);
  add(BOX(.4, 11, 20), fbin, 1, fy + 1, -10, drawer); add(BOX(.4, 11, 20), fbin, W - 1, fy + 1, -10, drawer);
  add(BOX(W - 1, 11, .4), fbin, W / 2, fy + 1, -20, drawer);
  zones.freezer = [z([-16, -9, -3], 1.6, W - 1.6, fy + 1.4, 10, drawer)];

  // shorthand spots for items the Inventory tab hasn't placed yet
  zones.shelf = [zones["shelf-2"][0], zones["shelf-3"][0], zones["shelf-1"][0]];
  zones.crisper = [zones["crisper-left"][0], zones["crisper-right"][0]];
  zones.door = ["right-2", "left-3", "right-3", "right-1", "left-1", "left-2"].map(k => zones["door-" + k][0]);
  return { doors, drawer, zones };
}

function pantryScene(v) {
  const s = v.scene, W = 30, D = 14, ys = [53, 40, 27, 14, 0], top = 66;
  const wall = flat("#cfd8dd"), white = flat("#f3efe6"), frame = flat("#e9e4da");
  const add = (geo, mat, x, y, z) => { const m = mesh(geo, mat); m.position.set(x, y, z); s.add(m); return m; };
  add(BOX(W + 8, top + 8, .5), wall, W / 2, -4, -D);
  add(BOX(1, top + 8, D), wall, -.5, -4, -D / 2); add(BOX(1, top + 8, D), wall, W + .5, -4, -D / 2);
  add(BOX(3, top + 8, 1.5), frame, -2, -4, .6); add(BOX(3, top + 8, 1.5), frame, W + 2, -4, .6);
  add(BOX(W + 7, 3, 1.5), frame, W / 2, top, .6);
  const zones = {};
  ys.forEach((y, i) => {
    add(BOX(W, .9, D), white, W / 2, y - .9, -D / 2 + .3);
    zones[`shelf-${i + 1}`] = [{ rows: [-10, -4.5], x0: .8, x1: W - .8, y, maxH: (i ? ys[i - 1] : top) - y - 1.3, scene: s }];
  });
  zones.pantry = [3, 4, 2, 1].map(n => zones[`shelf-${n}`][0]);
  const lamp = new THREE.PointLight(0xfff3d6, 160, 90, 1.5); lamp.position.set(W / 2, top - 2, -2); s.add(lamp);
  return { zones, W, top };
}

function counterScene(v) {
  const s = v.scene, W = 44;
  const add = (geo, mat, x, y, z) => { const m = mesh(geo, mat); m.position.set(x, y, z); s.add(m); return m; };
  add(BOX(W + 10, 1.4, 16), flat("#e9dfcc"), W / 2, -1.4, -6);
  add(BOX(W + 10, 20, .5), flat("#dfe7ea"), W / 2, -1.4, -14);
  const bowl = new THREE.CylinderGeometry(7, 4.5, 3, 14, 1, true); bowl.translate(0, 1.5, 0);
  const b = mesh(bowl, flat("#3f78c9")); b.material.side = THREE.DoubleSide; b.position.set(W * .72, 0, -6); s.add(b);
  return { zones: { counter: [{ rows: [-8, -3.5], x0: 1, x1: W - 1, y: 0, maxH: 12, scene: s }] } };
}

// ---------- page wiring ----------
export async function start(D, MAP, base = "./") {
  const probe = document.createElement("canvas");
  if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) return false;
  await document.fonts.ready.catch(() => {});

  const css = document.createElement("style");
  css.textContent = `
    .has3d .shelf, .has3d .empty { display: none !important; }
    .stage3d { position: relative; width: 100%; touch-action: manipulation; }
    .stage3d canvas { display: block; width: 100%; height: 100%; }
    .fridge3d { aspect-ratio: 3 / 4; }
    .has3d .cab-inside { aspect-ratio: 3 / 5; min-height: 0; padding: 0; }
    .ov3d { position: absolute; transition: opacity .25s; }
    .ov3d.off { opacity: 0; pointer-events: none; }
    .ov3d .magnets { inset: 6% 16% 6% 5%; }
    .tag3d { position: absolute; z-index: 3; translate: -50% calc(-100% - 10px); background: var(--paper); color: var(--ink);
      font: 12px/1.35 var(--font-mono); padding: 7px 10px; border-radius: 8px; box-shadow: 0 8px 18px -8px rgba(0,0,0,.5);
      display: grid; gap: 1px; max-width: 220px; pointer-events: none; }
    .tag3d b { font: 700 14px var(--font-display); }
    .tag3d::after { content: ""; position: absolute; left: 50%; bottom: -6px; translate: -50% 0; border: 6px solid transparent; border-bottom: 0; border-top-color: var(--paper); }
    .close3d { position: absolute; top: 8px; right: 8px; z-index: 4; border: 0; background: rgba(0,0,0,.55); color: #fff; border-radius: 999px;
      font: 600 11px var(--font-mono); padding: 5px 11px; cursor: pointer; }
    .close3d[hidden] { display: none; }
    .cab-inside .stage3d { position: absolute; inset: 0; border-radius: 4px; overflow: hidden; }
    .counter .stage3d { aspect-ratio: 3 / 1; border-radius: 8px; overflow: hidden; }
    .pantry-tagbox { position: absolute; inset: 0; pointer-events: none; z-index: 3; }`;
  document.head.appendChild(css);

  const views = [];
  const loadAll = async (loc, V, zones) => {
    const items = D.shelves[loc] || [];
    const groups = await Promise.all(items.map(async it => {
      const s = resolve(MAP, it, loc);
      const g = await makeItem(MAP, it, s, base);
      g.userData.spot = [it.spot, s.spot, loc].find(k => k && zones[k]) || Object.keys(zones)[0]; g.userData.h = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3()).y;
      return g;
    }));
    const bySpot = {};
    groups.forEach(g => (bySpot[g.userData.spot] ||= []).push(g));
    let spill = [];
    for (const [spot, gs] of Object.entries(bySpot)) spill = spill.concat(pack(gs, zones[spot] || []));
    if (spill.length) spill = pack(spill, zones.shelf || zones[loc] || []);
    if (spill.length) console.info("fridge3d: no room for", spill.map(g => g.userData.item.name));
  };

  // --- fridge ---
  const sec = document.querySelector('section[aria-label="Fridge"]');
  const fstage = document.createElement("div"); fstage.className = "stage3d fridge3d";
  fstage.innerHTML = `<canvas aria-label="Your fridge. Tap the door to open it, then tap anything inside."></canvas>
    <div class="ov3d ov-freezer"></div><div class="ov3d ov-main"></div>
    <button class="close3d" hidden>close</button><div class="tag3d" hidden></div>`;
  const fread = document.createElement("p"); fread.className = "readout"; fread.setAttribute("aria-live", "polite");
  const fv = viewer(fstage.querySelector("canvas"), { fov: 34, sun: [-25, 90, 80], sunTarget: [15, 25, -12] });
  const { doors, drawer, zones } = fridgeScene(fv);
  const { W, H, FH } = FR;
  await loadAll("fridge", fv, zones);
  await loadAll("freezer", fv, { freezer: zones.freezer });
  // all loaded: swap the CSS fridge for the 3D one
  const mags = document.getElementById("magnets"), letters = document.getElementById("letters");
  sec.replaceChildren(fstage, fread);
  fstage.querySelector(".ov-main").append(mags);
  fstage.querySelector(".ov-freezer").append(letters);
  mags.classList.add("magnets");
  document.body.classList.add("has3d");

  let open = 0, anim = null;
  const tag = fstage.querySelector(".tag3d"), closeBtn = fstage.querySelector(".close3d");
  const poses = () => {
    fv.size();
    const closed = fv.fit([-4, W + 4, -FH - 7, H + 4], [W / 2, (H - FH - 3) / 2, 0]);
    const opened = fv.fit([-13, W + 13, -FH - 7, H + 4], [W / 2, (H - FH - 3) / 2 + 2, -4], [0, .14, 1]);
    return { closed, opened };
  };
  const placeOverlays = () => {
    // project the closed door faces onto the canvas to pin the magnets
    const P = (x, y) => { const p = new THREE.Vector3(x, y, 3.2).project(fv.camera); return [(p.x + 1) / 2 * fstage.clientWidth, (1 - p.y) / 2 * fstage.clientHeight]; };
    const set = (el, x0, y0, x1, y1) => { const [a, b] = P(x0, y1), [c, d] = P(x1, y0); Object.assign(el.style, { left: a + "px", top: b + "px", width: (c - a) + "px", height: (d - b) + "px" }); };
    set(fstage.querySelector(".ov-main"), -1.5, -1.5, W + 1.5, H + 2);
    set(fstage.querySelector(".ov-freezer"), -1.5, -FH - 2.5, W + 1.5, -2.5);
  };
  const frame = t => {
    const { closed, opened } = poses();
    const k = ease(t);
    doors.forEach(d => d.rotation.y = -d.userData.sign * k * THREE.MathUtils.degToRad(108));
    drawer.position.z = k * 13;
    fv.camera.position.lerpVectors(closed.pos, opened.pos, k);
    fv.camera.lookAt(new THREE.Vector3().lerpVectors(closed.look, opened.look, k));
    fv.render();
  };
  const go = to => {
    if (anim) cancelAnimationFrame(anim);
    tag.hidden = true;
    const from = open, t0 = performance.now(), dur = matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 900;
    if (to) fstage.querySelectorAll(".ov3d").forEach(o => o.classList.add("off"));
    const stepf = now => {
      open = from + (to - from) * Math.min(1, (now - t0) / dur);
      frame(open);
      if ((now - t0) < dur) anim = requestAnimationFrame(stepf);
      else { anim = null; closeBtn.hidden = !to; if (!to) { placeOverlays(); fstage.querySelectorAll(".ov3d").forEach(o => o.classList.remove("off")); } }
    };
    anim = requestAnimationFrame(stepf);
    fread.textContent = to ? "Tap anything. See-through ones are usually here but aren't now." : "";
  };
  onTap(fv.canvas, e => {
    if (!open) return go(1);
    if (anim) return;
    const hit = fv.pick(e);
    if (hit && hit.userData.item) {
      const it = hit.userData.item, p = fv.project(hit);
      tag.innerHTML = tagHTML(it); tag.hidden = false;
      tag.style.left = Math.max(70, Math.min(fstage.clientWidth - 70, p.x)) + "px"; tag.style.top = Math.max(60, p.y) + "px";
      fread.textContent = tagText(it);
    } else tag.hidden = true;
  });
  fstage.querySelectorAll(".ov3d").forEach(o => o.addEventListener("click", () => go(1)));
  closeBtn.addEventListener("click", () => go(0));
  const redrawF = () => { frame(open); if (!open) placeOverlays(); tag.hidden = true; };
  new ResizeObserver(redrawF).observe(fstage);
  views.push(fv);

  // --- pantry: 3D behind the existing wooden doors ---
  const cab = document.querySelector(".cab-inside");
  if (cab) {
    const ps = document.createElement("div"); ps.className = "stage3d";
    ps.innerHTML = `<canvas aria-label="Pantry shelves. Tap anything."></canvas><div class="tag3d" hidden></div>`;
    const pv = viewer(ps.querySelector("canvas"), { bg: "#cfd8dd", fov: 30, sun: [-10, 90, 80], sunTarget: [15, 30, -6] });
    const { zones: pz, W: PW, top: PT } = pantryScene(pv);
    await loadAll("pantry", pv, pz);
    cab.prepend(ps);
    const ptag = ps.querySelector(".tag3d"), pread = cab.querySelector(".readout");
    const draw = () => { if (!pv.size()) return; pv.setPose(pv.fit([-1, PW + 1, -2, PT + 2], [PW / 2, PT / 2 - 1, 0], [0, .08, 1])); pv.render(); ptag.hidden = true; };
    new ResizeObserver(draw).observe(ps);
    onTap(pv.canvas, e => {
      const hit = pv.pick(e);
      if (hit && hit.userData.item) {
        const p = pv.project(hit);
        ptag.innerHTML = tagHTML(hit.userData.item); ptag.hidden = false;
        ptag.style.left = Math.max(70, Math.min(ps.clientWidth - 70, p.x)) + "px"; ptag.style.top = Math.max(60, p.y) + "px";
        if (pread) pread.textContent = tagText(hit.userData.item);
      } else ptag.hidden = true;
    });
    views.push(pv);
  }

  // --- counter ---
  const counter = document.querySelector(".counter");
  if (counter && (D.shelves.counter || []).length) {
    const cs = document.createElement("div"); cs.className = "stage3d";
    cs.innerHTML = `<canvas aria-label="Counter. Tap anything."></canvas><div class="tag3d" hidden></div>`;
    const cv = viewer(cs.querySelector("canvas"), { alpha: true, fov: 30, sun: [-10, 60, 50], sunTarget: [22, 0, -6] });
    const { zones: cz } = counterScene(cv);
    await loadAll("counter", cv, cz);
    counter.querySelector(".label").after(cs);
    const ctag = cs.querySelector(".tag3d"), cread = counter.querySelector(".readout");
    const draw = () => { if (!cv.size()) return; cv.setPose(cv.fit([-1, 45, -2, 12], [22, 4, -4], [0, .45, 1])); cv.render(); ctag.hidden = true; };
    new ResizeObserver(draw).observe(cs);
    onTap(cv.canvas, e => {
      const hit = cv.pick(e);
      if (hit && hit.userData.item) {
        const p = cv.project(hit);
        ctag.innerHTML = tagHTML(hit.userData.item); ctag.hidden = false;
        ctag.style.left = Math.max(70, Math.min(cs.clientWidth - 70, p.x)) + "px"; ctag.style.top = Math.max(60, p.y) + "px";
        if (cread) cread.textContent = tagText(hit.userData.item);
      } else ctag.hidden = true;
    });
  }
  // models may finish loading textures after the first frame
  setTimeout(() => { redrawF(); views.forEach(v => { v.size(); v.render(); }); }, 600);
  return true;
}
