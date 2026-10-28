// Settings from the repo's .env (or pipeline/.env), overridable by real environment variables.
import fs from 'node:fs';
import path from 'node:path';

const PIPELINE_DIR = path.resolve(import.meta.dirname, '..');
export const REPO_DIR = path.resolve(PIPELINE_DIR, '..');

for (const file of [path.join(PIPELINE_DIR, '.env'), path.join(REPO_DIR, '.env')]) {
  if (fs.existsSync(file)) process.loadEnvFile(file); // doesn't overwrite variables that are already set
}

function need(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} (set it in .env)`);
  return v;
}

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];
const effort = (process.env.LLM_EFFORT ?? 'high') as Effort;
if (!EFFORTS.includes(effort)) throw new Error(`LLM_EFFORT must be one of ${EFFORTS.join(', ')}`);

export const env = {
  llmBaseUrl: need('AI_PROXY_BASE_URL'),
  llmApiKey: need('AI_PROXY_API_KEY'),
  llmModel: process.env.LLM_PROXY_MODEL ?? 'claude-opus-5-5',
  llmEffort: effort, // the agent's thinking effort
  pickerModel: process.env.LLM_PICKER_MODEL ?? 'claude-haiku-5-5', // finds the floor plan page in a PDF (low effort)
  port: Number(process.env.PIPELINE_PORT ?? 8787),
  // where this server is reachable from the browser, and where the 3D viewer runs
  publicUrl: process.env.PIPELINE_PUBLIC_URL ?? `http://localhost:${process.env.PIPELINE_PORT ?? 8787}`,
  viewerUrl: process.env.VIEWER_URL ?? 'http://localhost:5173',
  maxRounds: Number(process.env.PIPELINE_MAX_ROUNDS ?? 16),
  // stage 2: recreate the furniture drawn on the plan (placeholder models); "off" leaves the rooms empty
  furnish: process.env.PIPELINE_FURNISH !== 'off',
  jobsDir: path.join(PIPELINE_DIR, 'jobs'),
};
