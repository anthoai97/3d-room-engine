// Shared helpers for the command-line tools.
import fs from 'node:fs';
import path from 'node:path';
import { resolveHouse, type ResolvedHouse } from '../src/layout/resolve';
import type { Catalog } from '../src/layout/items';

export const ROOT = path.resolve(import.meta.dirname, '..');
const HOUSES_DIR = path.join(ROOT, 'src/houses');

// The furniture catalog lives outside git; without it every item uses its built-in version.
export function loadCatalog(): Catalog {
  const file = path.join(ROOT, 'public/assets/models/manifest.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
}

export function houseKeys() {
  return fs.readdirSync(HOUSES_DIR).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')).sort();
}

// Accepts a house key ("adu") or a path to a JSON file.
export function loadHouse(keyOrPath: string, catalog: Catalog): ResolvedHouse {
  const file = keyOrPath.endsWith('.json') ? path.resolve(keyOrPath) : path.join(HOUSES_DIR, `${keyOrPath}.json`);
  const key = path.basename(file, '.json');
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return { ...resolveHouse(key, {}, catalog), issues: [{ level: 'error', path: '', where: file, msg: `can't read: ${(err as Error).message}` }] };
  }
  const house = resolveHouse(key, raw, catalog);
  if (house.plan && !fs.existsSync(path.join(ROOT, 'public', house.plan.src)))
    house.issues.push({ level: 'error', path: 'plan.src', where: 'plan', msg: `public/${house.plan.src} doesn't exist` });
  return house;
}

export function printIssues(house: ResolvedHouse) {
  const errors = house.issues.filter(i => i.level === 'error'), warnings = house.issues.filter(i => i.level === 'warning');
  const items = house.rooms.reduce((n, r) => n + r.items.length, 0);
  console.log(`\n${house.key}: ${house.rooms.length} rooms, ${house.openings.length} openings, ${items} items — ${errors.length} errors, ${warnings.length} warnings`);
  for (const i of [...errors, ...warnings]) console.log(`  ${i.level === 'error' ? 'error  ' : 'warning'} ${i.path.padEnd(22)} ${i.where}: ${i.msg}`);
}
