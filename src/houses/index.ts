// Every *.json file in this folder is a house; drop a new file here and it shows up in the house selector.
// Open one with ?house=<file name>.
const files = import.meta.glob('./*.json', { eager: true, import: 'default' });

const FIRST = ['family', 'adu'];
export const HOUSE_FILES: Record<string, unknown> = Object.fromEntries(
  Object.entries(files)
    .map(([path, data]) => [path.slice(2, -5), data] as const)
    .sort(([a], [b]) => (FIRST.indexOf(a) + 1 || 99) - (FIRST.indexOf(b) + 1 || 99) || a.localeCompare(b)),
);
