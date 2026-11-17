'use client';
import type { Place, Locale, Forecast, SummaryStore } from '../lib/types.ts';
import type { ReactNode } from 'react';
type WeatherScreenProps = {
  locale: Locale;
  place: Place;
  initial: Forecast | null;
  cacheNamespace: string;
  home?: boolean;
  homeContent?: ReactNode;
};
import {
  lazy,
  Suspense,
  useState,
  useEffect,
  useEffectEvent,
  useRef,
  useCallback,
  useTransition,
} from 'react';
import { validPlace } from '../lib/contracts.ts';
import { useRouter } from 'next/navigation';
import { locateWithPermissionRecovery } from '../lib/device-location.ts';
import Link from 'next/link';
import {
  localize,
  placeURL,
  locales,
  languageNames,
  browserLocale,
  isLocale,
  isCoordinatePlace,
} from '../lib/catalog.ts';
import { labels } from '../lib/ui-text.ts';
import { dateLabel, timeLabel, hourLabel, localDay } from '../lib/format.ts';
import { Icon, Mark } from './Symbols.tsx';
import { Current, Hours, Week } from './Forecast.tsx';
import WeatherLoading from './WeatherLoading.tsx';
import OtherCities, { useSaved } from './OtherCities.tsx';
import { readLocal, writeLocal, setHourPosition, takeHourPosition } from './storage.ts';
import usePlaceLabel, { warmPlaceLabel } from './usePlaceLabel.tsx';
import { mayPrepare } from './PreparedLink.tsx';
import useWeatherQuery from './useWeatherQuery.ts';
const loadSearch = () => import('./SearchDialog.tsx'),
  loadMap = () => Promise.all([import('./MapDialog.tsx'), import('leaflet')]).then(([mod]) => mod),
  loadAsk = () => import('./AskDialog.tsx');
const SearchDialog = lazy(loadSearch),
  MapDialog = lazy(loadMap),
  AskDialog = lazy(loadAsk);
