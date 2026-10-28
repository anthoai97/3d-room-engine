// List every item a house file can use: npm run items [-- --ft] [--json]
// Shows the size the placement solver works with: the catalog product's size when its model is installed,
// otherwise the built-in version's.
import { ITEM_KEYS, SWATCHES, footprint, itemDef } from '../src/layout/items';
import { loadCatalog } from './lib';

const catalog = loadCatalog();
const ft = process.argv.includes('--ft'), unit = ft ? 'ft' : 'm', k = ft ? 1 / 0.3048 : 1;
const rows = ITEM_KEYS.map(key => {
  const def = itemDef(key);
  const fp = footprint(key, {}, catalog);
  return {
    key, group: def.group, size: [fp.w, fp.d, fp.h].map(v => +(v * k).toFixed(2)),
    model: fp.model ? 'catalog' : 'built-in',
    notes: [def.mount === 'wall' && 'wall decor', def.mount === 'top' && 'goes on another item', def.resizable && !fp.model && 'w/d', def.colorable && !fp.model && 'color'].filter(Boolean).join(', '),
    desc: def.desc,
  };
});
if (process.argv.includes('--json')) console.log(JSON.stringify({ unit, items: rows, swatches: Object.keys(SWATCHES) }, null, 2));
else {
  let group = '';
  for (const r of rows) {
    if (r.group !== group) console.log(`\n${(group = r.group).toUpperCase()}`);
    console.log(`  ${r.key.padEnd(15)} ${r.size.map(v => v.toFixed(2)).join(' x ').padEnd(19)} ${r.model.padEnd(9)} ${r.desc}${r.notes ? `  [${r.notes}]` : ''}`);
  }
  console.log(`\nSizes are width x depth x height in ${ft ? 'feet' : 'metres (--ft for feet)'}. Width runs along the wall an item backs onto.`);
  console.log(`Colour swatches: ${Object.keys(SWATCHES).join(', ')}`);
}
