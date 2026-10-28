// Top-down plan of a resolved house as PNG (one per floor), drawn over the source plan when the house
// gives plan.bounds. Same drawing as `npm run shots`, rendered with resvg instead of a browser.
import { Resvg } from '@resvg/resvg-js';
import type { ResolvedHouse } from '../../src/layout/resolve';
import { planSvg } from '../../tools/plan';
import type { PlanImage } from './images';

export function renderPlans(house: ResolvedHouse, source?: PlanImage): Buffer[] {
  const image = source && { href: `data:image/png;base64,${source.png.toString('base64')}`, width: source.width, height: source.height };
  return house.floors.map((_, f) => {
    const svg = planSvg(house, f, image);
    return new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: 'Helvetica' }, fitTo: { mode: 'width', value: 1400 } }).render().asPng();
  });
}
