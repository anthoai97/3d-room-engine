// The pipeline's web page: upload a plan, watch each step (with its time) and the plan picture as the agent
// works, then open the result in the 3D viewer or download it. Past conversions are listed and can be reopened;
// the page address keeps the open one (?job=<id>), so a refresh doesn't lose it.
export const UPLOAD_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Floor plan to 3D</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  body { margin: 0; min-height: 100vh; font-family: Outfit, system-ui, sans-serif; color: #e6e7f5;
    background: linear-gradient(160deg, #1b1e36 0%, #12142a 50%, #090a16 100%); }
  main { max-width: 1100px; margin: 0 auto; padding: 32px 20px; display: grid; grid-template-columns: 340px 1fr; gap: 24px; align-items: start; }
  h1 { grid-column: 1 / -1; margin: 0; font-size: 30px; }
  h2 { margin: 0 0 12px; font-size: 17px; }
  .side { display: grid; gap: 24px; }
  .card { background: rgba(16,18,36,.72); border: 2px solid rgba(255,255,255,.12); border-radius: 14px; padding: 18px; }
  label { display: block; font-size: 13px; font-weight: 600; margin: 12px 0 6px; color: #c9cbe6; }
  input[type=text], input[type=number], textarea { width: 100%; padding: 9px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.06); color: #fff; font: inherit; }
  textarea { height: 80px; resize: vertical; }
  .drop { padding: 26px 12px; margin: 0; text-align: center; border: 2px dashed rgba(255,255,255,.25); border-radius: 12px; cursor: pointer; }
  .drop.has { border-color: #8f93d8; }
  .check { display: flex; gap: 8px; align-items: center; margin-top: 14px; cursor: pointer; }
  .check input { width: 16px; height: 16px; margin: 0; accent-color: #7a7ee6; }
  .hint { margin: 4px 0 0 24px; font-size: 12.5px; color: #8f93b8; }
  button { margin-top: 16px; width: 100%; padding: 12px; font: inherit; font-weight: 600; font-size: 16px; color: #fff; border: 2px solid rgba(255,255,255,.85);
    border-radius: 999px; background: linear-gradient(180deg, #7a7ee6, #4b4fa8); cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; }
  #jobs { list-style: none; margin: 0; padding: 0; font-size: 13.5px; max-height: 300px; overflow-y: auto; }
  #jobs li { display: flex; justify-content: space-between; gap: 10px; padding: 7px 8px; border-radius: 8px; cursor: pointer; }
  #jobs li:hover, #jobs li.active { background: rgba(255,255,255,.08); }
  #jobs li.empty { cursor: default; color: #8f93b8; background: none; }
  #jobs small { color: #8f93b8; white-space: nowrap; }
  #result { margin-bottom: 16px; }
  #stats { margin: 0 0 6px; font-weight: 600; }
  #stats.bad { color: #ff8fb8; }
  #summary { margin: 0 0 14px; color: #c9cbe6; font-size: 14px; }
  #open { display: block; padding: 12px 18px; border-radius: 999px; text-align: center; font-weight: 600; color: #fff; text-decoration: none;
    background: linear-gradient(180deg, #ff5f9e, #e5177e); border: 2px solid #fff; }
  #download { display: block; margin-top: 10px; text-align: center; font-size: 13.5px; color: #c9cbe6; }
  #log { list-style: none; margin: 0; padding: 0; font-size: 13.5px; max-height: 260px; overflow-y: auto; }
  #log li { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,.08); }
  #log li.thought { color: #a9acd0; }
  #log li.check b { color: #fff; }
  #log li.bad { color: #ff8fb8; }
  #log time { flex: none; color: #8f93b8; font-variant-numeric: tabular-nums; }
  #preview { display: block; width: 100%; margin-top: 12px; border-radius: 10px; background: #fff; }
  @media (max-width: 760px) { main { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<main>
  <h1>Floor plan → 3D house</h1>
  <div class="side">
    <form class="card" id="form">
      <label class="drop" id="drop"><span>Choose a PDF or image of the floor plan</span><input type="file" name="file" accept=".pdf,image/*" hidden required></label>
      <label>House name (optional)</label><input type="text" name="name" placeholder="e.g. cottage-a">
      <div id="pageField" hidden><label>PDF page with the floor plan (optional)</label><input type="number" name="page" min="1" placeholder="Found automatically"></div>
      <label>Notes for the agent (optional)</label><textarea name="brief" placeholder="e.g. The garage is not part of the house"></textarea>
      <label class="check"><input type="checkbox" id="furnish" checked> Place the furniture drawn on the plan</label>
      <p class="hint">Off: faster and cheaper; the rooms are left empty.</p>
      <button id="go">Convert</button>
    </form>
    <section class="card">
      <h2>Recent conversions</h2>
      <ul id="jobs"><li class="empty">None yet.</li></ul>
    </section>
  </div>
  <section class="card">
    <h2 id="title">Upload a plan to start.</h2>
    <div id="result" hidden>
      <p id="stats"></p>
      <p id="summary"></p>
      <a id="open" target="_blank">Open in the 3D viewer ↗</a>
      <a id="download">Download the house file</a>
    </div>
    <ul id="log"></ul>
    <img id="preview" alt="Plan picture" hidden>
  </section>
</main>
<script>
const $ = id => document.getElementById(id);
const form = $('form'), input = form.file, log = $('log');
const dur = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + String(s % 60).padStart(2, '0') + 's'; };
const money = v => '$' + v.toFixed(2);
const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');

input.onchange = () => {
  const f = input.files[0];
  $('drop').firstChild.textContent = f ? f.name : 'Choose a PDF or image of the floor plan';
  $('drop').classList.toggle('has', !!f);
  $('pageField').hidden = !(f && /\\.pdf$/i.test(f.name));
};

form.onsubmit = async e => {
  e.preventDefault();
  $('go').disabled = true;
  const body = new FormData(form);
  body.set('furnish', $('furnish').checked ? 'on' : 'off');
  const res = await fetch('/jobs', { method: 'POST', body });
  const job = await res.json();
  $('go').disabled = false;
  if (!res.ok) { $('title').textContent = job.error; return; }
  form.reset(); input.onchange();
  openJob(job.id, job.key);
  loadJobs();
};

// Each step shows how long it took (until the next one), counting up while it's the latest. Times come from the
// server's event timestamps, so they're right when a finished job is replayed too.
let source = null, step = null, start = 0, clock = 0, result = null;
const line = (text, cls, t) => {
  if (step) step.time.textContent = t - step.t < 1000 ? '' : dur(t - step.t);
  const li = document.createElement('li'), msg = document.createElement('span'), time = document.createElement('time');
  li.className = cls; msg.innerHTML = text; li.append(msg, time); log.append(li); log.scrollTop = log.scrollHeight;
  start ||= t; step = { time, t };
  return time;
};

function openJob(id, name) {
  if (source) source.close();
  clearInterval(clock);
  step = null; start = 0; result = null;
  history.replaceState(null, '', '?job=' + id);
  for (const li of $('jobs').children) li.classList.toggle('active', li.dataset.id === id);
  $('title').textContent = name; $('result').hidden = true; $('preview').hidden = true; log.innerHTML = '';
  clock = setInterval(() => { if (step) step.time.textContent = dur(Date.now() - step.t); }, 1000);
  const es = source = new EventSource('/jobs/' + id + '/events');
  es.addEventListener('status', m => {
    const s = JSON.parse(m.data), time = line(s.message.replace(/</g, '&lt;'), s.stage === 'failed' ? 'bad' : '', s.t);
    if (s.stage !== 'done' && s.stage !== 'failed') return;
    es.close(); clearInterval(clock); step = null;
    time.textContent = 'total ' + dur(s.t - start);
    showResult(s, dur(s.t - start));
    loadJobs();
  });
  es.addEventListener('thought', m => { const d = JSON.parse(m.data); line(d.text.slice(0, 400).replace(/</g, '&lt;'), 'thought', d.t); });
  es.addEventListener('check', m => {
    const c = JSON.parse(m.data);
    line('<b>Version ' + c.round + '</b>: ' + c.rooms + ' rooms, ' + c.items + ' items, ' + plural(c.errors, 'error') + ', ' + plural(c.warnings, 'warning'), 'check' + (c.errors ? ' bad' : ''), c.t);
    if (c.previews[0]) { $('preview').src = c.previews[0]; $('preview').hidden = false; }
  });
  es.addEventListener('done', m => { result = JSON.parse(m.data); });
}

// The outcome above the steps: what came out, how long it took, what it cost, and the way to the 3D house.
function showResult(s, took) {
  const ok = s.stage === 'done' && result;
  $('result').hidden = false;
  $('stats').className = ok ? '' : 'bad';
  $('open').hidden = $('download').hidden = !ok;
  if (!ok) { $('stats').textContent = '✗ Failed after ' + took; $('summary').textContent = s.message; return; }
  const cost = Object.values(result.usage || {}).reduce((sum, u) => sum + (u.cost ?? 0), 0);
  $('stats').textContent = '✓ Done in ' + took + ' · ' + plural(result.errors, 'error') + ', ' + plural(result.warnings, 'warning') + (cost ? ' · ' + money(cost) : '');
  $('summary').textContent = result.summary;
  $('open').href = result.viewerUrl;
  $('download').href = result.houseUrl;
  $('download').download = $('title').textContent + '.json';
}

async function loadJobs() {
  const jobs = await (await fetch('/jobs')).json(), ul = $('jobs');
  ul.innerHTML = jobs.length ? '' : '<li class="empty">None yet.</li>';
  for (const j of jobs) {
    const li = document.createElement('li'), name = document.createElement('span'), info = document.createElement('small');
    const when = new Date(j.created).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const state = j.status === 'done' ? '✓ ' + dur(j.seconds * 1000) + (j.cost ? ' · ' + money(j.cost) : '') : j.status === 'failed' ? '✗ failed' : '● running';
    name.textContent = j.key; info.textContent = when + ' · ' + state;
    li.dataset.id = j.id; li.className = location.search === '?job=' + j.id ? 'active' : '';
    li.append(name, info); li.onclick = () => openJob(j.id, j.key);
    ul.append(li);
  }
}

loadJobs();
const opened = new URLSearchParams(location.search).get('job');
if (opened) fetch('/jobs/' + opened).then(r => (r.ok ? r.json() : null)).then(j => { if (j) openJob(j.id, j.key); });
</script>
</body>
</html>`;
