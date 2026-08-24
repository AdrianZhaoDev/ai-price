/**
 * Platform-owned API pricing rules.
 *
 * Keep each provider in its own exported function. Shared HTML mechanics live in
 * shared.ts; provider-specific selectors, column meanings and unit conversions
 * stay here so an official-page change has a single obvious edit point.
 */
import { load } from "cheerio";
import type {
  NormalizedOffer,
  RawCollectionResult,
} from "@/lib/collectors/types";
import {
  apiOffer,
  compactLabel,
  dedupeOffers,
  firstNumberFrom,
  normalizeTokenUnit,
  numberFrom,
  officialTables,
  pricingTables,
  priceColumns,
  priceTypeFrom,
} from "@/lib/collectors/adapters/api-pricing/shared";

function modelOrderer() {
  const order = new Map<string, number>();
  return (model: string) => {
    const key = compactLabel(model).toLowerCase();
    if (!order.has(key)) order.set(key, order.size);
    return order.get(key)!;
  };
}

function validPrice(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}

function officialPriceFrom(value: string): number | null {
  const discount = value.match(/原价\s*([\d.]+)\s*元[^元]{0,30}?([\d.]+)\s*折/);
  if (discount) return Number(discount[1]) * (Number(discount[2]) / 10);
  const yuanValues = [...value.matchAll(/([\d.]+)\s*元/g)].map((match) =>
    Number(match[1]),
  );
  return yuanValues.at(-1) ?? numberFrom(value);
}

export function parseDeepSeekApi(raw: RawCollectionResult): NormalizedOffer[] {
  const rows = officialTables(raw.body)[0]?.rows ?? [];
  const modelRow = rows.find(
    (row) => row.length > 1 && row.some((cell) => /deepseek-/i.test(cell)),
  );
  const modelColumns =
    modelRow
      ?.map((cell, index) => (/deepseek-/i.test(cell) ? index : -1))
      .filter((index) => index >= 0) ?? [];
  const versionRow = rows.find((row) =>
    row.some((cell) => /模型版本/.test(cell)),
  );
  const modelNames = modelColumns.map(
    (column) => versionRow?.[column] || modelRow?.[column] || "",
  );
  if (!modelNames.length) return [];
  const definitions = [
    ["缓存命中输入", "cached_input", /缓存命中/],
    ["缓存未命中输入", "input", /缓存未命中/],
    ["输出", "output", /百万.*输出|tokens输出/i],
  ] as const;
  return definitions.flatMap(([label, priceType, matcher]) => {
    const row = rows.find((candidate) =>
      candidate.some((cell) => matcher.test(cell)),
    );
    if (!row) return [];
    return modelNames.flatMap((modelName, modelOrder) => {
      const value = numberFrom(row[modelColumns[modelOrder]]);
      return validPrice(value)
        ? [
            apiOffer({
              raw,
              providerSlug: "deepseek-api",
              parserVersion: "deepseek-api-v5",
              modelName,
              modelOrder,
              priceLabel: label,
              priceType,
              value,
            }),
          ]
        : [];
    });
  });
}

export function parseQwenApi(raw: RawCollectionResult): NormalizedOffer[] {
  const orderFor = modelOrderer();
  const offers: NormalizedOffer[] = [];
  for (const table of officialTables(raw.body)) {
    const headerIndex = table.rows.findIndex(
      (row) =>
        row.some((cell) => /模型\s*ID/i.test(cell)) &&
        row.some((cell) => /输入.*单价|输出.*单价/i.test(cell)),
    );
    if (headerIndex < 0) continue;
    const headers = table.rows[headerIndex];
    const modelIndex = headers.findIndex((cell) => /模型\s*ID/i.test(cell));
    const columns = priceColumns(headers).filter(
      (column) => column.type !== "other",
    );
    for (const row of table.rows.slice(headerIndex + 1)) {
      const rawModelName = compactLabel(row[modelIndex] ?? "");
      const modelName =
        rawModelName.match(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*/)?.[0] ?? rawModelName;
      if (!modelName || /模型\s*ID/i.test(modelName)) continue;
      for (const column of columns) {
        const cell = row[column.index] ?? "";
        if (!/[元¥￥]/.test(cell)) continue;
        const value = officialPriceFrom(cell);
        if (!validPrice(value)) continue;
        const unitInfo = normalizeTokenUnit(`${column.label} ${table.context}`);
        const tier = row
          .slice(modelIndex + 1, Math.min(...columns.map((item) => item.index)))
          .filter(Boolean)
          .join(" · ");
        const sameLabelColumns = columns.filter(
          (candidate) => candidate.label === column.label,
        );
        const duplicateLabelIndex = sameLabelColumns.findIndex(
          (candidate) => candidate.index === column.index,
        );
        const priceLabel =
          sameLabelColumns.length > 1
            ? `${compactLabel(column.label)} ${duplicateLabelIndex + 1}`
            : compactLabel(column.label);
        offers.push(
          apiOffer({
            raw,
            providerSlug: "qwen-api",
            parserVersion: "qwen-api-v5",
            modelName,
            modelOrder: orderFor(modelName),
            priceLabel,
            priceType: column.type,
            value,
            unit: unitInfo.unit,
            multiplier: unitInfo.multiplier,
            category: table.context || "模型调用",
            tier: tier || undefined,
            tierOrder: /华北|中国内地|北京/.test(table.context) ? 0 : 10,
          }),
        );
      }
    }
  }
  return dedupeOffers(offers);
}

