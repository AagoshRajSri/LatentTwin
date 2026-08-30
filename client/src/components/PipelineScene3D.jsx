import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";

/* ────────────────────────────────────────────────────────────────────────
   COLORS
   ──────────────────────────────────────────────────────────────────────── */
const HEALTHY   = 0x6fd8ff; // brighter cyan — reads clearly against the dark floor
const ERROR     = 0xff4d4f;
const FIXED     = 0x35e08a;
const NEUTRAL_EDGE = 0x3a4468;
const BG_COLOR  = 0x05060a;

function seeded(i) {
  const v = Math.sin(i * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}

/* ────────────────────────────────────────────────────────────────────────
   DATA — three services. Each has a real (small) file dependency graph
   across 3 tiers. Only Event Queue's schema guard is actually broken;
   the break is visible on the block itself, on the exact wire it feeds,
   and — one click deeper — on the exact line of code.
   ──────────────────────────────────────────────────────────────────────── */
const NODES = [
  {
    id: "auth", label: "auth-service", glyph: "server", tint: 0xf3ecd8, accent: 0xf0a63b, x: -6.4, hasError: false,
    tiers: [
      { name: "Route", files: [{ id: "a0", name: "login.route.js" }, { id: "a1", name: "refresh.route.js" }, { id: "a2", name: "logout.route.js" }] },
      { name: "Controller", files: [{ id: "a3", name: "auth.controller.js" }, { id: "a4", name: "session.service.js" }, { id: "a5", name: "token.util.js" }] },
      { name: "Payload", files: [{ id: "a6", name: "auth-success.event.js" }, { id: "a7", name: "user.mapper.js" }, { id: "a8", name: "queue.publisher.js" }] },
    ],
    edges: [["a0", "a3"], ["a1", "a4"], ["a2", "a5"], ["a3", "a6"], ["a4", "a7"], ["a5", "a8"], ["a1", "a8"]],
  },
  {
    id: "queue", label: "Event Queue", glyph: "database", tint: 0xdfe6f5, accent: 0x6fd8ff, x: 0, hasError: true,
    tiers: [
      { name: "Ingress", files: [{ id: "q0", name: "ingress.topic.js" }, { id: "q1", name: "consumer.group.js" }, { id: "q2", name: "offset.tracker.js" }] },
      {
        name: "Schema Guard",
        files: [
          {
            id: "q3", name: "schema.guard.js", isErr: true,
            code: [
              "10  function validate(evt) {",
              "11    const required = ['user_id']",
              "12    if (!evt.user_id) return fail('user_id')",
              "13    return ok(evt)",
              "14  }",
            ],
            lineIdx: 2,
            broken: "12    if (!evt.user_id) return fail('user_id')",
            brokenNote: "received `userId` — schema expects `user_id`",
            fixed: "12    if (!evt.user_id && !evt.userId) return fail()",
            fixedNote: "now accepts both `userId` and `user_id`",
          },
          { id: "q4", name: "dead-letter.js" },
          { id: "q5", name: "retry.policy.js" },
        ],
      },
      { name: "Payload", files: [{ id: "q6", name: "event.payload.js" }, { id: "q7", name: "partition.key.js" }, { id: "q8", name: "ack.handler.js" }] },
    ],
    edges: [["q0", "q3"], ["q1", "q4"], ["q2", "q5"], ["q3", "q6"], ["q4", "q7"], ["q5", "q8"], ["q0", "q8"]],
  },
  {
    id: "worker", label: "worker-service", glyph: "grid", tint: 0xdfe6f5, accent: 0x6fd8ff, x: 6.4, hasError: false,
    tiers: [
      { name: "Handler", files: [{ id: "w0", name: "consumer.handler.js" }, { id: "w1", name: "message.parser.js" }, { id: "w2", name: "idempotency.js" }] },
      { name: "Job", files: [{ id: "w3", name: "job.controller.js" }, { id: "w4", name: "retry.backoff.js" }, { id: "w5", name: "worker.pool.js" }] },
      { name: "Result", files: [{ id: "w6", name: "result.payload.js" }, { id: "w7", name: "metrics.reporter.js" }, { id: "w8", name: "sink.writer.js" }] },
    ],
    edges: [["w0", "w3"], ["w1", "w4"], ["w2", "w5"], ["w3", "w6"], ["w4", "w7"], ["w5", "w8"], ["w2", "w8"]],
  },
];

const TIER_Y = [-0.05, 0.68, 1.4];
const TIER_RADIUS = [0.62, 0.86, 0.6];
const NODE_LABEL = Object.fromEntries(NODES.map((n) => [n.id, n.label]));
const NODE_ACCENT_CSS = Object.fromEntries(NODES.map((n) => [n.id, "#" + n.accent.toString(16).padStart(6, "0")]));

/* ────────────────────────────────────────────────────────────────────────
   CANVAS LABEL TEXTURE for the top identity plate
   ──────────────────────────────────────────────────────────────────────── */
function hexToCss(hex) { return "#" + hex.toString(16).padStart(6, "0"); }

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeLabelTexture(label, glyph, accentHex) {
  const accent = hexToCss(accentHex);
  const cnv = document.createElement("canvas");
  cnv.width = 512; cnv.height = 512;
  const ctx = cnv.getContext("2d");
  ctx.clearRect(0, 0, 512, 512);

  // dark backing plate so the label pops regardless of the card colour/lighting underneath
  ctx.fillStyle = "rgba(8,10,17,0.9)";
  roundRect(ctx, 46, 60, 420, 320, 28);
  ctx.fill();
  ctx.strokeStyle = accent + "aa";
  ctx.lineWidth = 4;
  roundRect(ctx, 46, 60, 420, 320, 28);
  ctx.stroke();

  ctx.strokeStyle = accent;
  ctx.fillStyle = accent;
  ctx.lineWidth = 10;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.save();
  ctx.translate(256, 190);
  const s = 1.5;
  if (glyph === "server") {
    for (let i = 0; i < 3; i++) {
      ctx.strokeRect(-55 * s, (-70 + i * 46) * s, 110 * s, 30 * s);
      ctx.beginPath(); ctx.arc(-35 * s, (-55 + i * 46) * s, 4 * s, 0, Math.PI * 2); ctx.fill();
    }
  } else if (glyph === "database") {
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.ellipse(0, (-70 + i * 45) * s, 60 * s, 20 * s, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-60 * s, -70 * s); ctx.lineTo(-60 * s, 20 * s);
    ctx.moveTo(60 * s, -70 * s); ctx.lineTo(60 * s, 20 * s);
    ctx.stroke();
  } else {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++)
      ctx.fillRect((-66 + c * 46) * s, (-66 + r * 46) * s, 30 * s, 30 * s);
  }
  ctx.restore();
  ctx.font = "700 42px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = accent;
  ctx.textAlign = "center";
  ctx.fillText(label, 256, 335);
  const tex = new THREE.CanvasTexture(cnv);
  tex.needsUpdate = true;
  return tex;
}

