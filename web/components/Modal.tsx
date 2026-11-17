'use client';
import type { ReactNode } from 'react';
type ModalProps = {
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  variant?: string;
};
import { useEffect, useRef } from 'react';
import { Icon } from './Symbols.tsx';
export function Modal({
  title,
  closeLabel,
  onClose,
  children,
  wide = false,
  variant = '',
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const dialog = ref.current;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const viewport = window.visualViewport;
    function resize() {
      const height = viewport?.height || innerHeight;
      dialog.style.maxHeight = `${variant === 'map' ? Math.max(0, height - 16) : height * 0.85}px`;
      const focused = document.activeElement;
      if (
        focused instanceof HTMLElement &&
        dialog.contains(focused) &&
        /INPUT|TEXTAREA/.test(focused.tagName)
      ) {
        requestAnimationFrame(() => focused.scrollIntoView({ block: 'center' }));
      }
    }
    resize();
    viewport?.addEventListener('resize', resize);
    return () => {
      viewport?.removeEventListener('resize', resize);
      dialog.close();
      document.body.style.overflow = overflow;
      active?.focus?.();
    };
  }, [variant]);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={`dialog${wide ? ' wide' : ''}${variant === 'map' ? ' map-dialog' : ''}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dialog-inner">
        <div className="dialog-heading">
          <h2>{title}</h2>
          <button autoFocus={false} className="icon-btn" aria-label={closeLabel} onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