export function parseBaiduApi(raw: RawCollectionResult): NormalizedOffer[] {
  const orderFor = modelOrderer();
  const offers: NormalizedOffer[] = [];
  for (const table of officialTables(raw.body)) {
    const headerIndex = table.rows.findIndex((row) =>
      row.some((cell) => /模型名称|模型名/.test(cell)),
    );
    if (headerIndex < 0) continue;
    const headers = table.rows[headerIndex];
    const modelIndex = headers.findIndex((cell) =>
      /模型名称|模型名/.test(cell),
    );
    const itemIndex = headers.findIndex((cell) => /子项|计费项/.test(cell));
    const onlineIndex = headers.findIndex((cell) =>
      /在线推理|单价|价格/.test(cell),
    );
    if (onlineIndex < 0) continue;
    for (const row of table.rows.slice(headerIndex + 1)) {
      const modelName = compactLabel(row[modelIndex] ?? "");
      const priceLabel = compactLabel(row[itemIndex] ?? "价格");
      const priceText = row[onlineIndex] ?? "";
      const value = firstNumberFrom(priceText);
      if (!modelName || !validPrice(value)) continue;
      const priceType = priceTypeFrom(priceLabel);
      const unitText = `${headers[onlineIndex]} ${headers[itemIndex] ?? ""} ${priceLabel}`;
      const parsedUnit = normalizeTokenUnit(unitText);
      const unitInfo =
        priceType !== "other" && !/token/i.test(unitText)
          ? { unit: "/百万 tokens", multiplier: 1_000 }
          : parsedUnit;
      offers.push(
        apiOffer({
          raw,
          providerSlug: "ernie-api",
          parserVersion: "baidu-api-v4",
          modelName,
          modelOrder: orderFor(modelName),
          priceLabel,
          priceType,
          value,
          unit: unitInfo.unit,
          multiplier: unitInfo.multiplier,
          category: table.context || "在线推理",
          tier: row
            .slice(modelIndex + 1, itemIndex >= 0 ? itemIndex : onlineIndex)
            .filter(Boolean)
            .join(" · "),
        }),
      );
    }
  }
  return dedupeOffers(offers);
}

export function parseSparkApi(raw: RawCollectionResult): NormalizedOffer[] {
  const tables = officialTables(raw.body);
  const member = tables
    .flatMap((table) => table.rows)
    .find((row) => row[0] === "标准成员" && validPrice(numberFrom(row[1])));
  const yuanPerPoint =
    member &&
    validPrice(numberFrom(member[1])) &&
    validPrice(numberFrom(member[2]))
      ? numberFrom(member[1])! / numberFrom(member[2])!
      : null;
  if (!validPrice(yuanPerPoint) || yuanPerPoint === 0) return [];
  const table = tables.find((candidate) =>
    candidate.rows[0]?.some((cell) => /积分.*百万.*Token/i.test(cell)),
  );
  if (!table) return [];
  const headers = table.rows[0];
  const columns = priceColumns(headers);
  const orderFor = modelOrderer();
  return dedupeOffers(
    table.rows.slice(1).flatMap((row) => {
      const modelName = compactLabel(row[0] ?? "");
      if (!modelName) return [];
      return columns.flatMap((column) => {
        const points = numberFrom(row[column.index]);
        if (!validPrice(points)) return [];
        return [
          apiOffer({
            raw,
            providerSlug: "spark-api",
            parserVersion: "spark-api-v4",
            modelName,
            modelOrder: orderFor(modelName),
            priceLabel:
              column.type === "cached_input"
                ? "缓存命中输入"
                : column.type === "input"
                  ? "输入"
                  : column.type === "output"
                    ? "输出"
                    : compactLabel(column.label),
            priceType: column.type,
            value: points * yuanPerPoint,
            unit: "/百万 tokens",
            category: "Token Plan 标准成员折算",
            tier: row
              .slice(1, Math.min(...columns.map((item) => item.index)))
              .join(" · "),
          }),
        ];
      });
    }),
  );
}

export function parseHunyuanApi(raw: RawCollectionResult): NormalizedOffer[] {
  const orderFor = modelOrderer();
  const offers: NormalizedOffer[] = [];
  for (const [tableOrder, table] of officialTables(raw.body).entries()) {
    const headerIndex = table.rows.findIndex((row) =>
      row.some((cell) => /模型名称|模型名|模型/.test(cell)),
    );
    if (headerIndex < 0) continue;
    const headers = table.rows[headerIndex];
    const modelIndex = headers.findIndex((cell) =>
      /模型名称|模型名|模型/.test(cell),
    );
    const columns = priceColumns(headers);
    if (!columns.length) continue;
    for (const row of table.rows.slice(headerIndex + 1)) {
      const modelName = compactLabel(row[modelIndex] ?? "");
      if (!modelName) continue;
      const alignedPriceCells =
        row.length > headers.length
          ? row.slice(-columns.length)
          : columns.map((column) => row[column.index]);
      const tierEnd =
        row.length > headers.length
          ? row.length - columns.length
          : Math.min(...columns.map((item) => item.index));
      for (const [columnOrder, column] of columns.entries()) {
        const value = numberFrom(alignedPriceCells[columnOrder]);
        if (!validPrice(value)) continue;
        const parsedUnit = normalizeTokenUnit(
          `${column.label} ${table.context}`,
        );
        const unitInfo =
          column.type !== "other" && parsedUnit.unit === "按官方单位"
            ? { unit: "/百万 tokens", multiplier: 1 }
            : parsedUnit;
        offers.push(
          apiOffer({
            raw,
            providerSlug: "hunyuan-api",
            parserVersion: "hunyuan-api-v4",
            modelName,
            modelOrder: orderFor(modelName),
            priceLabel: compactLabel(column.label),
            priceType: column.type,
            value,
            unit: unitInfo.unit,
            multiplier: unitInfo.multiplier,
            category: table.context || `价目表 ${tableOrder + 1}`,
            tier: row
              .slice(modelIndex + 1, tierEnd)
              .filter(Boolean)
              .join(" · "),
            tierOrder: tableOrder * 10,
          }),
        );
      }
    }
  }
  return dedupeOffers(offers);
}

