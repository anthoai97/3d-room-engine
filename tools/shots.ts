// Preview a house the way a reviewer sees it: npm run shots -- <house> [--rooms] [--no-3d]
//   1. validates it and prints every problem,
//   2. draws a top-down plan per floor (plan-1F.png): rooms, walls, doors with swings, windows, item
//      footprints labelled by id, problems in red, grid in the file's own coordinates,
//   3. renders the 3D dollhouse per floor (floor-1F.png) and, with --rooms, every room opened (room-<name>.png).
// Pictures go to out/<house>/. The house must be in src/houses/ for the 3D views.
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import { Browser, sleep } from './browser';
import { loadCatalog, loadHouse, printIssues, ROOT } from './lib';
import { planSvg } from './plan';

const args = process.argv.slice(2);
const target = args.find(a => !a.startsWith('--'));
if (!target) {
  console.log('usage: npm run shots -- <house> [--rooms] [--no-3d]');
  process.exit(1);
}
const house = loadHouse(target, loadCatalog());
printIssues(house);
const outDir = path.join(ROOT, 'out', house.key);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const written: string[] = [];

const browser = await Browser.launch();
try {
  // ---- plans ----
  let image: { href: string; width: number; height: number } | undefined;
  if (house.plan?.bounds) {
    const file = path.join(ROOT, 'public', house.plan.src);
    const buf = fs.readFileSync(file);
    if (buf.toString('ascii', 1, 4) === 'PNG') {
      const width = buf.readUInt32BE(16), height = buf.readUInt32BE(20); // from the PNG header
      image = { href: `data:image/png;base64,${buf.toString('base64')}`, width, height };
    } else console.log('(plan overlay needs a PNG plan image)');
  }
  for (let f = 0; f < house.floors.length; f++) {
    const svg = planSvg(house, f, image);
    const [, w, h] = svg.match(/width="([\d.]+)" height="([\d.]+)"/)!.map(Number);
    const file = path.join(outDir, `plan-${f + 1}F`);
    fs.writeFileSync(`${file}.svg`, svg);
    await browser.size(Math.ceil(w), Math.ceil(h));
    await browser.goto(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
    await sleep(400);
    await browser.shot(`${file}.png`);
    written.push(`${file}.png`, `${file}.svg`);
  }

  // ---- 3D views ----
  if (!args.includes('--no-3d')) {
    const inHouses = fs.existsSync(path.join(ROOT, 'src/houses', `${house.key}.json`));
    if (!inHouses) console.log(`\n(skipping 3D views: put the file in src/houses/ to render it)`);
    else {
      const server = await createServer({ root: ROOT, logLevel: 'silent', server: { port: 5190 } });
      await server.listen();
      const base = server.resolvedUrls!.local[0];
      await browser.size(1400, 900);
      const view = async (query: string, name: string, settle: number) => {
        await browser.goto(`${base}?house=${house.key}&${query}`);
        for (let i = 0; i < 120; i++) {
          await sleep(500);
          if (await browser.eval<boolean>('typeof window.__ready === "function" && window.__ready()')) break;
        }
        await sleep(settle);
        const file = path.join(outDir, `${name}.png`);
        await browser.shot(file);
        written.push(file);
      };
      for (let f = 0; f < house.floors.length; f++) await view(`floor=${f + 1}`, `floor-${f + 1}F`, 2500);
      if (args.includes('--rooms')) {
        for (const r of house.rooms) await view(`floor=${r.floor + 1}&room=${encodeURIComponent(r.name)}`, `room-${r.floor + 1}F-${r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`, 3000);
      }
      await server.close();
    }
  }
} finally {
  await browser.close();
}
const logs = browser.logs.filter(l => !l.includes('React DevTools') && !l.startsWith('House "'));
if (logs.length) console.log(`\nbrowser console:\n  ${logs.slice(0, 20).join('\n  ')}`);
console.log(`\nwrote:\n  ${written.map(f => path.relative(ROOT, f)).join('\n  ')}`);
process.exit(house.issues.some(i => i.level === 'error') ? 1 : 0);
