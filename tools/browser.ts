// A tiny headless Chrome driver over the DevTools protocol (no extra dependencies).
// Uses CHROME_PATH, or the usual Chrome / Chromium locations.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export class Browser {
  private ws!: WebSocket;
  private id = 0;
  private pending = new Map<number, (v: any) => void>();
  logs: string[] = [];
  private constructor(private proc: ChildProcess, private dir: string) {}

  static async launch(width = 1400, height = 900) {
    const exe = CANDIDATES.find(p => p && fs.existsSync(p));
    if (!exe) throw new Error('Chrome not found: set CHROME_PATH');
    const port = 9400 + Math.floor(Math.random() * 400);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'house-shots-'));
    const proc = spawn(exe, ['--headless=new', '--hide-scrollbars', '--use-angle=metal', `--remote-debugging-port=${port}`,
      `--window-size=${width},${height}`, `--user-data-dir=${dir}`, 'about:blank'], { stdio: 'ignore' });
    const b = new Browser(proc, dir);
    let target: { webSocketDebuggerUrl: string } | undefined;
    for (let i = 0; i < 60 && !target; i++) {
      await sleep(200);
      try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t: { type: string }) => t.type === 'page'); } catch {}
    }
    if (!target) throw new Error('Chrome did not start');
    b.ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(r => b.ws.addEventListener('open', r));
    b.ws.addEventListener('message', e => {
      const msg = JSON.parse(String(e.data));
      if (msg.id && b.pending.has(msg.id)) { b.pending.get(msg.id)!(msg.result); b.pending.delete(msg.id); }
      if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type))
        b.logs.push(msg.params.args.map((a: { value?: unknown; description?: string }) => a.value ?? a.description).join(' '));
      if (msg.method === 'Runtime.exceptionThrown') b.logs.push('EXCEPTION ' + msg.params.exceptionDetails.exception?.description);
    });
    await b.send('Runtime.enable');
    await b.size(width, height);
    return b;
  }

  send(method: string, params: object = {}) {
    return new Promise<any>(r => { const i = ++this.id; this.pending.set(i, r); this.ws.send(JSON.stringify({ id: i, method, params })); });
  }
  size(width: number, height: number) {
    return this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  }
  goto(url: string) { return this.send('Page.navigate', { url }); }
  async eval<T>(expression: string): Promise<T> {
    return (await this.send('Runtime.evaluate', { expression, returnByValue: true }))?.result?.value;
  }
  async shot(file: string) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
  }
  async close() {
    this.ws.close();
    const exited = new Promise(r => this.proc.once('exit', r));
    this.proc.kill();
    await Promise.race([exited, sleep(3000)]);
    fs.rmSync(this.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