export function parseMiniMaxApi(raw: RawCollectionResult): NormalizedOffer[] {
  const orderFor = modelOrderer();
  const offers: NormalizedOffer[] = [];
  for (const [tableOrder, table] of officialTables(raw.body).entries()) {
    const headerIndex = table.rows.findIndex((row) =>
      row.some((cell) => /模型|功能|服务/.test(cell)),
    );
    if (headerIndex < 0) continue;
    const headers = table.rows[headerIndex];
    const modelIndex = headers.findIndex((cell) => /模型|功能|服务/.test(cell));
    const columns = priceColumns(headers);
    if (!columns.length) continue;
    for (const row of table.rows.slice(headerIndex + 1)) {
      const rawModelName = compactLabel(row[modelIndex] ?? "");
      const modelName =
        rawModelName.match(/MiniMax-[A-Za-z0-9.()_-]+/i)?.[0] ?? rawModelName;
      const modelQualifier = compactLabel(rawModelName.replace(modelName, ""));
      if (!modelName) continue;
      for (const column of columns) {
        const cell = row[column.index] ?? "";
        const value = numberFrom(cell);
        if (!validPrice(value) || !/[0-9]/.test(cell)) continue;
        const parsedUnit = normalizeTokenUnit(
          `${column.label} ${cell} ${table.context}`,
        );
        const unitInfo =
          column.type !== "other" &&
          parsedUnit.unit === "按官方单位" &&
          /minimax/i.test(modelName)
            ? { unit: "/百万 tokens", multiplier: 1 }
            : parsedUnit;
        offers.push(
          apiOffer({
            raw,
            providerSlug: "minimax-api",
            parserVersion: "minimax-api-v5",
            modelName,
            modelOrder: orderFor(modelName),
            priceLabel: compactLabel(column.label),
            priceType: column.type,
            value,
            unit: unitInfo.unit,
            multiplier: unitInfo.multiplier,
            category: table.context || `价目表 ${tableOrder + 1}`,
            tier: [
              modelQualifier,
              ...row
                .slice(
                  modelIndex + 1,
                  Math.min(...columns.map((item) => item.index)),
                )
                .filter(Boolean),
            ]
              .filter(Boolean)
              .join(" · "),
          }),
        );
      }
    }
  }
  return dedupeOffers(offers);
}

export function parseKimiApi(raw: RawCollectionResult): NormalizedOffer[] {
  const matches = [
    ...raw.body.matchAll(
      /\["([^"]+)",\s*"([^"]*tokens[^"]*)",\s*"¥([\d.]+)",\s*"¥([\d.]+)",\s*"¥([\d.]+)"/gi,
    ),
  ];
  return matches.flatMap((match, modelOrder) => {
    const modelName = match[1];
    return [
      ["缓存命中输入", "cached_input", Number(match[3])],
      ["缓存未命中输入", "input", Number(match[4])],
      ["输出", "output", Number(match[5])],
    ].map(([priceLabel, priceType, value]) =>
      apiOffer({
        raw,
        providerSlug: "kimi-api",
        parserVersion: "kimi-api-v4",
        modelName,
        modelOrder,
        priceLabel: String(priceLabel),
        priceType: priceType as "cached_input" | "input" | "output",
        value: Number(value),
      }),
    );
  });
}

export function parseGlmApi(raw: RawCollectionResult): NormalizedOffer[] {
  const matches = [
    ...raw.body.matchAll(
      /name:"([^"]+)"[^{}]{0,2500}?inPrice:\["([\d.]+)元"[^{}]{0,1000}?outPrice:\["([\d.]+)元"[^{}]{0,1000}?hit:\["([\d.]+)元"/g,
    ),
  ];
  return dedupeOffers(
    matches.flatMap((match, modelOrder) => [
      apiOffer({
        raw,
        providerSlug: "glm-api",
        parserVersion: "glm-api-v4",
        modelName: match[1],
        modelOrder,
        priceLabel: "输入",
        priceType: "input",
        value: Number(match[2]),
      }),
      apiOffer({
        raw,
        providerSlug: "glm-api",
        parserVersion: "glm-api-v4",
        modelName: match[1],
        modelOrder,
        priceLabel: "缓存命中输入",
        priceType: "cached_input",
        value: Number(match[4]),
      }),
      apiOffer({
        raw,
        providerSlug: "glm-api",
        parserVersion: "glm-api-v4",
        modelName: match[1],
        modelOrder,
        priceLabel: "输出",
        priceType: "output",
        value: Number(match[3]),
      }),
    ]),
  );
}

export function parseDoubaoApi(raw: RawCollectionResult): NormalizedOffer[] {
  const $ = load(raw.body);
  const offers: NormalizedOffer[] = [];
  $(".rank-item").each((modelOrder, element) => {
    const modelName = compactLabel($(element).find("h4,h3").first().text());
    if (!modelName) return;
    $(element)
      .find(".rank-item__price-row")
      .each((_, row) => {
        const label = compactLabel(
          $(row).find(".rank-item__price-label").text(),
        );
        const value = numberFrom($(row).find(".rank-item__price-value").text());
        if (!label || !validPrice(value)) return;
        offers.push(
          apiOffer({
            raw,
            providerSlug: "doubao-api",
            parserVersion: "doubao-api-v4",
            modelName,
            modelOrder,
            priceLabel: label,
            value,
            unit: /输入|输出|缓存/.test(label) ? "/百万 tokens" : "按官方单位",
            category: "火山方舟",
          }),
        );
      });
  });
  return dedupeOffers(offers);
}

