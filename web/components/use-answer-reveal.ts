'use client';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { WeatherMessage } from '../lib/chat-types.ts';
import { messageText } from './weather-chat.ts';

type Entry = { glyphs: string[]; shown: number; at: number; stopped: boolean };
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

// 只改变显示进度；SDK 消息与经过校验的天气快照保留原文。
export function useAnswerReveal(messages: WeatherMessage[]) {
  const targets = useMemo(
    () =>
      messages
        .filter((message) => message.role === 'assistant')
        .map((message) => ({
          id: message.id,
          text: messageText(message),
        })),
    [messages],
  );
  const entries = useRef(new Map<string, Entry>()),
    currentTargets = useRef(targets),
    frame = useRef<number | null>(null),
    paused = useRef(false);
  currentTargets.current = targets;
  const [, redraw] = useReducer((value: number) => value + 1, 0);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const ids = new Set(targets.map(({ id }) => id));
    for (const id of entries.current.keys()) if (!ids.has(id)) entries.current.delete(id);
    for (const target of targets) {
      const previous = entries.current.get(target.id);
      const glyphs = Array.from(segmenter.segment(target.text), ({ segment }) => segment);
      const entry = previous || {
        glyphs,
        shown: 0,
        at: performance.now(),
        stopped: paused.current,
      };
      if (entry.shown >= entry.glyphs.length && entry.shown < glyphs.length)
        entry.at = performance.now();
      if (!target.text.startsWith(entry.glyphs.slice(0, entry.shown).join(''))) entry.shown = 0;
      entry.glyphs = glyphs;
      if (reduced && !entry.stopped) entry.shown = glyphs.length;
      entries.current.set(target.id, entry);
    }
    const tick = (now: number) => {
      let changed = false,
        pending = false;
      for (const entry of entries.current.values()) {
        if (entry.stopped || entry.shown >= entry.glyphs.length) continue;
        // 通常每字 24 ms；长回答加快，当前完整文本的展示预算最多约 6 秒。
        const interval = Math.min(24, 6000 / entry.glyphs.length);
        const step = Math.floor((now - entry.at) / interval);
        if (step > 0) {
          entry.shown = Math.min(entry.glyphs.length, entry.shown + step);
          entry.at += step * interval;
          changed = true;
        }
        pending ||= entry.shown < entry.glyphs.length;
      }
      if (changed) redraw();
      frame.current = pending ? requestAnimationFrame(tick) : null;
    };
    redraw();
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [targets, reduced]);
  function text(message: WeatherMessage) {
    const entry = entries.current.get(message.id);
    return reduced && !entry?.stopped && !paused.current
      ? messageText(message)
      : entry?.glyphs.slice(0, entry.shown).join('') || '';
  }
  function complete(message: WeatherMessage) {
    return !entries.current.get(message.id)?.stopped && text(message) === messageText(message);
  }
  function stop() {
    paused.current = true;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    for (const target of currentTargets.current) {
      const entry = entries.current.get(target.id);
      if (entry && (entry.shown < entry.glyphs.length || !entry.glyphs.length))
        entry.stopped = true;
      else if (!entry)
        entries.current.set(target.id, {
          glyphs: Array.from(segmenter.segment(target.text), ({ segment }) => segment),
          shown: 0,
          at: performance.now(),
          stopped: true,
        });
    }
    redraw();
  }
  const busy = targets.some(({ id, text }) => {
    const entry = entries.current.get(id);
    return (
      !paused.current &&
      !entry?.stopped &&
      !reduced &&
      (entry?.glyphs.slice(0, entry.shown).join('') || '') !== text
    );
  });
  return {
    text,
    complete,
    stop,
    busy,
    begin: () => {
      paused.current = false;
    },
  };
}
