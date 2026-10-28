// Write house.schema.json from the Zod schema (src/layout/schema.ts): npm run schema
// House files point at it with "$schema", so editors and LLMs get completion and checking.
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { House } from '../src/layout/schema';
import { ROOT } from './lib';

const schema = z.toJSONSchema(House, { io: 'input', target: 'draft-2020-12' });
const out = { ...schema, title: 'House', description: 'A house for the 3D room engine. See docs/house-format.md.' };
fs.writeFileSync(path.join(ROOT, 'house.schema.json'), JSON.stringify(out, null, 2) + '\n');
console.log('wrote house.schema.json');