export function parseStepFunApi(raw: RawCollectionResult): NormalizedOffer[] {
  const offers: NormalizedOffer[] = [];
  const orderFor = modelOrderer();
  for (const table of officialTables(raw.body)) {
    const headers = table.rows[0] ?? [];
    for (const row of table.rows.slice(1)) {
      const modelName = compactLabel(row[0] ?? "");
      if (!modelName) continue;
      row.slice(1).forEach((cell, offset) => {
        if (!/[¥￥元]/.test(cell)) return;
        const value = numberFrom(cell);
        if (!validPrice(value)) return;
        const label = compactLabel(headers[offset + 1] || "价格");
        offers.push(
          apiOffer({
            raw,
            providerSlug: "stepfun-api",
            parserVersion: "stepfun-api-v4",
            modelName,
            modelOrder: orderFor(modelName),
            priceLabel: label,
            value,
            unit: row[2] || label,
            category: table.context || "Step Plan",
          }),
        );
      });
    }
  }
  return dedupeOffers(offers);
}

export function parseMimoApi(raw: RawCollectionResult): NormalizedOffer[] {
  const offers: NormalizedOffer[] = [];
  const orderFor = modelOrderer();
  for (const table of officialTables(raw.body)) {
    const headers = table.rows[0] ?? [];
    const columns = priceColumns(headers);
    if (!columns.length) continue;
    for (const row of table.rows.slice(1)) {
      const modelName = compactLabel(row[0] ?? "");
      if (!modelName || /\$|美元/.test(row.join(" "))) continue;
      for (const column of columns) {
        const value = numberFrom(row[column.index]);
        if (!validPrice(value)) continue;
        const parsedUnit = normalizeTokenUnit(
          `${column.label} ${table.context}`,
        );
        const unitInfo =
          column.type !== "other" &&
          parsedUnit.unit === "按官方单位" &&
          /^mimo-/i.test(modelName)
            ? { unit: "/百万 tokens", multiplier: 1 }
            : parsedUnit;
        offers.push(
          apiOffer({
            raw,
            providerSlug: "mimo-api",
            parserVersion: "mimo-api-v4",
            modelName,
            modelOrder: orderFor(modelName),
            priceLabel: compactLabel(column.label),
            priceType: column.type,
            value,
            unit: unitInfo.unit,
            multiplier: unitInfo.multiplier,
            category: table.context || "按量付费",
          }),
        );
      }
    }
  }
  return dedupeOffers(offers);
}

export function parseBaichuanApi(raw: RawCollectionResult): NormalizedOffer[] {
  const orderFor = modelOrderer();
  const offers: NormalizedOffer[] = [];
  for (const [tableOrder, table] of officialTables(raw.body).entries()) {
    for (const [rowOrder, row] of table.rows.slice(1).entries()) {
      const modelName = compactLabel(row[0] ?? "");
      if (!modelName) continue;
      const text = row.join(" ");
      const pairs = [
        ...text.matchAll(
          /(输入|输出|缓存[^：:\s]*)[：:\s]*([\d.]+)\s*元\/(千|万|百万)?\s*tokens?/gi,
        ),
      ];
      for (const pair of pairs) {
        const unitInfo = normalizeTokenUnit(`/${pair[3] ?? ""}tokens`);
        offers.push(
          apiOffer({
            raw,
            providerSlug: "baichuan-api",
            parserVersion: "baichuan-api-v4",
            modelName,
            modelOrder: orderFor(modelName),
            priceLabel: pair[1],
            priceType: priceTypeFrom(pair[1]),
            value: Number(pair[2]),
            unit: unitInfo.unit,
            multiplier: unitInfo.multiplier,
            category: table.context || `价目表 ${tableOrder + 1}`,
            tier: row.slice(1, -1).filter(Boolean).join(" · "),
          }),
        );
      }
      if (!pairs.length) {
        row.slice(1).forEach((cell, index) => {
          if (!/[¥￥元]/.test(cell)) return;
          const value = numberFrom(cell);
          if (!validPrice(value)) return;
          offers.push(
            apiOffer({
              raw,
              providerSlug: "baichuan-api",
              parserVersion: "baichuan-api-v4",
              modelName,
              modelOrder: orderFor(modelName),
              priceLabel: `${table.rows[0]?.[index + 1] || "价格"} ${index + 1}`,
              value,
              unit: normalizeTokenUnit(cell).unit,
              category: table.context || `价目表 ${tableOrder + 1}`,
              tier: row.slice(1, -1).filter(Boolean).join(" · ") || undefined,
              planSuffix: `price-${index + 1}-row-${rowOrder}`,
            }),
          );
        });
      }
    }
  }
  return dedupeOffers(offers);
}

export function parseLongCatApi(raw: RawCollectionResult): NormalizedOffer[] {
  const rows = officialTables(raw.body)[0]?.rows ?? [];
  return rows.slice(1).flatMap((row) => {
    const label = compactLabel(row[0] ?? "");
    const value = numberFrom(row.at(-1));
    if (!label || !validPrice(value)) return [];
    return [
      apiOffer({
        raw,
        providerSlug: "longcat-api",
        parserVersion: "longcat-api-v5",
        modelName: "LongCat-2.0",
        modelOrder: 0,
        priceLabel: label,
        value,
        category: "限时折扣",
      }),
    ];
  });
}

