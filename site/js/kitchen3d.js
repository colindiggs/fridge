// Low-poly 3D fridge and pantry. Units are inches.
// Models: Kenney Food Kit (CC0) GLBs plus a few shapes built here (#box, #tub, #eggs, #butter).
// If anything here fails, the page keeps its plain tile view.
import * as THREE from "three";
import { GLTFLoader } from "../vendor/loaders/GLTFLoader.js";
import { RoomEnvironment } from "../vendor/environments/RoomEnvironment.js";

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
  if (ghost) Object.assign(m, { transparent: true, opacity: .06, depthWrite: false });
  return m;
}
function flat(color, { low, ghost, opacity } = {}) {
  const c = new THREE.Color(color);
  if (low) { const g = c.r*.2126 + c.g*.7152 + c.b*.0722; c.lerp(new THREE.Color(g, g, g), .55); }
  const m = new THREE.MeshStandardMaterial({ color: c, roughness: .85, metalness: 0, flatShading: true });
  if (ghost) Object.assign(m, { transparent: true, opacity: .06, depthWrite: false });
  else if (opacity) Object.assign(m, { transparent: true, opacity, depthWrite: false });
  return m;
}

// An item that is usually here but is out: a faint shell with a dashed outline in its place.
const dashMat = new THREE.LineDashedMaterial({ color: 0x4f6470, dashSize: .32, gapSize: .22, transparent: true, opacity: .85 });
function dashed(g) {
  const meshes = [];
  g.traverse(c => { if (c.isMesh) meshes.push(c); });
  for (const m of meshes) {
    m.castShadow = false;
    const line = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 28), dashMat);
    line.computeLineDistances(); line.userData.edge = true;
    m.add(line);
  }
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
  // later layers win; a layer that picks a model also drops the earlier layers' sizes and colors, which were for another shape
  const s = {};
  for (const L of [MAP.locations[loc] || MAP.locations.fridge, MAP.categories[it.cat], rule, MAP.items[name]]) {
    if (!L) continue;
    if (L.model) for (const k of ["w", "h", "d", "lie", "count", "tint", "color", "band", "lid"]) delete s[k];
    Object.assign(s, L);
  }
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
    if (s.model === "bag") c.rotation.y = Math.PI / 2;   // the kit's bag is deep and narrow; show its wide face
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
    if (s.label && i === 0 && !o.ghost) addLabel(m, s.label);
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
  if (o.ghost) dashed(g);
  g.traverse(c => c.userData.owner = g);
  return g;
}

// ---------- the snap grid ----------
// Every zone row is a lane of 1-inch cells. An item takes as many cells as it is wide, so items snap
// into place and never overlap. Where each item sits is kept per device; anything not placed by hand
// is packed in order, tallest first, so an item keeps its spot whether it's in or out (ghosts pack too).
const CELL = 1, LAYOUT_KEY = "fridge.layout.v1";
const store = {
  get() { try { return JSON.parse(localStorage.getItem(LAYOUT_KEY) || "{}"); } catch (e) { return {}; } },
  set(o) { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(o)); } catch (e) {} },
};
function makeGrid(zones) {
  const byZone = new Map(), lanes = [];
  for (const [key, zs] of Object.entries(zones)) zs.forEach((z, zi) => {
    if (byZone.has(z)) return;   // shelf, crisper and door are shorthand for zones already listed
    const ls = z.rows.map((row, ri) => ({ id: `${key}/${zi}/${ri}`, key, z, ri, row, n: Math.max(1, Math.floor((z.x1 - z.x0) / CELL)) }));
    ls.forEach(l => l.occ = Array(l.n).fill(null));
    byZone.set(z, ls); lanes.push(...ls);
  });
  const byId = new Map(lanes.map(l => [l.id, l]));
  const span = (g, k = 1) => Math.max(1, Math.ceil((g.userData.w0 * k + .35) / CELL));
  const scaleIn = (g, l) => g.userData.h0 > l.z.maxH ? (l.z.maxH - .3) / g.userData.h0 : 1;
  const free = (l, c, n, me) => { if (c < 0 || c + n > l.n) return false; for (let i = c; i < c + n; i++) if (l.occ[i] && l.occ[i] !== me) return false; return true; };
  // the free run in a lane nearest to column `want`
  const nearest = (l, want, n, me) => {
    for (let d = 0; d <= l.n; d++) for (const c of d ? [want - d, want + d] : [want]) if (free(l, c, n, me)) return c;
    return null;
  };
  const lift = g => { const s = g.userData.slot; if (!s) return; for (let i = s.c; i < s.c + s.n; i++) if (s.l.occ[i] === g) s.l.occ[i] = null; g.userData.slot = null; };
  const put = (g, l, c, k = scaleIn(g, l)) => {
    lift(g);
    const n = span(g, k);
    g.scale.setScalar(k);
    g.position.set(l.z.x0 + (c + n / 2) * CELL, l.z.y, l.row);
    (l.z.parent || l.z.scene).add(g);
    for (let i = c; i < c + n; i++) l.occ[i] = g;
    g.userData.slot = { l, c, n };
  };
  // first fit, back row first; zones too short for the item are tried last, with the item shrunk to fit
  const auto = (g, zl) => {
    for (let pass = 0; pass < 2; pass++) for (const z of zl) {
      if (pass === 0 && g.userData.h0 > z.maxH) continue;
      for (const l of byZone.get(z) || []) { const k = scaleIn(g, l), c = nearest(l, 0, span(g, k), g); if (c != null) { put(g, l, c, k); return true; } }
    }
    return false;
  };
  return { lanes, byZone, byId, span, scaleIn, free, nearest, put, lift, auto };
}

