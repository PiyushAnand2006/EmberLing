import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { IconCopy } from "./Icons";

function CodeBlock({ children, className }: { children: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const text = extractText(children);
  const lang = (className || "").replace("language-", "").trim().toLowerCase();
  if (lang === "mermaid") return <Mermaid code={text} />;
  if (lang === "html" || lang === "preview") return <HtmlPreview code={text} />;
  if (lang === "chart") return <Chart code={text} />;
  if (lang === "graph") return <GraphBlock code={text} />;
  if (lang === "three") return <ThreeBlock code={text} />;
  if (lang === "clip") return <ClipPlayer code={text} />;
  return (
    <div className="code-block">
      <button
        className="code-copy"
        title="Copy code"
        onClick={() => {
          navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          });
        }}
      >
        <IconCopy size={13} />
      </button>
      <pre>
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

/* ---------- Mermaid diagrams (all the original's *Diagram chunk types) ---------- */
let mermaidReady: Promise<any> | null = null;
function loadMermaid() {
  if (!mermaidReady) {
    mermaidReady = import("mermaid").then((m) => {
      m.default.initialize({ startOnLoad: false, theme: "dark", securityLevel: "strict" });
      return m.default;
    });
  }
  return mermaidReady;
}

function Mermaid({ code }: { code: string }) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  useEffect(() => {
    let alive = true;
    loadMermaid()
      .then((mermaid) => mermaid.render(`mmd-${Math.random().toString(36).slice(2)}`, code))
      .then(({ svg }: { svg: string }) => {
        if (alive) setSvg(svg);
      })
      .catch((e: Error) => alive && setError(e.message || "diagram error"));
    return () => {
      alive = false;
    };
  }, [code]);
  if (error)
    return (
      <div className="tool-line" style={{ cursor: "default" }}>
        <span className="tool-name">mermaid</span> <span className="tool-status-err">✕</span> {error.slice(0, 120)}
      </div>
    );
  return svg ? (
    <div className="photo-card mermaid-card" style={{ background: "rgba(0,0,0,0.25)", padding: 10, margin: "8px 0" }} dangerouslySetInnerHTML={{ __html: svg }} />
  ) : (
    <div className="status-pill">Rendering diagram…</div>
  );
}