export function parseSiliconFlowApi(
  raw: RawCollectionResult,
): NormalizedOffer[] {
  const $ = load(raw.body);
  const offers: NormalizedOffer[] = [];
  $('[id^="pricing-row-"]').each((modelOrder, row) => {
    const link = $(row).find("a[title]").first();
    const modelName = compactLabel(link.text() || link.attr("title") || "");
    if (!modelName) return;
    const route = link.attr("title") || modelName;
    const prices = $(row)
      .find("span")
      .map((_, span) => {
        const text = $(span).text().replace(/\s+/g, "");
        return /^¥[\d.]+$/.test(text) ? numberFrom(text) : null;
      })
      .get()
      .filter(validPrice);
    if (!prices.length) return;
    const category =
      ($(row).attr("id") ?? "").match(/^pricing-row-([a-z-]+)-/)?.[1] ??
      "model";
    const definitions =
      prices.length >= 3
        ? [
            ["输入", "input", prices[0]],
            ["输出", "output", prices[1]],
            ["缓存命中输入", "cached_input", prices[2]],
          ]
        : prices.length === 2
          ? [
              ["输入", "input", prices[0]],
              ["输出", "output", prices[1]],
            ]
          : [["价格", "other", prices[0]]];
    for (const [priceLabel, priceType, value] of definitions) {
      offers.push(
        apiOffer({
          raw,
          providerSlug: "siliconflow-api",
          parserVersion: "siliconflow-api-v5",
          modelName,
          modelOrder,
          priceLabel: String(priceLabel),
          priceType: priceType as "input" | "output" | "cached_input" | "other",
          value: Number(value),
          unit:
            category === "text" || category === "embedding"
              ? "/百万 tokens"
              : "按官方单位",
          category,
          tier: route,
        }),
      );
    }
  });
  return dedupeOffers(offers);
}

export function parseHuaweiMaaSApi(
  raw: RawCollectionResult,
): NormalizedOffer[] {
  const orderFor = modelOrderer();
  const rows = officialTables(raw.body)[0]?.rows ?? [];
  const headerIndex = rows.findIndex(
    (row) =>
      row.some((cell) => /模型/.test(cell)) &&
      row.some((cell) => /单价|价格/.test(cell)),
  );
  const primaryHeader = rows[headerIndex >= 0 ? headerIndex : 0] ?? [];
  const modelIndex = Math.max(
    0,
    primaryHeader.findIndex((cell) => /模型/.test(cell)),
  );
  const detailHeader = rows[(headerIndex >= 0 ? headerIndex : 0) + 1] ?? [];
  const inheritedHeaderColumnCount = primaryHeader.filter(
    (cell, index) =>
      Boolean(cell) &&
      compactLabel(cell) === compactLabel(detailHeader[index] ?? ""),
  ).length;
  const hasPriceTypeHeader =
    inheritedHeaderColumnCount >= 2 &&
    /模型/.test(primaryHeader[modelIndex] ?? "") &&
    detailHeader.some(
      (cell, index) => index > modelIndex && priceTypeFrom(cell) !== "other",
    );
  const headers = hasPriceTypeHeader ? detailHeader : primaryHeader;
  const dataStart =
    (headerIndex >= 0 ? headerIndex : 0) + (hasPriceTypeHeader ? 2 : 1);
  const unitInfo = normalizeTokenUnit(
    primaryHeader.find((cell) => /单价|价格/.test(cell)) ??
      headers.find((cell) => /单价|价格/.test(cell)) ??
      "/千Token",
  );
  const priceTypeColumns = hasPriceTypeHeader
    ? headers.flatMap((label, index) => {
        const priceType = priceTypeFrom(label);
        return priceType === "other"
          ? []
          : [{ index, label: compactLabel(label), priceType }];
      })
    : [];
  const parseHuaweiPriceCell = (
    value: string | undefined,
  ): Array<{ value: number; tier?: string }> => {
    if (!value) return [];
    const labeledValues = [
      ...value.matchAll(
        /(非思考模式|思考模式|non[- ]thinking mode|thinking mode)\s*[:：]\s*(-?\d+(?:\.\d+)?)/gi,
      ),
    ].map((match) => ({
      tier: compactLabel(match[1]),
      value: Number(match[2]),
    }));
    if (labeledValues.length > 0) return labeledValues;
    const parsed = numberFrom(value);
    return parsed === null ? [] : [{ value: parsed }];
  };
  if (priceTypeColumns.length > 0) {
    const tierEnd = Math.min(...priceTypeColumns.map((column) => column.index));
    return dedupeOffers(
      rows.slice(dataStart).flatMap((row, tierOrder) => {
        const modelName = compactLabel(row[modelIndex] ?? "");
        const tier = [
          ...new Set(
            row
              .slice(modelIndex + 1, tierEnd)
              .map(compactLabel)
              .filter((value) => value && value !== "-"),
          ),
        ].join(" · ");
        if (!modelName) return [];
        return priceTypeColumns.flatMap(({ index, label, priceType }) => {
          return parseHuaweiPriceCell(row[index]).flatMap(
            ({ value, tier: priceTier }) => {
              if (!validPrice(value)) return [];
              return [
                apiOffer({
                  raw,
                  providerSlug: "huawei-maas-api",
                  parserVersion: "huawei-maas-api-v6",
                  modelName,
                  modelOrder: orderFor(modelName),
                  priceLabel: label,
                  priceType,
                  value,
                  unit: unitInfo.unit,
                  multiplier: unitInfo.multiplier,
                  category: "华为云 MaaS",
                  tier:
                    [tier, priceTier].filter(Boolean).join(" · ") || undefined,
                  tierOrder,
                }),
              ];
            },
          );
        });
      }),
    );
  }

  const priceIndex = primaryHeader.findIndex((cell) => /单价|价格/.test(cell));
  const priceLabelIndex = primaryHeader.findIndex((cell) =>
    /计费项|输入|输出|缓存/.test(cell),
  );
  return dedupeOffers(
    rows.slice(dataStart).flatMap((row, tierOrder) => {
      const modelName = compactLabel(row[modelIndex] ?? "");
      const priceLabel = compactLabel(
        (priceLabelIndex >= 0 ? row[priceLabelIndex] : undefined) ??
          (priceLabelIndex >= 0 ? primaryHeader[priceLabelIndex] : undefined) ??
          "价格",
      );
      const tierEnd = priceIndex >= 0 ? priceIndex : row.length - 1;
      const tier = [
        ...new Set(
          row
            .slice(modelIndex + 1, tierEnd)
            .map(compactLabel)
            .filter(
              (value) =>
                value &&
                value !== "-" &&
                value !== priceLabel &&
                !/^(输入|输出|缓存)$/.test(value),
            ),
        ),
      ].join(" · ");
      return parseHuaweiPriceCell(
        priceIndex >= 0 ? row[priceIndex] : row.at(-1),
      ).flatMap(({ value, tier: priceTier }) => {
        if (!modelName || !validPrice(value)) return [];
        return [
          apiOffer({
            raw,
            providerSlug: "huawei-maas-api",
            parserVersion: "huawei-maas-api-v6",
            modelName,
            modelOrder: orderFor(modelName),
            priceLabel,
            value,
            unit: unitInfo.unit,
            multiplier: unitInfo.multiplier,
            category: "华为云 MaaS",
            tier: [tier, priceTier].filter(Boolean).join(" · ") || undefined,
            tierOrder,
          }),
        ];
      });
    }),
  );
}

