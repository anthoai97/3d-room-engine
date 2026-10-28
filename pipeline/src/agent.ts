// The conversion agent, as a LangGraph graph:
//   find_plan -> agent <-> tools -> furnish -> agent <-> tools -> end
// find_plan locates the floor plan sheet(s) in the upload (plans.ts). Stage 1: the model drafts the floor plan
// with write_house, which runs the engine's own resolver and validator and sends back the problems plus a
// rendered plan drawn over the original, round after round, until it checks out. Stage 2: with the floor plan
// locked, the model recreates the furniture drawn on the sheet with write_furniture, checked the same way.
import fs from 'node:fs';
import path from 'node:path';
import { tool } from '@langchain/core/tools';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { Annotation, END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph';
import { z } from 'zod';
import { resolveHouse, type ResolvedHouse } from '../../src/layout/resolve';
import type { Catalog } from '../../src/layout/items';
import { env } from './env';
import { emit, fileUrl, type Job } from './jobs';
import { addUsage, chatModel } from './llm';
import { findPlans, type FoundPlan } from './plans';
import { systemPrompt } from './prompt';
import { renderPlans } from './render';

type Stage = 'plan' | 'furnish' | 'done';
type House = Record<string, unknown> & { rooms: Record<string, unknown>[] };

const State = Annotation.Root({
  ...MessagesAnnotation.spec,
  stage: Annotation<Stage>({ reducer: (_, b) => b, default: () => 'plan' }),
});

const writeHouse = tool(async () => '', {
  name: 'write_house',
  description: 'Stage 1. Check and save the complete house file. Replies with every problem found (errors must be fixed) and then shows you a top-down picture of each floor drawn over the source plan.',
  schema: z.object({ house: z.record(z.string(), z.unknown()).describe('The complete house file (JSON object)') }),
});
const writeFurniture = tool(async () => '', {
  name: 'write_furniture',
  description: 'Stage 2. Set the furniture ("items") of some rooms; the floor plan stays as it is. Later calls replace the items of the rooms they list. Replies with the problems and a picture of the plan with the furniture.',
  schema: z.object({
    rooms: z.array(z.object({
      name: z.string().describe('Room name, as in the house file'),
      floor: z.number().int().optional().describe('Only when the name is on more than one floor'),
      items: z.array(z.record(z.string(), z.unknown())).describe('The room\'s items, in order'),
    })),
  }),
});
const finish = tool(async () => '', {
  name: 'finish',
  description: 'Finish the current stage when it has no errors (or you cannot improve it further).',
  schema: z.object({ summary: z.string().describe('Stage 1: one short paragraph about the house and anything you could not match. Stage 2: one line about the furniture') }),
});

interface Version { house: House; errors: number; warnings: number; resolved: ResolvedHouse }

export async function runAgent(job: Job, upload: Buffer, catalog: Catalog, opts: { page?: number; furnish?: boolean } = {}) {
  const models = { plan: chatModel().bindTools([writeHouse, finish]), furnish: chatModel().bindTools([writeFurniture, finish]) };
  const system = new SystemMessage(systemPrompt());
  const rounds = { plan: 0, furnish: 0 };
  const maxRounds = { plan: env.maxRounds, furnish: Math.ceil(env.maxRounds / 2) };
  const placeFurniture = opts.furnish ?? env.furnish; // stage 2 on or off for this job
  let plans: FoundPlan[] = [];
  const previewIds = new Set<string>();
  let best: Version | undefined; // stage 1: the floor plan
  let bestFurnished: Version | undefined; // stage 2
  const furnished = new Map<number, unknown[]>(); // room index -> items written in stage 2
  let version = 0, summary = '', furnitureSummary = '', furnishStarted = false;

  // fewer errors wins; on a tie the newer version does (it's the model's latest take on the drawing)
  const better = (v: Version, than?: Version) => !than || v.errors <= than.errors;
  const save = (house: House) => fs.writeFileSync(path.join(job.dir, 'house.json'), JSON.stringify(house, null, 2));

  // The engine checks the house exactly as the viewer will build it.
  function check(house: House): Version & { text: string; pngs: Buffer[] } {
    const resolved = resolveHouse(job.key, house, catalog);
    const errors = resolved.issues.filter(i => i.level === 'error'), warnings = resolved.issues.filter(i => i.level === 'warning');
    version++;
    fs.writeFileSync(path.join(job.dir, `house-v${version}.json`), JSON.stringify(house, null, 2));
    const pngs = resolved.rooms.length ? renderPlans(resolved, plans[0]) : [];
    pngs.forEach((png, f) => fs.writeFileSync(path.join(job.dir, `preview-${f + 1}F.png`), png));
    const items = resolved.rooms.reduce((n, r) => n + r.items.length, 0);
    emit(job, {
      type: 'check', round: version, errors: errors.length, warnings: warnings.length, rooms: resolved.rooms.length, items,
      previews: pngs.map((_, f) => `${fileUrl(job, `preview-${f + 1}F.png`)}?v=${version}`),
    });
    const lines = [...errors, ...warnings].slice(0, 80).map(i => `${i.level} ${i.path} ${i.where}: ${i.msg}`);
    const text = `Version ${version}: ${resolved.rooms.length} rooms, ${resolved.openings.length} openings, ${items} items — ${errors.length} errors, ${warnings.length} warnings.\n`
      + (lines.length ? lines.join('\n') : 'No problems.')
      + (pngs.length ? `\nThe plan picture${pngs.length > 1 ? 's' : ''} of this version follow${pngs.length > 1 ? '' : 's'}.` : '');
    return { house, errors: errors.length, warnings: warnings.length, resolved, text, pngs };
  }

  // Stage 1: floor plan only. With furniture on, each room gets automatic furniture from its type (placeholder
  // models) until stage 2; with it off, the rooms stay empty.
  function checkPlan(raw: Record<string, unknown>) {
    const rooms = (Array.isArray(raw.rooms) ? raw.rooms : []).map(r => { const { items: _, ...rest } = r as Record<string, unknown>; return placeFurniture ? rest : { ...rest, items: [] }; });
    const house: House = { ...raw, rooms, furniture: 'placeholder', plan: { title: 'Source floor plan', ...(raw.plan as object | undefined), src: fileUrl(job, 'plan.png') } };
    delete house.$schema;
    const v = check(house);
    if (better(v, best)) { best = v; save(house); }
    return v;
  }

  // Stage 2: the locked floor plan with the furniture written so far
  const withFurniture = () => ({ ...best!.house, rooms: best!.house.rooms.map((r, i) => (furnished.has(i) ? { ...r, items: furnished.get(i) } : r)) });
  function checkFurniture(rooms: { name: string; floor?: number; items: unknown[] }[]) {
    const unknown: string[] = [];
    for (const r of rooms) {
      const matches = best!.house.rooms.map((x, i) => [x, i] as const).filter(([x]) => x.name === r.name && (r.floor === undefined || (x.floor ?? 0) === r.floor));
      if (matches.length !== 1) unknown.push(matches.length ? `"${r.name}" is on more than one floor: add "floor"` : `no room named "${r.name}"`);
      else furnished.set(matches[0][1], r.items);
    }
    const v = check(withFurniture());
    if (better(v, bestFurnished)) bestFurnished = v;
    return { ...v, text: (unknown.length ? `Not applied: ${unknown.join('; ')}.\n` : '') + v.text };
  }

  // A room whose furniture still has errors at the end goes back to automatic furnishing, which never fails.
  function finalFurnished() {
    if (!bestFurnished) return;
    const bad = new Set(bestFurnished.resolved.issues.filter(i => i.level === 'error').map(i => Number(/^rooms\[(\d+)\]\.items/.exec(i.path)?.[1])).filter(n => !Number.isNaN(n)));
    const rooms = bestFurnished.house.rooms.map((r, i) => { if (!bad.has(i)) return r; const { items: _, ...rest } = r; return rest; });
    const house = { ...bestFurnished.house, rooms };
    const resolved = resolveHouse(job.key, house, catalog);
    if (resolved.issues.some(i => i.level === 'error')) return; // keep the floor plan alone
    if (bad.size) emit(job, { type: 'thought', text: `Furniture in ${bad.size} room(s) still had problems; those rooms use the automatic furniture.` });
    save(house);
    best = { house, errors: 0, warnings: resolved.issues.length, resolved };
  }

  const preview = (pngs: Buffer[]) => {
    const id = `preview-${version}`;
    previewIds.add(id);
    return new HumanMessage({
      id,
      content: [
        { type: 'text', text: `Plan picture of version ${version} (${pngs.length > 1 ? 'one per floor, ' : ''}drawn over the faded original; red = problems; grid labelled in the file's coordinates). Compare it with the source plan and keep going.` },
        ...pngs.map(png => ({ type: 'image_url' as const, image_url: { url: `data:image/png;base64,${png.toString('base64')}` } })),
      ],
    });
  };

  const graph = new StateGraph(State)
    .addNode('find_plan', async () => {
      emit(job, { type: 'status', stage: 'reading', message: 'Finding the floor plan' });
      plans = await findPlans(upload, { page: opts.page, log: text => emit(job, { type: 'thought', text }), usage: job.usage });
      plans.forEach((p, i) => fs.writeFileSync(path.join(job.dir, i ? `plan-${i + 1}.png` : 'plan.png'), p.png));
      emit(job, { type: 'status', stage: 'drafting', message: 'Reading the plan and drafting rooms' });
      const many = plans.length > 1;
      return {
        messages: [new HumanMessage({
          content: [
            { type: 'text', text: `Stage 1: convert this floor plan into a house file.${placeFurniture ? '' : ' Furniture is off for this job, so the rooms stay empty and there is no stage 2.'}${many ? ` There is one image per storey (floor 0 first); plan.bounds refers to the first image.` : ''}${job.brief ? `\n\nNotes from the user: ${job.brief}` : ''}` },
            ...plans.flatMap(p => [
              { type: 'text' as const, text: `${many ? `Floor ${p.floor}: ` : ''}image ${p.width} × ${p.height} px (${p.note}).` },
              { type: 'image_url' as const, image_url: { url: `data:image/png;base64,${p.png.toString('base64')}` } },
            ]),
          ],
        })],
      };
    })
    .addNode('agent', async state => {
      // only the latest plan pictures are worth their tokens; older ones become a note
      const latest = [...previewIds].at(-1);
      const messages = state.messages.map(m => (m.id && previewIds.has(m.id) && m.id !== latest ? new HumanMessage({ content: '(older plan picture removed)' }) : m));
      const ai = await models[state.stage === 'furnish' ? 'furnish' : 'plan'].invoke([system, ...messages]);
      addUsage(job.usage, env.llmModel, ai.usage_metadata);
      const text = typeof ai.content === 'string' ? ai.content : ai.content.map(c => ('text' in c ? c.text : '')).join('');
      if (text.trim()) emit(job, { type: 'thought', text: text.trim() });
      return { messages: [ai] };
    })
    .addNode('tools', async state => {
      const stage = state.stage as 'plan' | 'furnish';
      rounds[stage]++;
      const ai = state.messages.at(-1) as AIMessage;
      const out: BaseMessage[] = [];
      let pngs: Buffer[] = [], next: Stage = stage;
      for (const call of ai.tool_calls ?? []) {
        const reply = (content: string) => out.push(new ToolMessage({ tool_call_id: call.id!, content }));
        if (call.name === 'write_house' && stage === 'plan') {
          emit(job, { type: 'status', stage: 'checking', message: `Checking version ${version + 1}` });
          const house = call.args.house as Record<string, unknown> | undefined;
          if (!house || typeof house !== 'object') { reply('write_house needs { "house": { ...the whole house file... } }'); continue; }
          const v = checkPlan(house);
          reply(v.text);
          pngs = v.pngs;
        } else if (call.name === 'write_furniture' && stage === 'furnish') {
          emit(job, { type: 'status', stage: 'checking', message: `Checking furniture, version ${version + 1}` });
          const v = checkFurniture((call.args.rooms ?? []) as { name: string; floor?: number; items: unknown[] }[]);
          reply(v.text);
          pngs = v.pngs;
        } else if (call.name === 'finish') {
          const current = stage === 'plan' ? best : bestFurnished;
          const lastChance = rounds[stage] >= maxRounds[stage] - 1;
          if (!current && stage === 'plan') reply('Nothing written yet: call write_house first.');
          else if (current && current.errors > 0 && !lastChance) reply(`The best version still has ${current.errors} errors. Fix them first.`);
          else {
            if (stage === 'plan') summary = String(call.args.summary ?? '');
            else furnitureSummary = String(call.args.summary ?? '');
            next = stage === 'plan' && placeFurniture && best && best.errors === 0 ? 'furnish' : 'done';
            reply('Done.');
          }
        } else reply(`${call.name} isn't available in this stage.`);
      }
      if (pngs.length && next === stage) out.push(preview(pngs));
      if (next === stage && rounds[stage] >= maxRounds[stage]) next = stage === 'plan' && placeFurniture && best && best.errors === 0 ? 'furnish' : 'done';
      return { messages: out, stage: next };
    })
    // Stage 2 begins: the floor plan is locked, the drawing's furniture comes next
    .addNode('furnish', () => {
      emit(job, { type: 'status', stage: 'drafting', message: 'Placing the furniture drawn on the plan' });
      const v = check(withFurniture()); // the automatic furniture, as a starting picture only
      return {
        messages: [
          new HumanMessage(`Stage 2 starts now. The floor plan is final (version ${version}, ${v.resolved.rooms.length} rooms). Now recreate the furniture drawn on the plan with write_furniture, as described in the stage 2 instructions. Below is the plan as it stands, with the automatic furniture each room has until you set its items.`),
          preview(v.pngs),
        ],
      };
    })
    .addNode('nudge', state => ({
      messages: [new HumanMessage(state.stage === 'furnish'
        ? 'Keep going: call write_furniture, or finish when the furniture matches the drawing and has no errors.'
        : 'Keep going: call write_house with the whole house file, or finish when it has no errors.')],
    }))
    .addEdge(START, 'find_plan')
    .addEdge('find_plan', 'agent')
    .addConditionalEdges('agent', state => {
      const ai = state.messages.at(-1) as AIMessage;
      if (ai.tool_calls?.length) return 'tools';
      const stage = state.stage === 'furnish' ? 'furnish' : 'plan';
      return rounds[stage] >= maxRounds[stage] ? END : 'nudge';
    }, ['tools', 'nudge', END])
    .addConditionalEdges('tools', state => {
      if (state.stage === 'done') return END;
      // just switched to furniture: the tools node returned 'furnish' after a stage-1 finish
      if (state.stage === 'furnish' && !furnishStarted) { furnishStarted = true; return 'furnish'; }
      return 'agent';
    }, ['agent', 'furnish', END])
    .addEdge('furnish', 'agent')
    .addEdge('nudge', 'agent')
    .compile();

  await graph.invoke({ messages: [] }, { recursionLimit: (maxRounds.plan + maxRounds.furnish) * 3 + 20 });

  if (!best) throw new Error('The model never produced a house file');
  finalFurnished();
  return { ...best, summary: [summary, furnitureSummary].filter(Boolean).join(' ') };
}
