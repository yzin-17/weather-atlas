import { chromium } from 'playwright-core';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true }),
  rows: {
    round: number;
    kind: string;
    jsBytes: number;
    jsResources: number;
    lcp: number;
    interactive: number;
    tile: number;
  }[] = [];
try {
  for (let round = 1; round <= 5; round++)
    for (const kind of round % 2 ? ['lazy', 'eager'] : ['eager', 'lazy']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } }),
        page = await context.newPage(),
        cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 70,
        downloadThroughput: 1600000 / 8,
        uploadThroughput: 750000 / 8,
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 3 });
      let bytes = 0,
        resources = 0;
      const kinds = new Map<string, string>();
      cdp.on('Network.responseReceived', (e) => kinds.set(e.requestId, e.type));
      cdp.on('Network.loadingFinished', (e) => {
        if (kinds.get(e.requestId) === 'Script') {
          bytes += e.encodedDataLength;
          resources++;
        }
      });
      await page.addInitScript(() => {
        window.__lcp = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) window.__lcp = e.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      });
      await page.goto(
        `http://127.0.0.1:${kind === 'lazy' ? 3300 : 3303}/zh-Hans/weather/seoul-1835848`,
        { waitUntil: 'networkidle' },
      );
      const jsBytes = bytes,
        jsResources = resources,
        lcp = await page.evaluate(() => window.__lcp);
      await page.locator('.finder').click();
      await page.locator('.place-actions button').last().waitFor();
      await page.evaluate(() => {
        window.__clicked = performance.now();
        window.__tile = 0;
        new MutationObserver(() => {
          if (!window.__tile && document.querySelector('.leaflet-tile-loaded'))
            window.__tile = performance.now();
        }).observe(document.body, { subtree: true, attributes: true, childList: true });
      });
      await page.locator('.place-actions button').last().click();
      await page.locator('.leaflet-interactive').waitFor();
      const interactive = await page.evaluate(() => performance.now() - window.__clicked);
      await page.locator('.leaflet-tile-loaded').first().waitFor();
      const tile = await page.evaluate(() => window.__tile - window.__clicked);
      rows.push({ round, kind, jsBytes, jsResources, lcp, interactive, tile });
      await context.close();
    }
} finally {
  await browser.close();
}
const median = (values: number[]) =>
  values.sort((a: number, b: number) => a - b)[Math.floor(values.length / 2)];
const medians = Object.fromEntries(
  ['lazy', 'eager'].map((k) => [
    k,
    Object.fromEntries(
      (['jsBytes', 'lcp', 'interactive', 'tile'] as const).map((field) => [
        field,
        median(rows.filter((r) => r.kind === k).map((r) => Number(r[field]))),
      ]),
    ),
  ]),
);
const report: {
  at: string;
  browser: string;
  conditions: {
    viewport: string;
    cpu: number;
    downloadBps: number;
    latency: number;
    cache: false;
    upstream: string;
    tiles: string;
    eager: string;
  };
  rows: {
    round: number;
    kind: string;
    jsBytes: number;
    jsResources: number;
    lcp: number;
    interactive: number;
    tile: number;
  }[];
  medians: { [k: string]: { [k: string]: number } };
} = {
  at: new Date().toISOString(),
  browser: browser.version(),
  conditions: {
    viewport: '390x844',
    cpu: 3,
    downloadBps: 200000,
    latency: 70,
    cache: false,
    upstream: 'demo',
    tiles: 'local PNG',
    eager: '首次加载预取 MapDialog 和 Leaflet；其他功能相同',
  },
  rows,
  medians,
};
await writeFile(
  new URL('./evidence/map-performance.json', import.meta.url),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(medians));
