// One conversion: uploaded file -> agent (finds the plan, drafts and fixes the house) -> house file,
// reporting progress as job events. Its tokens and cost are logged at the end (and kept in job.json, see jobs.ts).
import { loadCatalog } from '../../tools/lib';
import { runAgent } from './agent';
import { env } from './env';
import { emit, fileUrl, type Job } from './jobs';
import { usageReport } from './llm';

export async function runJob(job: Job, upload: Buffer, opts: { page?: number; furnish?: boolean } = {}) {
  job.status = 'running';
  try {
    const result = await runAgent(job, upload, loadCatalog(), opts);
    const houseUrl = fileUrl(job, 'house.json');
    emit(job, {
      type: 'done', houseUrl, viewerUrl: `${env.viewerUrl}/?src=${encodeURIComponent(houseUrl)}`,
      errors: result.errors, warnings: result.warnings, summary: result.summary, usage: job.usage,
    });
    emit(job, { type: 'status', stage: 'done', message: result.errors ? `Finished with ${result.errors} errors` : 'Finished' });
  } catch (err) {
    console.error(`job ${job.id} failed`, err);
    emit(job, { type: 'error', message: (err as Error).message });
    emit(job, { type: 'status', stage: 'failed', message: (err as Error).message });
  } finally {
    console.log(`job ${job.id} (${job.key}) tokens and cost:\n${usageReport(job.usage)}`);
  }
}
