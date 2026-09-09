import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import * as THREE from "three";
import { Timer } from "three";

/* ────────────────────────────────────────────────────────────────────────
   COLORS
   ──────────────────────────────────────────────────────────────────────── */
const HEALTHY    = 0x00d4ff; // electric cyan — sharp against deep black
const ERROR      = 0xff2d55; // vivid crimson for root-cause errors
const DOWNSTREAM = 0xff8c00; // warm amber for downstream cascade
const CONTEXT    = 0x7b8db5; // cool slate for context neighbors
const FIXED      = 0x00e87a; // clean emerald for resolved state
const NEUTRAL_EDGE = 0x253050;
const BG_COLOR   = 0x03040c; // deep space black

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
    id: "auth",
    label: "auth-service",
    glyph: "server",
    tint: 0xf3ecd8,
    accent: 0xf0a63b,
    x: -6.4,
    hasError: false,
    tiers: [
      {
        name: "Route",
        files: [
          { id: "a0", name: "login.route.js" },
          { id: "a1", name: "refresh.route.js" },
          { id: "a2", name: "logout.route.js" },
        ],
      },
      {
        name: "Controller",
        files: [
          { id: "a3", name: "auth.controller.js" },
          { id: "a4", name: "session.service.js" },
          { id: "a5", name: "token.util.js" },
        ],
      },
      {
        name: "Payload",
        files: [
          { id: "a6", name: "auth-success.event.js" },
          { id: "a7", name: "user.mapper.js" },
          { id: "a8", name: "queue.publisher.js" },
        ],
      },
    ],
    edges: [
      ["a0", "a3"],
      ["a1", "a4"],
      ["a2", "a5"],
      ["a3", "a6"],
      ["a4", "a7"],
      ["a5", "a8"],
      ["a1", "a8"],
    ],
  },
  {
    id: "queue",
    label: "Event Queue",
    glyph: "database",
    tint: 0xdfe6f5,
    accent: 0x6fd8ff,
    x: 0,
    hasError: true,
    tiers: [
      {
        name: "Ingress",
        files: [
          { id: "q0", name: "ingress.topic.js" },
          { id: "q1", name: "consumer.group.js" },
          { id: "q2", name: "offset.tracker.js" },
        ],
      },
      {
        name: "Schema Guard",
        files: [
          {
            id: "q3",
            name: "schema.guard.js",
            isErr: true,
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
      {
        name: "Payload",
        files: [
          { id: "q6", name: "event.payload.js" },
          { id: "q7", name: "partition.key.js" },
          { id: "q8", name: "ack.handler.js" },
        ],
      },
    ],
    edges: [
      ["q0", "q3"],
      ["q1", "q4"],
      ["q2", "q5"],
      ["q3", "q6"],
      ["q4", "q7"],
      ["q5", "q8"],
      ["q0", "q8"],
    ],
  },
  {
    id: "worker",
    label: "worker-service",
    glyph: "grid",
    tint: 0xdfe6f5,
    accent: 0x6fd8ff,
    x: 6.4,
    hasError: false,
    tiers: [
      {
        name: "Handler",
        files: [
          { id: "w0", name: "consumer.handler.js" },
          { id: "w1", name: "message.parser.js" },
          { id: "w2", name: "idempotency.js" },
        ],
      },
      {
        name: "Job",
        files: [
          { id: "w3", name: "job.controller.js" },
          { id: "w4", name: "retry.backoff.js" },
          { id: "w5", name: "worker.pool.js" },
        ],
      },
      {
        name: "Result",
        files: [
          { id: "w6", name: "result.payload.js" },
          { id: "w7", name: "metrics.reporter.js" },
          { id: "w8", name: "sink.writer.js" },
        ],
      },
    ],
    edges: [
      ["w0", "w3"],
      ["w1", "w4"],
      ["w2", "w5"],
      ["w3", "w6"],
      ["w4", "w7"],
      ["w5", "w8"],
      ["w2", "w8"],
    ],
  },
];

const TIER_Y = [0.5, 1.65, 2.8];
const TIER_RADIUS = [1.15, 1.55, 1.15];

function serviceNameOf(filePath) {
  const parts = String(filePath || "")
    .split(/[\\/]/)
    .filter(Boolean);
  return parts.length > 1 ? parts[0] : "repository";
}

function getLayoutPositions(count, mode) {
  if (count <= 1) return [[0, 0.25, 0]];

  if (mode === "triangle" && count <= 3) {
    return count === 2
      ? [
          [-5, 0.25, 0],
          [5, 0.25, 0],
        ]
      : [
          [0, 1.7, 0],
          [-6.2, 0.05, 1.2],
          [6.2, 0.05, -1.2],
        ];
  }

  if (mode === "square" && count <= 4) {
    const square = [
      [-5.4, 0.3, -3.6],
      [5.4, 0.3, -3.6],
      [5.4, 0.3, 3.6],
      [-5.4, 0.3, 3.6],
    ];
    return square.slice(0, count);
  }

  if (mode === "orbit") {
    const radius = Math.max(6, count * 2.2);
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      return [
        Math.cos(angle) * radius,
        0.45 + Math.sin(angle * 2) * 0.45,
        Math.sin(angle) * radius,
      ];
    });
  }

  const spacing = Math.max(7.5, Math.min(10, 42 / count));
  return Array.from({ length: count }, (_, i) => {
    const progress = i / (count - 1);
    return [
      (progress - 0.5) * spacing * (count - 1),
      0.25 + Math.sin(progress * Math.PI) * 0.7,
      (i % 2 ? -1 : 1) * 0.8,
    ];
  });
}
/* ────────────────────────────────────────────────────────────────────────
   CANVAS LABEL TEXTURE for the top identity plate
   ──────────────────────────────────────────────────────────────────────── */
function hexToCss(hex) {
  return "#" + hex.toString(16).padStart(6, "0");
}

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
  const S = 1024;
  const cnv = document.createElement("canvas");
  cnv.width = S;
  cnv.height = S;
  const ctx = cnv.getContext("2d");
  ctx.clearRect(0, 0, S, S);

  // ── Gradient backing plate ────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, 0, S);
  bg.addColorStop(0, "rgba(10,14,30,0.97)");
  bg.addColorStop(1, "rgba(4,7,18,0.94)");
  roundRect(ctx, 80, 96, S - 160, S - 210, 52);
  ctx.fillStyle = bg;
  ctx.fill();

  // ── Accent border ─────────────────────────────────────────────
  ctx.strokeStyle = accent + "cc";
  ctx.lineWidth = 6;
  roundRect(ctx, 80, 96, S - 160, S - 210, 52);
  ctx.stroke();

  // ── Top accent bar ────────────────────────────────────────────
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = accent;
  roundRect(ctx, 80 + 52, 96, S - 160 - 104, 5, 3);
  ctx.fill();
  ctx.globalAlpha = 1.0;

  // ── Corner notch marks (tech frame) ──────────────────────────
  const ml = 80, mr = S - 80, mt = 96, mb = S - 114;
  const nl = 44;
  ctx.strokeStyle = accent + "77";
  ctx.lineWidth = 5;
  [[ml, mt, 1, 1], [mr, mt, -1, 1], [ml, mb, 1, -1], [mr, mb, -1, -1]].forEach(
    ([cx, cy, dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(cx + dx * nl, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dy * nl);
      ctx.stroke();
    }
  );

  // ── Glyph icon ────────────────────────────────────────────────
  ctx.strokeStyle = accent;
  ctx.fillStyle = accent;
  ctx.lineWidth = 14;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.save();
  ctx.translate(S / 2, S * 0.415);
  if (glyph === "server") {
    for (let i = 0; i < 3; i++) {
      const ry = (-58 + i * 44) * 1.2;
      roundRect(ctx, -96, ry, 192, 30, 8);
      ctx.strokeStyle = accent + (i === 1 ? "ff" : "99");
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-66, ry + 15, 8, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-42, ry + 15, 6, 0, Math.PI * 2);
      ctx.fillStyle = accent + "66";
      ctx.fill();
    }
  } else if (glyph === "database") {
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(0, (-64 + i * 44) * 1.1, 96, 26, 0, 0, Math.PI * 2);
      ctx.strokeStyle = accent + (i === 1 ? "ff" : "88");
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-96, -64 * 1.1);
    ctx.lineTo(-96, 18 * 1.1);
    ctx.moveTo(96, -64 * 1.1);
    ctx.lineTo(96, 18 * 1.1);
    ctx.strokeStyle = accent + "77";
    ctx.stroke();
  } else {
    // Grid / microservice — 3×3 rounded squares
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const bx = (-2 + c) * 64 - 30;
        const by = (-2 + r) * 64 - 30;
        roundRect(ctx, bx, by, 52, 52, 10);
        ctx.fillStyle = (r + c) % 2 === 0 ? accent : accent + "44";
        ctx.fill();
      }
    }
  }
  ctx.restore();

  // ── Service label ─────────────────────────────────────────────
  ctx.textAlign = "center";
  ctx.shadowColor = accent;
  ctx.shadowBlur = 28;
  ctx.font = "700 58px 'Inter', system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#eaeff8";
  ctx.fillText(label, S / 2, S * 0.74);
  ctx.shadowBlur = 0;

  // ── Type badge ────────────────────────────────────────────────
  ctx.font = "600 26px ui-monospace, monospace";
  ctx.fillStyle = accent + "99";
  ctx.fillText(glyph.toUpperCase(), S / 2, S * 0.82);

  const tex = new THREE.CanvasTexture(cnv);
  tex.needsUpdate = true;
  return tex;
}

/* ────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
   ──────────────────────────────────────────────────────────────────────── */
