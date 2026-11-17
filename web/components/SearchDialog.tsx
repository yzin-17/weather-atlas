'use client';
import type { Place, Locale } from '../lib/types.ts';
import type { labels } from '../lib/ui-text.ts';
type SearchDialogProps = {
  t: ReturnType<typeof labels>;
  locale: Locale;
  onPick: (place: Place) => void;
  onLocate: () => void;
  onMap: () => void;
  onClose: () => void;
  locating: boolean;
  error: string;
  demo?: boolean;
};
import { decode, readJson } from '../lib/validation.ts';
import { validPlaces } from '../lib/contracts.ts';
import { useEffect, useRef, useState } from 'react';
import { defaultCities, localPlace } from '../lib/catalog.ts';
import { Modal } from './Modal.tsx';
import { Icon } from './Symbols.tsx';
export default function SearchDialog({
  t,
  locale,
  onPick,
  onLocate,
  onMap,
  onClose,
  locating,
  error,
  demo,
}: SearchDialogProps) {
  const [query, setQuery] = useState(''),
    [places, setPlaces] = useState<Place[]>([]),
    [state, setState] = useState('idle'),
    [composing, setComposing] = useState(false),
    [active, setActive] = useState(-1),
    [attempt, setAttempt] = useState(0);
  const input = useRef<HTMLInputElement>(null),
    term = query.trim();
  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    setActive(-1);
    if (composing || term.length < 2) {
      setPlaces([]);
      setState('idle');
      return;
    }
    const abort = new AbortController();
    setState('loading');
    setPlaces([]);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places?${new URLSearchParams({ q: term, lang: locale })}`, {
          signal: abort.signal,
        });
        if (!res.ok) throw Error();
        const data = decode(await readJson(res), validPlaces);
        if (!abort.signal.aborted) {
          setPlaces(data.places);
          setState('ready');
        }
      } catch {
        if (!abort.signal.aborted) setState('error');
      }
    }, 220);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [term, locale, composing, attempt]);
  const choices = term ? places : defaultCities.map((p) => localPlace(p, locale));
  return (
    <Modal title={t.searchTitle} closeLabel={t.close} onClose={onClose}>
      <div className="search-input">
        <Icon name="search" />
        <input
          autoComplete="off"
          ref={input}
          role="combobox"
          aria-label={t.find}
          aria-controls="place-options"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-activedescendant={active >= 0 ? `place-${active}` : undefined}
          placeholder={t.searchHint}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'ArrowDown' && choices.length) {
              e.preventDefault();
              setActive((active + 1) % choices.length);
            }
            if (e.key === 'ArrowUp' && choices.length) {
              e.preventDefault();
              setActive(active <= 0 ? choices.length - 1 : active - 1);
            }
            if (e.key === 'Enter' && active >= 0) {
              e.preventDefault();
              onPick(choices[active]);
            }
          }}
        />
      </div>
      <div className="place-actions">
        <button disabled={locating} onClick={onLocate}>
          <Icon name="locate" />
          {locating ? t.locating : t.here}
        </button>
        <button onClick={onMap}>
          <Icon name="map" />
          {t.map}
        </button>
      </div>
      {error && (
        <p role="status" className="notice">
          {error}
        </p>
      )}
      {demo && <p className="subtle">{t.demoScope}</p>}
      <div className="list-caption">{term ? t.result : t.popular}</div>
      <div role="listbox" id="place-options" aria-label={t.result} className="places">
        {choices.map((p, i) => (
          <button
            role="option"
            aria-selected={active === i}
            id={`place-${i}`}
            key={p.id}
            onMouseEnter={() => setActive(i)}
            onClick={() => onPick(p)}
          >
            <span>
              <b>{p.name}</b>
              <small>
                {[p.region, p.country]
                  .filter(Boolean)
                  .filter((str, j, arr) => arr.indexOf(str) === j)
                  .join(' · ')}
              </small>
            </span>
            <Icon name="east" size={16} />
          </button>
        ))}
      </div>
      {term && (
        <div role="status" className="subtle">
          {term.length < 2 ? (
            t.twoChars
          ) : state === 'loading' ? (
            t.searching
          ) : state === 'error' ? (
            <button onClick={() => setAttempt((n) => n + 1)}>
              {t.offline} {t.retry}
            </button>
          ) : state === 'ready' && !places.length ? (
            t.noResults
          ) : null}
        </div>
      )}
    </Modal>
  );
}
