import { errorInfo } from './errors.ts';
import { isArray, isRecord, isFiniteNumber, parseJson, timed, cacheRecord } from './validation.ts';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

export const cacheDirectory = () =>
  path.resolve(/* turbopackIgnore: true */ process.env.WEATHER_CACHE_DIR || '.weather-cache');
export function createSharedStore(directory = cacheDirectory(), now = Date.now) {
  const name = (key: string) =>
    path.join(
      /* turbopackIgnore: true */ directory,
      createHash('sha256').update(key).digest('hex'),
    );
  function read(key: string): Promise<unknown>;
  function read<T>(key: string, guard: (value: unknown) => value is T): Promise<T | null>;
  async function read(key: string, guard?: (value: unknown) => boolean): Promise<unknown> {
    try {
      const value = parseJson(await fs.readFile(name(key) + '.json', 'utf8'));
      return !guard || guard(value) ? value : null;
    } catch (e) {
      if (['ENOENT', 'ENOTDIR'].includes(errorInfo(e).code || '') || e instanceof SyntaxError)
        return null;
      throw e;
    }
  }
  async function write(key: string, value: unknown) {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const destination = name(key) + '.json',
      temporary = destination + '.' + randomUUID() + '.tmp';
    try {
      await fs.writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
      await fs.rename(temporary, destination);
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }
  async function lock<T>(
    key: string,
    action: () => T | Promise<T>,
    { wait = 16000, lease = 60000 } = {},
  ) {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const target = name('lock:' + key) + '.lock',
      started = Date.now();
    while (true) {
      try {
        await fs.mkdir(target);
        break;
      } catch (e) {
        if (errorInfo(e).code !== 'EEXIST') throw e;
        try {
          const stat = await fs.stat(target);
          if (Date.now() - stat.mtimeMs > lease) {
            // Rename first: never remove a new lock created by a different owner.
            const abandoned = target + '.' + randomUUID();
            await fs.rename(target, abandoned);
            await fs.rm(abandoned, { recursive: true, force: true });
            continue;
          }
        } catch (err) {
          if (errorInfo(err).code === 'ENOENT') continue;
          throw err;
        }
        if (Date.now() - started > wait)
          throw Object.assign(new Error('Shared cache lock timeout'), { code: 'CACHE_BUSY' });
        await delay(40);
      }
    }
    // Refresh the lease while a live owner is working, including slow disk/network.
    const pulse = setInterval(
      () => fs.utimes(target, new Date(), new Date()).catch(() => {}),
      lease / 3,
    );
    pulse.unref();
    try {
      return await action();
    } finally {
      clearInterval(pulse);
      await fs.rmdir(target).catch(() => {});
    }
  }
  async function getOrLoad<T extends object>(
    key: string,
    load: () => Promise<T>,
    {
      validate,
      freshFor = 900000,
      staleFor = 10800000,
      background = true,
    }: {
      validate: (value: unknown) => value is T;
      freshFor?: number;
      staleFor?: number;
      background?: boolean;
    },
  ) {
    const hit = await read(key, cacheRecord(validate)),
      age = hit ? now() - hit.at : Infinity;
    if (hit && age >= 0 && age < freshFor) return hit.value;
    const refresh = () =>
      lock(key, async () => {
        const latest = await read(key, cacheRecord(validate)),
          latestAge = latest ? now() - latest.at : Infinity;
        if (latest && latestAge >= 0 && latestAge < freshFor) return latest.value;
        const failure = await read('failure:' + key, timed);
        if (
          latest &&
          failure &&
          now() - failure.at < 30000 &&
          latestAge >= 0 &&
          latestAge < staleFor
        )
          return { ...latest.value, stale: true };
        try {
          const value = await load();
          await write(key, { at: now(), value });
          if (key.startsWith('forecast-')) void prune().catch(() => {});
          return value;
        } catch (error) {
          await write('failure:' + key, { at: now() });
          if (latest && latestAge >= 0 && latestAge < staleFor)
            return { ...latest.value, stale: true };
          throw error;
        }
      });
    if (hit && background && age >= 0 && age < staleFor) {
      void refresh().catch(() => {});
      return { ...hit.value, stale: true };
    }
    return refresh();
  }
  async function prune() {
    // Only weather entries are evictable; never remove rate budgets or RUM data.
    const files = (await fs.readdir(directory)).filter((n) => n.endsWith('.json'));
    const forecasts: { full: string; at: number }[] = [];
    for (const file of files) {
      const full = path.join(/* turbopackIgnore: true */ directory, file);
      try {
        const value = parseJson(await fs.readFile(full, 'utf8'));
        if (
          timed(value) &&
          isRecord(value) &&
          isRecord(value.value) &&
          isArray(value.value.comparisonHours)
        )
          forecasts.push({ full, at: value.at });
      } catch {}
    }
    forecasts.sort((a, b) => b.at - a.at);
    await Promise.all(forecasts.slice(512).map((f) => fs.rm(f.full, { force: true })));
  }
  return { read, write, lock, getOrLoad };
}

export function sharedLimiter({
  store = createSharedStore(),
  limit = 24,
  interval = 60000,
  now = Date.now,
  key = 'ask-budget',
} = {}) {
  return () =>
    store.lock(key, async () => {
      const accepted = (
        (await store.read(
          key,
          (value): value is number[] => isArray(value) && value.every(isFiniteNumber),
        )) || []
      ).filter((t) => t > now() - interval);
      if (accepted.length >= limit) return false;
      accepted.push(now());
      await store.write(key, accepted);
      return true;
    });
}
