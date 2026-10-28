// Check house files: npm run validate [house ...] [--json]
// Prints every error and warning with its path in the file. Exits with 1 when there are errors.
import { loadCatalog, loadHouse, houseKeys, printIssues } from './lib';

const args = process.argv.slice(2);
const json = args.includes('--json');
const keys = args.filter(a => !a.startsWith('--'));
const catalog = loadCatalog();
let errors = 0;
const out: Record<string, unknown> = {};
for (const key of keys.length ? keys : houseKeys()) {
  const house = loadHouse(key, catalog);
  errors += house.issues.filter(i => i.level === 'error').length;
  if (json) out[key] = house.issues;
  else printIssues(house);
}
if (json) console.log(JSON.stringify(out, null, 2));
process.exit(errors ? 1 : 0);
