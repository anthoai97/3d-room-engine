// The chat model behind the pipeline, reached through an OpenAI-compatible endpoint (.env), and what its calls cost.
// Effort is sent as `reasoning_effort`, which the proxy maps to the model's thinking effort. It goes in
// modelKwargs because ChatOpenAI's own `reasoning` option is only sent for OpenAI's reasoning models.
import type { UsageMetadata } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { env, type Effort } from './env';

export function chatModel(opts: { model?: string; effort?: Effort; maxTokens?: number; timeoutMs?: number } = {}) {
  return new ChatOpenAI({
    model: opts.model ?? env.llmModel,
    apiKey: env.llmApiKey,
    configuration: { baseURL: env.llmBaseUrl },
    maxTokens: opts.maxTokens ?? 64000,
    timeout: opts.timeoutMs ?? 15 * 60_000,
    maxRetries: 2,
    modelKwargs: { reasoning_effort: opts.effort ?? env.llmEffort },
  });
}

// Anthropic list prices in USD per million tokens (platform.claude.com/docs/en/about-claude/pricing: standard
// rates, 5-minute cache writes at 1.25x input). The proxy may bill differently. Models missing here are counted
// in tokens but not priced.
interface Price { input: number; cacheWrite: number; cacheRead: number; output: number }
const price = (input: number, output: number, cacheRead: number): Price => ({ input, cacheWrite: input * 1.25, cacheRead, output });
const PRICES: Record<string, { base: Price; over100k?: Price }> = {
  'claude-fable-5-1': { base: price(10, 50, 0.25) },
  'claude-opus-5-5': { base: price(4, 20, 0.2) },
  'claude-sonnet-5-5': { base: price(2, 10, 0.1) },
  'claude-haiku-5-5': { base: price(0.1, 0.5, 0.01), over100k: price(0.5, 2.5, 0.05) }, // prompts over 100k tokens cost more
};

// One model's tokens over a job. cost is null when the model has no price or a reply came back without usage.
export interface Usage { calls: number; input: number; cacheRead: number; cacheWrite: number; output: number; cost: number | null }

// Adds one model reply to the job's per-model totals. The endpoint counts cached tokens inside input_tokens and
// thinking inside output_tokens.
export function addUsage(totals: Record<string, Usage>, model: string, u: UsageMetadata | undefined) {
  const t = (totals[model] ??= { calls: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, cost: 0 });
  t.calls++;
  if (!u) { t.cost = null; return; }
  const cacheRead = u.input_token_details?.cache_read ?? 0, cacheWrite = u.input_token_details?.cache_creation ?? 0;
  const input = Math.max(0, u.input_tokens - cacheRead - cacheWrite);
  t.input += input; t.cacheRead += cacheRead; t.cacheWrite += cacheWrite; t.output += u.output_tokens;
  const p = PRICES[model], r = p && (u.input_tokens > 100_000 && p.over100k ? p.over100k : p.base);
  t.cost = r && t.cost !== null ? t.cost + (input * r.input + cacheRead * r.cacheRead + cacheWrite * r.cacheWrite + u.output_tokens * r.output) / 1e6 : null;
}

// One line per model, then the total, for logs.
export function usageReport(totals: Record<string, Usage>) {
  const n = (v: number) => v.toLocaleString('en-US');
  const usd = (v: number) => `$${v.toFixed(3)}`;
  const lines = Object.entries(totals).map(([model, t]) =>
    `${model}: ${t.calls} call${t.calls === 1 ? '' : 's'}, ${n(t.input)} input + ${n(t.cacheRead)} cache read + ${n(t.cacheWrite)} cache write, ${n(t.output)} output tokens: ${t.cost === null ? 'no price' : usd(t.cost)}`);
  const unpriced = Object.values(totals).some(t => t.cost === null);
  return [...lines, `total: ${usd(totalCost(totals))}${unpriced ? ' (plus calls without a price)' : ''}`].join('\n');
}

// What the priced calls cost in all.
export const totalCost = (totals: Record<string, Usage>) => Object.values(totals).reduce((sum, t) => sum + (t.cost ?? 0), 0);
