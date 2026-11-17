'use client';
import type { ComponentProps } from 'react';
type PreparedLinkProps = Omit<ComponentProps<typeof Link>, 'href'> & {
  href: string;
  scope?: string;
  automatic?: boolean;
  enabled?: boolean;
};
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { canPrepare, createPrefetchBudget } from '../lib/prefetch-policy.ts';

const budget = createPrefetchBudget();
export function mayPrepare(intent = false) {
  return canPrepare(
    {
      ...navigator.connection,
      saveData: navigator.connection?.saveData,
      effectiveType: navigator.connection?.effectiveType,
      online: navigator.onLine,
      visible: document.visibilityState === 'visible',
    },
    intent,
  );
}
export default function PreparedLink({
  href,
  scope = 'home',
  automatic = false,
  enabled = true,
  children,
  ...props
}: PreparedLinkProps) {
  const node = useRef<HTMLAnchorElement>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [armedHref, setArmedHref] = useState('');
  const prepare = useCallback(
    (intent = false) => {
      if (!enabled || !mayPrepare(intent) || !budget.claim(href, scope, intent)) return;
      setArmedHref(href);
      // 完整预取使用公开 Link API；短暂注册后停止追踪，不轮询过期页面。
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setArmedHref(''), 8000);
    },
    [href, scope, enabled],
  );
  useEffect(() => {
    if (!automatic || !enabled || !node.current || !window.IntersectionObserver) return;
    let idle: number | undefined, delay: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      clearTimeout(delay);
      if (idle) window.cancelIdleCallback?.(idle);
      if (!entry.isIntersecting) return;
      delay = setTimeout(() => {
        if (window.requestIdleCallback)
          idle = window.requestIdleCallback(() => prepare(), { timeout: 1500 });
        else prepare();
      }, 700);
    });
    observer.observe(node.current);
    return () => {
      observer.disconnect();
      clearTimeout(delay);
      if (idle) window.cancelIdleCallback?.(idle);
    };
  }, [automatic, enabled, prepare]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Link
      {...props}
      ref={node}
      href={href}
      prefetch={enabled && armedHref === href}
      onPointerEnter={() => prepare(true)}
      onFocus={() => prepare(true)}
      onTouchStart={() => prepare(true)}
    >
      {children}
    </Link>
  );
}
