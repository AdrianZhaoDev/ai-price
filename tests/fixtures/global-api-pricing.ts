export type GlobalApiFixture = {
  normal: string;
  missingField: string;
  modelChanges: string;
  invalidCurrencyUnit: string;
  mixedTiers: string;
};

export const openAiFixture: GlobalApiFixture = {
  normal: `## Flagship models
Prices per 1M tokens.
| Model | Input | Cached input | Cache writes | Output | Input | Cached input | Cache writes | Output |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-5.6-luna | $2.00 | $0.20 | $2.50 | $12.00 | $4.00 | $0.40 | $5.00 | $18.00 |`,
  missingField: `| Model | Input |
| --- | --- |
| gpt-5.6-sol | $2.00 |`,
  modelChanges: `Prices per 1M tokens.
| Model | Input | Cached input | Output |
| --- | --- | --- | --- |
| gpt-5.6-sol | $2.00 | $0.20 | $12.00 |
| gpt-5.5 | $0.20 | $0.02 | $1.20 |`,
  invalidCurrencyUnit: `| Model | Input | Cached input | Output |
| --- | --- | --- | --- |
| gpt-5.6-sol | €2.00 | €0.20 | €12.00 |
| gpt-5.6-terra | $2 / request | $0.20 / request | $12 / request |`,
  mixedTiers: `Prices per 1M tokens.
### Standard
| Model | Input | Cached input | Output |
| --- | --- | --- | --- |
| gpt-5.6-terra | $2.00 | $0.20 | $12.00 |
### Batch
| Model | Input | Cached input | Output |
| --- | --- | --- | --- |
| gpt-5.6-terra | $1.00 | $0.10 | $6.00 |`,
};

export const claudeFixture: GlobalApiFixture = {
  normal: `## Model pricing
| Model | Base Input Tokens | 5m Cache Writes | Cache Hits & Refreshes | Output Tokens |
| --- | --- | --- | --- | --- |
| Claude Opus 5 | $5 / MTok | $6.25 / MTok | $0.50 / MTok | $25 / MTok |`,
  missingField: `| Model | Base Input Tokens |
| --- | --- |
| Claude Opus 5 | $5 / MTok |`,
  modelChanges: `| Model | Base Input Tokens | Cache Hits & Refreshes | Output Tokens |
| --- | --- | --- | --- |
| Claude Opus 5 | $5 / MTok | $0.50 / MTok | $25 / MTok |
| Claude Sonnet 5 | $3 / MTok | $0.30 / MTok | $15 / MTok |`,
  invalidCurrencyUnit: `| Model | Base Input Tokens | Cache Hits & Refreshes | Output Tokens |
| --- | --- | --- | --- |
| Claude Opus 5 | €5 / MTok | €0.50 / MTok | €25 / MTok |
| Claude Sonnet 5 | $5 / call | $0.50 / call | $25 / call |`,
  mixedTiers: `<table>
    <tr><th>Model</th><th>Base Input Tokens</th><th>Cache Hits & Refreshes</th><th>Output Tokens</th></tr>
    <tr><td>Claude Opus 5</td><td>$5 / MTok</td><td>$0.50 / MTok</td><td>$25 / MTok</td></tr>
  </table><table>
    <tr><th>Model</th><th>Batch input</th><th>Batch output</th></tr>
    <tr><td>Claude Opus 5</td><td>$2.50 / MTok</td><td>$12.50 / MTok</td></tr>
  </table>`,
};

export const geminiFixture: GlobalApiFixture = {
  normal: `<h2>Gemini 3.6 Flash</h2><h3>Standard</h3><table>
    <tr><th></th><th>Free Tier</th><th>Paid Tier, per 1M tokens in USD</th></tr>
    <tr><td>Input price</td><td>Free of charge</td><td>$1.50</td></tr>
    <tr><td>Output price</td><td>Free of charge</td><td>$7.50</td></tr>
    <tr><td>Context caching price</td><td>Free of charge</td><td>$0.15</td></tr>
  </table>`,
  missingField: `<h2>Gemini 3.6 Flash</h2><table>
    <tr><th></th><th>Free Tier</th></tr>
    <tr><td>Input price</td><td>Free of charge</td></tr>
  </table>`,
  modelChanges: `<h2>Gemini 3.6 Flash</h2><h3>Standard</h3><table>
    <tr><th></th><th>Paid Tier, per 1M tokens in USD</th></tr>
    <tr><td>Input price</td><td>$1.50</td></tr><tr><td>Output price</td><td>$7.50</td></tr>
  </table><h2>Gemini 3.5 Flash</h2><h3>Standard</h3><table>
    <tr><th></th><th>Paid Tier, per 1M tokens in USD</th></tr>
    <tr><td>Input price</td><td>$1.00</td></tr><tr><td>Output price</td><td>$5.00</td></tr>
  </table>`,
  invalidCurrencyUnit: `<h2>Gemini 3.6 Flash</h2><h3>Standard</h3><table>
    <tr><th></th><th>Paid Tier, per request in EUR</th></tr>
    <tr><td>Input price</td><td>€1.50</td></tr><tr><td>Output price</td><td>€7.50</td></tr>
  </table>`,
  mixedTiers: `<h2>Gemini 3.6 Flash</h2><h3>Standard</h3><table>
    <tr><th></th><th>Paid Tier, per 1M tokens in USD</th></tr>
    <tr><td>Input price</td><td>$1.50</td></tr><tr><td>Output price</td><td>$7.50</td></tr>
  </table><h3>Batch</h3><table>
    <tr><th></th><th>Paid Tier, per 1M tokens in USD</th></tr>
    <tr><td>Input price</td><td>$0.75</td></tr><tr><td>Output price</td><td>$3.75</td></tr>
  </table>`,
};

export const grokFixture: GlobalApiFixture = {
  normal: `### Text API Pricing
| Model | Context | Input / 1M tokens | Cached input / 1M tokens | Output / 1M tokens |
| --- | --- | --- | --- | --- |
| grok-4.6 | 500k | $2.00 | $0.50 | $6.00 |
| grok-4.5 (< 200k prompt tokens) | 500k | $2.00 | $0.30 | $6.00 |
| grok-4.5 (≥ 200k prompt tokens) | 500k | $4.00 | $0.60 | $12.00 |`,
  missingField: `| Model | Input / 1M tokens |
| --- | --- |
| grok-4.5 | $2.00 |`,
  modelChanges: `| Model | Input / 1M tokens | Cached input / 1M tokens | Output / 1M tokens |
| --- | --- | --- | --- |
| grok-4.6 | $2.00 | $0.50 | $6.00 |
| grok-4.5 | $2.00 | $0.30 | $6.00 |`,
  invalidCurrencyUnit: `| Model | Input / request | Cached input / request | Output / request |
| --- | --- | --- | --- |
| grok-4.5 | €2.00 | €0.30 | €6.00 |
| grok-4.3 | $2.00 / call | $0.30 / call | $6.00 / call |`,
  mixedTiers: `### Text API Pricing
| Model | Input / 1M tokens | Cached input / 1M tokens | Output / 1M tokens |
| --- | --- | --- | --- |
| grok-4.5 | $2.00 | $0.30 | $6.00 |
### Batch API Pricing
| Model | Input / 1M tokens | Cached input / 1M tokens | Output / 1M tokens |
| --- | --- | --- | --- |
| grok-4.5 | $1.60 | $0.24 | $4.80 |`,
};
