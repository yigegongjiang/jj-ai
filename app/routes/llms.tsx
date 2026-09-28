import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Form, Link, useNavigation } from "react-router";
import { matchesFilterTerms, parseFilterTerms } from "../filter";
import type { Route } from "./+types/llms";

// ============ types ============
interface Model {
  id: string;
  name: string;
  description?: string;
  created?: number;
  context_length?: number;
  expiration_date?: string | null;
  knowledge_cutoff?: string | null;
  hugging_face_id?: string | null;
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
    tokenizer?: string;
    instruct_type?: string | null;
  };
  pricing?: Record<string, any>;
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number | null;
    is_moderated?: boolean;
  };
  supported_parameters?: string[];
  reasoning?: {
    mandatory?: boolean;
    supported_efforts?: string[];
    default_effort?: string;
  } | null;
  benchmarks?: {
    artificial_analysis?: {
      intelligence_index?: number;
      coding_index?: number;
      agentic_index?: number;
    };
    design_arena?: {
      arena: string;
      category: string;
      elo: number;
      win_rate: number;
      rank: number;
    }[];
  };
}
interface Snapshot {
  syncedAt: number;
  data: Model[];
}
type ActionResult =
  | { ok: true; snapshot: Snapshot }
  | { ok: false; error: string };

const OPENROUTER_URL =
  "https://openrouter.ai/api/v1/models?output_modalities=all";
const KV_KEY = "snapshot";