export function parseTeleAiApi(raw: RawCollectionResult): NormalizedOffer[] {
  const body = raw.body.replace(/\\"/g, '"');
  const matches = [
    ...body.matchAll(
      /"discountedPrice":"([\d.]+)","discountedUnit":"元\/([^"]+)"/g,
    ),
  ];
  return dedupeOffers(
    matches.map((match, modelOrder) => {
      const start = Math.max(0, (match.index ?? 0) - 900);
      const context = body.slice(start, match.index);
      const names = [
        ...context.matchAll(
          /"(?:productName|modelName|title|name)":"([^"]+)"/g,
        ),
      ];
      const modelName = names.at(-1)?.[1] || `TeleAI 价格项 ${modelOrder + 1}`;
      return apiOffer({
        raw,
        providerSlug: "teleai-api",
        parserVersion: "teleai-api-v4",
        modelName,
        modelOrder,
        priceLabel: match[2],
        value: Number(match[1]),
        unit: `/${match[2]}`,
        category: "TeleAI 官方套餐",
      });
    }),
  );
}

type GlobalApiProvider = {
  providerSlug: string;
  parserVersion: string;
};

const globalApiModelNames: Record<string, Array<[RegExp, string]>> = {
  "openai-api": [
    [/^gpt-5\.6-sol$/i, "gpt-5.6-sol"],
    [/^gpt-5\.6-terra$/i, "gpt-5.6-terra"],
    [/^gpt-5\.6-luna$/i, "gpt-5.6-luna"],
    [/^gpt-5\.5-pro$/i, "gpt-5.5-pro"],
    [/^gpt-5\.5$/i, "gpt-5.5"],
  ],
  "claude-api": [
    [/^Claude Fable 5(?=$|\s*(?:through|starting)\b)/i, "Claude Fable 5"],
    [/^Claude Opus 5(?=$|\s*(?:through|starting)\b)/i, "Claude Opus 5"],
    [/^Claude Opus 4\.8(?=$|\s*(?:through|starting)\b)/i, "Claude Opus 4.8"],
    [/^Claude Opus 4\.7(?=$|\s*(?:through|starting)\b)/i, "Claude Opus 4.7"],
    [/^Claude Opus 4\.6(?=$|\s*(?:through|starting)\b)/i, "Claude Opus 4.6"],
    [/^Claude Sonnet 5(?=$|\s*(?:through|starting)\b)/i, "Claude Sonnet 5"],
    [
      /^Claude Sonnet 4\.6(?=$|\s*(?:through|starting)\b)/i,
      "Claude Sonnet 4.6",
    ],
    [/^Claude Haiku 4\.5(?=$|\s*(?:through|starting)\b)/i, "Claude Haiku 4.5"],
  ],
  "gemini-api": [
    [/^Gemini 3\.6 Flash$/i, "Gemini 3.6 Flash"],
    [/^Gemini 3\.5 Flash$/i, "Gemini 3.5 Flash"],
    [/^Gemini 3\.5 Flash-Lite$/i, "Gemini 3.5 Flash-Lite"],
    [/^Gemini 3\.1 Flash-Lite$/i, "Gemini 3.1 Flash-Lite"],
  ],
  "grok-api": [
    [/^grok-4\.6$/i, "grok-4.6"],
    [/^grok-4\.5$/i, "grok-4.5"],
    [/^grok-4\.3$/i, "grok-4.3"],
    [/^grok-4\.20-0309-reasoning$/i, "grok-4.20-0309-reasoning"],
    [/^grok-4\.20-0309-non-reasoning$/i, "grok-4.20-0309-non-reasoning"],
  ],
};