// place a location's items: hand-placed ones first, then the rest in order
function pack(groups, zl, grid, saved = {}) {
  const left = [];
  groups.sort((a, b) => (b.userData.h - a.userData.h) || a.userData.item.name.localeCompare(b.userData.item.name));
  for (const g of groups) {
    const want = saved[g.userData.key], [id, c] = want ? want.split("@") : [];
    const l = id && grid.byId.get(id);
    if (l && g.userData.h0 <= l.z.maxH && grid.free(l, +c, grid.span(g), g)) { grid.put(g, l, +c); continue; }
    if (!grid.auto(g, zl)) left.push(g);
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
    // the first thing under the pointer that is an item or a door; itemsFirst looks past doors and drawer fronts
    pick(ev, itemsFirst) {
      const r = canvas.getBoundingClientRect();
      const p = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      const ray = new THREE.Raycaster(); ray.params.Line.threshold = .4; ray.setFromCamera(p, camera);
      const hits = ray.intersectObjects(scene.children, true).filter(h => h.object.userData.owner || h.object.userData.door);
      const hit = (itemsFirst && hits.find(h => h.object.userData.owner)) || hits[0];
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
  if (it.ghost) {
    const note = window.ghostNote ? window.ghostNote(it) : `Usually here (${it.usual}).`;
    const on = window.Restock && window.Restock.has(it.name);
    return `<b>${esc(it.name)}</b><span>Out right now.</span><span>${esc(note.replace(/^You usually have [^:]+: /, "Usually here: "))}</span>` +
      (window.Restock ? `<button class="tagbtn" data-need="${esc(it.name)}">${on ? "On your list" : "Add to list"}</button>` : "");
  }
  const how = it.source === "photo" ? "Seen in a photo" : it.source === "receipt" ? "Bought" : "Noted";
  const lines = [];
  if (it.status === "low") lines.push("Probably running low.");
  if (it.last) lines.push(`Bought ${day(it.last)}${it.cost != null ? ` · $${Number(it.cost).toFixed(2)}` : ""}`);
  else lines.push(`${how} ${day(it.since)}`);
  if (!/^0 /.test(it.usual || "")) lines.push(`On ${esc(it.usual)}`);
  return `<b>${esc(it.name)}</b>${lines.map(l => `<span>${l}</span>`).join("")}`;
}
function tagText(it) { return tagHTML(it).replace(/<button.*<\/button>/, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
// show an item's tag above it; a ghost's tag carries an "Add to list" button
function showTag(tag, it, p, box, read) {
  tag.innerHTML = tagHTML(it); tag.hidden = false; tag.classList.toggle("ghost", !!it.ghost);
  tag.style.left = Math.max(80, Math.min(box.clientWidth - 80, p.x)) + "px"; tag.style.top = Math.max(70, p.y) + "px";
  const b = tag.querySelector(".tagbtn");
  if (b) b.onclick = e => { e.stopPropagation(); const on = window.Restock.toggle(it.name); b.textContent = on ? "On your list" : "Add to list"; };
  if (read) read.textContent = tagText(it);
}

// ---------- stainless ----------
let brushed = null;
function brushedTexture() {
  if (brushed || typeof document === "undefined" || !document.createElement("canvas").getContext("2d")?.createLinearGradient) return brushed;
  const cv = document.createElement("canvas"); cv.width = 512; cv.height = 512;
  const g = cv.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0, "#c2c8cc"); grad.addColorStop(.5, "#d6dbde"); grad.addColorStop(1, "#c4cacd");
  g.fillStyle = grad; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1400; i++) {
    const x = (hash("x" + i) % 5120) / 10, a = .03 + (hash("a" + i) % 60) / 1000;
    g.fillStyle = i % 2 ? `rgba(255,255,255,${a})` : `rgba(60,66,70,${a})`;
    g.fillRect(x, 0, .6 + (i % 3) * .4, 512);
  }
  brushed = new THREE.CanvasTexture(cv); brushed.colorSpace = THREE.SRGBColorSpace; brushed.anisotropy = 8;
  return brushed;
}
function steelMat(env, { rough = .34, color = "#ffffff" } = {}) {
  const map = brushedTexture();
  return new THREE.MeshStandardMaterial({ color: map ? color : "#c3c9cd", map, metalness: env ? .82 : .2, roughness: rough, envMap: env, envMapIntensity: 1.05 });
}

// ---------- scenes ----------
// Colin's fridge: a stainless LG with French doors over a freezer drawer. Inside, three glass shelves, two crispers
// and a full-width deli drawer; three bins in each door. The crispers, the deli drawer and the freezer all pull out.
// His pantry is a closet with five shelves.
const C = { liner: "#eef3f5", liner2: "#e2eaee", glass: "#cfe7ee", trim: "#d7e0e5", bin: "#d6ecf2", gasket: "#2a2e31", clear: "#eef6f9" };
const FR = { W: 32, D: 24, H: 52, FH: 16, shelves: [40, 28.5, 17], doorW: 17.5, bins: [[40, 5], [22, 5], [2.5, 6]], doorZ: 3.0, freezerZ: 2.4 };

function fridgeScene(v, env = null) {
  const s = v.scene, { W, D, H, FH } = FR;
  const add = (geo, mat, x, y, z, parent = s) => { const m = mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const liner = flat(C.liner), liner2 = flat(C.liner2), trim = flat(C.trim), gasket = flat(C.gasket);
  const steel = steelMat(env), sideSteel = steelMat(env, { rough: .42 }), bar = steelMat(env, { rough: .18, color: "#eef1f3" });
  const z = (rows, x0, x1, y, maxH, parent) => ({ rows, x0, x1, y, maxH, scene: s, parent });
  const zones = {};

  // cabinet: liner walls inside a stainless shell
  add(BOX(W, H, .5), liner2, W / 2, 0, -D);
  add(BOX(.5, H, D), liner, .25, 0, -D / 2); add(BOX(.5, H, D), liner, W - .25, 0, -D / 2);
  add(BOX(W, .5, D), liner, W / 2, -.5, -D / 2); add(BOX(W, .5, D), liner, W / 2, H, -D / 2);
  add(BOX(1.5, H + FH + 6, D), sideSteel, -.75, -FH - 3, -D / 2 + .2); add(BOX(1.5, H + FH + 6, D), sideSteel, W + .75, -FH - 3, -D / 2 + .2);
  add(BOX(W + 3, 2.5, D), sideSteel, W / 2, H + .5, -D / 2 + .2);
  add(BOX(W + 3, 2.5, D), gasket, W / 2, -3, -D / 2 + .2);
  add(BOX(W, FH, .5), liner2, W / 2, -FH - 3, -D);                        // freezer cavity, seen behind the drawer
  add(BOX(W + 3, 2.2, D - 1), gasket, W / 2, -FH - 5.2, -D / 2 - .3);     // kick plate
  add(BOX(W + 60, .4, D + 60), flat("#d8ccb6"), W / 2, -FH - 5.6, 6).castShadow = false;   // kitchen floor
  const strip = add(BOX(W * .55, .5, 1.2), new THREE.MeshBasicMaterial({ color: 0xfffbea }), W / 2, H - .5, -D * .55);
  strip.castShadow = false;

  // glass shelves and the zones on them
  const glass = flat(C.glass, { opacity: .7 });
  FR.shelves.forEach((y, i) => {
    add(BOX(W - 1, .35, D - 1), glass, W / 2, y, -D / 2).receiveShadow = true;
    add(BOX(W - 1, .6, .4), trim, W / 2, y - .15, -.7);
    const top = i ? FR.shelves[i - 1] : H;
    zones[`shelf-${i + 1}`] = [z([-15, -6], 1, W - 1, y + .35, top - y - 1.2)];
  });

  // drawers: two crispers on a shelf, a full-width deli drawer under them. Each is a group that slides out on z.
  const clear = flat(C.clear, { opacity: .32 }), binWall = flat("#e3eef2", { opacity: .55 });
  add(BOX(W - 1, .5, D - 1), liner, W / 2, 7, -D / 2);
  add(BOX(.5, 9.5, D - 2), liner, W / 2, 7.5, -D / 2 - .5);
  const drawers = {};
  const mkDrawer = (key, x0, x1, y, h, depth, rows) => {
    const g = new THREE.Group(); s.add(g); drawers[key] = g;
    const w = x1 - x0, cx = (x0 + x1) / 2, back = -1.4 - depth;
    add(BOX(w, .3, depth), flat("#e9f2f5"), cx, y - .3, -1.4 - depth / 2, g);
    add(BOX(.3, h - .5, depth), binWall, x0 + .15, y, -1.4 - depth / 2, g); add(BOX(.3, h - .5, depth), binWall, x1 - .15, y, -1.4 - depth / 2, g);
    add(BOX(w, h - .5, .3), binWall, cx, y, back, g);
    const front = add(BOX(w, h, .4), clear, cx, y, -1.4, g); front.userData.door = key;
    const lip = add(BOX(w, .7, .7), trim, cx, y + h - .5, -1.2, g); lip.userData.door = key;
    zones[key] = [z(rows, x0 + .6, x1 - .6, y, h + 2, g)];
  };
  mkDrawer("crisper-left", .8, W / 2 - .5, 7.5, 6.5, 20, [-15, -7.5]);
  mkDrawer("crisper-right", W / 2 + .5, W - .8, 7.5, 6.5, 20, [-15, -7.5]);
  mkDrawer("drawer", .8, W - .8, 0, 4.8, 20, [-15, -7]);
  zones["crisper-left"][0].maxH = zones["crisper-right"][0].maxH = 9;
  zones.drawer[0].maxH = 6.2;

  const lamp = new THREE.PointLight(0xfff3d6, 300, 80, 1.5); lamp.position.set(W / 2, H - 3, -6); s.add(lamp);
  const low = new THREE.PointLight(0xfff3d6, 70, 40, 1.6); low.position.set(W / 2, 13, -3); s.add(low);

  // French doors, hinged at the outer edges. Door space: x runs from the hinge toward the middle, the inner face is at z=0 facing -z.
  const doors = [];
  const mkDoor = (side) => {
    const sgn = side === "left" ? 1 : -1, dw = FR.doorW;
    const pivot = new THREE.Group(); pivot.position.set(side === "left" ? -1.5 : W + 1.5, 0, .6); s.add(pivot);
    pivot.userData.sign = sgn;
    const mid = sgn * dw / 2;
    const panel = add(BOX(dw - .15, H + 3.5, 2.4), steel, mid, -1.5, 1.2, pivot); panel.userData.door = "fridge";
    add(BOX(dw - .6, H + 3, .4), gasket, mid, -1.25, -.05, pivot);
    add(BOX(dw - 3, H - 1, .5), liner, mid, 0, -.45, pivot);
    if (side === "left") add(BOX(.6, H + 3, 2.2), gasket, dw - .2, -1.25, 1.1, pivot);   // the flip seal between the doors rides on the left door
    // a tall tubular handle on the inner edge, on two standoffs
    const hx = sgn * (dw - 1.7), hy = 13, hl = 30;
    const tube = new THREE.CylinderGeometry(.5, .5, hl, 14); tube.translate(0, hl / 2, 0);
    add(tube, bar, hx, hy, 4.1, pivot).userData.door = "fridge";
    for (const y of [hy + 2, hy + hl - 2]) add(BOX(.7, .9, 1.4), bar, hx, y, 3.2, pivot).userData.door = "fridge";
    FR.bins.forEach(([by, bh], i) => {
      add(BOX(dw - 3, .45, 4.6), flat(C.bin), mid, by, -2.9, pivot);
      add(BOX(dw - 3, bh, .3), flat(C.bin, { opacity: .5 }), mid, by, -5.2, pivot);
      add(BOX(dw - 3, .5, .5), flat("#bcdde6"), mid, by + bh - .4, -5.2, pivot);
      // contents face out of the door (-z in door space): a holder turned half a turn, so its +x runs the other way
      const holder = new THREE.Group(); holder.rotation.y = Math.PI; holder.position.set(0, 0, -2.9); pivot.add(holder);
      const [a, b] = side === "left" ? [-(dw - 2), -1.8] : [1.8, dw - 2];
      zones[`door-${side}-${i + 1}`] = [{ rows: [0], x0: a, x1: b, y: by + .45, maxH: i ? 13 : 11, parent: holder }];
    });
    doors.push(pivot);
  };
  mkDoor("left"); mkDoor("right");

  // freezer drawer: slides a long way out, with the camera looking down into it
  const drawer = new THREE.Group(); s.add(drawer); drawers.freezer = drawer;
  const fy = -FH - 2.5;
  add(BOX(W + 3, FH, 2.4), steel, W / 2, fy, 1.2, drawer).userData.door = "freezer";
  const fbar = new THREE.CylinderGeometry(.5, .5, W * .72, 14); fbar.rotateZ(Math.PI / 2);
  add(fbar, bar, W / 2, fy + FH - 2.4, 3.6, drawer).userData.door = "freezer";
  for (const x of [W * .16, W * .84]) add(BOX(.9, .7, 1.4), bar, x, fy + FH - 2.75, 2.8, drawer).userData.door = "freezer";
  const fbin = flat("#d5e6ef");
  add(BOX(W - 1, .4, 20), fbin, W / 2, fy + 1, -10, drawer);
  add(BOX(.4, 11, 20), fbin, 1, fy + 1, -10, drawer); add(BOX(.4, 11, 20), fbin, W - 1, fy + 1, -10, drawer);
  add(BOX(W - 1, 11, .4), fbin, W / 2, fy + 1, -20, drawer);
  zones.freezer = [z([-16, -9, -3], 1.6, W - 1.6, fy + 1.4, 10, drawer)];

  // shorthand spots for items the Inventory tab hasn't placed yet
  zones.shelf = [zones["shelf-2"][0], zones["shelf-3"][0], zones["shelf-1"][0]];
  zones.crisper = [zones["crisper-left"][0], zones["crisper-right"][0]];
  zones.door = ["right-2", "left-3", "right-3", "right-1", "left-1", "left-2"].map(k => zones["door-" + k][0]);
  return { doors, drawer, drawers, zones };
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
  zones.pantry = [5, 3, 4, 2, 1].map(n => zones[`shelf-${n}`][0]);
  const lamp = new THREE.PointLight(0xfff3d6, 160, 90, 1.5); lamp.position.set(W / 2, top - 2, -2); s.add(lamp);
  return { zones, W, top };
}

// load one location's items and pack them into their spots
async function fill(D, MAP, base, loc, zones, grid = makeGrid(zones), saved = store.get()) {
  const items = D.shelves[loc] || [];
  const groups = await Promise.all(items.map(async it => {
    const s = resolve(MAP, it, loc);
    const g = await makeItem(MAP, it, s, base);
    g.userData.spot = [it.spot, s.spot, loc].find(k => k && zones[k]) || Object.keys(zones)[0];
    g.userData.key = loc + ":" + it.name;
    const sz = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
    g.userData.h = g.userData.h0 = sz.y; g.userData.w0 = sz.x;
    return g;
  }));
  // hand-placed items go first, wherever they were dropped
  const mine = groups.filter(g => saved[g.userData.key]), rest = groups.filter(g => !saved[g.userData.key]);
  let spill = pack(mine, [], grid, saved);
  const bySpot = {};
  rest.concat(spill).forEach(g => (bySpot[g.userData.spot] ||= []).push(g));
  spill = [];
  for (const [spot, gs] of Object.entries(bySpot)) spill = spill.concat(pack(gs, zones[spot] || [], grid));
  if (spill.length) spill = pack(spill, zones.shelf || zones[loc] || [], grid);
  if (spill.length && typeof console !== "undefined") console.info("fridge3d: no room for", spill.map(g => g.userData.item.name));
  return { groups, spill, grid };
}

// ---------- drag to rearrange ----------
// Hold an item (or press and move it, with a mouse) and it lifts; it snaps to the nearest free cells of the
// shelf, bin or drawer under the pointer, with the grid shown while you drag. Drops are kept on this device.
function dragger(v, grid, { lanesFor, onChange, onStart }) {
  const preview = new THREE.Mesh(new THREE.BoxGeometry(1, .12, 1),
    new THREE.MeshBasicMaterial({ color: 0x2f9e62, transparent: true, opacity: .5, depthTest: false }));
  preview.renderOrder = 10; preview.visible = false;
  const lineMat = new THREE.LineBasicMaterial({ color: 0x4f6470, transparent: true, opacity: .45, depthTest: false });
  const gridLines = new Map();
  const band = l => { const rs = l.z.rows; return rs.length > 1 ? Math.min(6, Math.abs(rs[1] - rs[0]) * .8) : 4; };
  const linesFor = l => {
    if (gridLines.has(l)) return gridLines.get(l);
    const pts = [], b = band(l) / 2, y = l.z.y + .04, x0 = l.z.x0, x1 = l.z.x0 + l.n * CELL;
    for (let i = 0; i <= l.n; i += (i + 2 > l.n && i < l.n ? l.n - i : 2)) { const x = x0 + i * CELL; pts.push(x, y, l.row - b, x, y, l.row + b); }
    pts.push(x0, y, l.row - b, x1, y, l.row - b, x0, y, l.row + b, x1, y, l.row + b);
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const ln = new THREE.LineSegments(geo, lineMat); ln.renderOrder = 9; ln.visible = false;
    (l.z.parent || l.z.scene).add(ln); gridLines.set(l, ln); return ln;
  };
  const ray = new THREE.Raycaster(), inv = new THREE.Matrix4();
  // where the pointer lands in a zone's own space: on its floor when seen from above, else on its front
  const aim = (z, r) => {
    const par = z.parent || z.scene; par.updateWorldMatrix(true, false); inv.copy(par.matrixWorld).invert();
    const o = r.origin.clone().applyMatrix4(inv), d = r.direction.clone().transformDirection(inv);
    const front = Math.max(...z.rows), back = Math.min(...z.rows), inX = x => x > z.x0 - 1.5 && x < z.x1 + 1.5;
    if (d.y < -.25) {
      const t = (z.y - o.y) / d.y, p = o.clone().addScaledVector(d, t);
      if (t > 0 && inX(p.x) && p.z > back - 4 && p.z < front + 4)
        return { t, x: p.x, ri: z.rows.reduce((bi, rz, i) => Math.abs(rz - p.z) < Math.abs(z.rows[bi] - p.z) ? i : bi, 0) };
    }
    if (Math.abs(d.z) > 1e-3) {
      const t = (front + 2.5 - o.z) / d.z, p = o.clone().addScaledVector(d, t);
      if (t > 0 && inX(p.x) && p.y > z.y - 1 && p.y < z.y + Math.min(z.maxH, 14)) return { t, x: p.x, ri: z.rows.indexOf(front) };
    }
    return null;
  };
  let cand = null, drag = null, used = false;
  const target = ev => {
    const r = v.canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), v.camera);
    let best = null;
    const zs = new Set(drag.lanes.map(l => l.z));
    for (const z of zs) { const a = aim(z, ray.ray); if (a && (!best || a.t < best.t)) best = { ...a, z }; }
    if (!best) return null;
    const g = drag.g, ok = g.userData.h0 <= best.z.maxH + 2;   // a little squeeze is fine; it shrinks to fit
    const ls = grid.byZone.get(best.z).filter(l => drag.lanes.includes(l));
    let pick = null;
    for (const l of ls) {
      const k = grid.scaleIn(g, l), n = grid.span(g, k), want = Math.round((best.x - l.z.x0) / CELL - n / 2);
      const c = grid.nearest(l, Math.max(0, Math.min(l.n - n, want)), n, g);
      if (c == null) continue;
      const cost = Math.abs(c - want) + (l.ri === best.ri ? 0 : 3);
      if (!pick || cost < pick.cost) pick = { l, c, k, n, cost };
    }
    return ok ? pick : null;
  };
  const show = p => {
    if (!p) { preview.visible = false; return; }
    const { l, c, n } = p; (l.z.parent || l.z.scene).add(preview);
    preview.scale.set(n * CELL - .25, 1, band(l)); preview.position.set(l.z.x0 + (c + n / 2) * CELL, l.z.y + .08, l.row);
    preview.visible = true;
  };
  const begin = () => {
    const g = cand.g, s = g.userData.slot;
    drag = { g, from: s && { l: s.l, c: s.c }, lanes: lanesFor(), at: null };
    used = true; cand = null;
    if (onStart) onStart(g);
    drag.lanes.forEach(l => linesFor(l).visible = true);
    try { v.canvas.setPointerCapture(drag.pid); } catch (e) {}
    if (navigator.vibrate) navigator.vibrate(8);
    v.canvas.style.cursor = "grabbing";
  };
  const move = ev => {
    const p = target(ev); drag.at = p; show(p);
    const g = drag.g;
    if (p) { const par = p.l.z.parent || p.l.z.scene; par.add(g); g.scale.setScalar(p.k); g.position.set(p.l.z.x0 + (p.c + p.n / 2) * CELL, p.l.z.y + .9, p.l.row); }
    v.render();
  };
  const end = commit => {
    const { g, at, from } = drag;
    if (commit && at) grid.put(g, at.l, at.c, at.k);
    else if (from) grid.put(g, from.l, from.c);
    gridLines.forEach(ln => ln.visible = false); preview.visible = false;
    v.canvas.style.cursor = "";
    drag = null; v.render();
    if (commit && at) {
      const o = store.get(); o[g.userData.key] = `${at.l.id}@${at.c}`; store.set(o);
      if (onChange) onChange(g);
    }
  };
  const c = v.canvas;
  c.addEventListener("contextmenu", e => { if (cand || drag) e.preventDefault(); });
  c.addEventListener("touchmove", e => { if (drag) e.preventDefault(); }, { passive: false });
  c.addEventListener("pointerdown", e => {
    used = false;
    if (drag || !lanesFor()) return;
    const hit = v.pick(e, true);
    if (!hit || !hit.userData.item) return;
    cand = { g: hit, x: e.clientX, y: e.clientY };
    drag = null;
    const pid = e.pointerId;
    if (e.pointerType !== "mouse") cand.timer = setTimeout(() => { if (cand) { begin(); drag.pid = pid; try { c.setPointerCapture(pid); } catch (er) {} } }, 300);
    cand.pid = pid;
  });
  c.addEventListener("pointermove", e => {
    if (drag) return move(e);
    if (!cand) return;
    const far = Math.hypot(e.clientX - cand.x, e.clientY - cand.y);
    if (e.pointerType === "mouse" && far > 5) { const pid = cand.pid; begin(); drag.pid = pid; try { c.setPointerCapture(pid); } catch (er) {} move(e); }
    else if (e.pointerType !== "mouse" && far > 9) { clearTimeout(cand.timer); cand = null; }   // a scroll, not a hold
  });
  const up = commit => e => { if (cand) { clearTimeout(cand.timer); cand = null; } if (drag) end(commit); };
  c.addEventListener("pointerup", up(true));
  c.addEventListener("pointercancel", up(false));
  return { used: () => used, busy: () => !!drag, reset() { gridLines.forEach(ln => ln.visible = false); } };
}

// Camera, door swing and drawer slides for each state of the fridge. k: doors (0 shut, 1 open); the rest are inches pulled out.
const PULL = { "crisper-left": 13, "crisper-right": 13, drawer: 14, freezer: 20 };
function fridgePose(fv, st) {
  const { W, H, FH } = FR, down = [0, 1.25, .9];
  const t = { k: 0, "crisper-left": 0, "crisper-right": 0, drawer: 0, freezer: 0 };
  let p;
  if (st === "closed") p = fv.fit([-3, W + 3, -FH - 8, H + 5.5], [W / 2, (H + 5.5 - FH - 8) / 2, 0]);
  else if (st === "fridge") { t.k = 1; p = fv.fit([-13, W + 13, -FH - 7, H + 4], [W / 2, (H - FH - 3) / 2 + 2, -4], [0, .14, 1]); }
  else if (st === "crisper-left" || st === "crisper-right") {
    t.k = 1; t[st] = PULL[st];
    p = fv.fit([0, 19, -9, 9], [st === "crisper-left" ? W / 4 : W * .75, 9, 1.5], down);
  } else if (st === "drawer") { t.k = 1; t.drawer = PULL.drawer; p = fv.fit([-1, W + 1, -10, 10], [W / 2, 1.5, 1], down); }
  else if (st === "freezer") { t.freezer = PULL.freezer; p = fv.fit([-3, W + 3, -10, 10], [W / 2, -14, 12], [0, 1.3, .8]); }
  return Object.assign(t, p);
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
    .fridge3d { aspect-ratio: 3 / 5; max-height: 88svh; }
    .has3d .cab-inside { aspect-ratio: 3 / 5; min-height: 0; padding: 0; }
    .mag3d { position: absolute; inset: 0; pointer-events: none; transition: opacity .25s; }
    .mag3d.off { opacity: 0; }
    .mag3d.off .mag { pointer-events: none; }
    .mag3d .magnets { position: absolute; inset: 0; display: block; }
    .tag3d { position: absolute; z-index: 3; translate: -50% calc(-100% - 10px); background: var(--paper); color: var(--ink);
      font: 12px/1.35 var(--font-mono); padding: 7px 10px; border-radius: 8px; box-shadow: 0 8px 18px -8px rgba(0,0,0,.5);
      display: grid; gap: 1px; max-width: 230px; pointer-events: none; }
    .tag3d.ghost { pointer-events: auto; }
    .tag3d b { font: 700 14px var(--font-display); }
    .tag3d .tagbtn { justify-self: start; margin-top: 6px; border: 0; border-radius: 999px; background: var(--ink); color: var(--paper); font: 600 12px var(--font-display); padding: 4px 11px; cursor: pointer; }
    .tag3d::after { content: ""; position: absolute; left: 50%; bottom: -6px; translate: -50% 0; border: 6px solid transparent; border-bottom: 0; border-top-color: var(--paper); }
    .close3d { position: absolute; top: 8px; right: 8px; z-index: 4; border: 0; background: rgba(0,0,0,.55); color: #fff; border-radius: 999px;
      font: 600 11px var(--font-mono); padding: 5px 11px; cursor: pointer; }
    .close3d[hidden] { display: none; }
    .cab-inside .stage3d { position: absolute; inset: 0; border-radius: 4px; overflow: hidden; }
    .stage3d canvas { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
    .reset3d { position: absolute; left: 8px; bottom: 8px; z-index: 4; border: 0; background: rgba(0,0,0,.55); color: #fff; border-radius: 999px;
      font: 600 11px var(--font-mono); padding: 5px 11px; cursor: pointer; }
    .reset3d[hidden] { display: none; }`;
  document.head.appendChild(css);
  const views = [];

  // --- fridge ---
  const sec = document.querySelector('section[aria-label="Fridge"]');
  const fstage = document.createElement("div"); fstage.className = "stage3d fridge3d";
  fstage.innerHTML = `<canvas aria-label="Your fridge. Tap a door to open it, then tap anything inside. The crispers, deli drawer and freezer pull out."></canvas>
    <div class="mag3d"></div><button class="close3d" hidden>close</button><button class="reset3d" hidden>undo moves</button><div class="tag3d" hidden></div>`;
  const fread = document.createElement("p"); fread.className = "readout"; fread.setAttribute("aria-live", "polite");
  const fv = viewer(fstage.querySelector("canvas"), { alpha: true, fov: 34, sun: [-25, 90, 80], sunTarget: [15, 25, -12] });
  const pm = new THREE.PMREMGenerator(fv.renderer);
  const env = pm.fromScene(new RoomEnvironment(), .04).texture; pm.dispose();
  const { doors, drawers, zones } = fridgeScene(fv, env);
  const fgrid = makeGrid(zones);
  await fill(D, MAP, base, "fridge", zones, fgrid);
  await fill(D, MAP, base, "freezer", { freezer: zones.freezer }, fgrid);
  // all loaded: swap the CSS fridge for the 3D one, and move the magnets onto its doors
  const mags = document.getElementById("magnets"), layer = fstage.querySelector(".mag3d");
  sec.replaceChildren(fstage, fread);
  layer.append(mags);
  document.body.classList.add("has3d");
  if (window.magnets) window.magnets();   // re-render the magnets into the 3D layer

  let state = "closed", anim = null, cur = null;
  const tag = fstage.querySelector(".tag3d"), closeBtn = fstage.querySelector(".close3d");
  const rad = THREE.MathUtils.degToRad(108);
  const target = st => { fv.size(); return fridgePose(fv, st); };
  const apply = t => {
    doors.forEach(d => d.rotation.y = -d.userData.sign * t.k * rad);
    for (const [k, g] of Object.entries(drawers)) g.position.z = t[k] || 0;
    fv.camera.position.copy(t.pos); fv.camera.lookAt(t.look);
    fv.render(); cur = t;
  };
  // pin each magnet to its spot on the shut doors (see MAGS in the page): x across from the left door's
  // outer edge, y up from the fridge floor, both in inches; --in carries the scale so magnets keep real size
  const placeMagnets = () => {
    const M = window.MAGS || {}, w = fstage.clientWidth, h = fstage.clientHeight;
    const P = (x, y, z) => { const p = new THREE.Vector3(x, y, z).project(fv.camera); return [(p.x + 1) / 2 * w, (1 - p.y) / 2 * h]; };
    const a = P(0, 20, FR.doorZ), b = P(10, 20, FR.doorZ);
    mags.style.setProperty("--in", ((b[0] - a[0]) / 10).toFixed(2) + "px");
    mags.querySelectorAll(".mag").forEach(el => {
      const m = M[el.dataset.m]; if (!m) return;
      const [x, y] = P(-1.5 + m.x, m.y, m.y < 0 ? FR.freezerZ + .02 : FR.doorZ + .02);
      el.style.left = x + "px"; el.style.top = y + "px";
    });
  };
  document.addEventListener("magnets", () => { if (state === "closed" && !anim) placeMagnets(); });
  const say = { closed: "", fridge: "Tap anything, or hold it to move it; it snaps into place. Dashed outlines are things you're out of. Tap a crisper, the deli drawer or the freezer to pull it out.",
    "crisper-left": "Left crisper, pulled out. Tap its front to push it in.", "crisper-right": "Right crisper, pulled out. Tap its front to push it in.",
    drawer: "Deli drawer, pulled out. Tap its front to push it in.", freezer: "Freezer, pulled out. Tap the front to push it in." };
  const go = to => {
    if (anim) cancelAnimationFrame(anim);
    tag.hidden = true; if (window.closeMag) window.closeMag();
    const from = cur || target(state), end = target(to), t0 = performance.now();
    const dur = matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 900;
    state = to; closeBtn.hidden = true;
    layer.classList.add("off");
    const stepf = now => {
      const u = ease(Math.min(1, (now - t0) / dur)), t = { pos: from.pos.clone().lerp(end.pos, u), look: from.look.clone().lerp(end.look, u) };
      for (const k of ["k", "crisper-left", "crisper-right", "drawer", "freezer"]) t[k] = from[k] + (end[k] - from[k]) * u;
      apply(t);
      if (now - t0 < dur) anim = requestAnimationFrame(stepf);
      else {
        anim = null; closeBtn.hidden = to === "closed"; closeBtn.textContent = to === "fridge" ? "close" : "push in";
        if (to === "closed") { placeMagnets(); layer.classList.remove("off"); }
      }
    };
    anim = requestAnimationFrame(stepf);
    fread.textContent = say[to];
  };
  const back = () => go(state === "fridge" || state === "freezer" ? "closed" : "fridge");
  // drag to rearrange: in the open fridge, everything but the freezer; in a pulled drawer, just that drawer
  const resetBtn = fstage.querySelector(".reset3d");
  const hasMoves = loc => Object.keys(store.get()).some(k => k.startsWith(loc + ":"));
  const fdrag = dragger(fv, fgrid, {
    lanesFor: () => {
      if (anim || state === "closed") return null;
      return fgrid.lanes.filter(l => state === "fridge" ? l.key !== "freezer" : l.key === state);
    },
    onStart: () => { tag.hidden = true; },
    onChange: () => { resetBtn.hidden = false; fread.textContent = "Moved. It stays there on this device."; },
  });
  resetBtn.hidden = !(hasMoves("fridge") || hasMoves("freezer"));
  resetBtn.addEventListener("click", () => {
    const o = store.get(); for (const k of Object.keys(o)) if (/^(fridge|freezer):/.test(k)) delete o[k];
    store.set(o); location.reload();
  });
  onTap(fv.canvas, e => {
    if (anim || fdrag.used() || document.querySelector(".magcard")) return;
    const pulled = state !== "closed" && state !== "fridge";
    const hit = fv.pick(e, pulled), door = hit && hit.userData.door;
    if (state === "closed") return go(door === "freezer" ? "freezer" : "fridge");
    if (hit && hit.userData.item) return showTag(tag, hit.userData.item, fv.project(hit), fstage, fread);
    tag.hidden = true;
    if (door === state) return back();
    if (door && door !== "fridge") return go(door);
  });
  closeBtn.addEventListener("click", back);
  const redrawF = () => { if (anim) return; apply(target(state)); if (state === "closed") placeMagnets(); tag.hidden = true; };
  new ResizeObserver(redrawF).observe(fstage);
  views.push(fv);

  // --- pantry: 3D behind the wooden doors ---
  const cab = document.querySelector(".cab-inside");
  if (cab) {
    const ps = document.createElement("div"); ps.className = "stage3d";
    ps.innerHTML = `<canvas aria-label="Pantry shelves. Tap anything."></canvas><div class="tag3d" hidden></div>`;
    const pv = viewer(ps.querySelector("canvas"), { bg: "#cfd8dd", fov: 30, sun: [-10, 90, 80], sunTarget: [15, 30, -6] });
    const { zones: pz, W: PW, top: PT } = pantryScene(pv);
    const pgrid = makeGrid(pz);
    await fill(D, MAP, base, "pantry", pz, pgrid);
    cab.prepend(ps);
    const ptag = ps.querySelector(".tag3d"), pread = cab.querySelector(".readout");
    const draw = () => { if (!pv.size()) return; pv.setPose(pv.fit([-1, PW + 1, -2, PT + 2], [PW / 2, PT / 2 - 1, 0], [0, .08, 1])); pv.render(); ptag.hidden = true; };
    new ResizeObserver(draw).observe(ps);
    const pdrag = dragger(pv, pgrid, { lanesFor: () => pgrid.lanes, onStart: () => { ptag.hidden = true; },
      onChange: () => { if (pread) pread.textContent = "Moved. It stays there on this device."; } });
    onTap(pv.canvas, e => {
      if (pdrag.used()) return;
      const hit = pv.pick(e, true);
      if (hit && hit.userData.item) showTag(ptag, hit.userData.item, pv.project(hit), ps, pread); else ptag.hidden = true;
    });
    views.push(pv);
  }

  // models may finish loading textures after the first frame
  setTimeout(() => { redrawF(); views.forEach(v => { v.size(); v.render(); }); }, 600);
  return true;
}

// for the offline preview tools (sim/export.mjs); the page doesn't use this
export const _internals = { fridgeScene, pantryScene, makeItem, resolve, pack, fill, makeGrid, dragger, fridgePose, PULL, FR, CELL };
