'use client';
import type {
  AskResult,
  Place,
  Locale,
  Forecast,
  ComparisonContext,
  ComparisonRow,
  Evidence,
  SingleContext,
  DayWeather,
} from '../lib/types.ts';
import type { labels } from '../lib/ui-text.ts';
import { condition } from '../lib/ui-text.ts';
type AskDialogProps = {
  open: boolean;
  place: Place;
  locale: Locale;
  t: ReturnType<typeof labels>;
  weather: Forecast;
  onClose: () => void;
  onRefresh: (weather: Forecast) => void;
};
type Preview = {
  time: number;
  single?: boolean;
  row?: Pick<ComparisonRow, 'city' | 'timezone' | 'date' | 'fetchedAt' | 'evidence'>;
  days?: DayWeather[];
};
import { decode, readJson } from '../lib/validation.ts';
import { validSnapshot } from '../lib/client-forecast.ts';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useChat } from '@ai-sdk/react';
import type { WeatherMessage, WeatherPhase } from '../lib/chat-types.ts';
import { weatherTransport, messageWeather, messageText, failureKey } from './weather-chat.ts';
import { useAnswerReveal } from './use-answer-reveal.ts';
import FloatingPanel from './FloatingPanel.tsx';
import { Icon } from './Symbols.tsx';
import { timeLabel, localDay, temp, percent } from '../lib/format.ts';
export default function AskDialog({
  open,
  place,
  locale,
  t,
  weather,
  onClose,
  onRefresh,
}: AskDialogProps) {
  const [question, setQuestion] = useState(''),
    [result, setResult] = useState<AskResult | null>(null),
    [err, setErr] = useState<'' | keyof ReturnType<typeof labels>>(''),
    [asked, setAsked] = useState(''),
    [stopped, setStopped] = useState(false),
    [phase, setPhase] = useState<WeatherPhase>('weather');
  const draft = useRef(''),
    sending = useRef(false),
    stopping = useRef(false);
  const context = useRef<ComparisonContext | null>(null),
    version = useRef(weather.version);
  const singleContext = useRef<SingleContext | null>(null);
  const transport = useMemo(weatherTransport, []);
  const {
    messages,
    sendMessage,
    regenerate,
    stop,
    status: chatStatus,
  } = useChat<WeatherMessage>({
    transport,
    onData: (part) => {
      if (part.type === 'data-phase') setPhase(part.data.phase);
    },
    onError: (error) => {
      sending.current = false;
      if (stopping.current) return;
      reveal.stop();
      setErr(failureKey(error));
    },
    onFinish: ({ message, isAbort, isError, isDisconnect }) => {
      sending.current = false;
      if (isAbort || stopping.current) {
        setStopped(true);
        return;
      }
      if (isError || isDisconnect) return;
      const data = messageWeather(message);
      if (!data) {
        setErr('offline');
        return;
      }
      setResult(data);
      context.current = data.context || null;
      singleContext.current = data.singleContext || null;
    },
  });
  const reveal = useAnswerReveal(messages);
  const requestBusy = chatStatus === 'submitted' || chatStatus === 'streaming';
  const busy = requestBusy || reveal.busy;
  const [preview, setPreview] = useState<Preview | null>(null),
    [activeWeather, setActiveWeather] = useState(weather);
  const previewNode = useRef<HTMLElement>(null),
    scrollNode = useRef<HTMLDivElement>(null),
    answerScroll = useRef(0),
    followAnswer = useRef(true);
  useEffect(() => {
    if (!open || !scrollNode.current) return;
    scrollNode.current.scrollTop = preview ? 0 : answerScroll.current;
    if (preview) previewNode.current?.focus({ preventScroll: true });
  }, [preview, open]);
  useEffect(() => {
    if (!preview && followAnswer.current && scrollNode.current) {
      scrollNode.current.scrollTop = scrollNode.current.scrollHeight;
      answerScroll.current = scrollNode.current.scrollTop;
    }
  });
  useEffect(
    () => () => {
      stopping.current = true;
      void stop();
    },
    [stop],
  );
  function writeDraft(value: string) {
    draft.current = value;
    setQuestion(value);
  }
  function body(q: string) {
    return {
      question: q,
      locale,
      lat: place.lat,
      lon: place.lon,
      version: version.current,
      context: context.current,
      singleContext: singleContext.current,
    };
  }
  async function ask(q: string, { preserveDraft = false, retry = false } = {}) {
    q = q.trim();
    if (!q || busy || sending.current) return;
    sending.current = true;
    stopping.current = false;
    reveal.begin();
    followAnswer.current = true;
    if (!preserveDraft) writeDraft('');
    setAsked(q);
    setErr('');
    setStopped(false);
    setPhase('weather');
    setPreview(null);
    if (retry) await regenerate({ body: body(q) });
    else await sendMessage({ text: q }, { body: body(q) });
  }
  function seeDay(date: string, source = result) {
    if (source?.singleForecast) {
      const { city, forecast } = source.singleForecast;
      setPreview({
        time: 0,
        single: true,
        days: forecast.days.filter((day) => day.date === date),
        row: {
          city,
          timezone: forecast.timezone,
          date,
          fetchedAt: forecast.fetchedAt,
          evidence: [],
        },
      });
      return;
    }
    onClose();
    setTimeout(
      () =>
        document
          .getElementById(`day-${date}`)
          ?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
      50,
    );
  }
  function see(epoch: number, source = result) {
    if (source?.singleForecast) {
      const { city, forecast } = source.singleForecast;
      const date = localDay(epoch, forecast.timezone);
      setPreview({
        time: epoch,
        single: true,
        row: {
          city,
          timezone: forecast.timezone,
          date,
          fetchedAt: forecast.fetchedAt,
          evidence: (forecast.comparisonHours || forecast.hours).filter(
            (hour) => localDay(hour.time, forecast.timezone) === date,
          ),
        },
      });
      return;
    }
    if (!activeWeather.hours.some((h) => h.time === epoch)) {
      const date = localDay(epoch, activeWeather.timezone);
      setPreview({
        time: epoch,
        row: {
          city: place,
          timezone: activeWeather.timezone,
          date,
          fetchedAt: activeWeather.fetchedAt,
          evidence: (source?.evidence || []).filter(
            (h) => localDay(h.time, activeWeather.timezone) === date,
          ),
        },
      });
      return;
    }
    onClose();
    setTimeout(() => {
      const h = document.getElementById(`hour-${epoch}`);
      if (h) {
        h.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
        h.animate?.([{ backgroundColor: '#f6df87' }, { backgroundColor: 'transparent' }], 1800);
      } else document.getElementById('hourly')?.scrollIntoView();
    }, 50);
  }
  async function refreshAndAsk() {
    try {
      const cities =
        context.current?.cities || (singleContext.current ? [singleContext.current.city] : [place]);
      const values = await Promise.all(
        cities.map(async (p) => {
          const r = await fetch(`/api/weather?lat=${p.lat}&lon=${p.lon}&fresh=1`);
          if (!r.ok) throw Error();
          return { ...p, ...decode(await readJson(r), validSnapshot) };
        }),
      );
      let origin = values.find((p) => p.lat === place.lat && p.lon === place.lon);
      if (!origin) {
        const r = await fetch(`/api/weather?lat=${place.lat}&lon=${place.lon}&fresh=1`);
        if (!r.ok) throw Error();
        origin = { ...place, ...decode(await readJson(r), validSnapshot) };
      }
      version.current = origin.version;
      setActiveWeather(origin);
      onRefresh(origin);
      if (context.current)
        context.current = {
          ...context.current,
          createdAt: Date.now(),
          cities: context.current.cities.map((p, i) => ({ ...p, version: values[i].version })),
        };
      if (singleContext.current)
        singleContext.current = {
          ...singleContext.current,
          createdAt: Date.now(),
          city: { ...singleContext.current.city, version: values[0].version },
        };
      await ask(asked, { preserveDraft: true, retry: true });
    } catch {
      setErr('offline');
    }
  }
  return (
    <FloatingPanel open={open} title={t.ask} closeLabel={t.minimizeAsk} onClose={onClose}>
      <div
        className="ask-scroll"
        ref={scrollNode}
        tabIndex={-1}
        onScroll={(e) => {
          if (!preview) {
            answerScroll.current = e.currentTarget.scrollTop;
            followAnswer.current =
              e.currentTarget.scrollHeight -
                e.currentTarget.clientHeight -
                e.currentTarget.scrollTop <
              80;
          }
        }}
      >
        {!preview && (
          <div className={`ask-conversation${!asked ? ' is-empty' : ''}`}>
            <p className="ask-location subtle">
              {result?.singleForecast?.city.name || place.name} ·{' '}
              {result?.singleForecast?.forecast.timezone || activeWeather.timezone}
              <br />
              {t.updated}{' '}
              {timeLabel(
                Date.parse(result?.singleForecast?.forecast.fetchedAt || activeWeather.fetchedAt) /
                  1000,
                locale,
                result?.singleForecast?.forecast.timezone || activeWeather.timezone,
              )}
            </p>
            {!asked && (
              <div className="ask-welcome">
                <h3>{t.askWelcome}</h3>
              </div>
            )}
            {messages.map((message) => {
              const result = messageWeather(message),
                text = message.role === 'user' ? messageText(message) : reveal.text(message),
                complete = reveal.complete(message);
              if (message.role === 'user')
                return (
                  <p className="ask-question" key={message.id}>
                    {text}
                  </p>
                );
              return text || result ? (
                <section
                  className="answer"
                  aria-live="polite"
                  aria-busy={busy && !complete}
                  key={message.id}
                >
                  {result && (
                    <span className="list-caption">
                      {result.source === 'model' ? t.model : t.rules}
                    </span>
                  )}
                  <p>{text}</p>
                  {complete && !!result?.evidence?.length && (
                    <>
                      <small>{t.evidence}</small>
                      <div className="evidence">
                        {result.evidence.map((e) => (
                          <button
                            key={`${e.city?.id || ''}-${e.time}`}
                            onClick={() =>
                              e.city && !result.singleForecast
                                ? setPreview({
                                    row: result.comparisons?.find(
                                      (r) =>
                                        r.version === e.version &&
                                        r.city.lat === e.city?.lat &&
                                        r.city.lon === e.city?.lon,
                                    ),
                                    time: e.time,
                                  })
                                : see(e.time, result)
                            }
                          >
                            {e.city?.name && `${e.city.name} · `}
                            {timeLabel(e.time, locale, e.timezone || weather.timezone)} ·{' '}
                            {temp(e.temp)} · {percent(e.rain)}
                            {e.code !== undefined && ` · ${condition(e.code, locale)}`}{' '}
                            <Icon name="arrow" size={13} />
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {complete && !!result?.dailyEvidence?.length && (
                    <>
                      <small>{t.evidence}</small>
                      <div className="evidence">
                        {result.dailyEvidence.map((d) => (
                          <button key={d.date} onClick={() => seeDay(d.date, result)}>
                            {result.singleForecast && `${result.singleForecast.city.name} · `}
                            {d.date} · {temp(d.min)} – {temp(d.max)} <Icon name="arrow" size={13} />
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </section>
              ) : null;
            })}
            {busy && (
              <p className="ask-working" role="status">
                <Icon name="clock" size={16} />
                {!requestBusy || reveal.busy
                  ? t.askDisplaying
                  : phase === 'model'
                    ? t.askPlanning
                    : phase === 'city'
                      ? t.askSearching
                      : t.askWeather}
              </p>
            )}
            {err && (
              <div role="alert" className="notice">
                {t[err]}{' '}
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    err === 'askChanged'
                      ? refreshAndAsk()
                      : ask(asked, { preserveDraft: true, retry: true })
                  }
                >
                  {err === 'askChanged' ? t.refreshForecasts : t.retry}
                </button>
              </div>
            )}
            {stopped && !busy && !err && (
              <p className="notice" role="status">
                {t.askStopped}{' '}
                <button
                  className="primary"
                  onClick={() => ask(asked, { preserveDraft: true, retry: true })}
                >
                  {t.retry}
                </button>
              </p>
            )}
            {!asked && (
              <div className="prompts">
                {[t.prompt1, t.prompt2, t.prompt3, t.comparePrompt].map((q) => (
                  <button
                    key={q}
                    onClick={() => {
                      context.current = null;
                      singleContext.current = null;
                      ask(q);
                    }}
                  >
                    <span>{q}</span>
                    <Icon name="arrow" size={15} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {preview?.row && (
          <section
            className="answer"
            ref={previewNode}
            tabIndex={-1}
            data-testid={preview.single ? 'city-forecast' : 'comparison-forecast'}
          >
            <h3>
              {preview.row.city.name} · {t.evidence}
            </h3>
            <p className="subtle">
              {preview.row.timezone} · {preview.row.date} · {t.updated}{' '}
              {timeLabel(
                Date.parse(preview.row.fetchedAt || '') / 1000,
                locale,
                preview.row.timezone || weather.timezone,
              )}
            </p>
            <div className="comparison-hours">
              {preview.days?.map((day) => (
                <div key={day.date}>
                  <time>{day.date}</time>
                  <span>
                    {temp(day.min)} – {temp(day.max)}C{' · '}
                    {condition(day.code, locale)}
                  </span>
                </div>
              ))}
              {preview.row.evidence.map((h) => (
                <div key={h.time} className={h.time === preview.time ? 'selected-reading' : ''}>
                  <time>
                    {timeLabel(h.time, locale, preview?.row?.timezone || weather.timezone)}
                  </time>
                  <span>
                    {temp(h.temp)}C · {t.rain} {percent(h.rain)}
                    {h.code !== undefined && ` · ${condition(h.code, locale)}`}
                  </span>
                </div>
              ))}
            </div>
            <button
              className="primary"
              onClick={() => {
                setPreview(null);
                requestAnimationFrame(() => scrollNode.current?.focus({ preventScroll: true }));
              }}
            >
              {t.back}
            </button>
          </section>
        )}
      </div>
      {!preview && (
        <div className="ask-composer">
          <form
            className="ask-form"
            onSubmit={(e) => {
              e.preventDefault();
              ask(draft.current);
            }}
          >
            <label className="sr-only" htmlFor="weather-question">
              {t.askHint}
            </label>
            <textarea
              id="weather-question"
              maxLength={300}
              rows={2}
              placeholder={t.askHint}
              value={question}
              onChange={(e) => {
                writeDraft(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  ask(draft.current);
                }
              }}
            />
            <button
              className="primary ask-submit"
              type={busy ? 'button' : 'submit'}
              aria-label={busy ? t.askStop : t.submit}
              title={busy ? t.askStop : t.submit}
              disabled={!busy && !question.trim()}
              onClick={
                busy
                  ? (event) => {
                      event.preventDefault();
                      reveal.stop();
                      stopping.current = true;
                      setStopped(true);
                      void stop();
                    }
                  : undefined
              }
            >
              <Icon name={busy ? 'stop' : 'east'} size={20} />
            </button>
          </form>
          <p className="ask-footnote">{t.askFootnote}</p>
        </div>
      )}
    </FloatingPanel>
  );
}
