'use client';
import type { ReactNode } from 'react';
type FloatingPanelProps = {
  open: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
};
import { useEffect, useRef } from 'react';
import { Icon } from './Symbols.tsx';

export default function FloatingPanel({
  open,
  title,
  closeLabel,
  onClose,
  children,
}: FloatingPanelProps) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open || !ref.current) return;
    const panel = ref.current,
      previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const viewport = window.visualViewport;
    function resize() {
      const height = viewport?.height || innerHeight;
      const inset = Math.max(0, innerHeight - height - (viewport?.offsetTop || 0));
      panel.style.setProperty('--ask-viewport-height', `${height}px`);
      panel.style.setProperty('--ask-keyboard-inset', `${inset}px`);
    }
    resize();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    const target = matchMedia('(pointer: fine)').matches ? panel.querySelector('textarea') : panel;
    (target || panel).focus({ preventScroll: true });
    return () => {
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
      const restore =
        previous?.isConnected && previous !== document.body && previous !== document.documentElement
          ? previous
          : document.querySelector<HTMLElement>('.ask-launcher');
      restore?.focus?.({ preventScroll: true });
    };
  }, [open]);
  if (!open) return null;
  return (
    <section
      id="weather-ask-panel"
      className="ask-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="weather-ask-title"
      tabIndex={-1}
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.nativeEvent.isComposing) {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="ask-panel-heading dialog-heading">
        <Icon name="spark" size={23} />
        <h2 id="weather-ask-title">{title}</h2>
        <button className="icon-btn" aria-label={closeLabel} title={closeLabel} onClick={onClose}>
          <Icon name="down" size={22} />
        </button>
      </header>
      {children}
    </section>
  );
}
