import { describe, expect, it } from "vitest";
import {
  parseBaiduApi,
  parseDeepSeekApi,
  parseHunyuanApi,
  parseKimiApi,
  parseLongCatApi,
  parseMiniMaxApi,
  parseQwenApi,
} from "@/lib/collectors/adapters/api-pricing/rules";
import { hashContent } from "@/lib/collectors/http-client";
import type { RawCollectionResult } from "@/lib/collectors/types";

function raw(body: string): RawCollectionResult {
  return {
    body,
    status: 200,
    sourceUrl: "https://official.example/pricing",
    headers: {},
    contentHash: hashContent(body),
    observedAt: "2026-07-27T10:00:00.000Z",
  };
}

describe("maintainable API pricing rules", () => {
  it("adds model order and the three ranking price types", () => {
    const offers = parseDeepSeekApi(
      raw(`<table>
        <tr><th>模型</th><th>deepseek-v4-flash</th><th>deepseek-v4-pro</th></tr>
        <tr><td>模型版本</td><td>DeepSeek-V4-Flash</td><td>DeepSeek-V4-Pro</td></tr>
        <tr><td>百万tokens输入（缓存命中）</td><td>0.02元</td><td>0.025元</td></tr>
        <tr><td>百万tokens输入（缓存未命中）</td><td>1元</td><td>3元</td></tr>
        <tr><td>百万tokens输出</td><td>2元</td><td>6元</td></tr>
      </table>`),
    );
    expect(offers).toHaveLength(6);
    expect(new Set(offers.map((offer) => offer.priceType))).toEqual(
      new Set(["cached_input", "input", "output"]),
    );
    expect(offers.filter((offer) => offer.modelOrder === 0)).toHaveLength(3);
  });

  it("reads every row from Qwen-style model tables", () => {
    const offers = parseQwenApi(
      raw(`<h2>中国内地</h2><table>
        <tr><th>模型 ID（Model ID）</th><th>模式</th><th>输入单价（每百万Token）</th><th>输出单价（每百万Token）</th></tr>
        <tr><td>qwen3.7-max</td><td>标准</td><td>2元</td><td>8元</td></tr>
        <tr><td>qwen3.7-plus</td><td>标准</td><td>0.8元</td><td>3.2元</td></tr>
      </table>`),
    );
    expect(offers).toHaveLength(4);
    expect(offers.map((offer) => offer.modelName)).toContain("qwen3.7-plus");
    expect(offers.every((offer) => offer.unit === "/百万 tokens")).toBe(true);
  });

  it("expands rowspans and normalizes per-thousand token prices", () => {
    const offers = parseBaiduApi(
      raw(`<table>
        <tr><th>模型名称</th><th>版本</th><th>子项</th><th>在线推理</th></tr>
        <tr><td rowspan="2">ERNIE 5.1</td><td rowspan="2">ERNIE-5.1</td><td>输入</td><td>0.004</td></tr>
        <tr><td>输出</td><td>0.018</td></tr>
      </table>`),
    );
    expect(offers).toHaveLength(2);
    expect(offers.map((offer) => offer.amountMinor)).toEqual([400, 1800]);
    expect(offers[1].modelName).toBe("ERNIE 5.1");
  });

  it("keeps all Hunyuan and MiniMax model rows", () => {
    const hunyuan = parseHunyuanApi(
      raw(`<table>
        <tr><th>模型名称</th><th>条件</th><th>输入</th><th>输出</th><th>缓存</th></tr>
        <tr><td>Hy3</td><td>标准</td><td>1</td><td>4</td><td>0.25</td></tr>
        <tr><td>Hy3-preview</td><td>标准</td><td>2</td><td>8</td><td>0.5</td></tr>
      </table>`),
    );
    const minimax = parseMiniMaxApi(
      raw(`<table>
        <tr><th>模型</th><th>输入</th><th>输出</th><th>缓存读取</th><th>缓存写入</th></tr>
        <tr><td>MiniMax-M3</td><td>2</td><td>8</td><td>0.4</td><td>2.5</td></tr>
        <tr><td>MiniMax-M2.7</td><td>2.1</td><td>8.4</td><td>0.42</td><td>2.625</td></tr>
      </table>`),
    );
    expect(hunyuan).toHaveLength(6);
    expect(minimax).toHaveLength(8);
  });

  it("reads every Kimi model row in the official data block", () => {
    const offers = parseKimiApi(
      raw(`rows={[
        ["kimi-k3", "1M tokens", "¥2", "¥20", "¥100"],
        ["kimi-k2.5", "1M tokens", "¥1", "¥10", "¥50"]
      ]}`),
    );
    expect(offers).toHaveLength(6);
    expect(offers.filter((offer) => offer.modelOrder === 1)).toHaveLength(3);
  });

  it("classifies cache misses as uncached input", () => {
    const offers = parseLongCatApi(
      raw(`<table><tr><th>类型</th><th>原价</th><th>折扣</th></tr>
        <tr><td>缓存未命中输入</td><td>¥5</td><td>¥2</td></tr>
        <tr><td>缓存命中输入</td><td>¥0.1</td><td>¥0.04</td></tr>
        <tr><td>输出</td><td>¥20</td><td>¥8</td></tr></table>`),
    );
    expect(offers.map((offer) => offer.priceType)).toEqual([
      "input",
      "cached_input",
      "output",
    ]);
  });
});
