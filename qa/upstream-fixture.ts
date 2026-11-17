import { requireValue } from '../web/lib/validation.ts';
import http from 'node:http';
import { catalog } from '../web/lib/catalog.ts';
const port = Number(process.env.FIXTURE_PORT || 3399);
let calls = { forecast: 0, summaries: 0, geocoding: 0, model: 0 },
  delay = Number(process.env.FIXTURE_DELAY || 0),
  failure = 0;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const send = (body: unknown, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === '/stats') return send({ calls, delay, failure });
  if (url.pathname === '/control') {
    delay = Number(url.searchParams.get('delay') || 0);
    failure = Number(url.searchParams.get('failure') || 0);
    if (url.searchParams.has('reset'))
      calls = { forecast: 0, summaries: 0, geocoding: 0, model: 0 };
    return send({ ok: true });
  }
  if (url.pathname === '/forecast') {
    const full = url.searchParams.has('hourly');
    calls[full ? 'forecast' : 'summaries']++;
    if (delay) await new Promise((r) => setTimeout(r, delay));
    if (failure) return send({ error: true }, failure);
    const lats = requireValue(url.searchParams.get('latitude')).split(',').map(Number),
      lons = requireValue(url.searchParams.get('longitude')).split(',').map(Number);
    const rows = lats.map((lat, index) => {
      const city = catalog.find(
          (c) => Math.abs(c.lat - lat) < 0.01 && Math.abs(c.lon - lons[index]) < 0.01,
        ),
        zone = city?.timezone || 'UTC';
      const now = Math.floor(Date.now() / 3600000) * 3600;
      const date = new Intl.DateTimeFormat('en-CA', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(now * 1000);
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-GB', { timeZone: zone, timeZoneName: 'longOffset' })
          .formatToParts(now * 1000)
          .map((p) => [p.type, p.value]),
      );
      const m = parts.timeZoneName.match(/GMT([+-])(\d\d):(\d\d)/),
        offset = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 3600 + Number(m[3]) * 60) : 0;
      const first = Date.parse(date + 'T00:00:00Z') / 1000 - offset;
      const count = Number(url.searchParams.get('forecast_hours') || 24),
        hours = Array.from({ length: count }, (_, i) => now + i * 3600),
        days = Array.from({ length: 7 }, (_, i) => first + i * 86400);
      return {
        timezone: zone,
        utc_offset_seconds: offset,
        current: { time: now, temperature_2m: Math.round(lat / 3), weather_code: 2 },
        hourly: {
          time: hours,
          temperature_2m: hours.map((_, i) => Math.round(lat / 3) + (i % 5)),
          precipitation_probability: hours.map((_, i) => (i * 13 + Math.round(lat)) % 100),
          weather_code: hours.map(() => 2),
        },
        daily: {
          time: days,
          temperature_2m_min: days.map(() => 4),
          temperature_2m_max: days.map(() => 19),
          weather_code: days.map(() => 2),
        },
      };
    });
    return send(rows.length === 1 ? rows[0] : rows);
  }
  send({ error: 'Unknown fixture route' }, 404);
});
server.listen(port, '127.0.0.1', () =>
  console.log(`受控天气上游 http://127.0.0.1:${port}；不代表真实天气`),
);
