// Find the floor plan(s) in an upload. A PDF is usually a whole drawing set (site plan, stormwater forms,
// floor plan, electrical plan, elevations, foundation, roof...). Page text narrows it down to a few
// candidates; then the vision model looks at them, picks the floor plan sheet(s) and boxes the drawing,
// which is rendered cropped so the agent reads it at full detail.
import { HumanMessage, type AIMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { env } from './env';
import { addUsage, chatModel, type Usage } from './llm';
import { imageToPlan, isPdf, renderPdfPage, scorePdfPages, type Box, type PlanImage } from './images';

export interface FoundPlan extends PlanImage { floor: number; note: string }

const selectPlans = tool(async () => '', {
  name: 'select_floor_plans',
  description: 'Report which page(s) hold the floor plan and where the drawing is on each.',
  schema: z.object({
    plans: z.array(z.object({
      page: z.number().int().describe('Page number as labelled'),
      box: z.tuple([z.number(), z.number(), z.number(), z.number()]).describe('Pixel box [left, top, right, bottom] of the floor plan drawing in that page image, including its dimension lines; excluding title block, notes, schedules and legends'),
      floor: z.number().int().describe('0 = ground floor, 1 = the floor above, ...'),
    })).min(1),
  }),
});

export async function findPlans(upload: Buffer, opts: { page?: number; log: (msg: string) => void; usage: Record<string, Usage> }): Promise<FoundPlan[]> {
  if (!isPdf(upload)) return [{ ...(await imageToPlan(upload)), floor: 0, note: 'uploaded image' }];

  // 1. Candidate pages from their text (scanned PDFs have none: then every page is a candidate)
  let candidates: number[];
  if (opts.page) candidates = [opts.page];
  else {
    const scores = (await scorePdfPages(upload)).sort((a, b) => b.score - a.score);
    const best = scores[0];
    if (best.score >= 10 && (scores[1]?.score ?? 0) <= best.score / 2) candidates = [best.page];
    else candidates = scores.filter(s => s.score > 0).slice(0, 4).map(s => s.page);
    if (!candidates.length) candidates = scores.slice(0, 12).map(s => s.page).sort((a, b) => a - b);
    opts.log(`${scores.length} pages; candidate${candidates.length > 1 ? 's' : ''}: page ${candidates.join(', ')}`);
  }

  // 2. The model picks the floor plan page(s) and boxes the drawing
  const size = candidates.length > 1 ? 1000 : 1500;
  const thumbs = await Promise.all(candidates.map(p => renderPdfPage(upload, p, size)));
  let picks: { page: number; box: number[]; floor: number }[] = [];
  try {
    const model = chatModel({ model: env.pickerModel, effort: 'low', maxTokens: 8000, timeoutMs: 3 * 60_000 }).bindTools([selectPlans]);
    const ai = (await model.invoke([new HumanMessage({
      content: [
        { type: 'text', text: `These are pages from an architectural drawing set. Which hold the house's floor plan: the room layout with walls, doors, windows and room names? Not the electrical, plumbing, foundation, framing, roof or site plan. If the house has several storeys, give each storey's plan. For each, give the pixel box of the plan drawing on that page. Call select_floor_plans.` },
        ...thumbs.flatMap(t => [
          { type: 'text' as const, text: `Page ${t.page} (${t.width} × ${t.height} px):` },
          { type: 'image_url' as const, image_url: { url: `data:image/png;base64,${t.png.toString('base64')}` } },
        ]),
      ],
    })])) as AIMessage;
    addUsage(opts.usage, env.pickerModel, ai.usage_metadata);
    picks = (ai.tool_calls?.find(c => c.name === 'select_floor_plans')?.args.plans ?? []) as typeof picks;
  } catch (err) {
    opts.log(`couldn't ask the model to pick the page (${(err as Error).message}); using page ${candidates[0]}`);
  }
  picks = picks.filter(p => thumbs.some(t => t.page === p.page));
  if (!picks.length) picks = [{ page: candidates[0], box: [], floor: 0 }];

  // 3. Render each pick cropped to its drawing (with a small margin)
  const out: FoundPlan[] = [];
  for (const p of picks.sort((a, b) => a.floor - b.floor)) {
    const t = thumbs.find(t => t.page === p.page)!;
    let crop: Box = [0, 0, 1, 1];
    if (p.box?.length === 4) {
      const [l, tp, r, b] = p.box;
      const m = 0.02;
      crop = [Math.max(0, l / t.width - m), Math.max(0, tp / t.height - m), Math.min(1, r / t.width + m), Math.min(1, b / t.height + m)];
      if (crop[2] - crop[0] < 0.1 || crop[3] - crop[1] < 0.1) crop = [0, 0, 1, 1];
    }
    out.push({ ...(await renderPdfPage(upload, p.page, 2000, crop)), floor: p.floor, note: `page ${p.page}${crop[2] - crop[0] < 1 ? ', cropped to the drawing' : ''}` });
  }
  opts.log(`using ${out.map(o => `${o.note} (floor ${o.floor})`).join('; ')}`);
  return out;
}
