import { Link } from "react-router";
import type { Route } from "./+types/home";
import pkg from "../../package.json";

export function meta() {
  return [{ title: "jj-ai" }];
}

export function loader() {
  return { version: pkg.version };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <div className="home">
      <div className="home-inner">
        <div className="home-brand">
          <div className="home-mark">jj</div>
          <h1>jj-ai</h1>
          <span className="home-ver">v{loaderData.version}</span>
        </div>
        <p className="home-sub">AI 数据聚合展示站 · 直连开源 API</p>

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
    </div>
  );
}
