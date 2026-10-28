import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ITEMS, ITEM_KEYS } from '../layout/items';
import { buildItem } from './furniture';

// The placement solver trusts the sizes in layout/items.ts, so the built-in models must match them.
describe('built-in furniture sizes', () => {
  for (const key of ITEM_KEYS) {
    it(key, () => {
      const opts = key === 'rug' ? { w: 2.5, d: 1.6 } : {};
      const box = new THREE.Box3().setFromObject(buildItem(key, opts));
      const size = box.getSize(new THREE.Vector3());
      const [w, d, h] = ITEMS[key].size(opts);
      expect(size.x).toBeCloseTo(w, 1);
      expect(size.z).toBeCloseTo(d, 1);
      expect(size.y).toBeCloseTo(h, 1);
      // centred on its footprint
      expect(Math.abs(box.min.x + box.max.x) / 2).toBeLessThan(0.01);
      expect(Math.abs(box.min.z + box.max.z) / 2).toBeLessThan(0.01);
    });
  }
});