function prepareDialog(load: () => Promise<unknown>) {
  if (mayPrepare(true)) void load().catch(() => {});
}
// 仅用于同条件 A/B；正常构建不执行预加载。
if (process.env.NEXT_PUBLIC_MAP_EAGER === '1' && typeof window !== 'undefined') {
  void import('./MapDialog.tsx').then(() => import('leaflet'));
}
export default function WeatherScreen({
  locale,
  place: originalPlace,
  initial,
  cacheNamespace,
  home = false,
  homeContent,
}: WeatherScreenProps) {
  const {
    place,
    resolving: resolvingCity,
    canRetry: canRetryCity,
    retryLabel,
  } = usePlaceLabel(originalPlace, locale);
  const t = labels(locale),
    router = useRouter();
  const { weather, status, failure, reload, accept, retryBlocked } = useWeatherQuery(
    place,
    initial,
    cacheNamespace,
  );
  const [modal, setModal] = useState(''),
    [askStarted, setAskStarted] = useState(false),
    [askVisible, setAskVisible] = useState(false),
    [error, setError] = useState(''),
    [locating, setLocating] = useState(false),
    [language, setLanguage] = useState<Locale | 'system'>(locale),
    [notice, setNotice] = useState(''),
    [pendingPlace, setPendingPlace] = useState<Place | null>(null);
  const locationTask = useRef<(() => void) | null>(null);
  const cancelLocation = useCallback(() => {
    locationTask.current?.();
    locationTask.current = null;
  }, []);
  const nextChoice = useRef(0),
    addMode = useRef(false),
    store = useSaved(locale);
  const { rename } = store;
  const title = place.name || t.location;
  const PlaceHeading = home ? 'h2' : 'h1';
  const [navigating, startNavigation] = useTransition();
  const identity = `${place.lat},${place.lon}`;
  const loadingPlace = navigating ? pendingPlace : null;
  useEffect(() => {
    if (!place.label?.source) return;
    rename(place);
    const last = readLocal('last');
    if (
      validPlace(last) &&
      Number(last.lat) === Number(place.lat) &&
      Number(last.lon) === Number(place.lon)
    )
      writeLocal('last', place);
  }, [place, rename]);
  const close = useCallback(() => {
    cancelLocation();
    nextChoice.current++;
    setLocating(false);
    setModal('');
    setError('');
    addMode.current = false;
  }, [cancelLocation]);
  function choose(chosen: Place, source = 'manual') {
    if (isCoordinatePlace(chosen) && !chosen.label)
      chosen = {
        ...chosen,
        name: chosen.region || `${Number(chosen.lat).toFixed(4)}, ${Number(chosen.lon).toFixed(4)}`,
      };
    cancelLocation();
    nextChoice.current++;
    setModal('');
    setLocating(false);
    setError('');
    void warmPlaceLabel(chosen, locale).then((label) => {
      if (label)
        store.rename({
          ...chosen,
          name: label.name,
          region: label.region || chosen.region || '',
          country: label.country || chosen.country || '',
          label,
        });
    });
    if (addMode.current) {
      store.add(chosen);
      setNotice(t.savedMessage);
      addMode.current = false;
      return;
    }
    writeLocal('mode', source === 'gps' ? 'gps' : 'manual');
    if (source !== 'gps') writeLocal('last', chosen);
    setPendingPlace(chosen);
    startNavigation(() => router.push(placeURL(locale, localize(chosen, locale))));
  }
  function locate() {
    cancelLocation();
    const token = ++nextChoice.current;
    setError('');
    if (!window.isSecureContext) {
      setLocating(false);
      setError(t.locationSecure);
      return;
    }
    if (!navigator.geolocation) {
      setLocating(false);
      setError(t.locateFail);
      return;
    }
    locationTask.current = locateWithPermissionRecovery({
      geolocation: navigator.geolocation,
      permissions: navigator.permissions,
      isCurrent: () => token === nextChoice.current,
      onPending: () => {
        setError('');
        setLocating(true);
      },
      onSuccess: (pos) => {
        if (token !== nextChoice.current) return;
        const lat = Number(pos.coords.latitude.toFixed(4)),
          lon = Number(pos.coords.longitude.toFixed(4));
        choose(
          { lat, lon, id: `gps-${lat},${lon}`, kind: 'gps', name: t.location, country: '' },
          'gps',
        );
      },
      onError: (err) => {
        if (token !== nextChoice.current) return;
        setLocating(false);
        setError(err.code === 1 ? t.denied : t.locateFail);
      },
    });
  }
  useEffect(() => {
    const pref = readLocal('language', 'system');
    setLanguage(
      pref === 'system' && browserLocale(navigator.language) === locale ? 'system' : locale,
    );
    const restore = takeHourPosition();
    if (restore?.identity === identity) {
      requestAnimationFrame(() => {
        const row = document.querySelector('.hours');
        if (row) row.scrollLeft = restore.x;
      });
    }
  }, [identity, locale]);
  useEffect(
    () => () => {
      nextChoice.current++;
      cancelLocation();
    },
    [cancelLocation],
  );
  const autoLocate = useEffectEvent(locate);
  useEffect(() => {
    if (!home) return;
    // 首页每次进入都优先请求当前位置；显式城市／坐标页继续由 URL 决定。
    autoLocate();
  }, [home, locale]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 2200);
    return () => clearTimeout(timer);
  }, [notice]);
  const openSearch = (adding = false) => {
    cancelLocation();
    nextChoice.current++;
    setLocating(false);
    addMode.current = adding;
    setError('');
    setModal('search');
  };
  const openAsk = () => {
    setAskStarted(true);
    setAskVisible(true);
  };
  function changeLanguage(value: Locale | 'system') {
    cancelLocation();
    nextChoice.current++;
    writeLocal('language', value);
    setLanguage(value);
    const chosen = value === 'system' ? browserLocale(navigator.language) : value;
    if (chosen === locale) return;
    setHourPosition({ identity, x: document.querySelector('.hours')?.scrollLeft || 0 });
    router.push(home ? `/${chosen}` : placeURL(chosen, localize(place, chosen)), { scroll: false });
  }
  const showDate = weather
    ? dateLabel(localDay(weather.current.time, weather.timezone), locale, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
    : '';
  return (
    <>
      <header className="topbar">
        <div className="top-inner">
          <Link className="brand" prefetch={false} href={`/${locale}`}>
            <Mark />
            <span>Weather Atlas</span>
          </Link>
          <div className="toolbar">
            <button
              className="finder"
              aria-label={t.find}
              onClick={() => openSearch()}
              onPointerEnter={() => prepareDialog(loadSearch)}
              onFocus={() => prepareDialog(loadSearch)}
              onTouchStart={() => prepareDialog(loadSearch)}
            >
              <Icon name="search" />
              <span>{t.find}</span>
            </button>
            <div className="language">
              <Icon name="globe" size={17} />
              <label htmlFor="locale-select" className="sr-only">
                {t.language}
              </label>
              <select
                id="locale-select"
                aria-label={t.language}
                value={language === 'system' ? 'system' : locale}
                onChange={(e) =>
                  (e.target.value === 'system' || isLocale(e.target.value)) &&
                  changeLanguage(e.target.value)
                }
              >
                <option value="system">{t.system}</option>
                {locales.map((l) => (
                  <option value={l} key={l}>
                    {languageNames[l]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>
      <main className="wrap" aria-busy={!!loadingPlace}>
        {loadingPlace ? (
          <WeatherLoading place={loadingPlace} locale={locale} />
        ) : (
          <>
            {homeContent}
            <div className="location-heading">
              <div>
                <div className="place-country">
                  <Icon name="pin" size={13} />
                  {place.country || (isCoordinatePlace(place) ? t.selectedLocation : t.chartTime)}
                  {(place.country || resolvingCity) && (
                    <span>
                      {place.lat.toFixed(2)}°, {place.lon.toFixed(2)}°
                    </span>
                  )}
                </div>
                <PlaceHeading aria-busy={resolvingCity}>
                  {resolvingCity ? (
                    <span className="place-name-pending" role="status">
                      <i aria-hidden="true" />
                      <span>{t.resolvingCity}</span>
                    </span>
                  ) : (
                    title
                  )}
                </PlaceHeading>
                {canRetryCity && (
                  <button className="retry-city" onClick={retryLabel}>
                    {t.retryCity}
                  </button>
                )}
              </div>
              <div className="location-actions">
                <button
                  className="icon-btn"
                  aria-label={t.copyLink}
                  title={t.copyLink}
                  onClick={async () => {
                    const url = new URL(placeURL(locale, place), location.origin).href;
                    try {
                      if (!navigator.clipboard?.writeText) throw new Error('clipboard');
                      await navigator.clipboard.writeText(url);
                      setNotice(t.linkCopied);
                    } catch {
                      window.prompt(t.copyLink, url);
                    }
                  }}
                >
                  <Icon name="link" />
                </button>
                <button
                  className="save"
                  onClick={() => store.toggle(place)}
                  aria-pressed={store.has(place)}
                >
                  <Icon name={store.has(place) ? 'check' : 'bookmark'} size={16} />
                  {store.has(place) ? t.saved : t.save}
                </button>
              </div>
            </div>
            <div className="weather-date">
              {showDate && weather && (
                <span>
                  {showDate}{' '}
                  <time dateTime={new Date(weather.current.time * 1000).toISOString()}>
                    {hourLabel(weather.current.time, locale, weather.timezone)}
                  </time>
                </span>
              )}
              {weather && (
                <>
                  <i />
                  <span>{weather.timezone.replaceAll('_', ' ')}</span>
                </>
              )}
              {['demo', 'fixture'].includes(weather?.source || '') && (
                <span className="sample">{t.demo}</span>
              )}
              {weather && (weather.stale || status !== 'ready') && (
                <button
                  className="sample"
                  data-testid="forecast-refresh"
                  aria-live="polite"
                  disabled={status === 'loading' || retryBlocked}
                  onClick={() => void reload()}
                >
                  {status === 'loading'
                    ? t.refreshingForecast
                    : status === 'error'
                      ? t.refreshFailed
                      : t.stale}
                  {status !== 'loading' && <> · {retryBlocked ? t.weatherLimited : t.retry}</>}
                </button>
              )}
            </div>
            <div className="weather-feedback" role="status" aria-live="polite">
              {failure && <span>{t[`weather_${failure}`]}</span>}
            </div>
            {weather ? (
              <div aria-busy={status === 'loading'}>
                <Current weather={weather} t={t} locale={locale} />
              </div>
            ) : (
              <section className="unavailable" role="status">
                <Icon name="chart" size={32} />
                <h2>{status === 'loading' ? t.loading : t.unavailable}</h2>
                <button
                  className="primary"
                  disabled={status === 'loading' || retryBlocked}
                  onClick={() => void reload()}
                >
                  {retryBlocked ? t.weatherLimited : t.retry}
                </button>
              </section>
            )}
            <div className="dashboard">
              <div className="main-column">
                {weather && (
                  <>
                    <Hours weather={weather} t={t} locale={locale} />
                    <Week weather={weather} t={t} locale={locale} />
                  </>
                )}
              </div>
              <aside>
                <OtherCities
                  place={place}
                  locale={locale}
                  t={t}
                  store={{ ...store, mode: weather?.source || 'open-meteo' }}
                  preparing={!locating && !navigating && !modal && !askVisible}
                  cacheNamespace={cacheNamespace}
                  onChoose={choose}
                  onAdd={() => openSearch(true)}
                />
                <div className="provider">
                  <span>{t.source}</span>
                  <a href="https://open-meteo.com/" rel="external">
                    Open-Meteo <Icon name="arrow" size={12} />
                  </a>
                  {place.label?.source === 'photon-osm' && (
                    <a href="https://www.openstreetmap.org/copyright" rel="external">
                      © OpenStreetMap contributors
                    </a>
                  )}
                  {weather && (
                    <small>
                      {t.updated} · {timeLabel(weather.current.time, locale, weather.timezone)}{' '}
                      {weather.timezone}
                      {weather.stale && (
                        <>
                          <br />
                          {t.fetched} ·{' '}
                          {dateLabel(
                            localDay(Date.parse(weather.fetchedAt) / 1000, weather.timezone),
                            locale,
                            { year: 'numeric', month: 'short', day: 'numeric' },
                          )}{' '}
                          {timeLabel(
                            Date.parse(weather.fetchedAt) / 1000,
                            locale,
                            weather.timezone,
                          )}
                        </>
                      )}
                    </small>
                  )}
                </div>
              </aside>
            </div>
            {locating && modal === '' && (
              <div className="toast" role="status">
                {t.locating}
              </div>
            )}
            {error && modal === '' && (
              <div className="notice" role="status">
                {error}
              </div>
            )}
            {notice && (
              <div className="toast" role="status">
                {notice}
              </div>
            )}
            <footer>
              <div>
                <Mark /> Weather Atlas
              </div>
            </footer>
          </>
        )}
      </main>
      {weather && !askVisible && !loadingPlace && (
        <button
          className="ask-launcher"
          aria-label={t.ask}
          aria-expanded="false"
          aria-controls="weather-ask-panel"
          onClick={openAsk}
          onPointerEnter={() => prepareDialog(loadAsk)}
          onFocus={() => prepareDialog(loadAsk)}
          onTouchStart={() => prepareDialog(loadAsk)}
        >
          <Icon name="spark" size={21} />
          <span>{t.askShort}</span>
        </button>
      )}
      <Suspense
        fallback={
          modal || askVisible ? (
            <div className="toast" role="status">
              {t.loading}
            </div>
          ) : null
        }
      >
        {modal === 'search' && (
          <SearchDialog
            locale={locale}
            t={t}
            demo={weather?.source === 'demo'}
            error={error}
            locating={locating}
            onClose={close}
            onPick={(p) => choose(p)}
            onLocate={locate}
            onMap={() => {
              cancelLocation();
              nextChoice.current++;
              setLocating(false);
              setModal('map');
            }}
          />
        )}
        {modal === 'map' && (
          <MapDialog
            t={t}
            locale={locale}
            place={place}
            onPick={(p) => choose(p)}
            onClose={close}
          />
        )}
        {askStarted && weather && (
          <AskDialog
            open={askVisible && !loadingPlace}
            t={t}
            locale={locale}
            place={{ ...place, name: title }}
            weather={weather}
            onClose={() => setAskVisible(false)}
            onRefresh={accept}
          />
        )}
      </Suspense>
    </>
  );
}
