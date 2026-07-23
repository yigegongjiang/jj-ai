import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/modelfit";

// ============ types ============
interface MfModel {
  model: string;
  family: string;
  params: number | null;
  quantization: string;
  minRamGb: number;
  estimatedLoadGb: number;
  kvKbPerToken: number | null;
  runsLocally: boolean;
  openWeights: boolean;
  ggufDiy: boolean;
  runtimes: string[];
  bestFor: string;
  ollamaCommand: string | null;
}
interface Snapshot {
  syncedAt: number;
  updated?: string; // dataset's own publish date
  counts?: { models: number; local: number; cloud: number; families: number };
  data: MfModel[];
}
type ActionResult =
  | { ok: true; snapshot: Snapshot }
  | { ok: false; error: string };

// upstream returns { models, updated, counts, ... } — different shape from OpenRouter
const MODELFIT_URL = "https://modelfit.io/api/dataset/";
const KV_KEY = "modelfit";

export function meta() {
  return [{ title: "ModelFit · jj-ai" }];
}

// ============ loader / action ============
export async function loader({ context }: Route.LoaderArgs) {
  const snapshot = await context.cloudflare.env.MODELS_KV.get<Snapshot>(
    KV_KEY,
    "json",
  );
  return { snapshot };
}

export async function action({
  context,
}: Route.ActionArgs): Promise<ActionResult> {
  try {
    const res = await fetch(MODELFIT_URL, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`ModelFit HTTP ${res.status}`);
    const json = (await res.json()) as {
      models?: MfModel[];
      updated?: string;
      counts?: Snapshot["counts"];
    };
    const data = json?.models;
    if (!Array.isArray(data) || data.length === 0)
      throw new Error("empty response");
    const snapshot: Snapshot = {
      syncedAt: Date.now(),
      updated: json.updated,
      counts: json.counts,
      data,
    };
    // overwrite only after a valid non-empty fetch, so a failed sync never wipes the good snapshot
    await context.cloudflare.env.MODELS_KV.put(KV_KEY, JSON.stringify(snapshot));
    return { ok: true, snapshot };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ============ pure helpers ============
const trim = (s: string) => s.replace(/\.?0+$/, "");
// params are in billions; render 1600 -> "1.6T", 1.5 -> "1.5B"
function fmtParams(p: number | null): string {
  if (p == null) return "—";
  if (p >= 1000) return trim((p / 1000).toFixed(1)) + "T";
  return trim(p.toFixed(1)) + "B";
}
function fmtGb(n: number): string {
  if (!n) return "—"; // cloud/API rows are 0 -> no local footprint
  return trim(n.toFixed(1)) + " GB";
}
function fmtRel(ms: number, now: number): string {
  const s = Math.floor((now - ms) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// highlight matched query tokens inside a label
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function Highlight({ text, tokens }: { text: string; tokens: string[] }) {
  if (!tokens.length) return <>{text}</>;
  const re = new RegExp(`(${tokens.map(escapeRe).join("|")})`, "ig");
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark className="hl" key={i}>{p}</mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

// ---- bestFor normalization: 42 raw tags -> 12 canonical use-case categories ----
// display order == filter order; every raw tag is mapped so no model drops from the facet
const CATEGORIES = [
  "Coding",
  "Agentic",
  "Reasoning",
  "Tool calling",
  "Vision",
  "Long Context",
  "Math",
  "Translation",
  "Chat",
  "Edge",
  "Speed",
  "Quality",
] as const;
const CAT_MAP: Record<string, string[]> = {
  "agent scenarios": ["Agentic"],
  agentic: ["Agentic"],
  "agentic coding": ["Agentic", "Coding"],
  "agentic tasks": ["Agentic"],
  agents: ["Agentic"],
  analysis: ["Reasoning"],
  chat: ["Chat"],
  coding: ["Coding"],
  "complex reasoning": ["Reasoning"],
  "complex tasks": ["Reasoning"],
  edge: ["Edge"],
  "edge tasks": ["Edge"],
  embedded: ["Edge"],
  "enterprise assistant": ["Chat"],
  "frontier quality": ["Quality"],
  "frontier reasoning": ["Reasoning"],
  "frontier-level reasoning": ["Reasoning"],
  iot: ["Edge"],
  "lightweight chat": ["Chat"],
  "local ai agents": ["Agentic"],
  "long context": ["Long Context"],
  "mcp workflows": ["Tool calling"],
  math: ["Math"],
  mobile: ["Edge"],
  multimodal: ["Vision"],
  "on-device": ["Edge"],
  "on-device agents": ["Edge", "Agentic"],
  quality: ["Quality"],
  "real-time data": ["Speed"],
  reasoning: ["Reasoning"],
  speed: ["Speed"],
  "tool calling": ["Tool calling"],
  translation: ["Translation"],
  vision: ["Vision"],
  classification: ["Reasoning"],
  "instruction following": ["Chat"],
  "long-horizon software engineering": ["Coding", "Agentic"],
  "multilingual chat": ["Chat", "Translation"],
  "privacy-first tool calling": ["Tool calling"],
  "repo-scale software engineering": ["Coding"],
};
function normCats(bestFor: string): string[] {
  const set = new Set<string>();
  for (const raw of bestFor.split(",")) {
    const cats = CAT_MAP[raw.trim().toLowerCase()];
    if (cats) for (const c of cats) set.add(c);
  }
  // keep canonical display order
  return CATEGORIES.filter((c) => set.has(c));
}

const RAM_PRESETS = [8, 16, 24, 32, 48, 64, 128];
const PARAM_BANDS: {
  k: string;
  label: string;
  test: (p: number) => boolean;
}[] = [
  { k: "xs", label: "<2B", test: (p) => p < 2 },
  { k: "s", label: "2–8B", test: (p) => p >= 2 && p < 8 },
  { k: "m", label: "8–15B", test: (p) => p >= 8 && p < 15 },
  { k: "l", label: "15–35B", test: (p) => p >= 15 && p < 35 },
  { k: "xl", label: "35–80B", test: (p) => p >= 35 && p < 80 },
  { k: "xxl", label: "80B+", test: (p) => p >= 80 },
];

// derived row for fast filter/sort
interface Row {
  m: MfModel;
  uid: string; // stable id: name+quant (feature.md warns same model repeats across quantizations)
  s: string;
  cats: string[];
  ram: number;
  load: number;
  params: number | null;
  local: boolean;
  open: boolean;
  diy: boolean;
}

type SortKey = "ram" | "load" | "params" | "name";
const SORT_DEFAULT_ASC: Record<SortKey, boolean> = {
  ram: true,
  load: true,
  params: false,
  name: true,
};

export default function ModelFit({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const active =
    actionData && actionData.ok ? actionData.snapshot : loaderData.snapshot;
  const models = active?.data ?? [];
  const syncedAt = active?.syncedAt;
  const datasetDate = active?.updated;
  const syncErr = actionData && !actionData.ok ? actionData.error : null;

  const nav = useNavigation();
  const syncing = nav.state === "submitting";

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ---- filters / state ----
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query).trim().toLowerCase();
  // "-term" excludes; bare term includes (AND). only include-terms get highlighted
  const { inc, exc } = useMemo(() => {
    const inc: string[] = [];
    const exc: string[] = [];
    for (const t of q.split(/\s+/).filter(Boolean)) {
      if (t.startsWith("-")) {
        if (t.length > 1) exc.push(t.slice(1));
      } else inc.push(t);
    }
    return { inc, exc };
  }, [q]);
  const [ram, setRam] = useState(""); // RAM budget (GB); "" = off
  const [deploy, setDeploy] = useState("all"); // all | local | cloud
  const [openOnly, setOpenOnly] = useState(false);
  const [cats, setCats] = useState<Set<string>>(new Set());
  const [quant, setQuant] = useState<Set<string>>(new Set());
  const [band, setBand] = useState("all");
  const [famSel, setFamSel] = useState<Set<string>>(new Set());
  const [famQ, setFamQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("ram");
  const [asc, setAsc] = useState(true);
  const [sel, setSel] = useState<Row | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);

  // ---- derived rows (once per snapshot) ----
  const rows = useMemo<Row[]>(
    () =>
      models.map((m) => ({
        m,
        uid: `${m.model}|${m.quantization}`,
        s: `${m.model} ${m.family} ${m.bestFor}`.toLowerCase(),
        cats: normCats(m.bestFor),
        ram: m.minRamGb ?? 0,
        load: m.estimatedLoadGb ?? 0,
        params: m.params,
        local: !!m.runsLocally,
        open: !!m.openWeights,
        diy: !!m.ggufDiy,
      })),
    [models],
  );

  // ---- facet options + counts ----
  const facets = useMemo(() => {
    const fam = new Map<string, number>();
    const qz = new Map<string, number>();
    const cat = new Map<string, number>();
    const bump = (map: Map<string, number>, k: string) =>
      map.set(k, (map.get(k) ?? 0) + 1);
    for (const r of rows) {
      bump(fam, r.m.family);
      bump(qz, r.m.quantization);
      for (const c of r.cats) bump(cat, c);
    }
    return {
      fam: [...fam].sort((a, b) =>
        b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0]),
      ),
      qz: [...qz].sort((a, b) => a[0].localeCompare(b[0])),
      cat: CATEGORIES.filter((c) => cat.has(c)).map(
        (c) => [c, cat.get(c)!] as [string, number],
      ),
    };
  }, [rows]);

  const ramBudget = ram ? parseInt(ram, 10) : 0;

  // ---- filter + sort ----
  const view = useMemo(() => {
    const dir = asc ? 1 : -1;
    const list = rows.filter((r) => {
      if (inc.length && !inc.every((t) => r.s.includes(t))) return false;
      if (exc.length && exc.some((t) => r.s.includes(t))) return false;
      // RAM budget: local models whose minimum tier fits (cloud has no footprint -> excluded)
      if (ramBudget > 0 && !(r.ram > 0 && r.ram <= ramBudget)) return false;
      if (deploy === "local" && !r.local) return false;
      if (deploy === "cloud" && r.local) return false;
      if (openOnly && !r.open) return false;
      if (cats.size && !r.cats.some((c) => cats.has(c))) return false;
      if (quant.size && !quant.has(r.m.quantization)) return false;
      if (band !== "all") {
        const b = PARAM_BANDS.find((x) => x.k === band);
        if (!b || r.params == null || !b.test(r.params)) return false;
      }
      if (famSel.size && !famSel.has(r.m.family)) return false;
      return true;
    });
    list.sort((a, b) => {
      if (sortKey === "name") return dir * a.m.model.localeCompare(b.m.model);
      if (sortKey === "params") {
        // null params (API) always last, both directions
        if (a.params == null && b.params == null) return 0;
        if (a.params == null) return 1;
        if (b.params == null) return -1;
        return dir * (a.params - b.params);
      }
      // ram / load: 0 means no local footprint (cloud) -> always last
      const av = sortKey === "ram" ? a.ram : a.load;
      const bv = sortKey === "ram" ? b.ram : b.load;
      if (av === 0 && bv === 0) return 0;
      if (av === 0) return 1;
      if (bv === 0) return -1;
      return dir * (av - bv);
    });
    return list;
  }, [rows, inc, exc, ramBudget, deploy, openOnly, cats, quant, band, famSel, sortKey, asc]);

  // ---- keyboard ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === "INPUT" || t.tagName === "SELECT";
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape") {
        if (sel) setSel(null);
        else if (query) setQuery("");
        else searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, query]);

  const toggle = (set: Set<string>, k: string, fn: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(k) ? next.delete(k) : next.add(k);
    fn(next);
  };
  const clickSort = (k: SortKey) => {
    if (k === sortKey) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(SORT_DEFAULT_ASC[k]);
    }
  };
  const hasFilters =
    !!q ||
    !!ram ||
    deploy !== "all" ||
    openOnly ||
    cats.size > 0 ||
    quant.size > 0 ||
    band !== "all" ||
    famSel.size > 0;
  const resetAll = () => {
    setQuery("");
    setRam("");
    setDeploy("all");
    setOpenOnly(false);
    setCats(new Set());
    setQuant(new Set());
    setBand("all");
    setFamSel(new Set());
    setFamQ("");
  };

  const Arrow = ({ k }: { k: SortKey }) =>
    sortKey === k ? <span className="arrow">{asc ? "↑" : "↓"}</span> : null;

  return (
    <div className="app">
      {/* ---- topbar ---- */}
      <header className="topbar">
        <Link to="/" className="tb-back" title="Home">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <div className="tb-title">
          <b>ModelFit</b>
          <span className="tb-count">
            {view.length}
            {view.length !== rows.length ? ` / ${rows.length}` : ""}
          </span>
        </div>

        <div className="search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…  e.g.  qwen coding  -api  (- excludes)"
            spellCheck={false}
            autoComplete="off"
          />
          {query ? (
            <button className="clear" onClick={() => setQuery("")} title="Clear">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          ) : (
            <kbd>/</kbd>
          )}
        </div>

        <div className="tb-spacer" />

        <div className="tb-sync">
          {datasetDate ? (
            <span className="synced">
              Data {datasetDate}
              {syncedAt && mounted ? ` · synced ${fmtRel(syncedAt, Date.now())}` : ""}
            </span>
          ) : null}
          <Form method="post">
            <button className="btn btn-accent" disabled={syncing}>
              <svg className={syncing ? "spin" : ""} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <path d="M21 3v6h-6" />
              </svg>
              {syncing ? "Syncing…" : "Sync"}
            </button>
          </Form>
        </div>
      </header>

      {syncErr ? (
        <div className="err-banner">Sync failed: {syncErr} · showing last snapshot</div>
      ) : null}

      {/* ---- body ---- */}
      <div className="body">
        <aside className="rail">
          <div className="fgroup">
            <div className="fgroup-h">
              <span>RAM budget</span>
              {ram ? <button onClick={() => setRam("")}>clear</button> : null}
            </div>
            <div className="ram-row">
              <input
                className="fsearch ram-input"
                type="number"
                min={1}
                value={ram}
                onChange={(e) => setRam(e.target.value.replace(/\D/g, ""))}
                placeholder="GB"
                spellCheck={false}
                autoComplete="off"
              />
              <span className="ram-hint">local models that fit</span>
            </div>
            <div className="chips">
              {RAM_PRESETS.map((g) => (
                <Chip key={g} on={ram === String(g)} onClick={() => setRam(String(g))}>
                  {g}
                </Chip>
              ))}
            </div>
          </div>

          <FilterGroup title="Deploy">
            <Chip on={deploy === "all"} onClick={() => setDeploy("all")}>any</Chip>
            <Chip on={deploy === "local"} onClick={() => setDeploy("local")}>Local</Chip>
            <Chip on={deploy === "cloud"} onClick={() => setDeploy("cloud")}>Cloud API</Chip>
          </FilterGroup>

          <FilterGroup title="Weights">
            <Chip on={openOnly} onClick={() => setOpenOnly((v) => !v)}>open weights only</Chip>
          </FilterGroup>

          <FilterGroup title="Use case" onClear={cats.size ? () => setCats(new Set()) : undefined}>
            {facets.cat.map(([k, n]) => (
              <Chip key={k} on={cats.has(k)} n={n} onClick={() => toggle(cats, k, setCats)}>
                {k}
              </Chip>
            ))}
          </FilterGroup>

          <FilterGroup title="Quantization" onClear={quant.size ? () => setQuant(new Set()) : undefined}>
            {facets.qz.map(([k, n]) => (
              <Chip key={k} on={quant.has(k)} n={n} onClick={() => toggle(quant, k, setQuant)}>
                {k}
              </Chip>
            ))}
          </FilterGroup>

          <FilterGroup title="Params">
            <Chip on={band === "all"} onClick={() => setBand("all")}>any</Chip>
            {PARAM_BANDS.map((b) => (
              <Chip key={b.k} on={band === b.k} onClick={() => setBand(b.k)}>{b.label}</Chip>
            ))}
          </FilterGroup>

          <div className="fgroup">
            <div className="fgroup-h">
              <span>Family {famSel.size ? `· ${famSel.size}` : `(${facets.fam.length})`}</span>
              {famSel.size ? <button onClick={() => setFamSel(new Set())}>clear</button> : null}
            </div>
            <input
              className="fsearch"
              value={famQ}
              onChange={(e) => setFamQ(e.target.value)}
              placeholder="Filter families…"
              spellCheck={false}
              autoComplete="off"
            />
            <div className="plist">
              {facets.fam
                .filter(([k]) => k.toLowerCase().includes(famQ.trim().toLowerCase()))
                .map(([k, n]) => (
                  <button
                    key={k}
                    className={"prow" + (famSel.has(k) ? " on" : "")}
                    onClick={() => toggle(famSel, k, setFamSel)}
                    title={k}
                  >
                    <span className="pcheck" aria-hidden>
                      {famSel.has(k) ? (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      ) : null}
                    </span>
                    <span className="pname">{k}</span>
                    <span className="pcnt">{n}</span>
                  </button>
                ))}
            </div>
          </div>

          {hasFilters ? (
            <button className="btn" style={{ width: "100%" }} onClick={resetAll}>
              Reset filters
            </button>
          ) : null}
        </aside>

        {/* ---- table ---- */}
        {view.length === 0 ? (
          <div className="empty">
            <div className="empty-inner">
              {rows.length === 0 ? (
                <>
                  <h3>No data yet</h3>
                  <p>Click <b>Sync</b> to pull the latest dataset from ModelFit.</p>
                </>
              ) : (
                <>
                  <h3>No matches</h3>
                  <p>No models match the current filters.</p>
                </>
              )}
            </div>
          </div>
        ) : (
          <main className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th className="sortable" onClick={() => clickSort("name")}>Model <Arrow k="name" /></th>
                  <th className="num sortable" onClick={() => clickSort("params")}>Params <Arrow k="params" /></th>
                  <th>Quant</th>
                  <th className="num sortable" onClick={() => clickSort("ram")} title="Minimum RAM tier that fits">Min RAM <Arrow k="ram" /></th>
                  <th className="num sortable" onClick={() => clickSort("load")} title="Estimated memory load">Load <Arrow k="load" /></th>
                  <th>Best for</th>
                  <th>Deploy</th>
                </tr>
              </thead>
              <tbody>
                {view.map((r) => (
                  <tr
                    key={r.uid}
                    className={sel?.uid === r.uid ? "sel" : ""}
                    onClick={() => setSel(r)}
                  >
                    <td>
                      <div className="m-name" title={r.m.model}>
                        <Highlight text={r.m.model} tokens={inc} />
                      </div>
                      <div className="m-id" title={r.m.family}>
                        <Highlight text={r.m.family} tokens={inc} />
                      </div>
                    </td>
                    <td className="num">{fmtParams(r.params)}</td>
                    <td>
                      <span className={"qz" + (r.m.quantization === "API" ? " qz-api" : "")}>
                        {r.m.quantization}
                      </span>
                    </td>
                    <td className="num">{r.ram > 0 ? `${r.ram} GB` : <span className="dash">—</span>}</td>
                    <td className="num">{r.load > 0 ? fmtGb(r.load) : <span className="dash">—</span>}</td>
                    <td>
                      <span className="utags">
                        {r.cats.slice(0, 3).map((c) => (
                          <span className="utag" key={c}>{c}</span>
                        ))}
                        {r.cats.length > 3 ? <span className="utag utag-more">+{r.cats.length - 3}</span> : null}
                      </span>
                    </td>
                    <td>
                      <span className="dep">
                        <span className={r.local ? "badge badge-local" : "badge badge-cloud"}>
                          {r.local ? "Local" : "Cloud"}
                        </span>
                        {r.open ? <span className="badge badge-open" title="Open weights">open</span> : null}
                        {r.diy ? <span className="badge badge-diy" title="GGUF requires DIY conversion">DIY</span> : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </main>
        )}
      </div>

      {sel ? <Drawer r={sel} onClose={() => setSel(null)} /> : null}
    </div>
  );
}

// ============ sub components ============
function FilterGroup({
  title,
  onClear,
  children,
}: {
  title: string;
  onClear?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fgroup">
      <div className="fgroup-h">
        <span>{title}</span>
        {onClear ? <button onClick={onClear}>clear</button> : null}
      </div>
      <div className="chips">{children}</div>
    </div>
  );
}

function Chip({
  on,
  n,
  onClick,
  children,
}: {
  on: boolean;
  n?: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button className={"chip" + (on ? " on" : "")} onClick={onClick}>
      {children}
      {n != null ? <span className="cnt">{n}</span> : null}
    </button>
  );
}

function Drawer({ r, onClose }: { r: Row; onClose: () => void }) {
  const m = r.m;
  const cmd = m.ollamaCommand;
  const [copied, setCopied] = useState(false);
  const copyCmd = () => {
    if (!cmd) return;
    navigator.clipboard?.writeText(cmd);
    setCopied(true);
  };
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);

  const rawTags = m.bestFor
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="drawer" role="dialog" aria-label={m.model}>
        <div className="dw-head">
          <div className="dw-top">
            <div style={{ minWidth: 0 }}>
              <h2>{m.model}</h2>
              <div className="dw-id">{m.family}</div>
            </div>
            <button className="dw-close" onClick={onClose} title="Close (Esc)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div className="dw-links">
            <span className={m.runsLocally ? "badge badge-local" : "badge badge-cloud"}>
              {m.runsLocally ? "Runs locally" : "Cloud only"}
            </span>
            <span className={m.openWeights ? "badge badge-open" : "badge badge-closed"}>
              {m.openWeights ? "Open weights" : "Closed weights"}
            </span>
            {m.ggufDiy ? <span className="badge badge-diy" title="No prebuilt GGUF; convert yourself">GGUF DIY</span> : null}
          </div>
        </div>

        <div className="dw-body">
          {cmd ? (
            <Section title="Ollama">
              <button className={"cmd" + (copied ? " copied" : "")} onClick={copyCmd} title="Click to copy">
                <code>{cmd}</code>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {copied ? (
                    <path d="M20 6L9 17l-5-5" />
                  ) : (
                    <>
                      <rect x="9" y="9" width="11" height="11" rx="2" />
                      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                    </>
                  )}
                </svg>
              </button>
            </Section>
          ) : null}

          <Section title="Hardware">
            <div className="facts">
              <Fact k="Params" v={fmtParams(m.params)} />
              <Fact k="Quantization" v={m.quantization} />
              <Fact k="Min RAM" v={m.minRamGb > 0 ? `${m.minRamGb} GB` : "—"} />
              <Fact k="Est. load" v={fmtGb(m.estimatedLoadGb)} />
              {m.kvKbPerToken != null ? <Fact k="KV / token" v={`${m.kvKbPerToken} KB`} /> : null}
              <Fact k="Family" v={m.family} />
            </div>
          </Section>

          {r.cats.length ? (
            <Section title="Use case">
              <div className="tags">
                {r.cats.map((c) => <span className="tag tag-cat" key={c}>{c}</span>)}
              </div>
            </Section>
          ) : null}

          {rawTags.length ? (
            <Section title="Best for (raw)">
              <div className="tags">
                {rawTags.map((t, i) => <span className="tag" key={i}>{t}</span>)}
              </div>
            </Section>
          ) : null}

          {m.runtimes?.length ? (
            <Section title="Runtimes">
              <div className="tags">
                {m.runtimes.map((rt) => <span className="tag" key={rt}>{rt}</span>)}
              </div>
            </Section>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="dw-sec">
      <div className="dw-sec-h">{title}</div>
      {children}
    </div>
  );
}
function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="fact">
      <div className="fact-k">{k}</div>
      <div className="fact-v">{v}</div>
    </div>
  );
}
