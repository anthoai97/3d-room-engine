// Convert a plan without the server: npm run convert -- <plan.pdf|png|jpg> [--name key] [--brief "..."] [--page 2] [--save]
// --save also adds the result to the viewer's sample houses (src/houses/<key>.json + public/assets/plans/<key>.png).
import fs from 'node:fs';
import path from 'node:path';
import { runJob } from './convert';
import { REPO_DIR } from './env';
import { createJob } from './jobs';

const args = process.argv.slice(2);
const opt = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const file = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!file) {
  console.log('usage: npm run convert -- <plan.pdf|png|jpg> [--name key] [--brief "..."] [--page 2] [--save]');
  process.exit(1);
}

const job = createJob({ key: opt('name') ?? path.basename(file, path.extname(file)), brief: opt('brief') });
job.listeners.add(e => {
  const time = new Date(e.t).toLocaleTimeString();
  if (e.type === 'status') console.log(`${time}  [${e.stage}] ${e.message}`);
  if (e.type === 'thought') console.log(`${time}  model: ${e.text.replace(/\s+/g, ' ').slice(0, 300)}`);
  if (e.type === 'check') console.log(`${time}  version ${e.round}: ${e.rooms} rooms, ${e.items} items, ${e.errors} errors, ${e.warnings} warnings`);
  if (e.type === 'error') console.log(`${time}  ERROR ${e.message}`);
});
await runJob(job, fs.readFileSync(file), { page: Number(opt('page')) || undefined });
console.log(`\njob folder: ${path.relative(process.cwd(), job.dir)}`);
if (job.result) {
  console.log(`summary: ${job.result.summary}`);
  if (args.includes('--save')) {
    const house = JSON.parse(fs.readFileSync(path.join(job.dir, 'house.json'), 'utf8'));
    fs.copyFileSync(path.join(job.dir, 'plan.png'), path.join(REPO_DIR, 'public/assets/plans', `${job.key}.png`));
    house.plan.src = `assets/plans/${job.key}.png`;
    fs.writeFileSync(path.join(REPO_DIR, 'src/houses', `${job.key}.json`), JSON.stringify({ $schema: '../../house.schema.json', ...house }, null, 2) + '\n');
    console.log(`saved src/houses/${job.key}.json — open http://localhost:5173/?house=${job.key}`);
  } else console.log(`result: ${job.result.houseUrl} (start the server to open it in the viewer, or use --save)`);
}
process.exit(job.result ? 0 : 1);
