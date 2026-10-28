// Conversion jobs: each one has a folder under pipeline/jobs/<id> holding the source plan, every version of the
// house file, the latest previews and job.json: the job's status, its events (with times), result and token usage.
// job.json is rewritten on every event, so past jobs can still be listed and replayed after a server restart.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from './env';
import { totalCost, type Usage } from './llm';

export type JobEvent =
  | { type: 'status'; stage: 'queued' | 'reading' | 'drafting' | 'checking' | 'done' | 'failed'; message: string }
  | { type: 'thought'; text: string } // what the model says between tool calls
  | { type: 'check'; round: number; errors: number; warnings: number; rooms: number; items: number; previews: string[] }
  | { type: 'done'; houseUrl: string; viewerUrl: string; errors: number; warnings: number; summary: string; usage: Record<string, Usage> }
  | { type: 'error'; message: string };

export interface Job {
  id: string;
  key: string; // house key (file name) for the result
  brief: string; // extra instructions from the uploader
  created: number;
  dir: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  events: (JobEvent & { t: number })[];
  listeners: Set<(e: JobEvent & { t: number }) => void>;
  result?: Extract<JobEvent, { type: 'done' }>;
  usage: Record<string, Usage>; // tokens and cost per model so far
}

const jobs = new Map<string, Job>();

function save(job: Job) {
  const { dir, listeners: _, ...saved } = job;
  fs.writeFileSync(path.join(dir, 'job.json'), JSON.stringify(saved, null, 2));
}

export function createJob(opts: { key?: string; brief?: string }): Job {
  const id = randomUUID().slice(0, 8);
  const key = (opts.key ?? `plan-${id}`).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || `plan-${id}`;
  const dir = path.join(env.jobsDir, id);
  fs.mkdirSync(dir, { recursive: true });
  const job: Job = { id, key, brief: opts.brief ?? '', created: Date.now(), dir, status: 'queued', events: [], listeners: new Set(), usage: {} };
  jobs.set(id, job);
  save(job);
  return job;
}

// A job from this run of the server, or one saved by an earlier run. A saved job that never finished was cut
// off by a restart, so it's marked failed.
export function getJob(id: string): Job | undefined {
  const known = jobs.get(id);
  if (known) return known;
  const dir = path.join(env.jobsDir, path.basename(id)), file = path.join(dir, 'job.json');
  if (!fs.existsSync(file)) return undefined;
  const job: Job = { ...JSON.parse(fs.readFileSync(file, 'utf8')), dir, listeners: new Set() };
  jobs.set(job.id, job);
  if (job.status === 'queued' || job.status === 'running') {
    const message = 'Stopped: the server restarted while this job was running';
    emit(job, { type: 'error', message });
    emit(job, { type: 'status', stage: 'failed', message });
  }
  return job;
}

// Every saved job, newest first, as the upload page lists them.
export function listJobs() {
  const ids = fs.existsSync(env.jobsDir) ? fs.readdirSync(env.jobsDir) : [];
  return ids.map(id => getJob(id)).filter(job => job !== undefined).sort((a, b) => b.created - a.created).map(job => ({
    id: job.id, key: job.key, status: job.status, created: job.created,
    seconds: Math.floor(((job.events.at(-1)?.t ?? 0) - (job.events[0]?.t ?? 0)) / 1000), // same as the page's "total"
    cost: totalCost(job.usage),
  }));
}

export function emit(job: Job, e: JobEvent) {
  const ev = { ...e, t: Date.now() };
  job.events.push(ev);
  if (e.type === 'done') { job.status = 'done'; job.result = e; }
  if (e.type === 'error') job.status = 'failed';
  save(job);
  for (const l of job.listeners) l(ev);
}

export const fileUrl = (job: Job, name: string) => `${env.publicUrl}/jobs/${job.id}/files/${name}`;
