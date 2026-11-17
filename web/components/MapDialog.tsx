'use client';
import type { Place, Locale } from '../lib/types.ts';
import type * as Leaflet from 'leaflet';
import type { labels } from '../lib/ui-text.ts';
type MapDialogProps = {
  place: Place;
  locale: Locale;
  t: ReturnType<typeof labels>;
  onPick: (place: Place) => void;
  onClose: () => void;
};
import { decode, readJson } from '../lib/validation.ts';
import { validPlaces } from '../lib/contracts.ts';
import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { Modal } from './Modal.tsx';
import { coordinatesValid } from '../lib/catalog.ts';
import { mapKey } from '../lib/map-weather.ts';
const styles = {
  'zh-Hans': process.env.NEXT_PUBLIC_MAP_STYLE_ZH_HANS,
  'zh-Hant': process.env.NEXT_PUBLIC_MAP_STYLE_ZH_HANT,
  en: process.env.NEXT_PUBLIC_MAP_STYLE_EN,
  ko: process.env.NEXT_PUBLIC_MAP_STYLE_KO,
};
const mapKeyPublic = process.env.NEXT_PUBLIC_MAPTILER_KEY;
export default function MapDialog({ place, locale, t, onPick, onClose }: MapDialogProps) {
  const node = useRef<HTMLDivElement>(null),
    mapRef = useRef<Leaflet.Map | null>(null),
    markRef = useRef<Leaflet.CircleMarker<unknown> | null>(null),
    searchJob = useRef<AbortController | null>(null);
  const tilesRef = useRef<Leaflet.TileLayer | null>(null);
  const [query, setQuery] = useState(''),
    [places, setPlaces] = useState<Place[]>([]),
    [searching, setSearching] = useState(false),
    [searchError, setSearchError] = useState(''),
    [selection, setSelection] = useState<Place | null>(null),
    [lat, setLat] = useState(String(place.lat)),
    [lon, setLon] = useState(String(place.lon)),
    [tileError, setTileError] = useState(false);
  const valid =
    lat.trim() !== '' && lon.trim() !== '' && coordinatesValid(Number(lat), Number(lon));
  const coords = { lat: Number(lat), lon: Number(lon) },
    chosenKey = valid ? mapKey(coords) : '';
  const selected = selection || (mapKey(place) === chosenKey ? place : null);
  useEffect(() => {
    let disposed = false,
      map: Leaflet.Map | undefined;
    import('leaflet')
      .then((mod) => {
        if (disposed || !node.current) return;
        const L = mod.default || mod;
        map = L.map(node.current, {
          attributionControl: true,
          scrollWheelZoom: true,
          zoomAnimation: false,
          fadeAnimation: false,
          markerZoomAnimation: false,
        }).setView([place.lat, place.lon], 6);
        mapRef.current = map;
        const zoomNames = {
          'zh-Hans': ['放大', '缩小'],
          'zh-Hant': ['放大', '縮小'],
          en: ['Zoom in', 'Zoom out'],
          ko: ['확대', '축소'],
        }[locale];
        [...node.current.querySelectorAll<HTMLElement>('.leaflet-control-zoom a')].forEach(
          (el, i) => {
            el.title = zoomNames[i];
            el.setAttribute('aria-label', zoomNames[i]);
          },
        );
        const style = styles[locale];
        const custom = !!(mapKeyPublic && style);
        const url =
          mapKeyPublic && style
            ? `https://api.maptiler.com/maps/${encodeURIComponent(style)}/256/{z}/{x}/{y}.png?key=${encodeURIComponent(mapKeyPublic)}`
            : '/api/map-tiles/{z}/{x}/{y}';
        tilesRef.current = L.tileLayer(url, {
          maxZoom: 19,
          attribution: `${custom ? '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> · ' : ''}&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors`,
        })
          .addTo(map)
          .on('tileerror', () => setTileError(true));
        markRef.current = L.circleMarker<unknown>([place.lat, place.lon], {
          radius: 9,
          color: '#fff',
          weight: 3,
          fillColor: '#f2953c',
          fillOpacity: 1,
          interactive: false,
        }).addTo(map);
        map.on('click', (e: Leaflet.LeafletMouseEvent) => {
          const p = e.latlng.wrap();
          setSelection(null);
          setLat(p.lat.toFixed(4));
          setLon(p.lng.toFixed(4));
          markRef.current?.setLatLng([p.lat, p.lng]);
        });
        map.invalidateSize();
      })
      .catch(() => setTileError(true));
    const resize = new ResizeObserver(() => map?.invalidateSize());
    if (node.current) resize.observe(node.current);
    return () => {
      disposed = true;
      resize.disconnect();
      searchJob.current?.abort();
      map?.stop();
      map?.remove();
      mapRef.current = null;
    };
  }, [place.lat, place.lon, locale]);
  async function search(e: { preventDefault: () => void }) {
    e.preventDefault();
    searchJob.current?.abort();
    if (query.trim().length < 2) {
      setSearchError(t.twoChars);
      return;
    }
    const job = new AbortController();
    searchJob.current = job;
    setSearching(true);
    setPlaces([]);
    setSearchError('');
    try {
      const response = await fetch(
        '/api/places?' + new URLSearchParams({ q: query.trim(), lang: locale }),
        { signal: job.signal },
      );
      if (!response.ok) throw Error('search');
      const result = decode(await readJson(response), validPlaces);
      if (!job.signal.aborted) {
        setPlaces(result.places);
        if (!result.places.length) setSearchError(t.noResults);
      }
    } catch {
      if (!job.signal.aborted) setSearchError(t.offline);
    } finally {
      if (!job.signal.aborted) setSearching(false);
    }
  }
  function moveTo(city: Place) {
    setSelection(city);
    setLat(String(city.lat));
    setLon(String(city.lon));
    setQuery('');
    setPlaces([]);
    setSearchError('');
    if (mapRef.current)
      mapRef.current.setView([city.lat, city.lon], mapRef.current.getZoom(), { animate: false });
    markRef.current?.setLatLng([city.lat, city.lon]);
  }
  function pan() {
    if (valid) {
      if (mapRef.current)
        mapRef.current.setView([Number(lat), Number(lon)], mapRef.current.getZoom(), {
          animate: false,
        });
      markRef.current?.setLatLng([Number(lat), Number(lon)]);
    }
  }
  return (
    <Modal variant="map" title={t.mapTitle} closeLabel={t.close} onClose={onClose}>
      <form className="map-search" onSubmit={search}>
        <input
          aria-label={t.searchHint}
          placeholder={t.searchHint}
          value={query}
          onChange={(e) => {
            searchJob.current?.abort();
            setSearching(false);
            setSearchError('');
            setPlaces([]);
            setQuery(e.target.value);
          }}
        />
        <button disabled={searching}>{searching ? t.searching : t.find}</button>
      </form>
      {searchError && (
        <p className="subtle" role="status">
          {searchError}
        </p>
      )}
      <div className="map-stage">
        <div className="map-view" ref={node} />
        {!!places.length && (
          <div className="map-options">
            {places.map((p) => (
              <button key={p.id} onClick={() => moveTo(p)}>
                {p.name} · {[p.region, p.country].filter(Boolean).join(' · ')}
              </button>
            ))}
          </div>
        )}
        {tileError && (
          <div className="map-status" role="status">
            {tileError && (
              <>
                <span>{t.mapError}</span>
                <button
                  aria-label={`${t.mapError} ${t.retry}`}
                  onClick={() => {
                    setTileError(false);
                    tilesRef.current?.redraw();
                  }}
                >
                  {t.retry}
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <div className="map-selection">
        <b>{selected?.name || t.selectedLocation}</b>
        <button
          className="primary"
          disabled={!valid}
          onClick={() =>
            onPick(
              selected || {
                ...coords,
                name: t.map,
                country: '',
                kind: 'pin',
                id: `pin-${chosenKey}`,
              },
            )
          }
        >
          {t.view}
        </button>
      </div>
      <div className="coordinate-entry">
        <label>
          {t.lat}
          <input
            type="number"
            step="any"
            min="-90"
            max="90"
            value={lat}
            onChange={(e) => {
              setSelection(null);
              setLat(e.target.value);
            }}
            onBlur={pan}
          />
        </label>
        <label>
          {t.lon}
          <input
            type="number"
            step="any"
            min="-180"
            max="180"
            value={lon}
            onChange={(e) => {
              setSelection(null);
              setLon(e.target.value);
            }}
            onBlur={pan}
          />
        </label>
      </div>
    </Modal>
  );
}