export default function PipelineScene3D({ analysisData, demoMode = false }) {
  const mountRef = useRef(null);
  const overlayRef = useRef(null);
  const orbitApiRef = useRef(null);
  const [activeId, setActiveId] = useState(null);
  const [resolved, setResolved] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);
  const [layoutMode, setLayoutMode] = useState("line");
  const [microFile, setMicroFile] = useState(null); // {id,name,tierName,nodeId,code,lineIdx,broken,brokenNote,fixed,fixedNote}

  const activeRef = useRef(null);
  const resolvedRef = useRef(false);
  const microRef = useRef(null);
  activeRef.current = activeId;
  resolvedRef.current = resolved;
  microRef.current = microFile;

  // Scanned mode is strict: render only the nodes returned by the analysis job.
  // The fixture pipeline is available only after the user explicitly chooses Demo.
  const sceneNodes = useMemo(() => {
    if (
      (!analysisData ||
        !analysisData.nodes ||
        analysisData.nodes.length === 0) &&
      demoMode
    ) {
      const positions = getLayoutPositions(NODES.length, layoutMode);
      return NODES.map((node, index) => ({
        ...node,
        x: positions[index][0],
        y: positions[index][1],
        z: positions[index][2],
      }));
    }
    if (!analysisData?.nodes?.length) return [];

    // Keep the architectural boundary visible: a block represents one service,
    // while its internal layers represent the tiers/files found in that service.
    const serviceGroups = new Map();
    analysisData.nodes.forEach((node) => {
      const serviceKey = serviceNameOf(node.file || node.id);
      if (!serviceGroups.has(serviceKey)) serviceGroups.set(serviceKey, []);
      serviceGroups.get(serviceKey).push(node);
    });

    const tierOrder = [
      "entrypoint",
      "api",
      "core",
      "logic",
      "consumer",
      "infrastructure",
      "data",
      "utility",
      "other",
    ];
    const sortedServices = [...serviceGroups.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    );

    const tierMeta = {
      api: {
        label: "API / Ingress",
        glyph: "server",
        accent: 0xf0a63b,
        tint: 0xf3ecd8,
      },
      logic: {
        label: "Business Logic",
        glyph: "grid",
        accent: 0x6fd8ff,
        tint: 0xdfe6f5,
      },
      data: {
        label: "Data / State",
        glyph: "database",
        accent: 0xa78bfa,
        tint: 0xdfe6f5,
      },
      other: {
        label: "Other",
        glyph: "grid",
        accent: 0x6fd8ff,
        tint: 0xdfe6f5,
      },
    };

    // Use generous spacing so each service has a readable footprint and the
    // cross-service wires remain visually separable.
    const count = sortedServices.length;
    const blockPositions = getLayoutPositions(count, layoutMode);
    const allEdges = analysisData.edges || [];

    const blocks = sortedServices.map(([serviceKey, serviceNodes], i) => {
      const tierGroups = new Map();
      serviceNodes.forEach((node) => {
        const tier = node.tier || "other";
        if (!tierGroups.has(tier)) tierGroups.set(tier, []);
        tierGroups.get(tier).push(node);
      });
      const sortedTiers = [...tierGroups.entries()].sort(([a], [b]) => {
        const ai = tierOrder.indexOf(a) === -1 ? 99 : tierOrder.indexOf(a);
        const bi = tierOrder.indexOf(b) === -1 ? 99 : tierOrder.indexOf(b);
        return ai - bi;
      });
      const primaryTier = sortedTiers[0]?.[0] || "other";
      const meta = tierMeta[primaryTier] ?? tierMeta.other;
      const hasError = serviceNodes.some(
        (n) =>
          n.status === "impacted" || (n.lines || []).some((line) => line.error),
      );
      const blockIds = new Set(serviceNodes.map((node) => node.id));

      const files = serviceNodes.map((node) => {
        const lines = node.lines || [];
        const errLineIdx = lines.findIndex((l) => l.error);
        const fileStatus =
          errLineIdx !== -1 ? "impacted" : node.status || "healthy";
        const incoming = allEdges.filter((edge) => edge.target === node.id);
        const outgoing = allEdges.filter((edge) => edge.source === node.id);
        return {
          id: node.id,
          name: (node.file || node.id).split("/").pop(),
          path: node.file || node.id,
          isErr: node.status === "impacted" || errLineIdx !== -1,
          status: fileStatus,
          incoming: incoming.map((edge) => ({
            id: edge.source,
            broken: ["impacted", "affected-downstream"].includes(
              analysisData.nodes.find((n) => n.id === edge.source)?.status,
            ),
          })),
          outgoing: outgoing.map((edge) => ({
            id: edge.target,
            broken: ["impacted", "affected-downstream"].includes(
              analysisData.nodes.find((n) => n.id === edge.target)?.status,
            ),
          })),
          code: lines.map((l) => l.code || l.before || ""),
          lineIdx: errLineIdx,
          broken:
            errLineIdx !== -1
              ? lines[errLineIdx].before || lines[errLineIdx].code || ""
              : null,
          brokenNote:
            errLineIdx !== -1 ? lines[errLineIdx].hint || "Bug detected" : "",
          fixed: errLineIdx !== -1 ? lines[errLineIdx].after || "" : "",
          fixedNote: "Resolved",
        };
      });

      // Distribute files across the block's three visual layers.
      const t1 = [],
        t2 = [],
        t3 = [];
      files.forEach((f, fi) => {
        if (fi % 3 === 0) t1.push(f);
        else if (fi % 3 === 1) t2.push(f);
        else t3.push(f);
      });

      const internalEdges = allEdges
        .filter((e) => blockIds.has(e.source) && blockIds.has(e.target))
        .map((e) => [e.source, e.target]);

      return {
        id: serviceKey,
        label: `${serviceKey} / ${meta.label}`,
        glyph: meta.glyph,
        tint: meta.tint,
        accent: meta.accent,
        x: blockPositions[i][0],
        y: blockPositions[i][1],
        z: blockPositions[i][2],
        hasError,
        files,
        tiers: [
          { name: "Layer 1", files: t1 },
          { name: "Layer 2", files: t2 },
          { name: "Layer 3", files: t3 },
        ],
        edges: internalEdges,
        crossEdges: i === 0 ? allEdges : [],
      };
    });

    return blocks;
  }, [analysisData, demoMode, layoutMode]);

  // Derived lookups for the overlay
  const NODE_LABEL = useMemo(
    () => Object.fromEntries(sceneNodes.map((n) => [n.id, n.label])),
    [sceneNodes],
  );
  const NODE_ACCENT_CSS = useMemo(
    () =>
      Object.fromEntries(
        sceneNodes.map((n) => [
          n.id,
          "#" + n.accent.toString(16).padStart(6, "0"),
        ]),
      ),
    [sceneNodes],
  );
  const brokenFiles = useMemo(
    () =>
      sceneNodes.flatMap((node) =>
        node.tiers.flatMap((tier) => tier.files.filter((file) => file.isErr)),
      ),
    [sceneNodes],
  );

  const repair = useCallback(() => setResolved(true), []);
  useEffect(() => {
    setResolved(false);
    setActiveId(null);
    setMicroFile(null);
  }, [analysisData]);
  const reset = useCallback(() => {
    setResolved(false);
    setMicroFile(null);
  }, []);
  const goBack = useCallback(() => {
    setActiveId(null);
    setMicroFile(null);
  }, []);
  const closeMicro = useCallback(() => setMicroFile(null), []);
  const inspectFirstError = useCallback(() => {
    const file = brokenFiles[0];
    if (!file) return;
    const owner = sceneNodes.find((node) =>
      node.tiers.some((tier) => tier.files.some((item) => item.id === file.id)),
    );
    if (!owner) return;
    setActiveId(owner.id);
    setMicroFile({ ...file, nodeId: owner.id });
    setHintVisible(false);
  }, [brokenFiles, sceneNodes]);
  const resetView = useCallback(() => {
    setActiveId(null);
    setMicroFile(null);
    orbitApiRef.current && orbitApiRef.current.resetView();
  }, []);
  const zoomIn = useCallback(
    () => orbitApiRef.current && orbitApiRef.current.zoomIn(),
    [],
  );
  const zoomOut = useCallback(
    () => orbitApiRef.current && orbitApiRef.current.zoomOut(),
    [],
  );

  useEffect(() => {
    const mount = mountRef.current;
    let width = mount.clientWidth,
      height = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(BG_COLOR, 16, 46);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(BG_COLOR, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0x3355cc, 0x020305, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(8, 12, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x2244ff, 0.55);
    rim.position.set(-10, 5, -8);
    scene.add(rim);
    const under = new THREE.DirectionalLight(0x001133, 0.3);
    under.position.set(0, -8, 2);
    scene.add(under);
    // Warm fill — creates depth contrast against the cool blue bias
    const fill = new THREE.DirectionalLight(0xff7722, 0.18);
    fill.position.set(2, 4, 14);
    scene.add(fill);

    /* floor + grid, double-sided so the scene reads correctly from below too */
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshStandardMaterial({
        color: 0x090a10,
        roughness: 0.95,
        metalness: 0.1,
        side: THREE.DoubleSide,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.6;
    scene.add(floor);
    const grid = new THREE.GridHelper(90, 60, 0x323a52, 0x161a26);
    grid.position.y = -1.59;
    scene.add(grid);

    /* ── build nodes ─────────────────────────────────────────── */
    const nodeRig = [];
    const fileMeshMap = new Map(); // fileId -> { mesh, node }

    sceneNodes.forEach((n) => {
      const group = new THREE.Group();
      group.position.set(n.x, n.y || 0, n.z || 0);
      scene.add(group);

      // ── Main body — premium clearcoat physical material ──────────────────
      const cardMat = new THREE.MeshPhysicalMaterial({
        color: n.tint,
        transparent: true,
        opacity: 0.86,
        roughness: 0.20,
        metalness: 0.28,
        clearcoat: 1.0,
        clearcoatRoughness: 0.12,
        reflectivity: 0.65,
      });
      const baseBox = new THREE.Mesh(
        new THREE.BoxGeometry(2.58, 0.66, 2.58),
        cardMat,
      );
      baseBox.position.y = -0.35;
      group.add(baseBox);

      // ── Status-reactive wireframe edges ───────────────────────────────────
      const edgeMat = new THREE.LineBasicMaterial({
        color: n.hasError ? 0x8a1822 : NEUTRAL_EDGE,
      });
      const edgeLines = new THREE.LineSegments(
        new THREE.EdgesGeometry(baseBox.geometry),
        edgeMat,
      );
      baseBox.add(edgeLines);

      // ── Inner tier slabs (spread apart when block explodes) ───────────────
      const midMat = new THREE.MeshStandardMaterial({
        color: 0x060c1a,
        roughness: 0.6,
        metalness: 0.5,
        emissive: new THREE.Color(n.hasError ? ERROR : HEALTHY),
        emissiveIntensity: 0.05,
      });
      const midSlab = new THREE.Mesh(
        new THREE.BoxGeometry(2.26, 0.13, 2.26),
        midMat,
      );
      midSlab.position.y = -0.35;
      group.add(midSlab);
      const baseSlab = new THREE.Mesh(
        new THREE.BoxGeometry(2.26, 0.13, 2.26),
        midMat.clone(),
      );
      baseSlab.position.y = -0.35;
      group.add(baseSlab);

      // ── Accent top cap strip (accent colour, metallic) ────────────────────
      const topCapMat = new THREE.MeshStandardMaterial({
        color: n.accent,
        emissive: new THREE.Color(n.accent),
        emissiveIntensity: n.hasError ? 0.0 : 0.45,
        roughness: 0.12,
        metalness: 0.92,
      });
      const topCap = new THREE.Mesh(
        new THREE.BoxGeometry(2.58, 0.04, 2.58),
        topCapMat,
      );
      topCap.position.y = 0.01;
      group.add(topCap);

      // ── Hexagonal architectural base pad ──────────────────────────────────
      const hexPadMat = new THREE.MeshStandardMaterial({
        color: n.hasError ? 0x1e0609 : 0x070c1c,
        roughness: 0.62,
        metalness: 0.48,
        emissive: new THREE.Color(n.hasError ? ERROR : HEALTHY),
        emissiveIntensity: n.hasError ? 0.16 : 0.07,
      });
      const hexPad = new THREE.Mesh(
        new THREE.CylinderGeometry(1.68, 1.78, 0.09, 6),
        hexPadMat,
      );
      hexPad.position.y = -0.73;
      group.add(hexPad);

      // ── Glowing status ring (torus at block equator) ──────────────────────
      const ringMat = new THREE.MeshBasicMaterial({
        color: n.hasError ? ERROR : HEALTHY,
        transparent: true,
        opacity: n.hasError ? 0.72 : 0.3,
      });
      const statusRing = new THREE.Mesh(
        new THREE.TorusGeometry(1.32, 0.030, 8, 64),
        ringMat,
      );
      statusRing.rotation.x = Math.PI / 2;
      statusRing.position.y = 0.0;
      group.add(statusRing);

      // ── Error scanner ring (animated outer sweep) ─────────────────────────
      let pulseRing = null;
      if (n.hasError) {
        const prMat = new THREE.MeshBasicMaterial({
          color: ERROR,
          transparent: true,
          opacity: 0.5,
        });
        pulseRing = new THREE.Mesh(
          new THREE.TorusGeometry(1.64, 0.016, 6, 64),
          prMat,
        );
        pulseRing.rotation.x = Math.PI / 2;
        pulseRing.position.y = -0.69;
        group.add(pulseRing);
      }

      // ── Label texture plate ────────────────────────────────────────────────
      const plateTex = makeLabelTexture(n.label, n.glyph, n.accent);
      const plateMat = new THREE.MeshStandardMaterial({
        map: plateTex,
        transparent: true,
        roughness: 0.22,
        metalness: 0.06,
      });
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), plateMat);
      plate.rotation.x = -Math.PI / 2;
      plate.position.y = 0.02;
      group.add(plate);

      // ── Architectural superstructure — unique per service type ────────────
      {
        const profileMat = new THREE.MeshStandardMaterial({
          color: n.tint,
          roughness: 0.28,
          metalness: 0.72,
          emissive: new THREE.Color(n.accent),
          emissiveIntensity: n.hasError ? 0.0 : 0.14,
        });
        const detailMat = new THREE.MeshStandardMaterial({
          color: n.accent,
          emissive: new THREE.Color(n.accent),
          emissiveIntensity: n.hasError ? 0.0 : 0.6,
          roughness: 0.10,
          metalness: 0.95,
        });
        const beaconColor = n.hasError ? ERROR : n.accent;
        const beaconMat = new THREE.MeshStandardMaterial({
          color: beaconColor,
          emissive: new THREE.Color(beaconColor),
          emissiveIntensity: n.hasError ? 1.4 : 0.85,
          roughness: 0.08,
          metalness: 0.4,
        });

        if (n.glyph === "server") {
          // ── CONTROL TOWER: tall shaft + lateral wing arms + tapered antenna + beacon
          const shaft = new THREE.Mesh(
            new THREE.BoxGeometry(0.82, 1.15, 0.82),
            profileMat.clone(),
          );
          shaft.position.y = 0.58;
          group.add(shaft);
          shaft.add(
            new THREE.LineSegments(
              new THREE.EdgesGeometry(shaft.geometry),
              new THREE.LineBasicMaterial({ color: n.accent, transparent: true, opacity: 0.45 }),
            ),
          );

          // Lateral wing arms (horizontal slabs extending from mid-shaft)
          [-1, 1].forEach((side) => {
            const wing = new THREE.Mesh(
              new THREE.BoxGeometry(0.85, 0.09, 0.55),
              profileMat.clone(),
            );
            wing.position.set(side * 1.15, 0.30, 0);
            group.add(wing);
            // Wing tip node (small glowing orb)
            const tip = new THREE.Mesh(
              new THREE.SphereGeometry(0.09, 8, 6),
              detailMat.clone(),
            );
            tip.position.set(side * 1.6, 0.30, 0);
            group.add(tip);
          });

          // Tapered antenna
          const antenna = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.065, 0.52, 7),
            detailMat.clone(),
          );
          antenna.position.y = 1.37;
          group.add(antenna);

          // Top beacon
          const beacon = new THREE.Mesh(
            new THREE.SphereGeometry(0.095, 10, 8),
            beaconMat,
          );
          beacon.position.y = 1.67;
          group.add(beacon);

        } else if (n.glyph === "database") {
          // ── DATA SILO: cylindrical body + horizontal banding rings + conical cap + rim
          const silo = new THREE.Mesh(
            new THREE.CylinderGeometry(0.80, 0.80, 0.92, 16),
            profileMat.clone(),
          );
          silo.position.y = 0.46;
          group.add(silo);

          // 4 horizontal banding rings
          for (let i = 0; i < 4; i++) {
            const band = new THREE.Mesh(
              new THREE.TorusGeometry(0.86, 0.056, 8, 32),
              detailMat.clone(),
            );
            band.rotation.x = Math.PI / 2;
            band.position.y = 0.09 + i * 0.23;
            group.add(band);
          }

          // Conical cap
          const cone = new THREE.Mesh(
            new THREE.ConeGeometry(0.80, 0.40, 16),
            profileMat.clone(),
          );
          cone.position.y = 1.12;
          group.add(cone);

          // Cap rim ring
          const capRim = new THREE.Mesh(
            new THREE.TorusGeometry(0.80, 0.075, 8, 32),
            detailMat.clone(),
          );
          capRim.rotation.x = Math.PI / 2;
          capRim.position.y = 0.92;
          group.add(capRim);

          // Top vent / beacon on cone tip
          const topVent = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 8, 6),
            beaconMat,
          );
          topVent.position.y = 1.33;
          group.add(topVent);

        } else {
          // ── PROCESSING HUB: stepped pyramid tiers + central core + side tank modules
          const step2 = new THREE.Mesh(
            new THREE.BoxGeometry(1.92, 0.26, 1.92),
            profileMat.clone(),
          );
          step2.position.y = 0.13;
          group.add(step2);

          const step3 = new THREE.Mesh(
            new THREE.BoxGeometry(1.18, 0.26, 1.18),
            profileMat.clone(),
          );
          step3.position.y = 0.39;
          group.add(step3);

          // Central cylindrical core
          const core = new THREE.Mesh(
            new THREE.CylinderGeometry(0.19, 0.28, 0.52, 8),
            detailMat.clone(),
          );
          core.position.y = 0.78;
          group.add(core);

          // Side exhaust tanks + horizontal cross-pipe
          const tankGeo = new THREE.CylinderGeometry(0.175, 0.175, 0.48, 8);
          [-1.08, 1.08].forEach((xOff, idx) => {
            const tank = new THREE.Mesh(tankGeo, profileMat.clone());
            tank.position.set(xOff, 0.24, 0);
            group.add(tank);

            const tankCap = new THREE.Mesh(
              new THREE.SphereGeometry(0.175, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5),
              detailMat.clone(),
            );
            tankCap.position.set(xOff, 0.48, 0);
            group.add(tankCap);

            // Only add the connecting cross-pipe once
            if (idx === 0) {
              const crossPipe = new THREE.Mesh(
                new THREE.CylinderGeometry(0.055, 0.055, 2.16, 7),
                profileMat.clone(),
              );
              crossPipe.rotation.z = Math.PI / 2;
              crossPipe.position.set(0, 0.24, 0);
              group.add(crossPipe);
            }
          });

          // Beacon on core top
          const coreBeacon = new THREE.Mesh(
            new THREE.SphereGeometry(0.088, 8, 6),
            beaconMat,
          );
          coreBeacon.position.y = 1.06;
          group.add(coreBeacon);
        }
      }

      // ── files (chips) laid out on 3 clear tiers, real ids for the edge graph
      const filePos = new Map(); // fileId -> Vector3 (exploded, local space)
      const fileMeta = new Map(); // fileId -> file def
      const chipMeshes = [];
      n.tiers.forEach((tier, ti) => {
        const count = tier.files.length;
        tier.files.forEach((f, fi) => {
          const angle = (fi / count) * Math.PI * 2 + ti * 0.6 + n.x * 0.02;
          const r = TIER_RADIUS[ti] + Math.max(0, count - 1) * 0.12;
          const px = Math.cos(angle) * r;
          const pz = Math.sin(angle) * r;
          const py =
            TIER_Y[ti] + (seeded(f.id.charCodeAt(0) * 7 + fi) - 0.5) * 0.08;
          const pos = new THREE.Vector3(px, py, pz);
          filePos.set(f.id, pos);
          fileMeta.set(f.id, { ...f, tierName: tier.name });

          const isErr = f.isErr || f.status === "impacted";
          const isDownstream = f.status === "affected-downstream";
          const isContext = f.status === "context";

          const chipColor = isErr
            ? ERROR
            : isDownstream
              ? DOWNSTREAM
              : isContext
                ? CONTEXT
                : 0x54608a;
          const hasEmissive = isErr || isDownstream;

          const size = isErr ? 0.28 : isDownstream ? 0.27 : 0.24;
          // Premium clearcoat material for all chips
          const mat = new THREE.MeshPhysicalMaterial({
            color: chipColor,
            emissive: hasEmissive
              ? new THREE.Color(chipColor)
              : new THREE.Color(0x000000),
            emissiveIntensity: isErr ? 0.95 : isDownstream ? 0.68 : 0,
            roughness: 0.18,
            metalness: 0.62,
            clearcoat: 0.85,
            clearcoatRoughness: 0.08,
          });
          // Error files → crystalline octahedron; healthy → hexagonal prism
          const chipGeo = isErr
            ? new THREE.OctahedronGeometry(size * 0.7, 0)
            : new THREE.CylinderGeometry(size * 0.56, size * 0.56, size * 0.54, 6);
          const mesh = new THREE.Mesh(chipGeo, mat);
          const chipEdge = new THREE.LineSegments(
            new THREE.EdgesGeometry(chipGeo),
            new THREE.LineBasicMaterial({
              color: isErr ? 0xff5566 : isDownstream ? 0xffaa44 : 0x5577cc,
              transparent: true,
              opacity: 0.65,
            }),
          );
          mesh.add(chipEdge);
          mesh.userData = {
            fileId: f.id,
            isErr: !!isErr,
            nodeId: n.id,
            exploded: pos,
          };
          mesh.scale.setScalar(0.001);
          group.add(mesh);
          chipMeshes.push(mesh);
          fileMeshMap.set(f.id, { mesh, node: n });
        });
      });

      // ── wires following the real dependency graph
      const wireMeshes = [];
      let forwardErrorWire = null;
      n.edges.forEach(([fromId, toId], edgeIndex) => {
        const a = fileMeta.get(fromId),
          b = fileMeta.get(toId);
        const pa = filePos.get(fromId),
          pb = filePos.get(toId);
        const forward = a?.isErr;

        const isImpactedWire =
          a?.status === "impacted" || b?.status === "impacted";
        const isDownstreamWire =
          !isImpactedWire &&
          (a?.status === "affected-downstream" ||
            b?.status === "affected-downstream");
        const wireColor = isImpactedWire
          ? ERROR
          : isDownstreamWire
            ? DOWNSTREAM
            : HEALTHY;

        const lift =
          0.32 +
          seeded((fromId + toId).length * 17 + fromId.charCodeAt(0)) * 0.3;
        const lane = (edgeIndex % 5) - 2;
        const laneOffset = new THREE.Vector3(-(pb.z - pa.z), 0, pa.x - pb.x)
          .normalize()
          .multiplyScalar(lane * 0.12);
        const curve = new THREE.CatmullRomCurve3([
          pa.clone(),
          pa
            .clone()
            .lerp(pb, 0.5)
            .add(laneOffset)
            .add(new THREE.Vector3(0, lift, 0)),
          pb.clone(),
        ]);
        const geo = new THREE.TubeGeometry(
          curve,
          20,
          isImpactedWire || isDownstreamWire ? 0.021 : 0.013,
          6,
          false,
        );
        const mat = new THREE.MeshBasicMaterial({
          color: wireColor,
          transparent: true,
          opacity: 0,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData = {
          involvesErr: isImpactedWire || isDownstreamWire,
          kind: "wire",
        };
        group.add(mesh);
        wireMeshes.push(mesh);
        if (forward) forwardErrorWire = { curve, mesh, fromId, toId };
      });

      // ── spokes: top-tier files rise to the identity plate
      const topTier = n.tiers[n.tiers.length - 1];
      const spokeMeshes = [];
      topTier.files.forEach((f) => {
        const pos = filePos.get(f.id);
        const plateAnchor = pos.clone().multiplyScalar(0.5);
        plateAnchor.y = TIER_Y[2] + 0.55;
        const curve = new THREE.CatmullRomCurve3([
          pos.clone(),
          pos.clone().add(new THREE.Vector3(0, 0.6, 0)),
          plateAnchor,
        ]);
        const geo = new THREE.TubeGeometry(curve, 12, 0.014, 6, false);
        const mat = new THREE.MeshBasicMaterial({
          color: HEALTHY,
          transparent: true,
          opacity: 0,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData = { involvesErr: false, kind: "wire" };
        group.add(mesh);
        spokeMeshes.push(mesh);
      });

      // invisible generous hit-box for click detection
      const hit = new THREE.Mesh(
        new THREE.BoxGeometry(2.8, 3.6, 2.8),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      hit.position.y = 0.6;
      hit.userData = { kind: "node-hit", nodeId: n.id };
      group.add(hit);

      nodeRig.push({
        id: n.id,
        group,
        baseBox,
        edgeLines,
        midSlab,
        baseSlab,
        plate,
        plateTex,
        chipMeshes,
        wireMeshes,
        spokeMeshes,
        hit,
        statusRing,
        hexPad,
        pulseRing,
        topCap,
        hasError: n.hasError,
        forwardErrorWire,
        explodeAmount: 0,
      });
    });

    /* ── Mechanical pipeline connections between services ────── */
    const linkMeshes = [];
    const graphEdges = sceneNodes[0]?.crossEdges || [];

    // Deduplicate and resolve clean inter-block service links
    const serviceLinks = [];
    const seenPairs = new Set();

    if (graphEdges.length > 0) {
      graphEdges.forEach((edge) => {
        const fromInfo = fileMeshMap.get(edge.source);
        const toInfo = fileMeshMap.get(edge.target);
        const fromNode = fromInfo?.node;
        const toNode = toInfo?.node;
        // Strictly skip intra-block connections — those belong inside the block
        if (!fromNode || !toNode || fromNode.id === toNode.id) return;

        const pairKey = `${fromNode.id}->${toNode.id}`;
        const sourceFile = fileMetaLookup(sceneNodes, edge.source);
        const targetFile = fileMetaLookup(sceneNodes, edge.target);
        const isErr =
          sourceFile?.status === "impacted" ||
          targetFile?.status === "impacted" ||
          sourceFile?.status === "affected-downstream" ||
          targetFile?.status === "affected-downstream" ||
          fromNode.hasError ||
          toNode.hasError;

        if (seenPairs.has(pairKey)) {
          const existing = serviceLinks.find((l) => l.key === pairKey);
          if (existing && isErr) existing.isErrLink = true;
          return;
        }
        seenPairs.add(pairKey);
        serviceLinks.push({
          key: pairKey,
          from: fromNode,
          to: toNode,
          sourceId: edge.source,
          targetId: edge.target,
          isErrLink: isErr,
        });
      });
    } else if (demoMode && sceneNodes.length > 1) {
      for (let i = 0; i < sceneNodes.length - 1; i++) {
        const fromNode = sceneNodes[i];
        const toNode = sceneNodes[i + 1];
        const isErr = fromNode.hasError || toNode.hasError;
        serviceLinks.push({
          key: `${fromNode.id}->${toNode.id}`,
          from: fromNode,
          to: toNode,
          sourceId: null,
          targetId: null,
          isErrLink: isErr,
        });
      }
    }

    for (const [linkIndex, link] of serviceLinks.entries()) {
      const from = link.from;
      const to = link.to;
      const isErrLink = link.isErrLink;

      // ── Physical Docking Manifold Ports on block perimeters ────────────────
      const dx = to.x - from.x;
      const dz = (to.z || 0) - (from.z || 0);
      const lenXZ = Math.hypot(dx, dz) || 1;
      const nx = dx / lenXZ;
      const nz = dz / lenXZ;

      // Ports anchored on top perimeter of source and target blocks
      const fromPort = new THREE.Vector3(
        from.x + nx * 1.30,
        (from.y || 0) + 0.38,
        (from.z || 0) + nz * 1.30,
      );
      const toPort = new THREE.Vector3(
        to.x - nx * 1.30,
        (to.y || 0) + 0.38,
        (to.z || 0) - nz * 1.30,
      );

      // ── Industrial Overhead Gantry Height (clears all towers) ──────────────
      const GANTRY_Y =
        Math.max(from.y || 0, to.y || 0) + 2.85 + (linkIndex % 3) * 0.32;

      // ── Orthogonal Industrial Waypoints ────────────────────────────────────
      const W0 = fromPort.clone();
      const W1 = new THREE.Vector3(fromPort.x, GANTRY_Y, fromPort.z);

      let W2, W3, W4;
      if (Math.abs(fromPort.z - toPort.z) > 0.3) {
        // Blocks have distinct Z coordinates — mid-span Z transition
        const midX = (fromPort.x + toPort.x) * 0.5;
        W2 = new THREE.Vector3(midX, GANTRY_Y, fromPort.z);
        W3 = new THREE.Vector3(midX, GANTRY_Y, toPort.z);
        W4 = new THREE.Vector3(toPort.x, GANTRY_Y, toPort.z);
      } else {
        // Blocks are linearly aligned — route via a dedicated offset service rack
        const rackOffset = (linkIndex % 2 === 0 ? 1 : -1) * 0.95;
        const rackZ = fromPort.z + rackOffset;
        W2 = new THREE.Vector3(fromPort.x, GANTRY_Y, rackZ);
        W3 = new THREE.Vector3(toPort.x, GANTRY_Y, rackZ);
        W4 = new THREE.Vector3(toPort.x, GANTRY_Y, toPort.z);
      }
      const W5 = toPort.clone();

      const waypoints = [W0, W1, W2, W3, W4, W5];
      const pulseCurve = new THREE.CatmullRomCurve3(
        waypoints,
        false,
        "catmullrom",
        0.15,
      );

      // ── Materials: Heavy brushed metal, glowing status trims ───────────────
      const pipeBodyColor  = isErrLink ? 0x1f050b : 0x0a1420;
      const pipeLightColor = isErrLink ? ERROR     : HEALTHY;
      const pipeMat = new THREE.MeshStandardMaterial({
        color: pipeBodyColor,
        roughness: 0.26,
        metalness: 0.90,
        emissive: new THREE.Color(pipeLightColor),
        emissiveIntensity: isErrLink ? 0.48 : 0.16,
      });
      const flangeMat = new THREE.MeshStandardMaterial({
        color: isErrLink ? 0x3a0914 : 0x16263e,
        roughness: 0.20,
        metalness: 0.95,
        emissive: new THREE.Color(pipeLightColor),
        emissiveIntensity: isErrLink ? 0.40 : 0.14,
      });
      const elbowMat = flangeMat.clone();
      elbowMat.emissiveIntensity = isErrLink ? 0.60 : 0.24;
      const pylonMat = new THREE.MeshStandardMaterial({
        color: 0x0e1422,
        roughness: 0.75,
        metalness: 0.55,
      });

      const PIPE_R   = 0.072;
      const FLANGE_R = 0.136;
      const ELBOW_R  = 0.115;

      const pipeMeshes = [];
      const pipeMats   = [pipeMat, flangeMat, elbowMat];

      // Helper: Docking collar at terminal port
      function addDockingManifold(pt) {
        const collar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.14, 0.18, 0.20, 12),
          flangeMat,
        );
        collar.position.copy(pt);
        collar.userData = { kind: "link", isErrLink, nodeA: from.id, nodeB: to.id };
        scene.add(collar);
        pipeMeshes.push(collar);

        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.165, 0.022, 8, 24),
          new THREE.MeshBasicMaterial({
            color: pipeLightColor,
            transparent: true,
            opacity: 0.85,
          }),
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.set(pt.x, pt.y + 0.10, pt.z);
        scene.add(ring);
        pipeMeshes.push(ring);
      }
      addDockingManifold(fromPort);
      addDockingManifold(toPort);

      // Helper: Straight cylindrical pipe segment with modular flange joints
      function addPipeSegment(a, b) {
        const dir = b.clone().sub(a);
        const len = dir.length();
        if (len < 0.05) return;
        const mid = a.clone().lerp(b, 0.5);
        const seg = new THREE.Mesh(
          new THREE.CylinderGeometry(PIPE_R, PIPE_R, len, 12),
          pipeMat,
        );
        seg.position.copy(mid);
        seg.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          dir.clone().normalize(),
        );
        seg.userData = {
          kind: "link",
          isErrLink,
          nodeA: from.id,
          nodeB: to.id,
        };
        scene.add(seg);
        pipeMeshes.push(seg);

        // Flange ring joints along segment
        const numFlanges = Math.floor(len / 1.7);
        if (numFlanges > 0) {
          for (let f = 1; f <= numFlanges; f++) {
            const frac = f / (numFlanges + 1);
            const fpos = a.clone().lerp(b, frac);
            const fl = new THREE.Mesh(
              new THREE.CylinderGeometry(FLANGE_R, FLANGE_R, 0.075, 12),
              flangeMat,
            );
            fl.position.copy(fpos);
            fl.quaternion.copy(seg.quaternion);
            scene.add(fl);
            pipeMeshes.push(fl);

            const flRing = new THREE.Mesh(
              new THREE.TorusGeometry(FLANGE_R + 0.015, 0.016, 6, 16),
              flangeMat,
            );
            flRing.position.copy(fpos);
            flRing.quaternion.copy(seg.quaternion);
            flRing.rotateX(Math.PI / 2);
            scene.add(flRing);
            pipeMeshes.push(flRing);
          }
        }
      }

      // Helper: Spherical elbow fitting at 90° pipe bends
      function addElbow(pt) {
        const el = new THREE.Mesh(
          new THREE.SphereGeometry(ELBOW_R, 14, 12),
          elbowMat,
        );
        el.position.copy(pt);
        el.userData = { kind: "link", isErrLink, nodeA: from.id, nodeB: to.id };
        scene.add(el);
        pipeMeshes.push(el);

        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(ELBOW_R + 0.016, 0.018, 6, 20),
          flangeMat,
        );
        ring.position.copy(pt);
        scene.add(ring);
        pipeMeshes.push(ring);
      }

      // Build the 5 orthogonal segments connecting waypoints
      addPipeSegment(W0, W1); // vertical rise out of Block A
      addElbow(W1);
      addPipeSegment(W1, W2); // first horizontal run
      addElbow(W2);
      addPipeSegment(W2, W3); // main overhead bridge run
      addElbow(W3);
      addPipeSegment(W3, W4); // alignment return
      addElbow(W4);
      addPipeSegment(W4, W5); // vertical drop into Block B

      // ── Structural Support Pylons on the long overhead span ────────────────
      const spanLen = W2.distanceTo(W3);
      if (spanLen > 3.8) {
        const numPylons = Math.min(2, Math.floor(spanLen / 3.8));
        for (let p = 1; p <= numPylons; p++) {
          const frac = p / (numPylons + 1);
          const pylonTop = W2.clone().lerp(W3, frac);
          const pylonHeight = pylonTop.y - (-1.55);
          const pylon = new THREE.Mesh(
            new THREE.CylinderGeometry(0.042, 0.065, pylonHeight, 8),
            pylonMat,
          );
          pylon.position.set(pylonTop.x, pylonTop.y - pylonHeight * 0.5, pylonTop.z);
          scene.add(pylon);
          pipeMeshes.push(pylon);

          const bracket = new THREE.Mesh(
            new THREE.BoxGeometry(0.24, 0.08, 0.24),
            flangeMat,
          );
          bracket.position.copy(pylonTop);
          scene.add(bracket);
          pipeMeshes.push(bracket);
        }
      }

      // ── Error Alert Collar on broken pipelines ─────────────────────────────
      if (isErrLink) {
        const midPoint = W2.clone().lerp(W3, 0.5);
        const alertCollar = new THREE.Mesh(
          new THREE.CylinderGeometry(FLANGE_R * 1.5, FLANGE_R * 1.5, 0.22, 6),
          new THREE.MeshStandardMaterial({
            color: 0x4a0a14,
            emissive: new THREE.Color(ERROR),
            emissiveIntensity: 0.95,
            roughness: 0.15,
            metalness: 0.85,
          }),
        );
        alertCollar.position.copy(midPoint);
        scene.add(alertCollar);
        pipeMeshes.push(alertCollar);
      }

      // ── Glowing Plasma Energy Pulses through pipe interior ─────────────────
      const pulseGeo = new THREE.SphereGeometry(0.058, 12, 8);
      const pulses = [0, 0.33, 0.66].map((phase) => {
        const pm = new THREE.MeshBasicMaterial({
          color: pipeLightColor,
          transparent: true,
          opacity: 0.92,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const pmesh = new THREE.Mesh(pulseGeo, pm);
        scene.add(pmesh);
        return { mesh: pmesh, phase };
      });

      const mesh = pipeMeshes[0];
      const mat  = pipeMat;
      linkMeshes.push({
        mesh,
        mat,
        pipeMeshes,
        pipeMats,
        curve: pulseCurve,
        isErrLink,
        pulses,
      });
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
        el.textContent = fileNameOf(sceneNodes, m.userData.fileId);
        overlay.appendChild(el);
        chipLabels.push({
          el,
          mesh: m,
          owner: nodeRig.find((r) => r.chipMeshes.includes(m)),
        });
      });
    });

    const hoverPanel = document.createElement("div");
    hoverPanel.className = "pl3d-hover-panel";
    hoverPanel.style.opacity = "0";
    overlay.appendChild(hoverPanel);
    const hoverState = { mesh: null, owner: null };
    const clearHover = () => {
      hoverState.mesh = null;
      hoverState.owner = null;
      hoverPanel.style.opacity = "0";
    };
    const showHover = (mesh) => {
      const meta = fileMetaLookup(sceneNodes, mesh.userData.fileId);
      if (!meta) return clearHover();
      hoverState.mesh = mesh;
      hoverState.owner = nodeRig.find((r) => r.id === mesh.userData.nodeId);
      hoverPanel.replaceChildren();

      const heading = document.createElement("div");
      heading.className = "pl3d-hover-panel__heading";
      heading.textContent = meta.path || meta.name;
      hoverPanel.appendChild(heading);

      const status = document.createElement("div");
      status.className = `pl3d-hover-panel__status ${meta.isErr ? "is-broken" : ""}`;
      status.textContent = meta.isErr ? "BROKEN FILE" : "healthy file";
      hoverPanel.appendChild(status);

      if (meta.code?.length) {
        const code = document.createElement("div");
        code.className = "pl3d-hover-panel__code";
        meta.code.forEach((line, index) => {
          const lineEl = document.createElement("div");
          lineEl.className = index === meta.lineIdx ? "is-error-line" : "";
          lineEl.textContent = line || " ";
          code.appendChild(lineEl);
        });
        hoverPanel.appendChild(code);
      }

      if (meta.brokenNote) {
        const note = document.createElement("div");
        note.className = "pl3d-hover-panel__note";
        note.textContent = meta.brokenNote;
        hoverPanel.appendChild(note);
      }
      hoverPanel.style.opacity = "1";
    };

    const xMarks = [];
    nodeRig.forEach((r) => {
      if (r.forwardErrorWire) {
        const el = document.createElement("div");
        el.className = "pl3d-xmark";
        el.textContent = "✕";
        overlay.appendChild(el);
        xMarks.push({
          el,
          group: r.group,
          curve: r.forwardErrorWire.curve,
          scoped: r,
        });
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
    const DEFAULT_VIEW = {
      theta: 0.55,
      phi: 1.05,
      radius:
        sceneNodes.length > 1 ? Math.max(16, sceneNodes.length * 5.5) : 10,
      lookAt: new THREE.Vector3(0, -0.2, 0),
    };
    const MIN_RADIUS = 0.8,
      MAX_RADIUS = 80;
    const orbit = {
      theta: DEFAULT_VIEW.theta,
      phi: DEFAULT_VIEW.phi,
      radius: DEFAULT_VIEW.radius,
      targetTheta: DEFAULT_VIEW.theta,
      targetPhi: DEFAULT_VIEW.phi,
      targetRadius: DEFAULT_VIEW.radius,
      lookAt: DEFAULT_VIEW.lookAt.clone(),
      targetLookAt: DEFAULT_VIEW.lookAt.clone(),
      dragging: false,
      panning: false,
      lastX: 0,
      lastY: 0,
    };
    const PHI_MIN = 0.06,
      PHI_MAX = Math.PI - 0.06;
    const framedKeyRef = { current: null };

    const dom = renderer.domElement;
    dom.style.touchAction = "none";
    let dragDistance = 0;
    const panRight = new THREE.Vector3(),
      panUp = new THREE.Vector3();
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const onContextMenu = (e) => e.preventDefault();
    const onDown = (e) => {
      clearHover();
      orbit.dragging = true;
      orbit.panning = e.button === 2 || e.shiftKey;
      orbit.lastX = e.clientX;
      orbit.lastY = e.clientY;
      dragDistance = 0;
      dom.setPointerCapture(e.pointerId);
    };
    const onMove = (e) => {
      if (!orbit.dragging) {
        const rect = dom.getBoundingClientRect();
        ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(ndc, camera);
        const hovered = raycaster.intersectObjects(
          nodeRig.flatMap((r) => r.chipMeshes.filter((mesh) => mesh.visible)),
          false,
        )[0];
        if (hovered) showHover(hovered.object);
        else clearHover();
        return;
      }
      const dx = e.clientX - orbit.lastX,
        dy = e.clientY - orbit.lastY;
      orbit.lastX = e.clientX;
      orbit.lastY = e.clientY;
      dragDistance += Math.abs(dx) + Math.abs(dy);
      if (orbit.panning) {
        // direct 1:1 panning — moves the focus point anywhere, "open world" style
        panRight.setFromMatrixColumn(camera.matrixWorld, 0);
        panUp.setFromMatrixColumn(camera.matrixWorld, 1);
        const panScale = orbit.radius * 0.0024;
        const delta = panRight
          .multiplyScalar(-dx * panScale)
          .add(panUp.multiplyScalar(dy * panScale));
        orbit.lookAt.add(delta);
        orbit.targetLookAt.add(delta);
      } else {
        orbit.targetTheta -= dx * 0.006;
        orbit.targetPhi = Math.max(
          PHI_MIN,
          Math.min(PHI_MAX, orbit.targetPhi - dy * 0.006),
        );
      }
    };
    const onUp = () => {
      orbit.dragging = false;
      orbit.panning = false;
    };
    const onWheel = (e) => {
      e.preventDefault();
      // multiplicative zoom: fast when far away, fine-grained when already close
      const factor = Math.exp(e.deltaY * 0.0016);
      orbit.targetRadius = Math.max(
        MIN_RADIUS,
        Math.min(MAX_RADIUS, orbit.targetRadius * factor),
      );
    };
    const onDblClick = (e) => {
      const rect = dom.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const targets = [
        ...nodeRig.map((r) => r.hit),
        ...nodeRig.flatMap((r) => (r.explodeAmount > 0.3 ? r.chipMeshes : [])),
        floor,
      ];
      const hits = raycaster.intersectObjects(targets, false);
      if (!hits.length) return;
      orbit.targetLookAt.copy(hits[0].point);
      orbit.targetRadius = Math.max(
        MIN_RADIUS,
        Math.min(orbit.targetRadius, orbit.targetRadius * 0.55),
      );
      // mark the *current* selection state as already framed so next frame's
      // one-shot check doesn't immediately overwrite this manual focus
      framedKeyRef.current = microRef.current
        ? `micro:${microRef.current.id}`
        : activeRef.current
          ? `node:${activeRef.current}`
          : "overview";
    };

    const activePointers = new Map();
    const getPinchDist = () => {
      const pts = [...activePointers.values()];
      if (pts.length < 2) return null;
      const dx = pts[0].x - pts[1].x,
        dy = pts[0].y - pts[1].y;
      return Math.sqrt(dx * dx + dy * dy);
    };
    let lastPinchDist = null;
    const onPinchDown = (e) => {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointers.size === 2) lastPinchDist = getPinchDist();
    };
    const onPinchMove = (e) => {
      if (!activePointers.has(e.pointerId)) return;
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointers.size === 2 && lastPinchDist !== null) {
        const dist = getPinchDist();
        orbit.targetRadius = Math.max(
          MIN_RADIUS,
          Math.min(
            MAX_RADIUS,
            orbit.targetRadius + (lastPinchDist - dist) * 0.04,
          ),
        );
        lastPinchDist = dist;
      }
    };
    const onPinchUp = (e) => {
      activePointers.delete(e.pointerId);
      lastPinchDist = activePointers.size === 2 ? getPinchDist() : null;
    };

    const onClick = (e) => {
      if (dragDistance > 6) return;
      const rect = dom.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);

      const activeRig = nodeRig.find((r) => r.id === activeRef.current);
      if (activeRig) {
        const chipHits = raycaster.intersectObjects(
          activeRig.chipMeshes,
          false,
        );
        if (chipHits.length) {
          const hit = chipHits[0].object;
          if (hit.userData.fileId) {
            const meta = fileMetaLookup(sceneNodes, hit.userData.fileId);
            setMicroFile({ ...meta, nodeId: hit.userData.nodeId });
          }
          return;
        }
      }
      const hits = raycaster.intersectObjects(
        nodeRig.map((r) => r.hit),
        false,
      );
      if (hits.length) {
        const id = hits[0].object.userData.nodeId;
        setActiveId((cur) => (cur === id ? null : id));
        setMicroFile(null);
        setHintVisible(false);
        return;
      }
      const linkHits = raycaster.intersectObjects(
        linkMeshes.flatMap((l) => l.pipeMeshes || [l.mesh]),
        false,
      );
      if (linkHits.length) {
        const ud = linkHits[0].object.userData;
        if (ud && (ud.nodeA || ud.nodeB)) {
          if (ud.isErrLink) setActiveId(ud.nodeB);
          else setActiveId((cur) => (cur ? cur : ud.nodeA));
          setHintVisible(false);
        }
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
    dom.addEventListener("pointerleave", clearHover);

    // imperative camera controls surfaced to the React toolbar (zoom buttons, reset)
    orbitApiRef.current = {
      zoomIn: () => {
        orbit.targetRadius = Math.max(MIN_RADIUS, orbit.targetRadius * 0.7);
      },
      zoomOut: () => {
        orbit.targetRadius = Math.min(MAX_RADIUS, orbit.targetRadius * 1.35);
      },
      resetView: () => {
        orbit.targetTheta = DEFAULT_VIEW.theta;
        orbit.targetPhi = DEFAULT_VIEW.phi;
        orbit.targetRadius = DEFAULT_VIEW.radius;
        orbit.targetLookAt.copy(DEFAULT_VIEW.lookAt);
        framedKeyRef.current = "overview";
      },
    };

    const onResize = () => {
      width = mount.clientWidth;
      height = mount.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    /* ── animation loop ─────────────────────────────────────── */
    let raf;
    const timer = new Timer();
    const tmpColor = new THREE.Color();
    const worldVec = new THREE.Vector3();
    const screenVec = new THREE.Vector3();

    function project(vec3) {
      screenVec.copy(vec3).project(camera);
      return {
        x: (screenVec.x * 0.5 + 0.5) * width,
        y: (-screenVec.y * 0.5 + 0.5) * height,
        behind: screenVec.z > 1,
      };
    }

    function animate() {
      raf = requestAnimationFrame(animate);
      timer.update();
      const t = timer.getElapsed();

      // one-shot framing when selection changes (never fights manual orbit/zoom)
      const micro = microRef.current;
      const framedKey = micro
        ? `micro:${micro.id}`
        : activeRef.current
          ? `node:${activeRef.current}`
          : "overview";
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
          if (rig) {
            orbit.targetLookAt.set(
              rig.group.position.x,
              rig.group.position.y + 0.5,
              rig.group.position.z,
            );
            orbit.targetRadius = 7.5;
          } else {
            activeRef.current = null;
            setActiveId(null);
            orbit.targetLookAt.set(0, -0.2, 0);
            orbit.targetRadius = 12;
          }
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

        // ── Animate premium structural elements ─────────────────────────────
        if (r.statusRing) {
          r.statusRing.material.color.set(
            errActive ? ERROR : r.hasError ? FIXED : HEALTHY,
          );
          r.statusRing.material.opacity = errActive
            ? 0.48 + Math.sin(t * 3.4) * 0.32
            : r.hasError
              ? 0.72
              : 0.22 + Math.sin(t * 1.7) * 0.1;
        }
        if (r.pulseRing) {
          const pScale = errActive ? 1.0 + Math.sin(t * 2.6) * 0.055 : 0.94;
          r.pulseRing.scale.setScalar(pScale);
          r.pulseRing.material.opacity = errActive
            ? 0.22 + Math.sin(t * 2.6 + 1.1) * 0.2
            : 0;
        }
        if (r.topCap) {
          r.topCap.material.emissiveIntensity = errActive
            ? 0.0
            : r.hasError
              ? 0.55
              : 0.28 + Math.sin(t * 1.5) * 0.12;
        }
        if (r.hexPad) {
          r.hexPad.material.emissiveIntensity = errActive
            ? 0.1 + Math.sin(t * 3.8) * 0.09
            : r.hasError
              ? 0.22
              : 0.05 + Math.sin(t * 1.6) * 0.025;
        }

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
            m.material.emissiveIntensity =
              0.7 + Math.sin(t * 4) * (resolvedRef.current ? 0.1 : 0.3);
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
        const errActive = l.isErrLink && !resolvedRef.current;
        tmpColor.set(errActive ? ERROR : HEALTHY);
        // Drive emissive on all pipe materials for smooth status transitions
        if (l.pipeMats) {
          l.pipeMats.forEach((m) => {
            m.emissive.lerp(tmpColor, 0.08);
            m.emissiveIntensity += (( errActive ? 0.58 : 0.18) - m.emissiveIntensity) * 0.06;
          });
        } else {
          l.mat.color.lerp(tmpColor, 0.08);
        }
        l.pulses.forEach((p) => {
          const u = (t * 0.28 + p.phase) % 1;
          p.mesh.position.copy(l.curve.getPointAt(u));
          const pipeColor = errActive ? ERROR : HEALTHY;
          tmpColor.set(pipeColor);
          p.mesh.material.color.lerp(tmpColor, 0.1);
        });
      });

      // ── HTML overlay projection (imperative, no React re-render) ──
      chipLabels.forEach((c) => {
        const owner = c.owner;
        if (!owner) {
          c.el.style.opacity = "0";
          return;
        }
        const e = owner.explodeAmount;
        if (e < 0.05) {
          c.el.style.opacity = "0";
          return;
        }
        c.mesh.getWorldPosition(worldVec);
        const { x, y, behind } = project(worldVec);
        c.el.style.opacity = behind ? "0" : String(Math.min(1, e * 1.4));
        c.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -140%)`;
        c.el.classList.toggle(
          "pl3d-chip--err",
          c.mesh.userData.isErr && !resolvedRef.current,
        );
        c.el.classList.toggle(
          "pl3d-chip--fixed",
          c.mesh.userData.isErr && resolvedRef.current,
        );
      });

      if (hoverState.mesh && hoverState.owner && hoverState.mesh.visible) {
        hoverState.mesh.getWorldPosition(worldVec);
        const { x, y, behind } = project(worldVec);
        hoverPanel.style.opacity = behind ? "0" : "1";
        hoverPanel.style.transform = `translate(${x + 18}px, ${y - 12}px)`;
      } else {
        hoverPanel.style.opacity = "0";
      }

      xMarks.forEach((xm) => {
        const e = xm.scoped ? xm.scoped.explodeAmount : 1;
        const visible = !resolvedRef.current && e > 0.4;
        if (!visible) {
          xm.el.style.opacity = "0";
          return;
        }
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
      dom.removeEventListener("pointerleave", clearHover);
      orbitApiRef.current = null;
      overlay.innerHTML = "";
      nodeRig.forEach((r) => r.plateTex.dispose());
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material))
            obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      renderer.dispose();
      if (mount.contains(renderer.domElement))
        mount.removeChild(renderer.domElement);
    };
  }, [demoMode, repair, sceneNodes]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 560,
        background: "#05060a",
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      <div
        ref={mountRef}
        style={{
          width: "100%",
          height: "100%",
          minHeight: 560,
          cursor: activeId ? "default" : "grab",
        }}
      />
      <div ref={overlayRef} style={overlayLayerStyle} />

      <style>{CSS}</style>

      <div style={overlayTop}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#eceef5" }}>
            Pipeline Cross-Section
            {activeId && (
              <span
                style={{
                  color: NODE_ACCENT_CSS[activeId],
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 12.5,
                  marginLeft: 10,
                }}
              >
                · {NODE_LABEL[activeId]}
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "#9799ad",
              fontFamily: "ui-monospace, monospace",
              marginTop: 2,
            }}
          >
            drag to orbit · shift/right-drag to pan · scroll or double-click to
            zoom
          </div>
          {brokenFiles.length > 0 && !resolved && (
            <div style={errorSummaryStyle}>
              <span>
                {brokenFiles.length} broken file
                {brokenFiles.length === 1 ? "" : "s"}
              </span>
              <button onClick={inspectFirstError} style={inspectErrorStyle}>
                Inspect error
              </button>
            </div>
          )}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            pointerEvents: "auto",
          }}
        >
          <div style={layoutControlStyle} aria-label="Pipeline layout">
            {[
              ["line", "Line"],
              ["triangle", "Triangle"],
              ["square", "Square"],
              ["orbit", "Orbit"],
            ].map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => {
                  setLayoutMode(mode);
                  setActiveId(null);
                  setMicroFile(null);
                }}
                style={
                  layoutMode === mode
                    ? layoutButtonActiveStyle
                    : layoutButtonStyle
                }
                title={`Arrange pipeline as ${label.toLowerCase()}`}
              >
                {label}
              </button>
            ))}
          </div>
          {activeId && (
            <button onClick={goBack} style={btnStyle}>
              ← Back
            </button>
          )}
          {resolved && (
            <button onClick={reset} style={btnStyle}>
              Reintroduce break
            </button>
          )}
        </div>
      </div>

      <div style={cameraControlsStyle}>
        <button onClick={zoomIn} style={roundBtnStyle} title="Zoom in">
          +
        </button>
        <button onClick={zoomOut} style={roundBtnStyle} title="Zoom out">
          −
        </button>
        <button
          onClick={resetView}
          style={{
            ...roundBtnStyle,
            width: "auto",
            padding: "0 12px",
            fontSize: 11,
          }}
          title="Reset view"
        >
          ⟲ Reset
        </button>
      </div>

      {activeId === "queue" && !microFile && (
        <div style={overlayBottom}>
          {resolved ? (
            <span style={{ color: "#35e08a" }}>
              ✓ Schema patched — worker-service link restored
            </span>
          ) : (
            <span style={{ color: "#ff4d4f" }}>
              ⚠ Click the glowing red file to inspect the exact broken line
            </span>
          )}
        </div>
      )}

      {hintVisible && !activeId && (
        <div style={hintStyle}>3 codebases · click one to expand</div>
      )}

      {microFile && (
        <div style={microPanelStyle}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#eceef5" }}>
                {microFile.name}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: "#8b8b9d",
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                {microFile.tierName} · {microFile.path || microFile.nodeId}
              </div>
            </div>
            <button
              onClick={closeMicro}
              style={{ ...btnStyle, padding: "5px 9px" }}
            >
              ✕
            </button>
          </div>

          {(microFile.incoming?.length > 0 ||
            microFile.outgoing?.length > 0) && (
            <div style={relationshipStyle}>
              <div>
                <span style={relationshipLabelStyle}>IN</span>
                {microFile.incoming?.length ? (
                  microFile.incoming.map((file) => (
                    <span
                      key={file.id}
                      style={
                        file.broken
                          ? relationshipBrokenStyle
                          : relationshipFileStyle
                      }
                    >
                      {shortFileName(file.id)}
                    </span>
                  ))
                ) : (
                  <span style={relationshipEmptyStyle}>none</span>
                )}
              </div>
              <div>
                <span style={relationshipLabelStyle}>OUT</span>
                {microFile.outgoing?.length ? (
                  microFile.outgoing.map((file) => (
                    <span
                      key={file.id}
                      style={
                        file.broken
                          ? relationshipBrokenStyle
                          : relationshipFileStyle
                      }
                    >
                      {shortFileName(file.id)}
                    </span>
                  ))
                ) : (
                  <span style={relationshipEmptyStyle}>none</span>
                )}
              </div>
            </div>
          )}

          <div style={codeBlockStyle}>
            {microFile.code.map((line, i) => {
              const isTarget = i === microFile.lineIdx;
              return (
                <div
                  key={i}
                  style={{
                    ...codeLineStyle,
                    background: isTarget
                      ? resolved
                        ? "rgba(53,224,138,0.14)"
                        : "rgba(255,77,79,0.14)"
                      : "transparent",
                    color: isTarget
                      ? resolved
                        ? "#35e08a"
                        : "#ff6b6d"
                      : "#aab0c8",
                  }}
                >
                  {isTarget
                    ? resolved
                      ? microFile.fixed
                      : microFile.broken
                    : line}
                </div>
              );
            })}
          </div>

          {microFile.isErr && (
            <>
              <div
                style={{
                  fontSize: 11,
                  marginTop: 8,
                  color: resolved ? "#35e08a" : "#ff8788",
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                {resolved
                  ? `✓ ${microFile.fixedNote}`
                  : `✕ ${microFile.brokenNote}`}
              </div>

              {!resolved && (
                <button onClick={repair} style={patchBtnStyle}>
                  Apply patch →
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* helpers that read from dynamic nodes without needing extra state plumbing */
function fileNameOf(nodes, fileId) {
  for (const n of nodes)
    for (const tier of n.tiers)
      for (const f of tier.files) if (f.id === fileId) return f.name;
  return fileId;
}
function fileMetaLookup(nodes, fileId) {
  for (const n of nodes)
    for (const tier of n.tiers)
      for (const f of tier.files)
        if (f.id === fileId) return { ...f, tierName: tier.name };
  return null;
}
function shortFileName(fileId) {
  const parts = String(fileId || "")
    .split(/[\\/]/)
    .filter(Boolean);
  return parts.length > 1
    ? `${parts[0]}/${parts[parts.length - 1]}`
    : parts[0] || "unknown";
}

/* ── styles ── */
const overlayTop = {
  position: "absolute",
  top: 16,
  left: 16,
  right: 16,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
  pointerEvents: "none",
  fontFamily: "'Inter', -apple-system, sans-serif",
};
const errorSummaryStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginTop: 8,
  color: "#ff8788",
  font: "700 10px ui-monospace, monospace",
  textTransform: "uppercase",
};
const inspectErrorStyle = {
  border: "1px solid #7a2e30",
  borderRadius: 5,
  padding: "4px 7px",
  color: "#ffd1d1",
  background: "rgba(122,46,48,0.28)",
  font: "700 9px ui-monospace, monospace",
  cursor: "pointer",
};
const layoutControlStyle = {
  display: "flex",
  gap: 3,
  padding: 3,
  background: "rgba(8,10,17,0.86)",
  border: "1px solid #2e3346",
  borderRadius: 8,
};
const layoutButtonStyle = {
  border: "1px solid transparent",
  borderRadius: 5,
  padding: "5px 7px",
  color: "#8b93ad",
  background: "transparent",
  font: "700 9px ui-monospace, monospace",
  cursor: "pointer",
};
const layoutButtonActiveStyle = {
  ...layoutButtonStyle,
  color: "#e2e8f0",
  background: "#25314b",
  borderColor: "#4b628b",
};
const overlayBottom = {
  position: "absolute",
  bottom: 18,
  left: 0,
  right: 0,
  textAlign: "center",
  fontSize: 12.5,
  fontFamily: "ui-monospace, monospace",
  pointerEvents: "none",
};
const hintStyle = {
  position: "absolute",
  bottom: 18,
  left: 0,
  right: 0,
  textAlign: "center",
  fontSize: 11.5,
  color: "#6a6c82",
  fontFamily: "ui-monospace, monospace",
  pointerEvents: "none",
};
const btnStyle = {
  pointerEvents: "auto",
  background: "rgba(255,255,255,0.07)",
  border: "1px solid #2e3346",
  color: "#dcdce6",
  fontSize: 11.5,
  padding: "7px 12px",
  borderRadius: 7,
  cursor: "pointer",
  fontFamily: "'Inter', -apple-system, sans-serif",
};
const overlayLayerStyle = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  overflow: "hidden",
};
const cameraControlsStyle = {
  position: "absolute",
  right: 16,
  top: 66,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  pointerEvents: "auto",
  fontFamily: "'Inter', -apple-system, sans-serif",
};
const roundBtnStyle = {
  width: 34,
  height: 34,
  borderRadius: 9,
  background: "rgba(255,255,255,0.07)",
  border: "1px solid #2e3346",
  color: "#dcdce6",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const microPanelStyle = {
  position: "absolute",
  right: 16,
  bottom: 16,
  width: 320,
  background: "rgba(10,11,18,0.94)",
  border: "1px solid #2e3346",
  borderRadius: 12,
  padding: 14,
  backdropFilter: "blur(6px)",
  fontFamily: "'Inter', -apple-system, sans-serif",
  boxShadow: "0 20px 50px -20px rgba(0,0,0,0.7)",
};
const codeBlockStyle = {
  background: "#0a0b11",
  border: "1px solid #1f2233",
  borderRadius: 8,
  padding: "8px 0",
  overflow: "hidden",
};
const relationshipStyle = {
  display: "grid",
  gap: 5,
  marginBottom: 10,
  padding: "7px 8px",
  background: "rgba(19,28,47,0.75)",
  border: "1px solid #1f2a42",
  borderRadius: 7,
  fontFamily: "ui-monospace, monospace",
  fontSize: 10,
  lineHeight: 1.35,
};
const relationshipLabelStyle = {
  display: "inline-block",
  width: 30,
  color: "#64748b",
  fontWeight: 700,
  fontSize: 9,
};
const relationshipFileStyle = {
  display: "inline-block",
  marginRight: 6,
  color: "#cbd5e1",
};
const relationshipBrokenStyle = {
  ...relationshipFileStyle,
  color: "#ff8788",
};
const relationshipEmptyStyle = { color: "#64748b" };
const codeLineStyle = {
  fontFamily:
    "ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, Consolas, monospace",
  fontSize: 11.5,
  padding: "3px 10px",
  whiteSpace: "pre",
};
const patchBtnStyle = {
  marginTop: 10,
  width: "100%",
  background: "#ff4d4f",
  border: "none",
  color: "#160607",
  fontWeight: 700,
  fontSize: 12,
  padding: "9px 0",
  borderRadius: 8,
  cursor: "pointer",
};

const CSS = `
  .pl3d-chip {
    position: absolute; top: 0; left: 0;
    font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
    font-size: 9.5px; letter-spacing: 0.02em;
    color: #b4c2e2;
    background: linear-gradient(135deg, rgba(10,14,26,0.92) 0%, rgba(6,9,18,0.88) 100%);
    border: 1px solid rgba(50,72,140,0.38);
    padding: 2px 8px; border-radius: 5px;
    white-space: nowrap; will-change: transform, opacity;
    backdrop-filter: blur(6px);
    box-shadow: 0 2px 10px rgba(0,0,0,0.45);
  }
  .pl3d-chip--err {
    color: #ff8898;
    border-color: rgba(255,45,85,0.48);
    background: linear-gradient(135deg, rgba(32,7,12,0.95) 0%, rgba(20,4,8,0.92) 100%);
    box-shadow: 0 0 14px rgba(255,45,85,0.28), 0 2px 10px rgba(0,0,0,0.5);
    animation: pl3d-chip-err-glow 2.2s ease-in-out infinite;
  }
  .pl3d-chip--fixed {
    color: #7ef5b4;
    border-color: rgba(0,232,122,0.42);
    background: linear-gradient(135deg, rgba(0,28,16,0.93) 0%, rgba(0,18,10,0.9) 100%);
    box-shadow: 0 0 12px rgba(0,232,122,0.2);
  }
  @keyframes pl3d-chip-err-glow {
    0%, 100% { box-shadow: 0 0 10px rgba(255,45,85,0.2), 0 2px 8px rgba(0,0,0,0.5); }
    50%       { box-shadow: 0 0 22px rgba(255,45,85,0.55), 0 2px 10px rgba(0,0,0,0.6); }
  }
  .pl3d-hover-panel {
    position: absolute; top: 0; left: 0; z-index: 8;
    width: min(350px, calc(100% - 24px));
    padding: 12px 14px;
    border: 1px solid rgba(55,85,160,0.42);
    border-radius: 12px;
    background: linear-gradient(145deg, rgba(8,11,22,0.97) 0%, rgba(4,7,16,0.95) 100%);
    box-shadow: 0 22px 64px rgba(0,0,0,0.72), 0 0 0 1px rgba(70,100,200,0.08) inset;
    pointer-events: none;
    transition: opacity 0.12s ease;
    will-change: transform, opacity;
    backdrop-filter: blur(14px);
  }
  .pl3d-hover-panel__heading {
    color: #e8eef8;
    font: 600 11px 'JetBrains Mono', ui-monospace, monospace;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    letter-spacing: 0.01em;
  }
  .pl3d-hover-panel__status {
    margin-top: 4px;
    color: #00e87a;
    font: 700 9px ui-monospace, monospace;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  .pl3d-hover-panel__status.is-broken {
    color: #ff2d55;
    animation: pl3d-status-flash 1.3s ease-in-out infinite;
  }
  @keyframes pl3d-status-flash {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.45; }
  }
  .pl3d-hover-panel__code {
    margin-top: 8px; padding: 6px 0;
    color: #8898c4;
    background: linear-gradient(180deg, #050710 0%, #070915 100%);
    border: 1px solid rgba(35,50,100,0.38);
    border-radius: 7px; overflow: hidden;
    font: 10px/1.52 'JetBrains Mono', ui-monospace, monospace;
    white-space: pre-wrap;
  }
  .pl3d-hover-panel__code div { padding: 1px 10px; }
  .pl3d-hover-panel__code .is-error-line {
    color: #ff6878;
    background: linear-gradient(90deg, rgba(255,45,85,0.2) 0%, rgba(255,45,85,0.04) 100%);
    border-left: 2px solid rgba(255,45,85,0.55);
    padding-left: 8px;
  }
  .pl3d-hover-panel__note {
    margin-top: 7px;
    color: #ff6070;
    font: 10px/1.4 ui-monospace, monospace;
    padding: 5px 9px;
    background: rgba(255,45,85,0.09);
    border-radius: 5px;
    border-left: 2px solid rgba(255,45,85,0.42);
  }
  .pl3d-xmark {
    position: absolute; top: 0; left: 0;
    color: #ff2d55; font-weight: 900; font-size: 20px;
    filter: drop-shadow(0 0 10px rgba(255,45,85,0.9)) drop-shadow(0 0 4px #000);
    will-change: transform, opacity;
    animation: pl3d-xmark-pulse 1.6s ease-in-out infinite;
  }
  .pl3d-xmark--link { font-size: 30px; }
  @keyframes pl3d-xmark-pulse {
    0%, 100% { filter: drop-shadow(0 0 8px rgba(255,45,85,0.8)) drop-shadow(0 0 3px #000); }
    50%       { filter: drop-shadow(0 0 20px rgba(255,45,85,1.0)) drop-shadow(0 0 6px rgba(255,45,85,0.4)); }
  }
  .pl3d-badge {
    position: absolute; top: 0; left: 0;
    background: linear-gradient(135deg, rgba(46,10,16,0.96) 0%, rgba(30,6,10,0.93) 100%);
    border: 1px solid rgba(255,45,85,0.42);
    color: #ff8898;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9.5px; font-weight: 700;
    letter-spacing: 0.08em; text-transform: uppercase;
    padding: 4px 11px 4px 9px;
    border-radius: 20px;
    white-space: nowrap;
    box-shadow: 0 0 18px rgba(255,45,85,0.22), 0 5px 14px rgba(0,0,0,0.55);
    will-change: transform, opacity;
    animation: pl3d-badge-glow 2.8s ease-in-out infinite;
  }
  @keyframes pl3d-badge-glow {
    0%, 100% { box-shadow: 0 0 12px rgba(255,45,85,0.16), 0 5px 14px rgba(0,0,0,0.55); }
    50%       { box-shadow: 0 0 28px rgba(255,45,85,0.52), 0 5px 18px rgba(0,0,0,0.65); }
  }
`;