/* ---------- HTML preview card (original: sand-html-preview) ---------- */
function HtmlPreview({ code }: { code: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    setSrc(`data:text/html;charset=utf-8,${encodeURIComponent(code)}`);
  }, [code]);
  return (
    <div className="photo-card" style={{ border: "1px solid var(--cursor-stroke-quaternary)", borderRadius: 12, margin: "8px 0", overflow: "hidden", background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 6px", background: "var(--cursor-pane)", borderBottom: "1px solid var(--cursor-stroke-quaternary)" }}>
        <button className="btn subtle" style={{ fontSize: 11, padding: "2px 10px" }} onClick={() => window.emberling.canvas.open(code)} title="Open in a separate window">
          ⧉ Open in window
        </button>
      </div>
      <iframe src={src} title="HTML preview" sandbox="allow-scripts" style={{ width: "100%", height: 260, border: 0, background: "#fff" }} />
    </div>
  );
}

/* ---------- Charts (bar / line / pie as inline SVG) ---------- */
function Chart({ code }: { code: string }) {
  let spec: { type?: string; labels?: string[]; data?: number[] } = {};
  try {
    spec = JSON.parse(code);
  } catch {
    return <div className="tool-line" style={{ cursor: "default" }}>chart: invalid JSON</div>;
  }
  const labels = spec.labels || [];
  const data = (spec.data || []).map((n) => Number(n) || 0);
  if (!data.length) return <div className="tool-line" style={{ cursor: "default" }}>chart: no data</div>;
  const type = String(spec.type || "bar");
  const palette = ["#f54e00", "#599ce7", "#3fa266", "#f1b467", "#9386f2", "#b48ead", "#e34671", "#81a1c1"];

  if (type === "pie" || type === "donut") {
    const total = data.reduce((a, b) => a + b, 0) || 1;
    let angle = -Math.PI / 2;
    const slices = data
      .map((v, i) => {
        const frac = v / total;
        const a0 = angle;
        const a1 = angle + frac * Math.PI * 2;
        angle = a1;
        const large = frac > 0.5 ? 1 : 0;
        const x0 = 100 + 80 * Math.cos(a0), y0 = 90 + 80 * Math.sin(a0);
        const x1 = 100 + 80 * Math.cos(a1), y1 = 90 + 80 * Math.sin(a1);
        return `<path d="M${x0},${y0} A80,80 0 ${large} 1 ${x1},${y1} L100,90 Z" fill="${palette[i % palette.length]}" stroke="#181818" stroke-width="2"/>`;
      })
      .join("");
    return (
      <div className="photo-card" style={{ background: "rgba(0,0,0,0.25)", padding: 12, margin: "8px 0" }}>
        <svg viewBox="0 0 200 180" style={{ width: 220, display: "block", margin: "0 auto" }} dangerouslySetInnerHTML={{ __html: slices }} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 6, fontSize: 11, color: "var(--cursor-text-secondary)" }}>
          {data.map((v, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: palette[i % palette.length], display: "inline-block" }} />
              {labels[i] || i}: {v}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (type === "line" || type === "area") {
    const max = Math.max(...data, 1);
    const w = 340, h = 160, pad = 24;
    const pts = data.map((v, i) => `${pad + (i * (w - pad * 2)) / Math.max(1, data.length - 1)},${h - pad - (v / max) * (h - pad * 2)}`);
    return (
      <div className="photo-card" style={{ background: "rgba(0,0,0,0.25)", padding: 12, margin: "8px 0" }}>
        <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", maxWidth: 380, display: "block" }}>
          {type === "area" && <polygon points={`${pad},${h - pad} ${pts.join(" ")} ${w - pad},${h - pad}`} fill="rgba(245,78,0,0.22)" />}
          <polyline points={pts.join(" ")} fill="none" stroke="#599ce7" strokeWidth="2.5" />
          {pts.map((p, i) => {
            const [x, y] = p.split(",");
            return <circle key={i} cx={x} cy={y} r="3" fill="#f54e00" />;
          })}
        </svg>
        {labels.length > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--cursor-text-quaternary)", maxWidth: 380 }}>
            <span>{labels[0] || ""}</span>
            <span>{labels[labels.length - 1] || ""}</span>
          </div>
        )}
      </div>
    );
  }

  if (type === "scatter") {
    const xs = (spec as any).x || labels.map((_, i) => i);
    const w = 340, h = 200, pad = 28;
    const maxY = Math.max(...data, 1);
    const maxX = Math.max(...xs.map((v: any) => Number(v) || 0), 1);
    return (
      <div className="photo-card" style={{ background: "rgba(0,0,0,0.25)", padding: 12, margin: "8px 0" }}>
        <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", maxWidth: 380, display: "block" }}>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={pad} y1={pad + f * (h - pad * 2)} x2={w - pad} y2={pad + f * (h - pad * 2)} stroke="rgba(255,255,255,0.08)" />
          ))}
          {data.map((v, i) => {
            const x = pad + ((Number(xs[i]) || 0) / maxX) * (w - pad * 2);
            const y = h - pad - (v / maxY) * (h - pad * 2);
            return <circle key={i} cx={x} cy={y} r="4" fill="#f54e00" opacity="0.85" />;
          })}
        </svg>
      </div>
    );
  }

  const max = Math.max(...data, 1);
  return (
    <div className="photo-card" style={{ background: "rgba(0,0,0,0.25)", padding: 12, margin: "8px 0" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 140, justifyContent: "center" }}>
        {data.map((v, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1, maxWidth: 60 }}>
            <span style={{ fontSize: 10, color: "var(--cursor-text-tertiary)" }}>{v}</span>
            <div style={{ width: "100%", height: `${(v / max) * 100}%`, minHeight: 3, background: "linear-gradient(180deg, #ff6a24, #f54e00)", borderRadius: "4px 4px 0 0" }} />
            <span style={{ fontSize: 10, color: "var(--cursor-text-tertiary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 60 }}>{labels[i] || i}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Clip player (video generation frame sequence) ---------- */
function ClipPlayer({ code }: { code: string }) {
  let spec: { prompt?: string; frames?: string[] } = {};
  try {
    spec = JSON.parse(code);
  } catch {
    return null;
  }
  const frames = (spec.frames || []).filter(Boolean);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    timer.current = window.setInterval(() => setI((v) => (v + 1) % frames.length), 420);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, frames.length]);
  if (!frames.length) return null;
  return (
    <div className="photo-card" style={{ position: "relative", margin: "8px 0", maxWidth: 440 }}>
      <img src={frames[i]} alt={spec.prompt || "clip"} style={{ width: "100%", display: "block", borderRadius: 12 }} />
      <div style={{ position: "absolute", inset: "auto 8px 8px 8px", display: "flex", alignItems: "center", gap: 8 }}>
        <button
          className="icon-btn"
          style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <div style={{ flex: 1, display: "flex", gap: 3 }}>
          {frames.map((_, k) => (
            <span key={k} style={{ flex: 1, height: 3, borderRadius: 2, background: k === i ? "#f54e00" : "rgba(255,255,255,0.35)" }} />
          ))}
        </div>
        <span style={{ fontSize: 10, color: "#fffc", textShadow: "0 1px 2px #000" }}>
          {i + 1}/{frames.length}
        </span>
      </div>
    </div>
  );
}

/* ---------- Graph block (cytoscape, Block B20) — nodes/edges network ---------- */
let cytoscapeReady: Promise<any> | null = null;
function loadCytoscape() {
  if (!cytoscapeReady) cytoscapeReady = import("cytoscape");
  return cytoscapeReady;
}

function GraphBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    let cy: any = null;
    (async () => {
      try {
        const spec = JSON.parse(code);
        if (!Array.isArray(spec.nodes) || !spec.nodes.length) throw new Error("graph needs nodes[]");
        const cytoscape = await loadCytoscape();
        if (!alive || !ref.current) return;
        cy = cytoscape({
          container: ref.current,
          elements: [
            ...spec.nodes.map((n: any) => ({ data: { id: String(n.id), label: String(n.label || n.id) } })),
            ...(spec.edges || []).map((e: any, i: number) => ({ data: { id: `e${i}`, source: String(e.source), target: String(e.target) } })),
          ],
          style: [
            { selector: "node", style: { "background-color": "#f54e00", label: "data(label)", color: "#f0f0f0", "font-size": 10, "text-valign": "bottom", width: 18, height: 18 } },
            { selector: "edge", style: { width: 1.5, "line-color": "rgba(255,255,255,0.35)", "target-arrow-color": "rgba(255,255,255,0.35)", "target-arrow-shape": "triangle", "curve-style": "bezier" } },
          ],
          layout: { name: "cose", animate: false },
        });
        cy.fit(undefined, 20);
      } catch (e) {
        alive && setError(String((e as Error).message || e));
      }
    })();
    return () => {
      alive = false;
      cy?.destroy();
    };
  }, [code]);
  return (
    <div className="photo-card" style={{ background: "rgba(0,0,0,0.3)", padding: 6, margin: "8px 0" }}>
      {error ? <div className="tool-line" style={{ cursor: "default" }}>graph: {error}</div> : <div ref={ref} style={{ width: "100%", height: 240 }} />}
    </div>
  );
}