export function meta() {
  return [{ title: "LLMs · jj-ai" }];
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
    const res = await fetch(OPENROUTER_URL, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);
    const json = (await res.json()) as { data?: Model[] };
    const data = json?.data;
    if (!Array.isArray(data) || data.length === 0)
      throw new Error("empty response");
    const snapshot: Snapshot = { syncedAt: Date.now(), data };
    // overwrite only after a valid non-empty fetch, so a failed sync never wipes the good snapshot
    await context.cloudflare.env.MODELS_KV.put(KV_KEY, JSON.stringify(snapshot));
    return { ok: true, snapshot };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ============ pure helpers ============
const trim = (s: string) => s.replace(/\.?0+$/, "");
function money(n: number): string {
  if (n === 0) return "0";
  if (n >= 100) return n.toFixed(0);
  if (n >= 1) return trim(n.toFixed(2));
  return trim(n.toFixed(3));
}
function perM(v: any): number | null {
  const n = parseFloat(v);
  return isFinite(n) ? n * 1e6 : null;
}
function fmtCtx(n?: number): string {
  if (!n) return "—";
  if (n >= 1e6) return trim((n / 1e6).toFixed(1)) + "M";
  if (n >= 1e3) return Math.round(n / 1e3) + "K";
  return String(n);
}
function fmtDate(sec?: number): string {
  if (!sec) return "—";
  return new Date(sec * 1000).toISOString().slice(0, 10);
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

const MOD: Record<string, [string, string]> = {
  text: ["T", "mod-t"],
  image: ["I", "mod-i"],
  file: ["F", "mod-f"],
  audio: ["A", "mod-a"],
  video: ["V", "mod-a"],
  embeddings: ["E", "mod-f"],
};
function ModList({ mods }: { mods: string[] }) {
  return (
    <>
      {mods.map((x) => {
        const [ch, cls] = MOD[x] ?? [x.slice(0, 1).toUpperCase(), "mod-t"];
        return (
          <span className={cls} key={x} title={x}>
            {ch}
          </span>
        );
      })}
    </>
  );
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

const ADDED_RANGES: { k: string; label: string; days: number }[] = [
  { k: "7d", label: "7d", days: 7 },
  { k: "30d", label: "30d", days: 30 },
  { k: "90d", label: "90d", days: 90 },
  { k: "1y", label: "1y", days: 365 },
];

// price bands on input price ($/M); "auto" (negative) never matches a band
const PRICE_BANDS: { k: string; label: string; test: (p: number) => boolean }[] = [
  { k: "free", label: "free", test: (p) => p === 0 },
  { k: "lt1", label: "<$1", test: (p) => p > 0 && p < 1 },
  { k: "1-5", label: "$1–5", test: (p) => p >= 1 && p < 5 },
  { k: "5-15", label: "$5–15", test: (p) => p >= 5 && p < 15 },
  { k: "15+", label: "$15+", test: (p) => p >= 15 },
];

// derived row for fast filter/sort
interface Row {
  m: Model;
  s: string;
  author: string;
  in: string[];
  out: string[];
  ctx: number;
  inP: number;
  outP: number;
  free: boolean;
  tools: boolean;
  reasoning: boolean;
  structured: boolean;
  vision: boolean;
  iq: number | null;
  bench: boolean;
  created: number;
}

// market leaders shown first (curated prominence order); the rest fall back to model-count desc
const POPULAR_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "qwen",
  "deepseek",
  "x-ai",
  "meta-llama",
  "mistralai",
  "moonshotai",
  "microsoft",
  "amazon",
  "nvidia",
  "cohere",
];
const PROV_RANK = new Map(POPULAR_PROVIDERS.map((p, i) => [p, i]));

type SortKey = "created" | "ctx" | "in" | "out" | "iq" | "name";
const SORT_DEFAULT_ASC: Record<SortKey, boolean> = {
  created: false,
  ctx: false,
  in: true,
  out: true,
  iq: false,
  name: true,
};

export default function Llms({ loaderData, actionData }: Route.ComponentProps) {
  const active =
    actionData && actionData.ok ? actionData.snapshot : loaderData.snapshot;
  const models = active?.data ?? [];
  const syncedAt = active?.syncedAt;
  const syncErr = actionData && !actionData.ok ? actionData.error : null;

  const nav = useNavigation();
  const syncing = nav.state === "submitting";

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ---- filters / state ----
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query).trim().toLowerCase();
  // "-term" excludes; bare term includes (AND). only include-terms get highlighted
  const { inc, exc } = useMemo(() => parseFilterTerms(q), [q]);
  const [outSel, setOutSel] = useState<Set<string>>(new Set());
  const [inSel, setInSel] = useState<Set<string>>(new Set());
  const [caps, setCaps] = useState<Set<string>>(new Set());
  const [price, setPrice] = useState("all");
  const [benchOnly, setBenchOnly] = useState(false);
  const [added, setAdded] = useState("all");
  const [provSel, setProvSel] = useState<Set<string>>(new Set());
  const [provQ, setProvQ] = useState("");
  const provTerms = useMemo(() => parseFilterTerms(provQ), [provQ]);
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [asc, setAsc] = useState(false);
  const [sel, setSel] = useState<Model | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);

  // ---- derived rows (once per snapshot) ----
  const rows = useMemo<Row[]>(
    () =>
      models.map((m) => {
        const a = m.architecture ?? {};
        const inM = a.input_modalities ?? [];
        const outM = a.output_modalities ?? [];
        const sp = m.supported_parameters ?? [];
        const inP = perM(m.pricing?.prompt) ?? 0;
        const outP = perM(m.pricing?.completion) ?? 0;
        return {
          m,
          s: `${m.id} ${m.name} ${m.description ?? ""}`.toLowerCase(),
          author: m.id.split("/")[0].replace(/^~/, ""),
          in: inM,
          out: outM,
          ctx: m.context_length || m.top_provider?.context_length || 0,
          inP,
          outP,
          free: inP === 0 && outP === 0,
          tools: sp.includes("tools"),
          reasoning: sp.includes("reasoning") || !!m.reasoning,
          structured: sp.includes("structured_outputs"),
          vision: inM.includes("image"),
          iq: m.benchmarks?.artificial_analysis?.intelligence_index ?? null,
          bench: !!m.benchmarks,
          created: m.created ?? 0,
        };
      }),
    [models],
  );

  // ---- facet options + counts ----
  const facets = useMemo(() => {
    const out = new Map<string, number>();
    const inp = new Map<string, number>();
    const provs = new Map<string, number>();
    const bump = (map: Map<string, number>, k: string) =>
      map.set(k, (map.get(k) ?? 0) + 1);
    for (const r of rows) {
      for (const x of new Set(r.out)) bump(out, x);
      for (const x of new Set(r.in)) bump(inp, x);
      bump(provs, r.author);
    }
    return {
      out: [...out].sort((a, b) => b[1] - a[1]),
      in: [...inp].sort((a, b) => b[1] - a[1]),
      provs: [...provs].sort((a, b) => {
        const ra = PROV_RANK.get(a[0]) ?? Infinity;
        const rb = PROV_RANK.get(b[0]) ?? Infinity;
        if (ra !== rb) return ra - rb; // popular first, in curated order
        if (b[1] !== a[1]) return b[1] - a[1]; // then by model count desc
        return a[0].localeCompare(b[0]);
      }),
    };
  }, [rows]);

  // ---- filter + sort ----
  const view = useMemo(() => {
    const dir = asc ? 1 : -1;
    // cutoff computed only when a range is picked → Date.now() never runs during SSR (default "all")
    let cutoff = 0;
    if (added !== "all") {
      const days = ADDED_RANGES.find((r) => r.k === added)?.days ?? 0;
      cutoff = Date.now() / 1000 - days * 86400;
    }
    const list = rows.filter((r) => {
      if (inc.length && !inc.every((t) => r.s.includes(t))) return false;
      if (exc.length && exc.some((t) => r.s.includes(t))) return false;
      if (cutoff && r.created < cutoff) return false;
      if (outSel.size && !r.out.some((x) => outSel.has(x))) return false;
      if (inSel.size && !r.in.some((x) => inSel.has(x))) return false;
      if (caps.has("tools") && !r.tools) return false;
      if (caps.has("reasoning") && !r.reasoning) return false;
      if (caps.has("structured") && !r.structured) return false;
      if (price !== "all") {
        const band = PRICE_BANDS.find((b) => b.k === price);
        if (band && !band.test(r.inP)) return false;
      }
      if (benchOnly && !r.bench) return false;
      if (provSel.size && !provSel.has(r.author)) return false;
      return true;
    });
    list.sort((a, b) => {
      if (sortKey === "name") return dir * a.m.name.localeCompare(b.m.name);
      if (sortKey === "iq") {
        if (a.iq == null && b.iq == null) return 0;
        if (a.iq == null) return 1; // missing always last
        if (b.iq == null) return -1;
        return dir * (a.iq - b.iq);
      }
      if (sortKey === "in" || sortKey === "out") {
        const av = sortKey === "in" ? a.inP : a.outP;
        const bv = sortKey === "in" ? b.inP : b.outP;
        // "Auto" (sentinel negative) has no real price → always last, both directions
        if (av < 0 && bv < 0) return 0;
        if (av < 0) return 1;
        if (bv < 0) return -1;
        return dir * (av - bv);
      }
      const av = sortKey === "ctx" ? a.ctx : a.created;
      const bv = sortKey === "ctx" ? b.ctx : b.created;
      return dir * (av - bv);
    });
    return list;
  }, [rows, inc, exc, outSel, inSel, caps, price, benchOnly, added, provSel, sortKey, asc]);

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
  // merged price column: one header, 4-state cycle in↑ → in↓ → out↑ → out↓
  const cyclePrice = () => {
    if (sortKey === "in" && asc) setAsc(false);
    else if (sortKey === "in") {
      setSortKey("out");
      setAsc(true);
    } else if (sortKey === "out" && asc) setAsc(false);
    else {
      setSortKey("in");
      setAsc(true);
    }
  };
  const hasFilters =
    !!q ||
    outSel.size > 0 ||
    inSel.size > 0 ||
    caps.size > 0 ||
    price !== "all" ||
    benchOnly ||
    added !== "all" ||
    provSel.size > 0;
  const resetAll = () => {
    setQuery("");
    setOutSel(new Set());
    setInSel(new Set());
    setCaps(new Set());
    setPrice("all");
    setBenchOnly(false);
    setAdded("all");
    setProvSel(new Set());
    setProvQ("");
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
          <b>LLMs</b>
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
            placeholder="Search…  e.g.  gpt -mini  (- excludes)"
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
          {syncedAt && mounted ? (
            <span className="synced">Updated {fmtRel(syncedAt, Date.now())}</span>
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
          <FilterGroup title="Output" onClear={outSel.size ? () => setOutSel(new Set()) : undefined}>
            {facets.out.map(([k, n]) => (
              <Chip key={k} on={outSel.has(k)} n={n} onClick={() => toggle(outSel, k, setOutSel)}>
                {k}
              </Chip>
            ))}
          </FilterGroup>

          <FilterGroup title="Input" onClear={inSel.size ? () => setInSel(new Set()) : undefined}>
            {facets.in.map(([k, n]) => (
              <Chip key={k} on={inSel.has(k)} n={n} onClick={() => toggle(inSel, k, setInSel)}>
                {k}
              </Chip>
            ))}
          </FilterGroup>

          <FilterGroup title="Capabilities" onClear={caps.size ? () => setCaps(new Set()) : undefined}>
            <Chip on={caps.has("tools")} onClick={() => toggle(caps, "tools", setCaps)}>tools</Chip>
            <Chip on={caps.has("reasoning")} onClick={() => toggle(caps, "reasoning", setCaps)}>reasoning</Chip>
            <Chip on={caps.has("structured")} onClick={() => toggle(caps, "structured", setCaps)}>structured</Chip>
          </FilterGroup>

          <FilterGroup title="Price · in $/M">
            <Chip on={price === "all"} onClick={() => setPrice("all")}>any</Chip>
            {PRICE_BANDS.map((b) => (
              <Chip key={b.k} on={price === b.k} onClick={() => setPrice(b.k)}>{b.label}</Chip>
            ))}
          </FilterGroup>

          <FilterGroup title="Added">
            <Chip on={added === "all"} onClick={() => setAdded("all")}>any</Chip>
            {ADDED_RANGES.map((r) => (
              <Chip key={r.k} on={added === r.k} onClick={() => setAdded(r.k)}>{r.label}</Chip>
            ))}
          </FilterGroup>

          <FilterGroup title="Benchmarks">
            <Chip on={benchOnly} onClick={() => setBenchOnly((v) => !v)}>has benchmarks</Chip>
          </FilterGroup>

          <div className="fgroup">
            <div className="fgroup-h">
              <span>Provider {provSel.size ? `· ${provSel.size}` : `(${facets.provs.length})`}</span>
              {provSel.size ? <button onClick={() => setProvSel(new Set())}>clear</button> : null}
            </div>
            <input
              className="fsearch"
              value={provQ}
              onChange={(e) => setProvQ(e.target.value)}
              placeholder="Filter providers…  -term excludes"
              spellCheck={false}
              autoComplete="off"
            />
            <div className="plist">
              {facets.provs
                .filter(([k]) => matchesFilterTerms(k, provTerms))
                .map(([k, n]) => (
                  <button
                    key={k}
                    className={"prow" + (provSel.has(k) ? " on" : "")}
                    onClick={() => toggle(provSel, k, setProvSel)}
                    title={k}
                  >
                    <span className="pcheck" aria-hidden>
                      {provSel.has(k) ? (
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
                  <p>Click <b>Sync</b> to pull the latest models from OpenRouter.</p>
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
                  <th>Modality</th>
                  <th className="num sortable" onClick={() => clickSort("ctx")}>Context <Arrow k="ctx" /></th>
                  <th className="num sortable" onClick={cyclePrice} title="USD per 1M tokens — click cycles input ↑/↓ then output ↑/↓">
                    In&nbsp;/&nbsp;Out&nbsp;$/M
                    {sortKey === "in" || sortKey === "out" ? (
                      <span className="arrow">{sortKey === "in" ? "in" : "out"}{asc ? "↑" : "↓"}</span>
                    ) : null}
                  </th>
                  <th>Caps</th>
                  <th className="num sortable" onClick={() => clickSort("iq")} title="Artificial Analysis intelligence index">Intel <Arrow k="iq" /></th>
                  <th className="num sortable" onClick={() => clickSort("created")}>Added <Arrow k="created" /></th>
                </tr>
              </thead>
              <tbody>
                {view.map((r) => (
                  <tr
                    key={r.m.id}
                    className={sel?.id === r.m.id ? "sel" : ""}
                    onClick={() => setSel(r.m)}
                  >
                    <td>
                      <div className="m-name" title={r.m.name}>
                        <Highlight text={r.m.name} tokens={inc} />
                      </div>
                      <div className="m-id" title={r.m.id}>
                        <Highlight text={r.m.id} tokens={inc} />
                      </div>
                    </td>
                    <td>
                      <span className="mods">
                        <ModList mods={r.in} />
                        <span className="arr">→</span>
                        <ModList mods={r.out} />
                      </span>
                    </td>
                    <td className="num">{fmtCtx(r.ctx)}</td>
                    <td className="num">
                      {r.free ? (
                        <span className="price-free">Free</span>
                      ) : r.inP < 0 && r.outP < 0 ? (
                        <span className="dash">Auto</span>
                      ) : (
                        <span className="price-io">
                          {r.inP < 0 ? "Auto" : `$${money(r.inP)}`}
                          <span className="sep">/</span>
                          {r.outP < 0 ? "Auto" : `$${money(r.outP)}`}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="caps">
                        {r.tools && <span className="cap cap-t" title="Tools / function calling">T</span>}
                        {r.reasoning && <span className="cap cap-r" title="Reasoning">R</span>}
                        {r.structured && <span className="cap cap-s" title="Structured outputs">S</span>}
                        {r.vision && <span className="cap cap-v" title="Vision (image input)">V</span>}
                      </span>
                    </td>
                    <td className="num">
                      {r.iq != null ? (
                        <span className={"iq " + (r.iq >= 50 ? "iq-hi" : r.iq >= 35 ? "iq-mid" : "")}>{r.iq}</span>
                      ) : (
                        <span className="dash">—</span>
                      )}
                    </td>
                    <td className="num" style={{ color: "var(--muted)" }}>{fmtDate(r.created)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </main>
        )}
      </div>

      {sel ? <Drawer m={sel} onClose={() => setSel(null)} /> : null}
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

const PRICE_ROWS: [string, string, "M" | "flat"][] = [
  ["prompt", "Input", "M"],
  ["completion", "Output", "M"],
  ["internal_reasoning", "Reasoning", "M"],
  ["input_cache_read", "Cache read", "M"],
  ["input_cache_write", "Cache write", "M"],
  ["request", "Per request", "flat"],
  ["image", "Per image", "flat"],
  ["web_search", "Web search", "flat"],
];

function priceCell(raw: any, unit: "M" | "flat"): string {
  const n = parseFloat(raw);
  if (!isFinite(n)) return "—";
  if (n < 0) return "Auto";
  if (n === 0) return "Free";
  if (unit === "M") return `$${money(n * 1e6)} /M`;
  return `$${trim((n).toFixed(5))}`;
}

function Drawer({ m, onClose }: { m: Model; onClose: () => void }) {
  const a = m.architecture ?? {};
  const tp = m.top_provider ?? {};
  const pr = m.pricing ?? {};
  const aa = m.benchmarks?.artificial_analysis;
  const arena = (m.benchmarks?.design_arena ?? [])
    .slice()
    .sort((x, y) => x.rank - y.rank)
    .slice(0, 8);
  const priceRows = PRICE_ROWS.filter(([k]) => k in pr);
  const overrides: any[] = Array.isArray(pr.overrides) ? pr.overrides : [];

  const copyId = () => navigator.clipboard?.writeText(m.id);

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="drawer" role="dialog" aria-label={m.name}>
        <div className="dw-head">
          <div className="dw-top">
            <div style={{ minWidth: 0 }}>
              <h2>{m.name}</h2>
              <div className="dw-id" onClick={copyId} title="Click to copy">
                {m.id}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                </svg>
              </div>
            </div>
            <button className="dw-close" onClick={onClose} title="Close (Esc)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div className="dw-links">
            <a href={`https://openrouter.ai/${m.id}`} target="_blank" rel="noreferrer">OpenRouter ↗</a>
            {m.hugging_face_id ? (
              <a href={`https://huggingface.co/${m.hugging_face_id}`} target="_blank" rel="noreferrer">Hugging Face ↗</a>
            ) : null}
          </div>
        </div>

        <div className="dw-body">
          {m.description ? <p className="dw-desc">{m.description}</p> : null}

          <Section title="Specs">
            <div className="facts">
              <Fact k="Context" v={fmtCtx(m.context_length)} />
              <Fact k="Max output" v={fmtCtx(tp.max_completion_tokens ?? undefined)} />
              <Fact k="Tokenizer" v={a.tokenizer ?? "—"} />
              <Fact k="Instruct" v={a.instruct_type ?? "—"} />
              <Fact k="Knowledge cutoff" v={m.knowledge_cutoff ?? "—"} />
              <Fact k="Added" v={fmtDate(m.created)} />
              <Fact k="Moderated" v={tp.is_moderated ? "yes" : "no"} />
              <Fact k="Expires" v={m.expiration_date ?? "—"} />
            </div>
          </Section>

          <Section title="Modalities">
            <div className="tags">
              {(a.input_modalities ?? []).map((x) => <span className="tag" key={"i" + x}>in: {x}</span>)}
              {(a.output_modalities ?? []).map((x) => <span className="tag" key={"o" + x}>out: {x}</span>)}
            </div>
          </Section>

          {priceRows.length ? (
            <Section title="Pricing (USD)">
              <table className="ptable">
                <tbody>
                  {priceRows.map(([k, label, unit]) => (
                    <tr key={k}>
                      <td>{label}</td>
                      <td>{priceCell(pr[k], unit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {overrides.map((o, i) => (
                <div className="ov" key={i}>
                  {o.min_prompt_tokens != null
                    ? `Above ${fmtCtx(o.min_prompt_tokens)} prompt tokens: `
                    : o.utc_start != null
                      ? `UTC ${String(o.utc_start).padStart(4, "0")}–${String(o.utc_end).padStart(4, "0")}: `
                      : "Override: "}
                  {o.prompt != null ? <>in <b>${money((parseFloat(o.prompt) || 0) * 1e6)}/M</b> </> : null}
                  {o.completion != null ? <>out <b>${money((parseFloat(o.completion) || 0) * 1e6)}/M</b></> : null}
                </div>
              ))}
            </Section>
          ) : null}

          {aa ? (
            <Section title="Artificial Analysis">
              <div className="bench-grid">
                {aa.intelligence_index != null ? <Bench k="Intelligence" v={aa.intelligence_index} /> : null}
                {aa.coding_index != null ? <Bench k="Coding" v={aa.coding_index} /> : null}
                {aa.agentic_index != null ? <Bench k="Agentic" v={aa.agentic_index} /> : null}
              </div>
            </Section>
          ) : null}

          {arena.length ? (
            <Section title="Design Arena (top ranks)">
              <div className="arena">
                {arena.map((b, i) => (
                  <span className="arena-item" key={i}>
                    {b.arena}/{b.category} <b>#{b.rank}</b> · {b.elo}
                  </span>
                ))}
              </div>
            </Section>
          ) : null}

          {m.reasoning ? (
            <Section title="Reasoning">
              <div className="tags">
                <span className="tag">{m.reasoning.mandatory ? "mandatory" : "optional"}</span>
                {m.reasoning.default_effort ? <span className="tag">default: {m.reasoning.default_effort}</span> : null}
                {(m.reasoning.supported_efforts ?? []).map((e) => <span className="tag" key={e}>{e}</span>)}
              </div>
            </Section>
          ) : null}

          {m.supported_parameters?.length ? (
            <Section title="Supported parameters">
              <div className="tags">
                {m.supported_parameters.map((p) => <span className="tag" key={p}>{p}</span>)}
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
function Bench({ k, v }: { k: string; v: number }) {
  return (
    <div className="bench">
      <div className="bench-v">{v}</div>
      <div className="bench-k">{k}</div>
    </div>
  );
}
