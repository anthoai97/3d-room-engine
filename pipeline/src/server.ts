// HTTP API: upload a floor plan (PDF or image), follow the agent as it works, open the result in the 3D viewer.
//
//   POST /jobs                  multipart: file, [brief], [name], [page], [furnish=off]  -> 202 { id, status, events }
//   GET  /jobs                  recent jobs, newest first
//   GET  /jobs/:id              job status and result
//   GET  /jobs/:id/events       live progress (Server-Sent Events), replays everything so far
//   GET  /jobs/:id/files/:name  plan.png, house.json, preview-1F.png, house-v3.json, job.json ...
//   GET  /                      a small upload page
import fs from 'node:fs';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { runJob } from './convert';
import { env } from './env';
import { createJob, getJob, listJobs } from './jobs';
import { UPLOAD_PAGE } from './page';

const app = new Hono();
app.use('*', cors());

app.get('/', c => c.html(UPLOAD_PAGE));

app.post('/jobs', async c => {
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return c.json({ error: 'send the floor plan as multipart field "file"' }, 400);
  const job = createJob({ key: typeof body.name === 'string' && body.name ? body.name : undefined, brief: typeof body.brief === 'string' ? body.brief : '' });
  const data = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(job.dir, `upload${path.extname(file.name) || ''}`), data);
  // furnish: "off" skips placing the drawn furniture; left out, PIPELINE_FURNISH decides
  const furnish = typeof body.furnish === 'string' ? !['off', 'false', '0'].includes(body.furnish) : undefined;
  void runJob(job, data, { page: Number(body.page) || undefined, furnish });
  return c.json({ id: job.id, key: job.key, status: `/jobs/${job.id}`, events: `/jobs/${job.id}/events` }, 202);
});

app.get('/jobs', c => c.json(listJobs()));

app.get('/jobs/:id', c => {
  const job = getJob(c.req.param('id'));
  if (!job) return c.json({ error: 'no such job' }, 404);
  return c.json({ id: job.id, key: job.key, status: job.status, result: job.result, usage: job.usage, events: job.events });
});

app.get('/jobs/:id/events', c => {
  const job = getJob(c.req.param('id'));
  if (!job) return c.json({ error: 'no such job' }, 404);
  return streamSSE(c, async stream => {
    // Each event's id is its index, so a browser that reconnects (sending Last-Event-ID) gets only what it missed.
    const send = (e: (typeof job.events)[number]) => stream.writeSSE({ id: String(job.events.indexOf(e)), event: e.type, data: JSON.stringify(e) });
    for (const e of job.events.slice(Number(c.req.header('Last-Event-ID') ?? -1) + 1)) await send(e);
    if (job.status === 'done' || job.status === 'failed') return;
    await new Promise<void>(resolve => {
      // Writes go out in order, and the stream closes only after the last one: closing earlier drops the final
      // events, and the browser then reconnects and gets everything again.
      let sending = Promise.resolve();
      const listener = (e: (typeof job.events)[number]) => {
        sending = sending.then(() => send(e));
        if (e.type === 'status' && (e.stage === 'done' || e.stage === 'failed')) void sending.then(finish);
      };
      const finish = () => { job.listeners.delete(listener); resolve(); };
      job.listeners.add(listener);
      stream.onAbort(finish);
    });
  });
});

const TYPES: Record<string, string> = { '.png': 'image/png', '.json': 'application/json', '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
// Files are read from the job folder, so results from earlier runs (or `npm run convert`) stay available.
app.get('/jobs/:id/files/:name', c => {
  const id = path.basename(c.req.param('id')), name = path.basename(c.req.param('name'));
  const file = path.join(env.jobsDir, id, name);
  if (!fs.existsSync(file)) return c.json({ error: 'not found' }, 404);
  return c.body(fs.readFileSync(file), 200, { 'Content-Type': TYPES[path.extname(name)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
});

serve({ fetch: app.fetch, port: env.port }, info => {
  console.log(`house pipeline on http://localhost:${info.port} (model ${env.llmModel} at ${env.llmEffort} effort, page picker ${env.pickerModel}, viewer ${env.viewerUrl})`);
});
