# Floor plan → 3D house pipeline

An HTTP server that takes a floor plan (PDF or image) and returns a house file the 3D Room Engine renders.

## How it works

The work is done by a [LangGraph](https://docs.langchain.com/oss/javascript/langgraph/overview) agent that loops until the house checks out:

```
upload ─► find_plan ─► agent ──write_house──► engine resolver + validator
          pick sheet,    ▲                    (same code as the viewer)
          crop drawing   │                               │
                         └── problems + plan picture ◄───┘
                             drawn over the original
                 finish ─► furnish ─► agent ──write_furniture──► (same checks, floor plan locked)
                                                   finish ─► house.json ─► 3D viewer (?src=…)
```

A PDF is usually a whole drawing set. The first step (`find_plan`) scores every page's text: sheet titles and room labels with sizes count for a page, electrical, foundation, roof and elevation words count against it. One quick vision call (Haiku by default) then confirms the floor plan sheet(s), one per storey, and boxes the drawing, which is rendered cropped at full detail. Images are used as they are. To skip detection, pass `page`.

The agent reads the plan with a vision model and builds **the floor plan only**: rooms (in feet for US plans), doors, windows, passes. It fixes everything the validator reports and everything it sees when comparing its plan picture with the original.

Then, with the floor plan locked, a second stage recreates **the furniture drawn on the sheet** (beds, sofas, tables, kitchen and bath fixtures, washer/dryer, closet rods) with `write_furniture`, using the same placement rules and checks. Furniture is simple built-in placeholder models: houses from the pipeline have `"furniture": "placeholder"`. Rooms with nothing drawn, or whose furniture can't be made error-free, keep the automatic furniture for their `type`. Choosing real catalog products is a later step. `PIPELINE_FURNISH=off` skips stage 2 and leaves the rooms empty by default; the upload page's "Place the furniture drawn on the plan" checkbox chooses per job.

## Run

The LLM goes through any OpenAI-compatible endpoint. The pipeline reads these variables from the repo's `.env` or `pipeline/.env`:

| Variable | Meaning |
| --- | --- |
| `AI_PROXY_BASE_URL` | e.g. `http://127.0.0.1:8317/v1` |
| `AI_PROXY_API_KEY` | key for that endpoint |
| `LLM_PROXY_MODEL` | a vision + tool-calling model, e.g. `claude-opus-5-5` |
| `LLM_EFFORT` | the agent's thinking effort: `low`, `medium`, `high` (default), `xhigh`, `max`. Sent as `reasoning_effort` |
| `LLM_PICKER_MODEL` | the model that finds the floor plan page in a PDF and boxes the drawing (at `low` effort), default `claude-haiku-5-5` |
| `PIPELINE_PORT` | default 8787 |
| `VIEWER_URL` | the 3D viewer, default `http://localhost:5173` |
| `PIPELINE_MAX_ROUNDS` | how many check rounds the agent gets for the floor plan, default 16 (half that for furniture) |
| `PIPELINE_FURNISH` | `off` skips the furniture stage by default (rooms are left empty); a job's `furnish` field overrides it |

```sh
cd pipeline
npm install
npm run dev                  # http://localhost:8787 — upload page included
# in the repo root, for the viewer:
npm run dev                  # http://localhost:5173
```

Or without the server:

```sh
npm run convert -- ~/plans/cottage.pdf --name cottage --brief "use page 2" --save
```

`--save` adds the result to the viewer's sample houses (`src/houses/cottage.json`).

## API

| Request | What it does |
| --- | --- |
| `POST /jobs` | multipart `file` (PDF/PNG/JPG), optional `name`, `brief` (notes for the agent), `page` (PDF page), `furnish` (`off` skips placing the drawn furniture). Returns `202 { id, events, status }` |
| `GET /jobs/:id/events` | Server-Sent Events: `status`, `thought` (what the model says), `check` (each version: errors, warnings, preview URLs), `done` (`houseUrl`, `viewerUrl`, `usage`), `error`. Replays past events, so you can connect late |
| `GET /jobs` | Recent jobs, newest first: name, status, time and cost |
| `GET /jobs/:id` | Status, result, tokens and cost so far (`usage`) and all events as JSON |
| `GET /jobs/:id/files/:name` | `plan.png` (the rasterised plan), `house.json` (best version), `house-v<n>.json`, `preview-<floor>F.png`, `job.json` (status, events with times, result, tokens and cost) |

```sh
curl -F file=@plan.pdf -F name=cottage http://localhost:8787/jobs
curl -N http://localhost:8787/jobs/<id>/events
```

The `done` event's `viewerUrl` opens the result in the 3D viewer: `http://localhost:5173/?src=<houseUrl>`.

Jobs are saved in `pipeline/jobs/<id>/` (git-ignored), so the upload page still lists them after a restart. A job that was running when the server stopped shows as failed.

## Tokens and cost

Every run adds up the tokens of each model call: input, cache reads and writes, and output (thinking included). At the end it prints them per model with their cost and keeps them in the job's `job.json`. `GET /jobs/:id` shows the totals so far, and the `done` event carries them. Costs use Anthropic's list prices in `src/llm.ts`; the proxy may bill differently, and a model without a price there is counted in tokens only.
