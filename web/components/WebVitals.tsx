'use client';
import type { Metric } from 'web-vitals';
import { useEffect } from 'react';
export default function WebVitals() {
  useEffect(() => {
    let active = true;
    const report = (metric: Metric) => {
      if (!active) return;
      const parts = location.pathname.split('/'),
        locale = parts[1];
      if (!['zh-Hans', 'zh-Hant', 'en', 'ko'].includes(locale)) return;
      const pageType =
        parts[2] === 'weather' ? 'city' : parts[2] === 'explore' ? 'explore' : 'home';
      const device = innerWidth < 600 ? 'mobile' : innerWidth < 1100 ? 'tablet' : 'desktop';
      const body = JSON.stringify({
        id: metric.id,
        name: metric.name,
        value: metric.value,
        locale,
        pageType,
        device,
      });
      navigator.sendBeacon('/api/vitals', new Blob([body], { type: 'application/json' }));
    };
    import('web-vitals').then(({ onLCP, onINP, onCLS }) => {
      if (active) {
        onLCP(report);
        onINP(report);
        onCLS(report);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  return null;
}
