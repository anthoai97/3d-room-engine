# Development Rules

## Writing Mode

- Keep plans and documents concise without sacrificing clarity.
- At the end of each plan, give me a list of unresolved questions to answer, if any.

## Engineering principles

- Keep edits minimal. Delete obsolete code instead of layering compatibility paths.
- Modify existing functions in place. Do not create a new version of, or rename, a function.
- Do not over-engineering.
- Aim for simple, elegant implementations.
- Let agents interpret intent. Validate tool arguments and execution safety, not user wording. Avoid regex intent checks and redundant confirmations.
- Do not write tests for reversible, low-impact changes that mirror the implementation. If you do choose to verify your work with tests, make sure that the tests are meaningful and necessary to verify implementation.
- Run tests appropriate to the change and complete required checks. Once those pass, broaden or repeat testing only when new changes, failures, or unresolved concerns justify it; otherwise, continue toward completing the task.
- Delegate concrete independent work to built-in Claude Code subagents when the benefit outweighs coordination overhead.
- DO NOT CHANGE ANY CONTRACT VERSION JUST REPLACE DIRECTLY

## Principles

Adapted from the pstack principle skills in [cursor/plugins](https://github.com/cursor/plugins) (MIT).

- **Explain the number.** Before you trust or report a measured result, such as a speedup, a regression, or an eval score, state the run count, the spread, and what limits it. Rule out other explanations: errors, skipped or cached work, code that never ran, noise, or a changed setup. One run of a nondeterministic system, such as an LLM, proves little.
- **Prove it works.** Check the real result: run the feature, read the actual value, inspect the output. Passing tests, mocks, "it compiles", and agent self-reports are stand-ins. Prefer one cheap real run or a rerunnable script over a one-time look.
- **Attack the premise.** When two fixes that share one assumption fail the same check, write the assumption down and test it before you try a third fix.
- **Encode lessons in structure.** When a rule has to be repeated, enforce it with a lint, hook, test fixture, or script instead of more text. Keep text only for rules that need judgment, and add an example of the failure.
- **Boundary discipline.** Validate and parse data once where it enters the system: requests, config, CLI arguments, external APIs, LLM output, database rows. Inside, trust the types and keep business logic in plain functions.
- **Type system discipline.** Give values that mean different things their own types, even when both are strings, for example two kinds of ID. Derive types from the schema that owns the shape instead of writing a parallel one.
- **Model the domain.** Put each rule in one data structure, such as a table, map, state machine, or discriminated union, instead of if branches spread across files. Do not force an abstraction that removes no branches or duplicated rules.
- **Test behavior, not implementation.** A test must fail when the behavior breaks and keep passing when only the internals change. Asserting a constant's value tests nothing. Drive the code through its public interface with a concrete input, and derive the expected value from the requirement.
- **Build the lever.** For non-trivial edits, comparisons, or checks, write a small rerunnable script instead of working by hand. Keep it a script, not a framework.

## Conversational Style

- Keep answers short and concise
- No emojis in commits, issues, PR comments, or code
- No fluff or cheerful filler text (e.g., "Thanks @user" not "Thanks so much @user!")
- Use plain language over jargon, and reference technical details only to the degree that it helps illustrate an idea or your work to the user. Communicate complex concepts in a clear and cohesive manner, and calibrate your writing to the level of background knowledge assumed from the user's prompt and context.
- Prefer concrete behavior and small illustrations over abstract summaries, dense terminology, or unexplained lists of changes.
- When the user asks a question, answer it first before making edits or running implementation commands.
- When responding to user feedback or an analysis, explicitly say whether you agree or 
disagree before saying what you changed.

## Writing Issues

- Keep issue titles and descriptions short, plain, and easy to understand.
- Start with the user-facing problem or feature, then a few bullets describing expected behavior. Use concrete examples when helpful.
- Leave implementation plans, code references, contract details, and extensive acceptance/test checklists for later unless explicitly requested.
- Implementation plan should put under docs/plans with format <issue-#>-<feature>.md
- DO NOT INCLUDE Co-Authored-By: Claude into the commit message

## Code Quality

- Read affected code and relevant dependencies before editing or auditing. Read full files for wide-ranging changes or when local context is insufficient. Do not rely on search snippets for broad changes.
- No `any` unless absolutely necessary.
- Inline single-line helpers that have only one call site when doing so improves readability.
- Check node_modules for external API types; don't guess.
- Never remove or downgrade code to fix type errors from outdated deps; upgrade the dep instead.
- Ask before removing functionality or code that appears intentional unless that removal is already authorized by the current task.
- Do not preserve backward compatibility unless the user asks for it.

## User Override

Explicit task instructions override repository defaults. Ask about material unresolved scope decisions or missing authorization. Continue independent authorized work while waiting. This does not override sandbox or approval enforcement.

The user's instructions take precedence over guidelines provided in a skill. If explicit user instructions conflict with a skill's instructions, prioritize the user's instructions.

## This project: 3D Room Engine

Interactive 3D dollhouse (Vite + React + React Three Fiber + zustand + Zod). Houses are JSON files in `src/houses/`; the engine furnishes and renders them.

- House files are made from floor plans by `pipeline/`. The format is in `docs/house-format.md`: place furniture by relation and don't hand-compute coordinates.
- `src/layout/` is pure TypeScript with no three.js: the house schema, item registry, placement solver, auto-furnish recipes and validator. `src/engine/` builds the three.js objects, `src/scene/` holds the R3F components and `src/ui/Overlay.tsx` draws the overlay.
- `pipeline/` is a separate package: an HTTP server that converts floor plan PDFs and images into house files. It reads `AI_PROXY_*` and `LLM_PROXY_MODEL` from `.env`.
- A new built-in item needs an entry in `src/layout/items.ts` and a builder in `src/engine/furniture.ts`; `furniture.test.ts` checks that their sizes match.
- The catalog (`public/assets/models/`) is git-ignored. Without it every item uses its built-in model, and the sample houses must still validate with no errors.

Checks: `npm test`, `npm run check` (types), `npm run validate [house]`, `npm run shots -- <house> [--rooms]` (plan and 3D previews in `out/`). Run `npm run schema` after changing `src/layout/schema.ts`.