function pricingWindowIncludes(
  modelLabel: string,
  observedAt: string,
): boolean {
  const observed = new Date(observedAt);
  if (!Number.isFinite(observed.getTime())) return true;
  const starting = modelLabel.match(
    /starting\s+([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/i,
  )?.[1];
  if (starting) {
    const start = new Date(`${starting} 00:00:00 UTC`);
    if (Number.isFinite(start.getTime()) && observed < start) return false;
  }
  const through = modelLabel.match(
    /through\s+([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/i,
  )?.[1];
  if (through) {
    const end = new Date(`${through} 23:59:59 UTC`);
    if (Number.isFinite(end.getTime()) && observed > end) return false;
  }
  return true;
}

function selectedGlobalApiModelName(
  providerSlug: string,
  modelLabel: string,
  observedAt: string,
): string | null {
  if (!pricingWindowIncludes(modelLabel, observedAt)) return null;
  for (const [pattern, canonicalName] of globalApiModelNames[providerSlug] ??
    []) {
    if (pattern.test(modelLabel)) return canonicalName;
  }
  return null;
}

function globalTier(text: string): {
  label: string;
  order: number;
  rankingEligible: boolean;
} {
  const normalized = text.toLowerCase();
  if (/batch|批量/.test(normalized)) {
    return { label: "Batch", order: 10, rankingEligible: false };
  }
  if (/flex/.test(normalized)) {
    return { label: "Flex", order: 20, rankingEligible: false };
  }
  if (/priority|fast|优先/.test(normalized)) {
    return { label: "Priority", order: 30, rankingEligible: false };
  }
  if (/free|免费/.test(normalized)) {
    return { label: "免费层", order: 40, rankingEligible: false };
  }
  if (
    /retired|deprecated|legacy|limited|preview|live|audio|image|nano banana|退役|限量|预览|实时翻译|音频|映像|图像/.test(
      normalized,
    )
  ) {
    return { label: "非通用模型", order: 60, rankingEligible: false };
  }
  if (/(?:<=?|≤)\s*[2-9]\d{2}k/.test(normalized)) {
    return { label: "标准实时", order: 0, rankingEligible: true };
  }
  if (/≥|>=|over|above|long|长上下文|[2-9]\d{2}k/.test(normalized)) {
    return { label: "长上下文", order: 50, rankingEligible: false };
  }
  return { label: "标准实时", order: 0, rankingEligible: true };
}

function globalModelName(value: string): string {
  return compactLabel(
    value
      .replace(/\((?:<=?|≤|>=|≥|>|over|above)[^)]+\)/gi, "")
      .replace(/\[(?:<=?|≤|>=|≥|>|over|above)[^\]]+]/gi, ""),
  );
}

function usdValuesFrom(value: string): number[] {
  return [
    ...value
      .replace(/,/g, "")
      .matchAll(
        /(?:\$\s*|usd\s*|美元\s*)(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:usd|美元)/gi,
      ),
  ]
    .map((match) => Number(match[1] ?? match[2]))
    .filter(validPrice);
}

function parseGlobalUsdTables(
  raw: RawCollectionResult,
  provider: GlobalApiProvider,
): NormalizedOffer[] {
  const tokenUnitPattern =
    /1\s*m(?:illion)?\s*tokens?|million tokens?|mtok|(?:100\s*万|百万)(?:个)?\s*tokens?/i;
  const nonTokenUnitPattern =
    /per\s+(?:request|call|image|minute|hour)|\/\s*(?:request|call|image|minute|hour)|每(?:次|张|分钟|小时)/i;
  if (!tokenUnitPattern.test(raw.body)) {
    return [];
  }
  const orderFor = modelOrderer();
  const offers: NormalizedOffer[] = [];
  for (const table of pricingTables(raw.body)) {
    const headerIndex = table.rows.findIndex(
      (row) =>
        row.some((cell) => /model|模型/i.test(cell)) &&
        row.some((cell) => /input|输入/i.test(cell)) &&
        row.some((cell) => /output|输出/i.test(cell)),
    );
    if (headerIndex < 0) continue;
    const headers = table.rows[headerIndex];
    const tableHasTokenUnit = headers.some((header) =>
      tokenUnitPattern.test(header),
    );
    const contextHasTokenUnit = tokenUnitPattern.test(table.context);
    const tableHasNonTokenUnit = [...headers, table.context].some((value) =>
      nonTokenUnitPattern.test(value),
    );
    const modelIndex = headers.findIndex((cell) => /model|模型/i.test(cell));
    const seenTypes = new Map<string, number>();
    const columns = headers.flatMap((label, index) => {
      if (index === modelIndex) return [];
      const type = priceTypeFrom(label);
      if (type === "other") return [];
      const occurrence = seenTypes.get(type) ?? 0;
      seenTypes.set(type, occurrence + 1);
      return [{ index, label, type, occurrence }];
    });
    if (
      modelIndex < 0 ||
      !columns.some(({ type }) => type === "input") ||
      !columns.some(({ type }) => type === "output")
    ) {
      continue;
    }
    for (const row of table.rows.slice(headerIndex + 1)) {
      const rawModelName = row[modelIndex] ?? "";
      const modelName = selectedGlobalApiModelName(
        provider.providerSlug,
        globalModelName(rawModelName),
        raw.observedAt,
      );
      if (!modelName || /model|模型/i.test(modelName)) continue;
      // Context capacity is descriptive metadata, not a pricing tier. Keep
      // tier signals from the table/section and model label only so a value
      // such as Grok's `500k` context cell cannot disable ranking eligibility.
      const tier = globalTier(
        `${table.context} ${headers.join(" ")} ${rawModelName}`,
      );
      for (const column of columns) {
        const cell = row[column.index] ?? "";
        if (!/\$|usd|美元/i.test(cell)) continue;
        if (tableHasNonTokenUnit || nonTokenUnitPattern.test(cell)) continue;
        if (
          !tokenUnitPattern.test(cell) &&
          !tableHasTokenUnit &&
          !contextHasTokenUnit
        ) {
          continue;
        }
        const value = firstNumberFrom(cell);
        if (!validPrice(value)) continue;
        const columnTier =
          column.occurrence > 0
            ? { label: "长上下文", order: 50, rankingEligible: false }
            : tier;
        offers.push(
          apiOffer({
            raw,
            providerSlug: provider.providerSlug,
            parserVersion: provider.parserVersion,
            modelName,
            modelOrder: orderFor(modelName),
            priceLabel: column.label,
            priceType: column.type,
            value,
            currency: "USD",
            region: "全球",
            category: table.context || "官方 API 定价",
            tier: columnTier.label,
            tierOrder: columnTier.order,
            rankingEligible: columnTier.rankingEligible,
          }),
        );
      }
    }
  }
  return dedupeOffers(offers);
}

export function parseOpenAiApi(raw: RawCollectionResult): NormalizedOffer[] {
  return parseGlobalUsdTables(raw, {
    providerSlug: "openai-api",
    parserVersion: "openai-api-v3",
  });
}

export function parseClaudeApi(raw: RawCollectionResult): NormalizedOffer[] {
  return parseGlobalUsdTables(raw, {
    providerSlug: "claude-api",
    parserVersion: "claude-api-v3",
  });
}

export function parseGrokApi(raw: RawCollectionResult): NormalizedOffer[] {
  return parseGlobalUsdTables(raw, {
    providerSlug: "grok-api",
    parserVersion: "grok-api-v4",
  });
}

export function parseGeminiApi(raw: RawCollectionResult): NormalizedOffer[] {
  const $ = load(raw.body);
  if ($("table").length === 0) {
    return parseGlobalUsdTables(raw, {
      providerSlug: "gemini-api",
      parserVersion: "gemini-api-v3",
    });
  }

  const orderFor = modelOrderer();
  const offers: NormalizedOffer[] = [];
  let modelName = "";
  let section = "标准实时";
  $("h1,h2,h3,h4,table").each((_, element) => {
    const tag = element.tagName.toLowerCase();
    if (tag !== "table") {
      const heading = compactLabel($(element).text());
      if (/gemini[\s-]*\d/i.test(heading)) {
        const headingModelName = heading
          .replace(/\s*(pricing|定价).*$/i, "")
          .replace(/\s*\(.*$/, "")
          .trim();
        modelName =
          selectedGlobalApiModelName(
            "gemini-api",
            headingModelName,
            raw.observedAt,
          ) ?? "";
        section = "标准实时";
      } else if (
        /standard|batch|flex|priority|free|标准|批量|优先|免费/i.test(heading)
      ) {
        section = heading;
      }
      return;
    }
    if (!modelName) return;
    const rows = officialTables($.html(element))[0]?.rows ?? [];
    const headerIndex = rows.findIndex((row) =>
      row.some(
        (cell) =>
          /paid tier|付费/i.test(cell) &&
          /1\s*m(?:illion)?\s*tokens?|million tokens?|(?:100\s*万|百万)(?:个)?\s*tokens?/i.test(
            cell,
          ),
      ),
    );
    if (headerIndex < 0) return;
    const paidIndex = rows[headerIndex].findIndex((cell) =>
      /paid tier|付费/i.test(cell),
    );
    if (paidIndex < 0) return;
    const tier = globalTier(`${section} ${modelName}`);
    for (const row of rows.slice(headerIndex + 1)) {
      const label = compactLabel(row[0] ?? "");
      const type = priceTypeFrom(label);
      const cell = row[paidIndex] ?? "";
      const storageCharge =
        /storage|存储|per\s*hour|每小时|\/\s*hour/i.test(label) ||
        /per\s*hour|每小时|\/\s*hour/i.test(cell);
      if (
        type === "other" ||
        !/\$|usd|美元/i.test(cell) ||
        /not available|不适用/i.test(cell)
      ) {
        continue;
      }
      const rowTier = globalTier(`${section} ${label} ${cell} ${modelName}`);
      const values = usdValuesFrom(cell);
      for (const [valueIndex, value] of values.entries()) {
        const compoundLongContext = valueIndex > 0;
        const priceTier = storageCharge
          ? { label: "存储费", order: 70, rankingEligible: false }
          : compoundLongContext
            ? { label: "长上下文", order: 50, rankingEligible: false }
            : rowTier;
        offers.push(
          apiOffer({
            raw,
            providerSlug: "gemini-api",
            parserVersion: "gemini-api-v3",
            modelName,
            modelOrder: orderFor(modelName),
            priceLabel: label,
            priceType: type,
            value,
            currency: "USD",
            region: "全球",
            category: section,
            tier: priceTier.label,
            tierOrder: priceTier.order,
            unit: storageCharge ? "/百万 tokens /小时" : undefined,
            rankingEligible: tier.rankingEligible && priceTier.rankingEligible,
          }),
        );
      }
    }
  });
  return dedupeOffers(offers);
}

export const apiPricingRules = {
  "stepfun-api": parseStepFunApi,
  "deepseek-api": parseDeepSeekApi,
  "qwen-api": parseQwenApi,
  "ernie-api": parseBaiduApi,
  "spark-api": parseSparkApi,
  "hunyuan-api": parseHunyuanApi,
  "minimax-api": parseMiniMaxApi,
  "kimi-api": parseKimiApi,
  "glm-api": parseGlmApi,
  "doubao-api": parseDoubaoApi,
  "mimo-api": parseMimoApi,
  "baichuan-api": parseBaichuanApi,
  "longcat-api": parseLongCatApi,
  "siliconflow-api": parseSiliconFlowApi,
  "huawei-maas-api": parseHuaweiMaaSApi,
  "teleai-api": parseTeleAiApi,
  "openai-api": parseOpenAiApi,
  "claude-api": parseClaudeApi,
  "gemini-api": parseGeminiApi,
  "grok-api": parseGrokApi,
} as const;
