"use client";

import { Bell, ChevronDown, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";
import { getMessages, type Locale } from "@/lib/i18n";
import {
  DEFAULT_MODEL_CATALOG_FILTERS,
  parseOptionalNumber,
} from "@/lib/model-catalog/filters";
import type { ModelCatalogFacets } from "@/lib/model-catalog/discovery";
import { modelDetailPath } from "@/lib/model-catalog/paths";
import type {
  ModelCatalogFilters,
  ModelCatalogSummary,
} from "@/lib/model-catalog/types";
import { SiteFooter, SiteHeader } from "./site-header";
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

export function ModelCatalogExplorer({
  locale = "zh-CN",
  models,
  facets,
  initialFilters,
  totalCount,
  currentPage,
  pageCount,
  children,
}: {
  locale?: Locale;
  models: ModelCatalogSummary[];
  facets: ModelCatalogFacets;
  initialFilters: ModelCatalogFilters;
  totalCount: number;
  currentPage: number;
  pageCount: number;
  children?: ReactNode;
}) {
  const messages = getMessages(locale);
  const router = useRouter();
  const [filters, setFilters] = useState(initialFilters);
  const [queryDraft, setQueryDraft] = useState(initialFilters.query ?? "");
  const [moreOpen, setMoreOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { labs, providers, modalities } = facets;

  function commit(next: ModelCatalogFilters) {
    setFilters(next);
    router.replace(catalogHref(next), { scroll: false });
  }

  function catalogHref(next: ModelCatalogFilters, page = 1) {
    const params = new URLSearchParams();
    if (next.query) params.set("q", next.query);
    if (next.hideZeroPrice === false) params.set("hideZero", "0");
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
    if (next.sort && next.sort !== "price_input") params.set("sort", next.sort);
    const defaultDirection =
      next.sort === "model" ||
      next.sort === "lab" ||
      next.sort === "input" ||
      !next.sort ||
      next.sort === "price_input"
        ? "asc"
        : "desc";
    if (next.direction && next.direction !== defaultDirection)
      params.set("direction", next.direction);
    if (page > 1) params.set("page", String(page));
    const prefix = locale === "en" ? "/en/api-pricing" : "/api-pricing";
    return `${prefix}${params.size ? `?${params}` : ""}`;
  }

  function submitQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    commit({ ...filters, query: queryDraft.trim() || undefined });
  }

  const activeFilterCount = [
    filters.query,
    filters.hideZeroPrice === false ? 1 : undefined,
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
          : sort === "model" ||
              sort === "lab" ||
              sort === "input" ||
              sort === "price_input"
            ? "asc"
            : "desc",
    });

  return (
    <div className="app-shell model-catalog-shell" data-hydrated="true">
      <a
        className="skip-link"
        href="#main-content"
        aria-hidden={sheetOpen ? true : undefined}
        tabIndex={sheetOpen ? -1 : undefined}
      >
        {messages.common.skipToContent}
      </a>
      <SiteHeader
        locale={locale}
        activeMode="api"
        showSync
        syncLabel={messages.common.syncEveryFourHours}
        syncTitle={messages.common.catalogSyncTitle}
        ariaHidden={sheetOpen}
      />
      <main
        id="main-content"
        className="main-content model-catalog-main"
        aria-hidden={sheetOpen ? true : undefined}
      >
        <section
          className="model-catalog-heading"
          aria-labelledby="model-catalog-title"
        >
          <div>
            <p className="eyebrow">MODELS.DEV CATALOG</p>
            <h1 id="model-catalog-title">
              {locale === "en" ? "API price ranking" : "API 价格排行榜"}
            </h1>
            <p>{messages.apiCatalog.description}</p>
          </div>
          <button
            type="button"
            className="secondary-button pressable model-subscribe"
            onClick={() => setSheetOpen(true)}
          >
            <Bell size={16} />
            {messages.apiCatalog.subscribeNewModel}
          </button>
        </section>
        <form
          className="model-filter-bar"
          aria-label={messages.apiCatalog.filterLabel}
          onSubmit={submitQuery}
        >
          <label className="model-search">
            <span>{messages.apiCatalog.searchLabel}</span>
            <input
              type="search"
              value={queryDraft}
              onChange={(event) => setQueryDraft(event.target.value)}
              placeholder={messages.apiCatalog.searchPlaceholder}
            />
          </label>
          <button type="submit" className="model-search-submit pressable">
            {messages.apiCatalog.searchSubmit}
          </button>
          <label>
            <span>{messages.apiCatalog.labs}</span>
            <select
              value={filters.labs?.[0] ?? ""}
              onChange={(event) =>
                update(
                  "labs",
                  event.target.value ? [event.target.value] : undefined,
                )
              }
            >
              <option value="">{messages.apiCatalog.allLabs}</option>
              {labs.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{messages.apiCatalog.providers}</span>
            <select
              value={filters.providers?.[0] ?? ""}
              onChange={(event) =>
                update(
                  "providers",
                  event.target.value ? [event.target.value] : undefined,
                )
              }
            >
              <option value="">{messages.apiCatalog.allProviders}</option>
              {providers.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="model-zero-filter">
            <input
              type="checkbox"
              checked={filters.hideZeroPrice !== false}
              onChange={(event) =>
                update("hideZeroPrice", event.target.checked)
              }
            />
            <span>{messages.apiCatalog.hideZeroPrices}</span>
          </label>
          <button
            type="button"
            className="filter-more-button pressable"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((open) => !open)}
          >
            <ChevronDown size={16} />
            {messages.apiCatalog.moreFilters(activeFilterCount)}
          </button>
          {moreOpen ? (
            <div className="model-filter-more">
              <label>
                <span>{messages.apiCatalog.contextMinimum}</span>
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
                <span>{messages.apiCatalog.outputMinimum}</span>
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
                <span>{messages.apiCatalog.inputModality}</span>
                <select
                  value={filters.inputModalities?.[0] ?? ""}
                  onChange={(event) =>
                    update(
                      "inputModalities",
                      event.target.value ? [event.target.value] : undefined,
                    )
                  }
                >
                  <option value="">{messages.apiCatalog.allModalities}</option>
                  {modalities.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>{messages.apiCatalog.inputMaximumPrice}</span>
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
                <span>{messages.apiCatalog.outputMaximumPrice}</span>
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
                <span>{messages.apiCatalog.releaseFrom}</span>
                <input
                  type="date"
                  value={filters.releaseFrom ?? ""}
                  onChange={(event) =>
                    update("releaseFrom", event.target.value || undefined)
                  }
                />
              </label>
              <label>
                <span>{messages.apiCatalog.releaseTo}</span>
                <input
                  type="date"
                  value={filters.releaseTo ?? ""}
                  onChange={(event) =>
                    update("releaseTo", event.target.value || undefined)
                  }
                />
              </label>
              <label>
                <span>{messages.apiCatalog.updatedFrom}</span>
                <input
                  type="date"
                  value={filters.updatedFrom ?? ""}
                  onChange={(event) =>
                    update("updatedFrom", event.target.value || undefined)
                  }
                />
              </label>
              <label>
                <span>{messages.apiCatalog.updatedTo}</span>
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
        </form>
        <div className="model-results">
          <span>
            {messages.apiCatalog.resultCount(models.length, totalCount)}
          </span>
          {activeFilterCount > 0 ? (
            <button
              type="button"
              className="model-clear pressable"
              onClick={() => {
                setQueryDraft("");
                commit(DEFAULT_MODEL_CATALOG_FILTERS);
              }}
            >
              <RotateCcw size={14} />
              {messages.apiCatalog.clearFilters}
            </button>
          ) : null}
          <span className="model-source-note">
            {messages.apiCatalog.sourceNote}
          </span>
        </div>
        <div
          className="model-table-scroll"
          tabIndex={0}
          aria-label={messages.apiCatalog.scrollLabel}
        >
          <table className="model-catalog-table">
            <caption className="sr-only">
              {messages.apiCatalog.title}: {messages.apiCatalog.columns.context}
              , {messages.apiCatalog.columns.input} &{" "}
              {messages.apiCatalog.columns.output}
            </caption>
            <thead>
              <tr>
                {(
                  [
                    ["model", messages.apiCatalog.columns.model],
                    ["lab", messages.apiCatalog.columns.lab],
                    ["context", messages.apiCatalog.columns.context],
                    ["output", messages.apiCatalog.columns.output],
                    ["input", messages.apiCatalog.columns.input],
                    [
                      filters.sort === "price_output"
                        ? "price_output"
                        : "price_input",
                      messages.apiCatalog.columns.price,
                    ],
                    ["release", messages.apiCatalog.columns.release],
                    ["updated", messages.apiCatalog.columns.updated],
                  ] as Array<[SortKey, string]>
                ).map(([key, label]) => (
                  <th
                    key={label}
                    scope="col"
                    aria-sort={
                      filters.sort === key
                        ? filters.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                  >
                    <button
                      type="button"
                      onClick={() => sortBy(key)}
                      aria-label={messages.apiCatalog.sortBy(label)}
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
                    {key === "price_input" || key === "price_output" ? (
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
                        {filters.sort === "price_output"
                          ? messages.apiCatalog.sortByOutput
                          : messages.apiCatalog.sortByInput}
                      </button>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {models.map((model) => (
                <tr key={model.id}>
                  <th scope="row">
                    <Link
                      href={modelDetailPath(model.id, locale)}
                      target="_blank"
                      rel="noopener"
                      title={messages.apiCatalog.openDetailsNewTab}
                    >
                      <strong>{model.name}</strong>
                      <small>{model.id}</small>
                      <span className="sr-only">
                        {messages.apiCatalog.detailsNewTabSr}
                      </span>
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
          {models.length === 0 ? (
            <div className="model-empty">
              <strong>{messages.apiCatalog.noModels}</strong>
              <p>{messages.apiCatalog.widenFilters}</p>
            </div>
          ) : null}
          {pageCount > 1 ? (
            <nav
              className="model-pagination"
              aria-label={messages.apiCatalog.paginationLabel}
            >
              {currentPage > 1 ? (
                <Link href={catalogHref(filters, currentPage - 1)}>
                  {messages.apiCatalog.previousPage}
                </Link>
              ) : (
                <span aria-disabled="true">
                  {messages.apiCatalog.previousPage}
                </span>
              )}
              <strong>
                {messages.apiCatalog.pageStatus(currentPage, pageCount)}
              </strong>
              {currentPage < pageCount ? (
                <Link href={catalogHref(filters, currentPage + 1)}>
                  {messages.apiCatalog.nextPage}
                </Link>
              ) : (
                <span aria-disabled="true">{messages.apiCatalog.nextPage}</span>
              )}
            </nav>
          ) : null}
          {children}
        </div>
      </main>
      <SiteFooter
        locale={locale}
        description={messages.apiCatalog.footerDescription}
        includeModelSource
        ariaHidden={sheetOpen}
      />
      <SubscriptionSheet
        open={sheetOpen}
        scopeLabel={messages.apiCatalog.newModelScope}
        providerId="api-model-new"
        mode="api"
        subscriptionType="api_model_new"
        locale={locale}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}
