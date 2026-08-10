"use client";

import { Bell, ChevronDown, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { modes } from "@/lib/data/catalog";
import { parseOptionalNumber } from "@/lib/model-catalog/filters";
import { modelDetailPath } from "@/lib/model-catalog/paths";
import type {
  ModelCatalogFilters,
  ModelCatalogSummary,
} from "@/lib/model-catalog/types";
import { modeHref } from "@/lib/seo";
import { ThemeToggle } from "./theme-toggle";
import { SubscriptionSheet } from "./subscription-sheet";

type SortKey = NonNullable<ModelCatalogFilters["sort"]>;

function formatTokens(value?: number) {
  if (value === undefined) return "—";
  return value >= 1_000_000
    ? `${Number((value / 1_000_000).toFixed(1))}M`
    : value >= 1_000
      ? `${Number((value / 1_000).toFixed(1))}K`
      : String(value);
}

function formatPrice(value?: number) {
  return value === undefined
    ? "—"
    : `$${value.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
}

function compareOptional(
  a: number | undefined,
  b: number | undefined,
  direction: "asc" | "desc",
) {
  if (a === undefined) return b === undefined ? 0 : 1;
  if (b === undefined) return -1;
  return (a - b) * (direction === "asc" ? 1 : -1);
}

export function ModelCatalogExplorer({
  models,
  initialFilters,
}: {
  models: ModelCatalogSummary[];
  initialFilters: ModelCatalogFilters;
}) {
  const router = useRouter();
  const [filters, setFilters] = useState(initialFilters);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const labs = useMemo(
    () =>
      [
        ...new Map(
          models.map((model) => [model.labId, model.labName]),
        ).entries(),
      ].sort((a, b) => a[1].localeCompare(b[1])),
    [models],
  );
  const providers = useMemo(
    () =>
      [
        ...new Map(
          models.flatMap((model) =>
            model.providerIds.map(
              (id, index) => [id, model.providerNames[index] ?? id] as const,
            ),
          ),
        ).entries(),
      ].sort((a, b) => a[1].localeCompare(b[1])),
    [models],
  );
  const modalities = useMemo(
    () => [...new Set(models.flatMap((model) => model.inputModalities))].sort(),
    [models],
  );

  function commit(next: ModelCatalogFilters) {
    setFilters(next);
    const params = new URLSearchParams();
    if (next.query) params.set("q", next.query);
    if (next.labs?.length) params.set("lab", next.labs.join(","));
    if (next.providers?.length)
      params.set("provider", next.providers.join(","));
    if (next.contextMin !== undefined)
      params.set("contextMin", String(next.contextMin));
    if (next.outputMin !== undefined)
      params.set("outputMin", String(next.outputMin));
    if (next.inputModalities?.length)
      params.set("input", next.inputModalities.join(","));
    if (next.inputPriceMax !== undefined)
      params.set("inputPriceMax", String(next.inputPriceMax));
    if (next.outputPriceMax !== undefined)
      params.set("outputPriceMax", String(next.outputPriceMax));
    if (next.releaseFrom) params.set("releaseFrom", next.releaseFrom);
    if (next.releaseTo) params.set("releaseTo", next.releaseTo);
    if (next.updatedFrom) params.set("updatedFrom", next.updatedFrom);
    if (next.updatedTo) params.set("updatedTo", next.updatedTo);
    if (next.sort && next.sort !== "release") params.set("sort", next.sort);
    if (next.direction && next.direction !== "desc")
      params.set("direction", next.direction);
    router.replace(`/api-pricing${params.size ? `?${params}` : ""}`, {
      scroll: false,
    });
  }

  const visible = useMemo(
    () =>
      models
        .filter((model) => {
          const query = filters.query?.trim().toLowerCase();
          if (
            query &&
            !`${model.name} ${model.id} ${model.labName} ${model.description ?? ""}`
              .toLowerCase()
              .includes(query)
          )
            return false;
          if (filters.labs?.length && !filters.labs.includes(model.labId))
            return false;
          if (
            filters.providers?.length &&
            !filters.providers.some((id) => model.providerIds.includes(id))
          )
            return false;
          if (
            filters.contextMin !== undefined &&
            (model.context ?? -1) < filters.contextMin
          )
            return false;
          if (
            filters.outputMin !== undefined &&
            (model.output ?? -1) < filters.outputMin
          )
            return false;
          if (
            filters.inputModalities?.length &&
            !filters.inputModalities.every((item) =>
              model.inputModalities.includes(item),
            )
          )
            return false;
          if (
            filters.inputPriceMax !== undefined &&
            (model.minInputPrice === undefined ||
              model.minInputPrice > filters.inputPriceMax)
          )
            return false;
          if (
            filters.outputPriceMax !== undefined &&
            (model.minOutputPrice === undefined ||
              model.minOutputPrice > filters.outputPriceMax)
          )
            return false;
          if (filters.releaseFrom && model.releaseDate < filters.releaseFrom)
            return false;
          if (filters.releaseTo && model.releaseDate > filters.releaseTo)
            return false;
          if (filters.updatedFrom && model.updatedDate < filters.updatedFrom)
            return false;
          if (filters.updatedTo && model.updatedDate > filters.updatedTo)
            return false;
          return true;
        })
        .sort((a, b) => {
          const direction = filters.direction ?? "desc";
          const sign = direction === "asc" ? 1 : -1;
          const sort = (filters.sort ?? "release") as SortKey;
          if (sort === "context" || sort === "output")
            return compareOptional(a[sort], b[sort], direction);
          if (sort === "price_input")
            return compareOptional(a.minInputPrice, b.minInputPrice, direction);
          if (sort === "price_output")
            return compareOptional(
              a.minOutputPrice,
              b.minOutputPrice,
              direction,
            );
          const left =
            sort === "model"
              ? a.name
              : sort === "lab"
                ? a.labName
                : sort === "input"
                  ? a.inputModalities.join(",")
                  : sort === "updated"
                    ? a.updatedDate
                    : a.releaseDate;
          const right =
            sort === "model"
              ? b.name
              : sort === "lab"
                ? b.labName
                : sort === "input"
                  ? b.inputModalities.join(",")
                  : sort === "updated"
                    ? b.updatedDate
                    : b.releaseDate;
          return left.localeCompare(right) * sign;
        }),
    [filters, models],
  );

  const activeFilterCount = [
    filters.query,
    filters.labs?.length,
    filters.providers?.length,
    filters.contextMin,
    filters.outputMin,
    filters.inputModalities?.length,
    filters.inputPriceMax,
    filters.outputPriceMax,
    filters.releaseFrom,
    filters.releaseTo,
    filters.updatedFrom,
    filters.updatedTo,
  ].filter((value) => value !== undefined && value !== "").length;
  const update = <K extends keyof ModelCatalogFilters>(
    key: K,
    value: ModelCatalogFilters[K],
  ) => commit({ ...filters, [key]: value });
  const sortBy = (sort: SortKey) =>
    commit({
      ...filters,
      sort,
      direction:
        filters.sort === sort
          ? filters.direction === "asc"
            ? "desc"
            : "asc"
          : sort === "model" || sort === "lab" || sort === "input"
            ? "asc"
            : "desc",
    });

  return (
    <div className="app-shell model-catalog-shell" data-hydrated="true">
      <a className="skip-link" href="#main-content">
        跳至主要内容
      </a>
      <header className="site-header">
        <Link href="/" className="brand" aria-label="Low Price Radar 首页">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
          </span>
          <span className="brand-copy">
            <strong>Low Price Radar</strong>
            <small>AI订阅全球比价</small>
          </span>
        </Link>
        <nav className="desktop-nav" aria-label="价格模式">
          {modes.map((mode) => (
            <Link
              key={mode.id}
              href={modeHref(mode.id)}
              className="nav-item pressable"
              data-mode={mode.id}
              aria-current={mode.id === "api" ? "page" : undefined}
              aria-label={mode.shortLabel}
            >
              {mode.id === "api" ? "API 模型" : mode.shortLabel}
              {mode.id === "api" ? (
                <span className="nav-label-compact" aria-hidden="true">
                  API 榜单
                </span>
              ) : null}
              {mode.id === "api" ? (
                <span className="nav-hot-badge" aria-hidden="true">
                  Hot
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <div className="sync-state" title="模型目录每 4 小时同步一次">
            <span className="sync-dot" />每 4 小时
          </div>
          <ThemeToggle />
        </div>
      </header>
      <main id="main-content" className="main-content model-catalog-main">
        <section
          className="model-catalog-heading"
          aria-labelledby="model-catalog-title"
        >
          <div>
            <p className="eyebrow">MODELS.DEV CATALOG</p>
            <h1 id="model-catalog-title">API 模型目录</h1>
            <p>比较模型规格与所有有效 provider 中的最低输入、输出价格。</p>
          </div>
          <button
            type="button"
            className="secondary-button pressable model-subscribe"
            onClick={() => setSheetOpen(true)}
          >
            <Bell size={16} />
            订阅新模型
          </button>
        </section>
        <section className="model-filter-bar" aria-label="模型筛选">
          <label className="model-search">
            <span>Model</span>
            <input
              type="search"
              value={filters.query ?? ""}
              onChange={(event) =>
                update("query", event.target.value || undefined)
              }
              placeholder="搜索名称或 ID"
            />
          </label>
          <label>
            <span>Lab</span>
            <select
              value={filters.labs?.[0] ?? ""}
              onChange={(event) =>
                update(
                  "labs",
                  event.target.value ? [event.target.value] : undefined,
                )
              }
            >
              <option value="">全部 Labs</option>
              {labs.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Provider</span>
            <select
              value={filters.providers?.[0] ?? ""}
              onChange={(event) =>
                update(
                  "providers",
                  event.target.value ? [event.target.value] : undefined,
                )
              }
            >
              <option value="">全部 Providers</option>
              {providers.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="filter-more-button pressable"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((open) => !open)}
          >
            <ChevronDown size={16} />
            更多筛选{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
          </button>
          {moreOpen ? (
            <div className="model-filter-more">
              <label>
                <span>Context 最小值</span>
                <input
                  type="number"
                  min="0"
                  value={filters.contextMin ?? ""}
                  onChange={(event) =>
                    update(
                      "contextMin",
                      parseOptionalNumber(event.target.value),
                    )
                  }
                />
              </label>
              <label>
                <span>Output 最小值</span>
                <input
                  type="number"
                  min="0"
                  value={filters.outputMin ?? ""}
                  onChange={(event) =>
                    update("outputMin", parseOptionalNumber(event.target.value))
                  }
                />
              </label>
              <label>
                <span>Input modality</span>
                <select
                  value={filters.inputModalities?.[0] ?? ""}
                  onChange={(event) =>
                    update(
                      "inputModalities",
                      event.target.value ? [event.target.value] : undefined,
                    )
                  }
                >
                  <option value="">全部模态</option>
                  {modalities.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>输入最高价</span>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={filters.inputPriceMax ?? ""}
                  onChange={(event) =>
                    update(
                      "inputPriceMax",
                      parseOptionalNumber(event.target.value),
                    )
                  }
                />
              </label>
              <label>
                <span>输出最高价</span>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={filters.outputPriceMax ?? ""}
                  onChange={(event) =>
                    update(
                      "outputPriceMax",
                      parseOptionalNumber(event.target.value),
                    )
                  }
                />
              </label>
              <label>
                <span>Release 起</span>
                <input
                  type="date"
                  value={filters.releaseFrom ?? ""}
                  onChange={(event) =>
                    update("releaseFrom", event.target.value || undefined)
                  }
                />
              </label>
              <label>
                <span>Release 止</span>
                <input
                  type="date"
                  value={filters.releaseTo ?? ""}
                  onChange={(event) =>
                    update("releaseTo", event.target.value || undefined)
                  }
                />
              </label>
              <label>
                <span>Updated 起</span>
                <input
                  type="date"
                  value={filters.updatedFrom ?? ""}
                  onChange={(event) =>
                    update("updatedFrom", event.target.value || undefined)
                  }
                />
              </label>
              <label>
                <span>Updated 止</span>
                <input
                  type="date"
                  value={filters.updatedTo ?? ""}
                  onChange={(event) =>
                    update("updatedTo", event.target.value || undefined)
                  }
                />
              </label>
            </div>
          ) : null}
        </section>
        <div className="model-results">
          <span>
            {visible.length} / {models.length} 个模型
          </span>
          {activeFilterCount > 0 ? (
            <button
              type="button"
              className="model-clear pressable"
              onClick={() => commit({ sort: "release", direction: "desc" })}
            >
              <RotateCcw size={14} />
              清除筛选
            </button>
          ) : null}
          <span className="model-source-note">
            价格：USD / 百万 tokens · 来源 models.dev
          </span>
        </div>
        <div
          className="model-table-scroll"
          tabIndex={0}
          aria-label="API 模型排行榜，可横向滚动"
        >
          <table className="model-catalog-table">
            <thead>
              <tr>
                {(
                  [
                    ["model", "Model"],
                    ["lab", "Lab"],
                    ["context", "Context"],
                    ["output", "Output"],
                    ["input", "Input"],
                    [
                      filters.sort === "price_output"
                        ? "price_output"
                        : "price_input",
                      "Price",
                    ],
                    ["release", "Release"],
                    ["updated", "Updated"],
                  ] as Array<[SortKey, string]>
                ).map(([key, label]) => (
                  <th key={label} scope="col">
                    <button
                      type="button"
                      onClick={() => sortBy(key)}
                      aria-label={`按 ${label} 排序`}
                    >
                      {label}
                      <span aria-hidden="true">
                        {filters.sort === key
                          ? filters.direction === "asc"
                            ? " ↑"
                            : " ↓"
                          : ""}
                      </span>
                    </button>
                    {label === "Price" ? (
                      <button
                        type="button"
                        className="price-sort-toggle"
                        onClick={() =>
                          sortBy(
                            filters.sort === "price_output"
                              ? "price_input"
                              : "price_output",
                          )
                        }
                      >
                        {filters.sort === "price_output" ? "按输出" : "按输入"}
                      </button>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((model) => (
                <tr key={model.id}>
                  <th scope="row">
                    <Link href={modelDetailPath(model.id)}>
                      <strong>{model.name}</strong>
                      <small>{model.id}</small>
                    </Link>
                  </th>
                  <td>{model.labName}</td>
                  <td>{formatTokens(model.context)}</td>
                  <td>{formatTokens(model.output)}</td>
                  <td>
                    {model.inputModalities.length
                      ? model.inputModalities.join(" · ")
                      : "—"}
                  </td>
                  <td className="model-price-cell">
                    <span>
                      <b>In</b> {formatPrice(model.minInputPrice)}
                      <small>{model.minInputProviderName ?? ""}</small>
                    </span>
                    <span>
                      <b>Out</b> {formatPrice(model.minOutputPrice)}
                      <small>{model.minOutputProviderName ?? ""}</small>
                    </span>
                  </td>
                  <td>{model.releaseDate}</td>
                  <td>{model.updatedDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 ? (
            <div className="model-empty">
              <strong>没有符合条件的模型</strong>
              <p>尝试放宽价格、日期或规格筛选。</p>
            </div>
          ) : null}
        </div>
      </main>
      <footer className="site-footer">
        <div>
          <strong>Low Price Radar</strong>
          <p>API 模型规格与社区聚合价格目录。</p>
        </div>
        <div className="footer-links">
          <Link href="/methodology">采集方法</Link>
          <Link href="/privacy">隐私</Link>
          <a
            href="https://github.com/anomalyco/models.dev"
            target="_blank"
            rel="noreferrer"
          >
            models.dev 来源
          </a>
        </div>
      </footer>
      <SubscriptionSheet
        open={sheetOpen}
        scopeLabel="API 新模型"
        providerId="api-model-new"
        mode="api"
        subscriptionType="api_model_new"
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}
