"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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

function yesNo(value?: boolean) {
  return value === undefined ? "—" : value ? "是" : "否";
}

function priceTierDetails(costDetails?: Record<string, unknown>) {
  if (!costDetails) return undefined;
  const { input: _input, output: _output, ...details } = costDetails;
  void _input;
  void _output;
  return Object.keys(details).length ? details : undefined;
}

const headers: Array<{
  label: string;
  sort?: ModelProviderSortKey;
}> = [
  { label: "Provider" },
  { label: "Lab" },
  { label: "Model ID" },
  { label: "Context", sort: "context" },
  { label: "Output", sort: "output" },
  { label: "Input Price", sort: "inputPrice" },
  { label: "Output Price", sort: "outputPrice" },
  { label: "Price tiers" },
  { label: "Reasoning" },
  { label: "Tool Call" },
  { label: "Structured" },
  { label: "Temperature" },
  { label: "状态" },
  { label: "来源" },
];

export function ModelProviderTable({
  providers,
}: {
  providers: ModelProviderOffering[];
}) {
  const [sort, setSort] = useState<ModelProviderSortKey>("inputPrice");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const sortedProviders = useMemo(
    () => sortModelProviderOfferings(providers, sort, direction),
    [direction, providers, sort],
  );

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
      aria-label="Provider 报价表，可横向滚动"
    >
      <table className="model-provider-table">
        <caption className="sr-only">
          Provider 模型规格与输入、输出价格比较
        </caption>
        <thead>
          <tr>
            {headers.map((header) => (
              <th
                key={header.label}
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
                    aria-label={`按 ${header.label} 排序`}
                  >
                    {header.label}
                    <span aria-hidden="true">
                      {header.sort === sort
                        ? direction === "asc"
                          ? " ↑"
                          : " ↓"
                        : ""}
                    </span>
                  </button>
                ) : (
                  header.label
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
                    href={`/api-pricing?provider=${encodeURIComponent(provider.providerId)}`}
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
                        {Object.keys(tierDetails).length} 项明细
                      </summary>
                      <pre>{JSON.stringify(tierDetails, null, 2)}</pre>
                    </details>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{yesNo(provider.capabilities.reasoning)}</td>
                <td>{yesNo(provider.capabilities.toolCall)}</td>
                <td>{yesNo(provider.capabilities.structuredOutput)}</td>
                <td>{yesNo(provider.capabilities.temperature)}</td>
                <td>
                  <span
                    className={`model-status model-status-${provider.status ?? "active"}`}
                  >
                    {provider.status ?? "active"}
                  </span>
                </td>
                <td>
                  {provider.sourceUrl ? (
                    <a
                      href={provider.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      查看 ↗
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