/* ────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
   ──────────────────────────────────────────────────────────────────────── */
export default function PipelineScene3D() {
  const mountRef = useRef(null);
  const overlayRef = useRef(null);
  const orbitApiRef = useRef(null);
  const [activeId, setActiveId] = useState(null);
  const [resolved, setResolved] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);
  const [microFile, setMicroFile] = useState(null); // {id,name,tierName,nodeId,code,lineIdx,broken,brokenNote,fixed,fixedNote}

  const activeRef = useRef(null);
  const resolvedRef = useRef(false);
  const microRef = useRef(null);
  activeRef.current = activeId;
  resolvedRef.current = resolved;
  microRef.current = microFile;

  const repair = useCallback(() => setResolved(true), []);
  const reset = useCallback(() => { setResolved(false); setMicroFile(null); }, []);
  const goBack = useCallback(() => { setActiveId(null); setMicroFile(null); }, []);
  const closeMicro = useCallback(() => setMicroFile(null), []);
  const resetView = useCallback(() => {
    setActiveId(null);
    setMicroFile(null);
    orbitApiRef.current && orbitApiRef.current.resetView();
  }, []);
  const zoomIn = useCallback(() => orbitApiRef.current && orbitApiRef.current.zoomIn(), []);
  const zoomOut = useCallback(() => orbitApiRef.current && orbitApiRef.current.zoomOut(), []);

  useEffect(() => {
    const mount = mountRef.current;
    let width = mount.clientWidth, height = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(BG_COLOR, 16, 46);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(BG_COLOR, 1);
    if ("outputColorSpace" in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    else renderer.outputEncoding = THREE.sRGBEncoding; // eslint-disable-line deprecation/deprecation
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0x8fa2ff, 0x050505, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.0); key.position.set(6, 10, 6); scene.add(key);
    const rim = new THREE.DirectionalLight(0x88aaff, 0.45); rim.position.set(-8, 4, -6); scene.add(rim);
    const under = new THREE.DirectionalLight(0x334066, 0.25); under.position.set(0, -6, 2); scene.add(under);

    /* floor + grid, double-sided so the scene reads correctly from below too */
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshStandardMaterial({ color: 0x090a10, roughness: 0.95, metalness: 0.1, side: THREE.DoubleSide })
    );
    floor.rotation.x = -Math.PI / 2; floor.position.y = -1.6; scene.add(floor);
    const grid = new THREE.GridHelper(90, 60, 0x323a52, 0x161a26);
    grid.position.y = -1.59; scene.add(grid);

    /* ── build nodes ─────────────────────────────────────────── */
    const nodeRig = [];
    const fileMeshMap = new Map(); // fileId -> { mesh, node }

    NODES.forEach((n) => {
      const group = new THREE.Group();
      group.position.set(n.x, 0, 0);
      scene.add(group);

      const cardMat = new THREE.MeshPhysicalMaterial({
        color: n.tint, transparent: true, opacity: 0.82, roughness: 0.32, metalness: 0.15, clearcoat: 0.5,
      });
      const baseBox = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 2.6), cardMat);
      baseBox.position.y = -0.35; group.add(baseBox);

      const edgeMat = new THREE.LineBasicMaterial({ color: NEUTRAL_EDGE });
      const edgeLines = new THREE.LineSegments(new THREE.EdgesGeometry(baseBox.geometry), edgeMat);
      baseBox.add(edgeLines);

      const midMat = new THREE.MeshStandardMaterial({ color: 0x0d1524, roughness: 0.5, metalness: 0.45 });
      const midSlab = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.16, 2.3), midMat);
      midSlab.position.y = -0.35; group.add(midSlab);
      const baseSlab = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.16, 2.3), midMat.clone());
      baseSlab.position.y = -0.35; group.add(baseSlab);

      const plateTex = makeLabelTexture(n.label, n.glyph, n.accent);
      const plateMat = new THREE.MeshStandardMaterial({ map: plateTex, transparent: true, roughness: 0.35, metalness: 0.05 });
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), plateMat);
      plate.rotation.x = -Math.PI / 2; plate.position.y = 0.02; group.add(plate);

      // ── files (chips) laid out on 3 clear tiers, real ids for the edge graph
      const filePos = new Map(); // fileId -> Vector3 (exploded, local space)
      const fileMeta = new Map(); // fileId -> file def
      const chipMeshes = [];
      n.tiers.forEach((tier, ti) => {
        const count = tier.files.length;
        tier.files.forEach((f, fi) => {
          const angle = (fi / count) * Math.PI * 2 + ti * 0.6 + n.x * 0.02;
          const r = TIER_RADIUS[ti];
          const px = Math.cos(angle) * r;
          const pz = Math.sin(angle) * r;
          const py = TIER_Y[ti] + (seeded(f.id.charCodeAt(0) * 7 + fi) - 0.5) * 0.08;
          const pos = new THREE.Vector3(px, py, pz);
          filePos.set(f.id, pos);
          fileMeta.set(f.id, { ...f, tierName: tier.name });

          const size = f.isErr ? 0.24 : 0.19;
          const mat = new THREE.MeshStandardMaterial({
            color: f.isErr ? ERROR : 0x54608a,
            emissive: f.isErr ? new THREE.Color(ERROR) : new THREE.Color(0x000000),
            emissiveIntensity: f.isErr ? 0.85 : 0,
            roughness: 0.35, metalness: 0.5,
          });
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.55, size), mat);
          const chipEdge = new THREE.LineSegments(
            new THREE.EdgesGeometry(mesh.geometry),
            new THREE.LineBasicMaterial({ color: f.isErr ? 0xffb3b4 : 0x8fa0c8 })
          );
          mesh.add(chipEdge);
          mesh.userData = { fileId: f.id, isErr: !!f.isErr, nodeId: n.id, exploded: pos };
          mesh.scale.setScalar(0.001);
          group.add(mesh);
          chipMeshes.push(mesh);
          fileMeshMap.set(f.id, { mesh, node: n });
        });
      });

      // ── wires following the real dependency graph
      const wireMeshes = [];
      let forwardErrorWire = null;
      n.edges.forEach(([fromId, toId]) => {
        const a = fileMeta.get(fromId), b = fileMeta.get(toId);
        const pa = filePos.get(fromId), pb = filePos.get(toId);
        const forward = !!a.isErr;
        const touches = !!a.isErr || !!b.isErr;
        const lift = 0.22 + seeded((fromId + toId).length * 17 + fromId.charCodeAt(0)) * 0.3;
        const curve = new THREE.CatmullRomCurve3([
          pa.clone(),
          pa.clone().lerp(pb, 0.5).add(new THREE.Vector3(0, lift, 0)),
          pb.clone(),
        ]);
        const geo = new THREE.TubeGeometry(curve, 20, touches ? 0.026 : 0.016, 6, false);
        const mat = new THREE.MeshBasicMaterial({ color: touches ? ERROR : HEALTHY, transparent: true, opacity: 0 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData = { involvesErr: touches, kind: "wire" };
        group.add(mesh);
        wireMeshes.push(mesh);
        if (forward) forwardErrorWire = { curve, mesh, fromId, toId };
      });

      // ── spokes: top-tier files rise to the identity plate
      const topTier = n.tiers[n.tiers.length - 1];
      const spokeMeshes = [];
      topTier.files.forEach((f) => {
        const pos = filePos.get(f.id);
        const curve = new THREE.CatmullRomCurve3([
          pos.clone(), pos.clone().add(new THREE.Vector3(0, 0.6, 0)), new THREE.Vector3(0, TIER_Y[2] + 0.55, 0),
        ]);
        const geo = new THREE.TubeGeometry(curve, 12, 0.014, 6, false);
        const mat = new THREE.MeshBasicMaterial({ color: HEALTHY, transparent: true, opacity: 0 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData = { involvesErr: false, kind: "wire" };
        group.add(mesh); spokeMeshes.push(mesh);
      });

      // invisible generous hit-box for click detection
      const hit = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3.6, 2.8), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.y = 0.6; hit.userData = { kind: "node-hit", nodeId: n.id };
      group.add(hit);

      nodeRig.push({
        id: n.id, group, baseBox, edgeLines, midSlab, baseSlab, plate, plateTex,
        chipMeshes, wireMeshes, spokeMeshes, hit, hasError: n.hasError,
        forwardErrorWire, explodeAmount: 0,
      });
    });

    /* ── connecting tubes between nodes ─────────────────────── */
    const linkMeshes = [];
    for (let i = 0; i < NODES.length - 1; i++) {
      const from = NODES[i], to = NODES[i + 1];
      const p0 = new THREE.Vector3(from.x + 1.35, -0.35, 0);
      const p3 = new THREE.Vector3(to.x - 1.35, -0.35, 0);
      const mid = p0.clone().lerp(p3, 0.5);
      const curve = new THREE.CatmullRomCurve3([
        p0, p0.clone().lerp(mid, 0.5).add(new THREE.Vector3(0, 0.5, 0)),
        p3.clone().lerp(mid, 0.5).add(new THREE.Vector3(0, 0.5, 0)), p3,
      ]);
      const geo = new THREE.TubeGeometry(curve, 40, 0.05, 8, false);
      const isErrLink = i === 1;
      const mat = new THREE.MeshBasicMaterial({ color: isErrLink ? ERROR : HEALTHY });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData = { kind: "link", isErrLink, nodeA: from.id, nodeB: to.id };
      scene.add(mesh);

      const pulseGeo = new THREE.SphereGeometry(0.085, 10, 10);
      const pulses = [0, 0.33, 0.66].map((phase) => {
        const pm = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const pmesh = new THREE.Mesh(pulseGeo, pm);
        scene.add(pmesh);
        return { mesh: pmesh, phase };
      });
      linkMeshes.push({ mesh, mat, curve, isErrLink, pulses });
    }
    const errorLink = linkMeshes.find((l) => l.isErrLink);

    /* ── HTML overlay: file labels, X-marks, error badges ───── */
    const overlay = overlayRef.current;
    overlay.innerHTML = "";

    const chipLabels = [];
    nodeRig.forEach((r) => {
      r.chipMeshes.forEach((m) => {
        const el = document.createElement("div");
        el.className = "pl3d-chip";
        el.textContent = fileNameOf(m.userData.fileId);
        overlay.appendChild(el);
        chipLabels.push({ el, mesh: m });
      });
    });

    const xMarks = [];
    nodeRig.forEach((r) => {
      if (r.forwardErrorWire) {
        const el = document.createElement("div");
        el.className = "pl3d-xmark";
        el.textContent = "✕";
        overlay.appendChild(el);
        xMarks.push({ el, group: r.group, curve: r.forwardErrorWire.curve, scoped: r });
      }
    });
    if (errorLink) {
      const el = document.createElement("div");
      el.className = "pl3d-xmark pl3d-xmark--link";
      el.textContent = "✕";
      overlay.appendChild(el);
      xMarks.push({ el, group: null, curve: errorLink.curve, scoped: null });
    }

    const badges = [];
    nodeRig.forEach((r) => {
      if (r.hasError) {
        const el = document.createElement("div");
        el.className = "pl3d-badge";
        el.textContent = "⚠ broken file inside";
        overlay.appendChild(el);
        badges.push({ el, group: r.group });
      }
    });

    /* ── camera / orbit — full 360, one-shot framing (no per-frame fighting) ── */
    const DEFAULT_VIEW = { theta: 0.55, phi: 1.05, radius: 12, lookAt: new THREE.Vector3(0, -0.2, 0) };
    const MIN_RADIUS = 1.1, MAX_RADIUS = 32;
    const orbit = {
      theta: DEFAULT_VIEW.theta, phi: DEFAULT_VIEW.phi, radius: DEFAULT_VIEW.radius,
      targetTheta: DEFAULT_VIEW.theta, targetPhi: DEFAULT_VIEW.phi, targetRadius: DEFAULT_VIEW.radius,
      lookAt: DEFAULT_VIEW.lookAt.clone(), targetLookAt: DEFAULT_VIEW.lookAt.clone(),
      dragging: false, panning: false, lastX: 0, lastY: 0, idleTimer: 0,
    };
    const PHI_MIN = 0.06, PHI_MAX = Math.PI - 0.06;
    const framedKeyRef = { current: null };

    const dom = renderer.domElement;
    let dragDistance = 0;
    const panRight = new THREE.Vector3(), panUp = new THREE.Vector3();
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const onContextMenu = (e) => e.preventDefault();
    const onDown = (e) => {
      orbit.dragging = true;
      orbit.panning = e.button === 2 || e.shiftKey;
      orbit.lastX = e.clientX; orbit.lastY = e.clientY;
      orbit.idleTimer = 0; dragDistance = 0;
      dom.setPointerCapture(e.pointerId);
    };
    const onMove = (e) => {
      if (!orbit.dragging) return;
      const dx = e.clientX - orbit.lastX, dy = e.clientY - orbit.lastY;
      orbit.lastX = e.clientX; orbit.lastY = e.clientY;
      dragDistance += Math.abs(dx) + Math.abs(dy);
      if (orbit.panning) {
        // direct 1:1 panning — moves the focus point anywhere, "open world" style
        panRight.setFromMatrixColumn(camera.matrixWorld, 0);
        panUp.setFromMatrixColumn(camera.matrixWorld, 1);
        const panScale = orbit.radius * 0.0016;
        const delta = panRight.multiplyScalar(-dx * panScale).add(panUp.multiplyScalar(dy * panScale));
        orbit.lookAt.add(delta);
        orbit.targetLookAt.add(delta);
      } else {
        orbit.targetTheta -= dx * 0.006;
        orbit.targetPhi = Math.max(PHI_MIN, Math.min(PHI_MAX, orbit.targetPhi - dy * 0.006));
      }
    };
    const onUp = () => { orbit.dragging = false; orbit.panning = false; };
    const onWheel = (e) => {
      e.preventDefault();
      // multiplicative zoom: fast when far away, fine-grained when already close
      const factor = Math.exp(e.deltaY * 0.0016);
      orbit.targetRadius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, orbit.targetRadius * factor));
    };
    const onDblClick = (e) => {
      const rect = dom.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const targets = [...nodeRig.map((r) => r.hit), ...nodeRig.flatMap((r) => (r.explodeAmount > 0.3 ? r.chipMeshes : [])), floor];
      const hits = raycaster.intersectObjects(targets, false);
      if (!hits.length) return;
      orbit.targetLookAt.copy(hits[0].point);
      orbit.targetRadius = Math.max(MIN_RADIUS, Math.min(orbit.targetRadius, orbit.targetRadius * 0.55));
      // mark the *current* selection state as already framed so next frame's
      // one-shot check doesn't immediately overwrite this manual focus
      framedKeyRef.current = microRef.current
        ? `micro:${microRef.current.id}`
        : activeRef.current ? `node:${activeRef.current}` : "overview";
    };

    const activePointers = new Map();
    const getPinchDist = () => {
      const pts = [...activePointers.values()];
      if (pts.length < 2) return null;
      const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
      return Math.sqrt(dx * dx + dy * dy);
    };
    let lastPinchDist = null;
    const onPinchDown = (e) => { activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (activePointers.size === 2) lastPinchDist = getPinchDist(); };
    const onPinchMove = (e) => {
      if (!activePointers.has(e.pointerId)) return;
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointers.size === 2 && lastPinchDist !== null) {
        const dist = getPinchDist();
        orbit.targetRadius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, orbit.targetRadius + (lastPinchDist - dist) * 0.04));
        lastPinchDist = dist;
      }
    };
    const onPinchUp = (e) => { activePointers.delete(e.pointerId); lastPinchDist = activePointers.size === 2 ? getPinchDist() : null; };

    const onClick = (e) => {
      if (dragDistance > 6) return;
      const rect = dom.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);

      const activeRig = nodeRig.find((r) => r.id === activeRef.current);
      if (activeRig) {
        const chipHits = raycaster.intersectObjects(activeRig.chipMeshes, false);
        if (chipHits.length) {
          const hit = chipHits[0].object;
          if (hit.userData.isErr && !resolvedRef.current) {
            const meta = fileMetaLookup(NODES, hit.userData.fileId);
            setMicroFile({ ...meta, nodeId: hit.userData.nodeId });
          }
          return;
        }
      }
      const hits = raycaster.intersectObjects(nodeRig.map((r) => r.hit), false);
      if (hits.length) {
        const id = hits[0].object.userData.nodeId;
        setActiveId((cur) => (cur === id ? null : id));
        setMicroFile(null);
        setHintVisible(false);
        return;
      }
      const linkHits = raycaster.intersectObjects(linkMeshes.map((l) => l.mesh), false);
      if (linkHits.length) {
        const ud = linkHits[0].object.userData;
        if (ud.isErrLink) setActiveId(ud.nodeB);
        else setActiveId((cur) => (cur ? cur : ud.nodeA));
        setHintVisible(false);
      }
    };

    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    dom.addEventListener("wheel", onWheel, { passive: false });
    dom.addEventListener("click", onClick);
    dom.addEventListener("dblclick", onDblClick);
    dom.addEventListener("contextmenu", onContextMenu);
    dom.addEventListener("pointerdown", onPinchDown);
    dom.addEventListener("pointermove", onPinchMove);
    dom.addEventListener("pointerup", onPinchUp);
    dom.addEventListener("pointercancel", onPinchUp);

    // imperative camera controls surfaced to the React toolbar (zoom buttons, reset)
    orbitApiRef.current = {
      zoomIn: () => { orbit.targetRadius = Math.max(MIN_RADIUS, orbit.targetRadius * 0.7); },
      zoomOut: () => { orbit.targetRadius = Math.min(MAX_RADIUS, orbit.targetRadius * 1.35); },
      resetView: () => {
        orbit.targetTheta = DEFAULT_VIEW.theta;
        orbit.targetPhi = DEFAULT_VIEW.phi;
        orbit.targetRadius = DEFAULT_VIEW.radius;
        orbit.targetLookAt.copy(DEFAULT_VIEW.lookAt);
        framedKeyRef.current = "overview";
      },
    };

    const onResize = () => {
      width = mount.clientWidth; height = mount.clientHeight;
      camera.aspect = width / height; camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    /* ── animation loop ─────────────────────────────────────── */
    let raf;
    const clock = new THREE.Clock();
    const tmpColor = new THREE.Color();
    const worldVec = new THREE.Vector3();
    const screenVec = new THREE.Vector3();

    function project(vec3) {
      screenVec.copy(vec3).project(camera);
      return { x: (screenVec.x * 0.5 + 0.5) * width, y: (-screenVec.y * 0.5 + 0.5) * height, behind: screenVec.z > 1 };
    }

    function animate() {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;

      if (!orbit.dragging) {
        orbit.idleTimer += dt;
        if (orbit.idleTimer > 1.4) orbit.targetTheta += dt * 0.025;
      }

      // one-shot framing when selection changes (never fights manual orbit/zoom)
      const micro = microRef.current;
      const framedKey = micro ? `micro:${micro.id}` : activeRef.current ? `node:${activeRef.current}` : "overview";
      if (framedKeyRef.current !== framedKey) {
        framedKeyRef.current = framedKey;
        if (micro) {
          const entry = fileMeshMap.get(micro.id);
          if (entry) {
            entry.mesh.getWorldPosition(worldVec);
            orbit.targetLookAt.copy(worldVec);
            orbit.targetRadius = 2.6;
          }
        } else if (activeRef.current) {
          const rig = nodeRig.find((r) => r.id === activeRef.current);
          orbit.targetLookAt.set(rig.group.position.x, 0.5, 0);
          orbit.targetRadius = 7.5;
        } else {
          orbit.targetLookAt.set(0, -0.2, 0);
          orbit.targetRadius = 12;
        }
      }

      orbit.theta += (orbit.targetTheta - orbit.theta) * 0.07;
      orbit.phi += (orbit.targetPhi - orbit.phi) * 0.07;
      orbit.radius += (orbit.targetRadius - orbit.radius) * 0.07;
      orbit.lookAt.lerp(orbit.targetLookAt, 0.07);

      const sp = new THREE.Spherical(orbit.radius, orbit.phi, orbit.theta);
      camera.position.setFromSpherical(sp).add(orbit.lookAt);
      camera.lookAt(orbit.lookAt);
      camera.updateMatrixWorld();

      nodeRig.forEach((r) => {
        const target = r.id === activeRef.current ? 1 : 0;
        r.explodeAmount += (target - r.explodeAmount) * 0.08;
        const e = r.explodeAmount;

        r.baseSlab.position.y = -0.35 + e * -0.9;
        r.midSlab.position.y = -0.35 + e * 0.15;
        r.baseBox.material.opacity = 0.82 * (1 - e) + 0.14 * e;
        r.baseBox.scale.y = 1 - e * 0.4;
        r.plate.position.y = 0.02 + e * (TIER_Y[2] + 0.53);
        r.plate.rotation.z = e * 0.04;
        // hide the identity plate once the block is meaningfully open — its
        // job (labelling) is taken over by the HTML breadcrumb + file labels
        r.plate.material.opacity = Math.max(0, 1 - e * 1.6);
        r.plate.visible = e < 0.7;

        const errActive = r.hasError && !resolvedRef.current;
        tmpColor.set(errActive ? ERROR : r.hasError ? FIXED : NEUTRAL_EDGE);
        r.edgeLines.material.color.lerp(tmpColor, 0.12);

        // fully hide (not just fade) chips/wires at rest — several
        // near-transparent overlapping wires still visibly "bleed" through
        // the card at low opacity from grazing angles, so cut them from
        // the render entirely below a small threshold instead of relying
        // on opacity alone
        const show = e > 0.02;
        r.chipMeshes.forEach((m) => {
          m.visible = show;
          if (!show) return;
          const p = m.userData.exploded;
          m.position.lerpVectors(new THREE.Vector3(0, -0.35, 0), p, e);
          m.scale.setScalar(0.001 + e * 0.999);
          if (m.userData.isErr) {
            const col = resolvedRef.current ? FIXED : ERROR;
            tmpColor.set(col);
            m.material.color.lerp(tmpColor, 0.1);
            m.material.emissive.lerp(tmpColor, 0.1);
            m.material.emissiveIntensity = 0.7 + Math.sin(t * 4) * (resolvedRef.current ? 0.1 : 0.3);
          }
        });
        [...r.wireMeshes, ...r.spokeMeshes].forEach((m) => {
          m.visible = show;
          if (!show) return;
          m.material.opacity = e * 0.92;
          if (m.userData.involvesErr) {
            tmpColor.set(resolvedRef.current ? FIXED : ERROR);
            m.material.color.lerp(tmpColor, 0.1);
          }
        });
      });

      linkMeshes.forEach((l) => {
        tmpColor.set(l.isErrLink && !resolvedRef.current ? ERROR : HEALTHY);
        l.mat.color.lerp(tmpColor, 0.08);
        l.pulses.forEach((p) => {
          const u = (t * 0.25 + p.phase) % 1;
          p.mesh.position.copy(l.curve.getPointAt(u));
          p.mesh.material.color.copy(l.mat.color);
        });
      });

      // ── HTML overlay projection (imperative, no React re-render) ──
      chipLabels.forEach((c) => {
        const e = nodeRig.find((r) => r.chipMeshes.includes(c.mesh)).explodeAmount;
        if (e < 0.05) { c.el.style.opacity = "0"; return; }
        c.mesh.getWorldPosition(worldVec);
        const { x, y, behind } = project(worldVec);
        c.el.style.opacity = behind ? "0" : String(Math.min(1, e * 1.4));
        c.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -140%)`;
        c.el.classList.toggle("pl3d-chip--err", c.mesh.userData.isErr && !resolvedRef.current);
        c.el.classList.toggle("pl3d-chip--fixed", c.mesh.userData.isErr && resolvedRef.current);
      });

      xMarks.forEach((xm) => {
        const e = xm.scoped ? xm.scoped.explodeAmount : 1;
        const visible = !resolvedRef.current && e > 0.4;
        if (!visible) { xm.el.style.opacity = "0"; return; }
        worldVec.copy(xm.curve.getPointAt(0.5));
        if (xm.group) worldVec.applyMatrix4(xm.group.matrixWorld);
        const { x, y, behind } = project(worldVec);
        xm.el.style.opacity = behind ? "0" : String(Math.min(1, (e - 0.4) * 2));
        xm.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      });

      badges.forEach((b) => {
        b.group.getWorldPosition(worldVec);
        worldVec.y += 2.4;
        const { x, y, behind } = project(worldVec);
        b.el.style.opacity = behind || resolvedRef.current ? "0" : "1";
        b.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      });

      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      dom.removeEventListener("wheel", onWheel);
      dom.removeEventListener("click", onClick);
      dom.removeEventListener("dblclick", onDblClick);
      dom.removeEventListener("contextmenu", onContextMenu);
      dom.removeEventListener("pointerdown", onPinchDown);
      dom.removeEventListener("pointermove", onPinchMove);
      dom.removeEventListener("pointerup", onPinchUp);
      dom.removeEventListener("pointercancel", onPinchUp);
      orbitApiRef.current = null;
      overlay.innerHTML = "";
      nodeRig.forEach((r) => r.plateTex.dispose());
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, [repair]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 560, background: "#05060a", borderRadius: 16, overflow: "hidden" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%", minHeight: 560, cursor: activeId ? "default" : "grab" }} />
      <div ref={overlayRef} style={overlayLayerStyle} />

      <style>{CSS}</style>

      <div style={overlayTop}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#eceef5" }}>
            Pipeline Cross-Section
            {activeId && (
              <span style={{ color: NODE_ACCENT_CSS[activeId], fontFamily: "ui-monospace, monospace", fontSize: 12.5, marginLeft: 10 }}>
                · {NODE_LABEL[activeId]}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "#9799ad", fontFamily: "ui-monospace, monospace", marginTop: 2 }}>
            drag to orbit · shift/right-drag to pan · scroll or double-click to zoom
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, pointerEvents: "auto" }}>
          {activeId && <button onClick={goBack} style={btnStyle}>← Back</button>}
          {resolved && <button onClick={reset} style={btnStyle}>Reintroduce break</button>}
        </div>
      </div>

      <div style={cameraControlsStyle}>
        <button onClick={zoomIn} style={roundBtnStyle} title="Zoom in">+</button>
        <button onClick={zoomOut} style={roundBtnStyle} title="Zoom out">−</button>
        <button onClick={resetView} style={{ ...roundBtnStyle, width: "auto", padding: "0 12px", fontSize: 11 }} title="Reset view">⟲ Reset</button>
      </div>

      {activeId === "queue" && !microFile && (
        <div style={overlayBottom}>
          {resolved ? (
            <span style={{ color: "#35e08a" }}>✓ Schema patched — worker-service link restored</span>
          ) : (
            <span style={{ color: "#ff4d4f" }}>⚠ Click the glowing red file to inspect the exact broken line</span>
          )}
        </div>
      )}

      {hintVisible && !activeId && <div style={hintStyle}>3 codebases · click one to expand</div>}

      {microFile && (
        <div style={microPanelStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#eceef5" }}>{microFile.name}</div>
              <div style={{ fontSize: 10.5, color: "#8b8b9d", fontFamily: "ui-monospace, monospace" }}>{microFile.tierName} · {microFile.nodeId}</div>
            </div>
            <button onClick={closeMicro} style={{ ...btnStyle, padding: "5px 9px" }}>✕</button>
          </div>

          <div style={codeBlockStyle}>
            {microFile.code.map((line, i) => {
              const isTarget = i === microFile.lineIdx;
              return (
                <div key={i} style={{
                  ...codeLineStyle,
                  background: isTarget ? (resolved ? "rgba(53,224,138,0.14)" : "rgba(255,77,79,0.14)") : "transparent",
                  color: isTarget ? (resolved ? "#35e08a" : "#ff6b6d") : "#aab0c8",
                }}>
                  {isTarget ? (resolved ? microFile.fixed : microFile.broken) : line}
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 11, marginTop: 8, color: resolved ? "#35e08a" : "#ff8788", fontFamily: "ui-monospace, monospace" }}>
            {resolved ? `✓ ${microFile.fixedNote}` : `✕ ${microFile.brokenNote}`}
          </div>

          {!resolved && (
            <button onClick={repair} style={patchBtnStyle}>Apply patch →</button>
          )}
        </div>
      )}
    </div>
  );
}

/* helpers that read from static NODES/nodeRig without needing extra state plumbing */
function fileNameOf(fileId) {
  for (const n of NODES) for (const tier of n.tiers) for (const f of tier.files) if (f.id === fileId) return f.name;
  return fileId;
}
function fileMetaLookup(nodes, fileId) {
  for (const n of nodes) for (const tier of n.tiers) for (const f of tier.files) if (f.id === fileId) return { ...f, tierName: tier.name };
  return null;
}

/* ── styles ── */
const overlayTop = {
  position: "absolute", top: 16, left: 16, right: 16,
  display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10,
  pointerEvents: "none", fontFamily: "'Inter', -apple-system, sans-serif",
};
const overlayBottom = {
  position: "absolute", bottom: 18, left: 0, right: 0, textAlign: "center",
  fontSize: 12.5, fontFamily: "ui-monospace, monospace", pointerEvents: "none",
};
const hintStyle = {
  position: "absolute", bottom: 18, left: 0, right: 0, textAlign: "center",
  fontSize: 11.5, color: "#6a6c82", fontFamily: "ui-monospace, monospace", pointerEvents: "none",
};
const btnStyle = {
  pointerEvents: "auto", background: "rgba(255,255,255,0.07)", border: "1px solid #2e3346",
  color: "#dcdce6", fontSize: 11.5, padding: "7px 12px", borderRadius: 7, cursor: "pointer",
  fontFamily: "'Inter', -apple-system, sans-serif",
};
const overlayLayerStyle = { position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" };
const cameraControlsStyle = {
  position: "absolute", right: 16, top: 66,
  display: "flex", flexDirection: "column", gap: 6, pointerEvents: "auto",
  fontFamily: "'Inter', -apple-system, sans-serif",
};
const roundBtnStyle = {
  width: 34, height: 34, borderRadius: 9, background: "rgba(255,255,255,0.07)",
  border: "1px solid #2e3346", color: "#dcdce6", fontSize: 16, fontWeight: 700,
  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
};
const microPanelStyle = {
  position: "absolute", right: 16, bottom: 16, width: 320,
  background: "rgba(10,11,18,0.94)", border: "1px solid #2e3346", borderRadius: 12,
  padding: 14, backdropFilter: "blur(6px)", fontFamily: "'Inter', -apple-system, sans-serif",
  boxShadow: "0 20px 50px -20px rgba(0,0,0,0.7)",
};
const codeBlockStyle = {
  background: "#0a0b11", border: "1px solid #1f2233", borderRadius: 8, padding: "8px 0", overflow: "hidden",
};
const codeLineStyle = {
  fontFamily: "ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, Consolas, monospace",
  fontSize: 11.5, padding: "3px 10px", whiteSpace: "pre",
};
const patchBtnStyle = {
  marginTop: 10, width: "100%", background: "#ff4d4f", border: "none", color: "#160607",
  fontWeight: 700, fontSize: 12, padding: "9px 0", borderRadius: 8, cursor: "pointer",
};

const CSS = `
  .pl3d-chip {
    position: absolute; top: 0; left: 0;
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 10px; color: #cfd6ef; background: rgba(14,16,26,0.82);
    border: 1px solid #2c3148; padding: 2px 6px; border-radius: 5px;
    white-space: nowrap; will-change: transform, opacity;
  }
  .pl3d-chip--err   { color: #ffb3b4; border-color: #7a2e30; }
  .pl3d-chip--fixed { color: #9dfcc6; border-color: #1f6b45; }
  .pl3d-xmark {
    position: absolute; top: 0; left: 0;
    color: #ff4d4f; font-weight: 800; font-size: 26px;
    text-shadow: 0 0 14px rgba(255,77,79,0.95), 0 0 4px #000;
    will-change: transform, opacity;
  }
  .pl3d-xmark--link { font-size: 36px; }
  .pl3d-badge {
    position: absolute; top: 0; left: 0;
    background: rgba(48,17,19,0.9); border: 1px solid #7a2e30; color: #ffb3b4;
    font-family: ui-monospace, monospace; font-size: 10.5px; font-weight: 600;
    padding: 3px 8px; border-radius: 999px; white-space: nowrap;
    will-change: transform, opacity;
  }
`;
