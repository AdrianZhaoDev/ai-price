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
| gpt-example-new | $2.00 | $0.20 | $2.50 | $12.00 | $4.00 | $0.40 | $5.00 | $18.00 |`,
  missingField: `| Model | Input |
| --- | --- |
| gpt-example | $2.00 |`,
  modelChanges: `Prices per 1M tokens.
| Model | Input | Cached input | Output |
| --- | --- | --- | --- |
| gpt-example-new | $2.00 | $0.20 | $12.00 |
| gpt-example-next | $0.20 | $0.02 | $1.20 |`,
  invalidCurrencyUnit: `| Model | Input | Cached input | Output |
| --- | --- | --- | --- |
| gpt-example-eur | €2.00 | €0.20 | €12.00 |
| gpt-example-request | $2 / request | $0.20 / request | $12 / request |`,
  mixedTiers: `Prices per 1M tokens.
### Standard
| Model | Input | Cached input | Output |
| --- | --- | --- | --- |
| gpt-example | $2.00 | $0.20 | $12.00 |
### Batch
| Model | Input | Cached input | Output |
| --- | --- | --- | --- |
| gpt-example | $1.00 | $0.10 | $6.00 |`,
};

export const claudeFixture: GlobalApiFixture = {
  normal: `## Model pricing
| Model | Base Input Tokens | 5m Cache Writes | Cache Hits & Refreshes | Output Tokens |
| --- | --- | --- | --- | --- |
| Claude Example 5 | $5 / MTok | $6.25 / MTok | $0.50 / MTok | $25 / MTok |`,
  missingField: `| Model | Base Input Tokens |
| --- | --- |
| Claude Example 5 | $5 / MTok |`,
  modelChanges: `| Model | Base Input Tokens | Cache Hits & Refreshes | Output Tokens |
| --- | --- | --- | --- |
| Claude Example 5 | $5 / MTok | $0.50 / MTok | $25 / MTok |
| Claude Example 4.8 | $5 / MTok | $0.50 / MTok | $25 / MTok |`,
  invalidCurrencyUnit: `| Model | Base Input Tokens | Cache Hits & Refreshes | Output Tokens |
| --- | --- | --- | --- |
| Claude Example EUR | €5 / MTok | €0.50 / MTok | €25 / MTok |
| Claude Example Call | $5 / call | $0.50 / call | $25 / call |`,
  mixedTiers: `<table>
    <tr><th>Model</th><th>Base Input Tokens</th><th>Cache Hits & Refreshes</th><th>Output Tokens</th></tr>
    <tr><td>Claude Example 5</td><td>$5 / MTok</td><td>$0.50 / MTok</td><td>$25 / MTok</td></tr>
  </table><table>
    <tr><th>Model</th><th>Batch input</th><th>Batch output</th></tr>
    <tr><td>Claude Example 5</td><td>$2.50 / MTok</td><td>$12.50 / MTok</td></tr>
  </table>`,
};

export const geminiFixture: GlobalApiFixture = {
  normal: `<h2>Gemini 3.6 Example</h2><h3>Standard</h3><table>
    <tr><th></th><th>Free Tier</th><th>Paid Tier, per 1M tokens in USD</th></tr>
    <tr><td>Input price</td><td>Free of charge</td><td>$1.50</td></tr>
    <tr><td>Output price</td><td>Free of charge</td><td>$7.50</td></tr>
    <tr><td>Context caching price</td><td>Free of charge</td><td>$0.15</td></tr>
  </table>`,
  missingField: `<h2>Gemini 3.6 Example</h2><table>
    <tr><th></th><th>Free Tier</th></tr>
    <tr><td>Input price</td><td>Free of charge</td></tr>
  </table>`,
  modelChanges: `<h2>Gemini 3.6 Example</h2><h3>Standard</h3><table>
    <tr><th></th><th>Paid Tier, per 1M tokens in USD</th></tr>
    <tr><td>Input price</td><td>$1.50</td></tr><tr><td>Output price</td><td>$7.50</td></tr>
  </table><h2>Gemini 3.5 Example</h2><h3>Standard</h3><table>
    <tr><th></th><th>Paid Tier, per 1M tokens in USD</th></tr>
    <tr><td>Input price</td><td>$1.00</td></tr><tr><td>Output price</td><td>$5.00</td></tr>
  </table>`,
  invalidCurrencyUnit: `<h2>Gemini 3.6 Example</h2><h3>Standard</h3><table>
    <tr><th></th><th>Paid Tier, per request in EUR</th></tr>
    <tr><td>Input price</td><td>€1.50</td></tr><tr><td>Output price</td><td>€7.50</td></tr>
  </table>`,
  mixedTiers: `<h2>Gemini 3.6 Example</h2><h3>Standard</h3><table>
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
| grok-example (< 200k prompt tokens) | 500k | $2.00 | $0.30 | $6.00 |
| grok-example (≥ 200k prompt tokens) | 500k | $4.00 | $0.60 | $12.00 |`,
  missingField: `| Model | Input / 1M tokens |
| --- | --- |
| grok-example | $2.00 |`,
  modelChanges: `| Model | Input / 1M tokens | Cached input / 1M tokens | Output / 1M tokens |
| --- | --- | --- | --- |
| grok-example-new | $2.00 | $0.30 | $6.00 |
| grok-example-next | $1.00 | $0.20 | $2.00 |`,
  invalidCurrencyUnit: `| Model | Input / request | Cached input / request | Output / request |
| --- | --- | --- | --- |
| grok-example-eur | €2.00 | €0.30 | €6.00 |
| grok-example-call | $2.00 | $0.30 | $6.00 |`,
  mixedTiers: `### Text API Pricing
| Model | Input / 1M tokens | Cached input / 1M tokens | Output / 1M tokens |
| --- | --- | --- | --- |
| grok-example | $2.00 | $0.30 | $6.00 |
### Batch API Pricing
| Model | Input / 1M tokens | Cached input / 1M tokens | Output / 1M tokens |
| --- | --- | --- | --- |
| grok-example | $1.60 | $0.24 | $4.80 |`,
};
