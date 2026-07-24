import { useEffect, useState } from "react";
import { Form, Link, useFetcher, useNavigation } from "react-router";
import type { Route } from "./+types/home";
import pkg from "../../package.json";

export function meta() {
  return [{ title: "jj-ai" }];
}

// ============ bookmarks (server-side, Cloudflare KV) ============
// 站点无认证 -> KV 单键 `bookmarks` 是「站点主人」的一份全局清单:
// 任何访客都能读 / 增 / 删, 没有按访客的隔离 (无认证下 KV 做不到私有)。
// 个人聚合面板可接受; 若将来需要按访客私有, 必须改回客户端 localStorage。
interface Bookmark {
  id: string;
  title: string;
  url: string;
  color: string;
  createdAt: number; // ms epoch, 用于"按添加时间"排序
  clicks: number; // 点击计数, 用于"按频率"排序
}

const BM_KEY = "bookmarks";
// title 里做标注即可, 颜色只用于快速区分, 固定 6 色板
const PALETTE = ["#7c8bff", "#4ade80", "#fbbf24", "#c084fc", "#2dd4bf", "#f87171"];
const TAG_RE = /#[^\s#]+/g;

function normalizeUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  // 剥离任何其它 scheme (javascript: / data: ...) 再强制 https, 防 href 注入
  return "https://" + t.replace(/^[a-z][a-z0-9+.-]*:\/*/i, "");
}

function pickColor(c: string): string {
  return PALETTE.includes(c) ? c : PALETTE[0];
}

// 约定: title 里的 #xx 即标签 (跟随用户已有习惯)
function parseTags(title: string): string[] {
  const m = title.match(TAG_RE);
  return m ? Array.from(new Set(m.map((t) => t.slice(1).toLowerCase()))) : [];
}
function stripTags(title: string): string {
  return title.replace(TAG_RE, "").replace(/\s+/g, " ").trim();
}
function monogram(title: string): string {
  const c = (stripTags(title) || title.trim())[0];
  return c ? c.toUpperCase() : "•";
}

// 兼容旧数据: 补齐 createdAt / clicks 缺省值
function normalize(b: any): Bookmark {
  return {
    id: String(b?.id ?? ""),
    title: String(b?.title ?? ""),
    url: String(b?.url ?? ""),
    color: pickColor(String(b?.color ?? "")),
    createdAt: typeof b?.createdAt === "number" ? b.createdAt : 0,
    clicks: typeof b?.clicks === "number" ? b.clicks : 0,
  };
}

// ============ loader / action ============
async function readList(kv: KVNamespace): Promise<Bookmark[]> {
  const raw = await kv.get<unknown[]>(BM_KEY, "json");
  return Array.isArray(raw) ? raw.map(normalize).filter((b) => b.id) : [];
}

export async function loader({ context }: Route.LoaderArgs) {
  const bookmarks = await readList(context.cloudflare.env.MODELS_KV);
  return { version: pkg.version, bookmarks };
}

export async function action({ request, context }: Route.ActionArgs) {
  const kv = context.cloudflare.env.MODELS_KV;
  const form = await request.formData();
  const op = String(form.get("_action") ?? "");
  const list = await readList(kv);

  let next = list;
  if (op === "add") {
    const title = String(form.get("title") ?? "").trim().slice(0, 80);
    const url = normalizeUrl(String(form.get("url") ?? ""));
    const color = pickColor(String(form.get("color") ?? ""));
    if (title && url)
      next = [
        ...list,
        { id: crypto.randomUUID(), title, url, color, createdAt: Date.now(), clicks: 0 },
      ];
  } else if (op === "edit") {
    const id = String(form.get("id") ?? "");
    const title = String(form.get("title") ?? "").trim().slice(0, 80);
    const url = normalizeUrl(String(form.get("url") ?? ""));
    const color = pickColor(String(form.get("color") ?? ""));
    if (id && title && url)
      next = list.map((b) => (b.id === id ? { ...b, title, url, color } : b));
  } else if (op === "delete") {
    const id = String(form.get("id") ?? "");
    next = list.filter((b) => b.id !== id);
  } else if (op === "reorder") {
    const ids = String(form.get("ids") ?? "").split(",").filter(Boolean);
    const byId = new Map(list.map((b) => [b.id, b]));
    const seen = new Set(ids);
    next = ids.map((id) => byId.get(id)).filter((b): b is Bookmark => !!b);
    // 补齐 ids 未覆盖的项 (并发下防丢失)
    for (const b of list) if (!seen.has(b.id)) next.push(b);
  } else if (op === "click") {
    const id = String(form.get("id") ?? "");
    next = list.map((b) => (b.id === id ? { ...b, clicks: b.clicks + 1 } : b));
  }

  // 整表覆盖; 数据量 < 50, 无并发写压力
  await kv.put(BM_KEY, JSON.stringify(next));
  return { bookmarks: next };
}

// ============ color picker (client state -> hidden input) ============
function ColorPicker({ initial }: { initial: string }) {
  const [color, setColor] = useState(initial);
  return (
    <>
      <input type="hidden" name="color" value={color} />
      <div className="bm-swatches">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            className={"bm-sw" + (color === c ? " on" : "")}
            style={{ background: c }}
            onClick={() => setColor(c)}
            aria-label={c}
            title={c}
          />
        ))}
      </div>
    </>
  );
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// title 里的 #标签独立展示, 名称完整换行
function BmContent({ item }: { item: Bookmark }) {
  const name = stripTags(item.title) || item.title.trim();
  const tags = parseTags(item.title);
  const host = hostname(item.url);
  const showHost = host && host.toLowerCase() !== name.toLowerCase();
  return (
    <span className="bm-content">
      <span className="bm-name">{name}</span>
      <span className="bm-meta">
        {showHost && <span className="bm-host">{host}</span>}
        {tags.map((tag) => (
          <span key={tag} className="bm-tag-inline">
            #{tag}
          </span>
        ))}
        <span className="bm-count">{item.clicks} 次</span>
      </span>
    </span>
  );
}

type SortMode = "manual" | "recent" | "clicks";
const SORTS: [SortMode, string][] = [
  ["clicks", "高频"],
  ["recent", "最近"],
  ["manual", "手动"],
];

// ============ bookmarks section ============
function Bookmarks({ items }: { items: Bookmark[] }) {
  const nav = useNavigation();
  const reorderFetcher = useFetcher();
  const clickFetcher = useFetcher();
  const busy = nav.state !== "idle";

  // open: null = 无表单, "new" = 新增, 其它 = 正在编辑该 id
  const [open, setOpen] = useState<string | null>(null);
  const editing = open && open !== "new" ? items.find((b) => b.id === open) : null;
  const [sort, setSort] = useState<SortMode>("clicks"); // 默认高频: 最常点击置前
  const [tag, setTag] = useState<string | null>(null);
  // 本地手动顺序 (拖拽即时反馈); 成员集不变时保留本地序, 防 KV 最终一致性回弹
  const [order, setOrder] = useState<Bookmark[]>(items);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    setOrder((prev) => {
      const same =
        prev.length === items.length && prev.every((b) => items.some((x) => x.id === b.id));
      return same ? prev.map((b) => items.find((x) => x.id === b.id) ?? b) : items;
    });
  }, [items]);

  // 提交完成 (submitting -> idle) 后自动收起表单; required 保证不会提交空值
  useEffect(() => {
    if (nav.state === "idle") setOpen(null);
  }, [nav.state]);

  const tags = Array.from(new Set(items.flatMap((b) => parseTags(b.title)))).sort();
  const activeTag = tag && tags.includes(tag) ? tag : null;

  const filtered = activeTag
    ? order.filter((b) => parseTags(b.title).includes(activeTag))
    : order;
  const view =
    sort === "recent"
      ? [...filtered].sort((a, b) => b.createdAt - a.createdAt)
      : sort === "clicks"
        ? [...filtered].sort((a, b) => b.clicks - a.clicks || b.createdAt - a.createdAt)
        : filtered;
  // 拖拽仅在手动排序且未筛选标签时可用 (筛选子集重排语义不清)
  const canDrag = sort === "manual" && !activeTag;

  function reorder(from: string, to: string) {
    if (from === to) return;
    const i = order.findIndex((b) => b.id === from);
    const j = order.findIndex((b) => b.id === to);
    if (i < 0 || j < 0) return;
    const nextOrder = order.slice();
    const [moved] = nextOrder.splice(i, 1);
    nextOrder.splice(j, 0, moved);
    setOrder(nextOrder);
    reorderFetcher.submit(
      { _action: "reorder", ids: nextOrder.map((b) => b.id).join(",") },
      { method: "post" },
    );
  }

  return (
    <section className="bm">
      <div className="bm-head">
        <span className="bm-title">Bookmarks</span>
        <div className="bm-tools">
          {items.length > 0 && (
            <div className="bm-sort" role="group" aria-label="排序方式">
              {SORTS.map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  className={"bm-sort-b" + (sort === k ? " on" : "")}
                  onClick={() => setSort(k)}
                  aria-pressed={sort === k}
                  title={k === "manual" ? "手动拖拽排序" : k === "recent" ? "按添加时间" : "按点击频率"}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <button className="bm-add" type="button" onClick={() => setOpen("new")} title="添加">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            添加
          </button>
        </div>
      </div>

      {tags.length > 0 && (
        <div className="bm-tags">
          <button
            type="button"
            className={"bm-tag" + (activeTag === null ? " on" : "")}
            onClick={() => setTag(null)}
            aria-pressed={activeTag === null}
          >
            全部
          </button>
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              className={"bm-tag" + (activeTag === t ? " on" : "")}
              onClick={() => setTag(activeTag === t ? null : t)}
              aria-pressed={activeTag === t}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      {open && (
        <Form method="post" className="bm-form" key={open}>
          <input type="hidden" name="_action" value={open === "new" ? "add" : "edit"} />
          {open !== "new" && <input type="hidden" name="id" value={open} />}
          <input
            className="bm-in"
            name="title"
            required
            maxLength={80}
            autoFocus
            placeholder="名称（可加 #标签，如 #模型 together.ai）"
            defaultValue={editing?.title ?? ""}
          />
          <input
            className="bm-in"
            name="url"
            required
            maxLength={2048}
            placeholder="https://…"
            defaultValue={editing?.url ?? ""}
          />
          <ColorPicker initial={editing?.color ?? PALETTE[0]} />
          <div className="bm-form-act">
            <button className="btn btn-accent" type="submit" disabled={busy}>
              保存
            </button>
            <button className="btn" type="button" onClick={() => setOpen(null)}>
              取消
            </button>
          </div>
        </Form>
      )}

      {items.length === 0 && !open ? (
        <button className="bm-empty" type="button" onClick={() => setOpen("new")}>
          还没有 bookmark，点击添加常用入口
        </button>
      ) : (
        <div className="bm-grid">
          {view.map((b) => (
            <div
              className={
                "bm-cell" +
                (canDrag ? " can-drag" : "") +
                (dragId === b.id ? " dragging" : "")
              }
              key={b.id}
              onDragOver={canDrag ? (e) => e.preventDefault() : undefined}
              onDrop={
                canDrag
                  ? (e) => {
                      e.preventDefault();
                      if (dragId) reorder(dragId, b.id);
                      setDragId(null);
                    }
                  : undefined
              }
            >
              {canDrag && (
                <span
                  className="bm-drag"
                  style={{ background: b.color }}
                  draggable
                  title="拖拽排序"
                  onDragStart={(e) => {
                    setDragId(b.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => setDragId(null)}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
                    <circle cx="4" cy="3" r="1" />
                    <circle cx="10" cy="3" r="1" />
                    <circle cx="4" cy="7" r="1" />
                    <circle cx="10" cy="7" r="1" />
                    <circle cx="4" cy="11" r="1" />
                    <circle cx="10" cy="11" r="1" />
                  </svg>
                </span>
              )}
              <a
                className="bm-card"
                href={b.url}
                target="_blank"
                rel="noreferrer"
                title={`${b.title}\n${b.url}`}
                draggable={false}
                onClick={() => clickFetcher.submit({ _action: "click", id: b.id }, { method: "post" })}
              >
                <span className="bm-mark" style={{ background: b.color }}>
                  {monogram(b.title)}
                </span>
                <BmContent item={b} />
              </a>
              <div className="bm-ops">
                <button className="bm-op" type="button" onClick={() => setOpen(b.id)} title="编辑" aria-label="编辑">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                  </svg>
                </button>
                <Form
                  method="post"
                  style={{ display: "contents" }}
                  onSubmit={(e) => {
                    if (!confirm("删除这个 bookmark?")) e.preventDefault();
                  }}
                >
                  <input type="hidden" name="_action" value="delete" />
                  <input type="hidden" name="id" value={b.id} />
                  <button className="bm-op" type="submit" title="删除" aria-label="删除" disabled={busy}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </Form>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Home({ loaderData }: Route.ComponentProps) {
  // 单一数据源 = loaderData: 每次 Form / fetcher 变更后 RR 都会重新校验 loader,
  // 故点击计数 / 拖拽后的最新顺序都会刷新 (不用 actionData, 否则 fetcher 变更不回填会固化旧值)
  const bookmarks = loaderData.bookmarks;
  return (
    <div className="home">
      <div className="home-inner">
        <header className="home-header">
          <div className="home-brand">
            <div className="home-mark">jj</div>
            <div>
              <div className="home-name">
                <h1>jj-ai</h1>
                <span className="home-ver">v{loaderData.version}</span>
              </div>
              <p className="home-sub">AI 数据聚合展示站 · 直连开源 API</p>
            </div>
          </div>
        </header>

        <div className="home-layout">
          <Bookmarks items={bookmarks} />

          <section className="home-apps">
            <div className="home-apps-head">
              <span className="home-apps-title">Explore</span>
              <span className="home-apps-count">2 个应用</span>
            </div>
            <div className="home-cards">
              <Link to="/llms" className="card">
                <div className="card-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                </div>
                <div className="card-body">
                  <div className="card-title">LLMs</div>
                  <div className="card-desc">检索、过滤、对比 400+ 大模型的能力与定价</div>
                </div>
                <svg className="card-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>

              <Link to="/modelfit" className="card">
                <div className="card-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                    <rect x="9" y="9" width="6" height="6" rx="1" />
                    <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" />
                  </svg>
                </div>
                <div className="card-body">
                  <div className="card-title">ModelFit</div>
                  <div className="card-desc">按内存反查能本地部署的开源模型 + Ollama 配置</div>
                </div>
                <svg className="card-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
