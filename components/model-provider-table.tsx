"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { getMessages, type Locale, type LocaleMessages } from "@/lib/i18n";
import {
  sortModelProviderOfferings,
  type ModelProviderSortKey,
} from "@/lib/model-catalog/provider-sorting";
import type { ModelProviderOffering } from "@/lib/model-catalog/types";

function tokens(value?: number) {
  return value === undefined ? "—" : value.toLocaleString("en-US");
}

function price(value?: number) {
  return value === undefined
    ? "—"
    : `$${value.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
}

function yesNo(value: boolean | undefined, locale: Locale) {
  return value === undefined
    ? "—"
    : value
      ? locale === "en"
        ? "Yes"
        : "是"
      : locale === "en"
        ? "No"
        : "否";
}

function priceTierDetails(costDetails?: Record<string, unknown>) {
  if (!costDetails) return undefined;
  const { input: _input, output: _output, ...details } = costDetails;
  void _input;
  void _output;
  return Object.keys(details).length ? details : undefined;
}

const headers: Array<{
  key: keyof LocaleMessages["modelDetail"]["providerColumns"];
  sort?: ModelProviderSortKey;
}> = [
  { key: "provider" },
  { key: "lab" },
  { key: "modelId" },
  { key: "context", sort: "context" },
  { key: "output", sort: "output" },
  { key: "inputPrice", sort: "inputPrice" },
  { key: "outputPrice", sort: "outputPrice" },
  { key: "priceTiers" },
  { key: "reasoning" },
  { key: "toolCall" },
  { key: "structured" },
  { key: "temperature" },
  { key: "status" },
  { key: "source" },
];

export function ModelProviderTable({
  locale = "zh-CN",
  providers,
}: {
  locale?: Locale;
  providers: ModelProviderOffering[];
}) {
  const messages = getMessages(locale);
  const [sort, setSort] = useState<ModelProviderSortKey>("inputPrice");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const tableRef = useRef<HTMLTableElement>(null);
  const sortedProviders = useMemo(
    () => sortModelProviderOfferings(providers, sort, direction),
    [direction, providers, sort],
  );

  useEffect(() => {
    tableRef.current?.setAttribute("data-hydrated", "true");
  }, []);

  function sortBy(nextSort: ModelProviderSortKey) {
    if (nextSort === sort) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSort(nextSort);
    setDirection("asc");
  }

  return (
    <div
      className="model-table-scroll"
      tabIndex={0}
      aria-label={
        locale === "en"
          ? "Provider quote table, horizontally scrollable"
          : "提供商报价表，可横向滚动"
      }
    >
      <table ref={tableRef} className="model-provider-table">
        <caption className="sr-only">
          {locale === "en"
            ? "Provider model specifications and input/output price comparison"
            : "提供商模型规格与输入、输出价格比较"}
        </caption>
        <thead>
          <tr>
            {headers.map((header) => (
              <th
                key={header.key}
                scope="col"
                aria-sort={
                  header.sort === sort
                    ? direction === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
                }
              >
                {header.sort ? (
                  <button
                    type="button"
                    onClick={() => sortBy(header.sort!)}
                    aria-label={messages.apiCatalog.sortBy(
                      messages.modelDetail.providerColumns[header.key],
                    )}
                  >
                    {messages.modelDetail.providerColumns[header.key]}
                    <span aria-hidden="true">
                      {header.sort === sort
                        ? direction === "asc"
                          ? " ↑"
                          : " ↓"
                        : ""}
                    </span>
                  </button>
                ) : (
                  messages.modelDetail.providerColumns[header.key]
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedProviders.map((provider) => {
            const tierDetails = priceTierDetails(provider.costDetails);
            return (
              <tr key={`${provider.providerId}:${provider.providerModelId}`}>
                <th scope="row">
                  <Link
                    href={`${locale === "en" ? "/en/api-pricing" : "/api-pricing"}?provider=${encodeURIComponent(provider.providerId)}`}
                  >
                    {provider.providerName}
                  </Link>
                  <small>
                    {provider.origin === "local_overlay"
                      ? "local overlay"
                      : "models.dev"}
                  </small>
                </th>
                <td>{provider.labName}</td>
                <td>
                  <code>{provider.providerModelId}</code>
                </td>
                <td>{tokens(provider.context)}</td>
                <td>{tokens(provider.output)}</td>
                <td>{price(provider.inputPrice)}</td>
                <td>{price(provider.outputPrice)}</td>
                <td>
                  {tierDetails ? (
                    <details className="model-price-tiers">
                      <summary>
                        {messages.modelDetail.tierDetails(
                          Object.keys(tierDetails).length,
                        )}
                      </summary>
                      <pre>{JSON.stringify(tierDetails, null, 2)}</pre>
                    </details>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{yesNo(provider.capabilities.reasoning, locale)}</td>
                <td>{yesNo(provider.capabilities.toolCall, locale)}</td>
                <td>{yesNo(provider.capabilities.structuredOutput, locale)}</td>
                <td>{yesNo(provider.capabilities.temperature, locale)}</td>
                <td>
                  <span
                    className={`model-status model-status-${provider.status ?? "active"}`}
                  >
                    {messages.modelDetail.status[provider.status ?? "active"]}
                  </span>
                </td>
                <td>
                  {provider.sourceUrl ? (
                    <a
                      href={provider.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {messages.modelDetail.view}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