/* ---------- 3D block (three.js, Block B20) — shape/points scene ---------- */
let threeReady: Promise<any> | null = null;
function loadThree() {
  if (!threeReady) {
    threeReady = Promise.all([import("three"), import("three/examples/jsm/controls/OrbitControls.js")]).then(([THREE, { OrbitControls }]) => ({ THREE, OrbitControls }));
  }
  return threeReady;
}

function ThreeBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    let raf = 0;
    let cleanup = () => {};
    (async () => {
      try {
        const spec = JSON.parse(code);
        const { THREE, OrbitControls } = await loadThree();
        if (!alive || !ref.current) return;
        const width = ref.current.clientWidth || 400;
        const height = 260;
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(width, height);
        ref.current.appendChild(renderer.domElement);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100);
        camera.position.set(0, 1.6, 4.2);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const key = new THREE.DirectionalLight(0xff8a4d, 1.4);
        key.position.set(3, 4, 2);
        scene.add(key);
        const color = new THREE.Color(String(spec.color || "#f54e00"));
        const shape = String(spec.shape || "sphere");
        const count = Math.min(4000, Math.max(1, Number(spec.count) || 600));
        if (shape === "points") {
          const pos = new Float32Array(count * 3);
          for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 4;
            pos[i * 3 + 1] = (Math.random() - 0.5) * 3;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 4;
          }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
          scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.035 })));
        } else {
          const geo =
            shape === "torus"
              ? new THREE.TorusGeometry(1.2, 0.45, 24, 96)
              : shape === "cube"
                ? new THREE.BoxGeometry(1.8, 1.8, 1.8)
                : new THREE.SphereGeometry(1.3, 48, 32);
          scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.15 })));
        }
        const animate = () => {
          if (!alive) return;
          raf = requestAnimationFrame(animate);
          scene.rotation.y += 0.004;
          controls.update();
          renderer.render(scene, camera);
        };
        animate();
        cleanup = () => {
          cancelAnimationFrame(raf);
          renderer.dispose();
          renderer.domElement.remove();
        };
      } catch (e) {
        alive && setError(String((e as Error).message || e));
      }
    })();
    return () => {
      alive = false;
      cleanup();
    };
  }, [code]);
  return (
    <div className="photo-card" style={{ background: "rgba(0,0,0,0.3)", padding: 6, margin: "8px 0" }}>
      {error ? <div className="tool-line" style={{ cursor: "default" }}>three: {error}</div> : <div ref={ref} style={{ width: "100%", height: 260, borderRadius: 8 }} />}
    </div>
  );
}

function extractText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  const el = node as { props?: { children?: React.ReactNode } };
  if (el.props?.children !== undefined) return extractText(el.props.children);
  return "";
}

export function Markdown({ content }: { content: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          img: ({ src, alt }) => <img src={String(src || "")} alt={alt || ""} loading="lazy" style={{ maxWidth: "100%", borderRadius: 8 }} />,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
