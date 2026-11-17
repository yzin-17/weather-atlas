'use client';
import type {
  Coordinates,
  Place,
  Locale,
  SummaryStore,
  Summary,
  WeatherSource,
} from '../lib/types.ts';
import type { labels } from '../lib/ui-text.ts';
type OtherCitiesProps = {
  place: Place;
  locale: Locale;
  t: ReturnType<typeof labels>;
  store: ReturnType<typeof useSaved> & { mode: WeatherSource };
  onAdd: () => void;
  onChoose: (place: Place) => void;
  preparing?: boolean;
};
import { decode, isArray, readJson } from '../lib/validation.ts';
import { validPlace, validSummaryStore, validSummaries } from '../lib/contracts.ts';
import { useEffect, useMemo, useState } from 'react';
import PreparedLink from './PreparedLink.tsx';
import { cachedSummary, forecastKey } from '../lib/client-forecast.ts';
import {
  defaultCities,
  localPlace,
  localize,
  placeURL,
  isCoordinatePlace,
} from '../lib/catalog.ts';
import { readLocal, writeLocal } from './storage.ts';
import { Icon, WeatherIcon } from './Symbols.tsx';
import { condition } from '../lib/ui-text.ts';
import { temp } from '../lib/format.ts';
const stampKey = (p: Coordinates) => `${Number(p.lat).toFixed(4)},${Number(p.lon).toFixed(4)}`;
function usable(value: unknown): value is Place[] {
  return isArray(value) && value.every(validPlace);
}
export function useSaved(locale: Locale) {
  const defaults = useMemo(() => defaultCities.map((c) => localPlace(c, locale)), [locale]);
  const [saved, setSaved] = useState(defaults),
    [ready, setReady] = useState(false);
  useEffect(() => {
    const v = readLocal('saved', defaults);
    setSaved(usable(v) ? v : defaults);
    setReady(true);
  }, [defaults]);
  function update(items: Place[]) {
    setSaved(items);
    writeLocal('saved', items);
  }
  function has(p: Place) {
    return saved.some((s) => stampKey(s) === stampKey(p));
  }
  function toggle(p: Place) {
    update(has(p) ? saved.filter((s) => stampKey(s) !== stampKey(p)) : [p, ...saved]);
  }
  return {
    saved,
    ready,
    has,
    toggle,
    rename(place: Place) {
      setSaved((old) => {
        const next = old.map((p) =>
          stampKey(p) === stampKey(place) && isCoordinatePlace(p) ? { ...p, ...place } : p,
        );
        if (next.every((p, i) => JSON.stringify(p) === JSON.stringify(old[i]))) return old;
        writeLocal('saved', next);
        return next;
      });
    },
    add(p: Place) {
      if (!has(p)) update([p, ...saved]);
    },
  };
}
export default function OtherCities({
  place,
  locale,
  t,
  store,
  onAdd,
  onChoose,
  preparing = true,
}: OtherCitiesProps) {
  const cities = useMemo(
    () =>
      store.saved.filter((p) => stampKey(p) !== stampKey(place)).map((p) => localize(p, locale)),
    [store.saved, place, locale],
  );
  const [summaries, setSummaries] = useState<SummaryStore>({}),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  const coordinateKeys = cities.map(stampKey).join(';');
  useEffect(() => {
    if (!store.ready) return;
    const abort = new AbortController();
    const key = 'summaries.' + (store.mode || 'open-meteo');
    const stored = readLocal(key);
    const cache: SummaryStore = validSummaryStore(stored) ? stored : {};
    for (const city of cities) {
      const summary = cachedSummary(city, readLocal(forecastKey(city), null), store.mode);
      if (summary && (!cache[stampKey(city)] || summary.time > cache[stampKey(city)].time))
        cache[stampKey(city)] = summary;
    }
    setSummaries(cache);
    setFailed(false);
    const wanted = cities.filter(
      (p) => !cache[stampKey(p)] || Date.now() - cache[stampKey(p)].time > 15 * 60_000,
    );
    async function load() {
      for (let start = 0; start < wanted.length; start += 20) {
        const group = wanted.slice(start, start + 20),
          coords = group.map(stampKey).join(';');
        try {
          const res = await fetch(`/api/summaries?coords=${encodeURIComponent(coords)}`, {
            signal: abort.signal,
          });
          if (!res.ok) throw Error();
          const { items } = decode(await readJson(res), validSummaries);
          if (abort.signal.aborted) return;
          for (const p of items) cache[stampKey(p)] = { ...p, time: Date.now() };
          const keep: SummaryStore = {};
          for (const city of cities) {
            const key = stampKey(city),
              item = cache[key];
            if (item) keep[key] = item;
          }
          writeLocal(key, keep);
          setSummaries({ ...keep });
        } catch {
          if (!abort.signal.aborted) setFailed(true);
          return;
        }
      }
    }
    load();
    return () => abort.abort();
  }, [coordinateKeys, attempt, store.ready, store.mode]);
  return (
    <section className="other-cities">
      <div className="section-heading">
        <h2>{t.cities}</h2>
        <button className="icon-btn small" aria-label={t.add} onClick={onAdd}>
          <Icon name="plus" size={16} />
        </button>
      </div>
      {!cities.length && <p className="subtle">{t.emptyCities}</p>}
      <div className="city-list">
        {cities.map((city, index) => {
          const data = summaries[stampKey(city)];
          return (
            <div className="city-row" key={stampKey(city)}>
              <PreparedLink
                automatic={index < 2}
                enabled={store.ready && preparing}
                scope={`${locale}:${stampKey(place)}`}
                href={placeURL(locale, city)}
                onClick={(e) => {
                  if (!e.metaKey && !e.ctrlKey && !e.shiftKey) {
                    e.preventDefault();
                    onChoose(city);
                  }
                }}
              >
                <span className="city-label">
                  <b>{city.name}</b>
                  <small>
                    {city.country || `${city.lat.toFixed(2)}°, ${city.lon.toFixed(2)}°`}
                  </small>
                </span>
                {data && <WeatherIcon code={data.code} size={27} />}
                <strong title={data ? condition(data.code, locale) : undefined}>
                  {temp(data?.temp)}
                </strong>
              </PreparedLink>
              <button
                className="city-remove"
                title={`${t.remove} ${city.name}`}
                aria-label={`${t.remove} ${city.name}`}
                onClick={() => store.toggle(city)}
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          );
        })}
      </div>
      {failed && (
        <button className="notice" onClick={() => setAttempt((n) => n + 1)}>
          {t.offline} {t.retry}
        </button>
      )}
    </section>
  );
}
