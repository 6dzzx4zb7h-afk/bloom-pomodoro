import {
  useId,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface ModalFrameProps {
  kind: 'dialog' | 'sheet';
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  onRequestClose?: () => void;
  closeLabel?: string;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  initialFocusRef?: RefObject<HTMLElement>;
  className?: string;
}

function focusableWithin(node: HTMLElement): HTMLElement[] {
  return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true',
  );
}

/**
 * Shared APG-style modal frame used by Dialog and Sheet (PLAN 8.4).
 * It portals beside the app content so the rest of the phone can be made
 * genuinely inert without also disabling the dialog itself.
 */
export function ModalFrame({
  kind,
  title,
  description,
  children,
  onRequestClose,
  closeLabel = 'Close',
  closeOnEscape = true,
  closeOnBackdrop = false,
  initialFocusRef,
  className = '',
}: ModalFrameProps) {
  const titleId = useId();
  const descriptionId = useId();
  const layerRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const invokerRef = useRef<HTMLElement | null>(null);
  const host =
    typeof document === 'undefined'
      ? null
      : (document.querySelector('.phone') as HTMLElement | null) ?? document.body;

  useLayoutEffect(() => {
    const layer = layerRef.current;
    const surface = surfaceRef.current;
    if (!layer || !surface || !host) return;

    invokerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const siblings = Array.from(host.children).filter((child) => child !== layer) as HTMLElement[];
    const previous = siblings.map((element) => ({
      element,
      inert: element.inert,
      ariaHidden: element.getAttribute('aria-hidden'),
    }));

    siblings.forEach((element) => {
      element.inert = true;
      element.setAttribute('aria-hidden', 'true');
    });

    const preferred = initialFocusRef?.current ?? surface.querySelector<HTMLElement>('[data-autofocus]');
    (preferred ?? focusableWithin(surface)[0] ?? surface).focus();

    return () => {
      previous.forEach(({ element, inert, ariaHidden }) => {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', ariaHidden);
      });
      invokerRef.current?.focus();
    };
  }, [host, initialFocusRef]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && closeOnEscape && onRequestClose) {
      event.preventDefault();
      event.stopPropagation();
      onRequestClose();
      return;
    }
    if (event.key !== 'Tab' || !surfaceRef.current) return;

    const focusable = focusableWithin(surfaceRef.current);
    if (focusable.length === 0) {
      event.preventDefault();
      surfaceRef.current.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!host) return null;

  return createPortal(
    <div className="dialog-layer" ref={layerRef}>
      <div
        className={`${kind}-backdrop`}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && closeOnBackdrop) onRequestClose?.();
        }}
      >
        <div
          ref={surfaceRef}
          className={`${kind}${className ? ` ${className}` : ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          onKeyDown={handleKeyDown}
        >
          {kind === 'sheet' ? (
            <div className="sheet-sticky-head">
              <span className="sheet-grip" aria-hidden="true" />
              <h2 className="sheet-title" id={titleId}>
                {title}
              </h2>
              {onRequestClose && (
                <button
                  type="button"
                  className="sheet-close"
                  aria-label={closeLabel}
                  onClick={onRequestClose}
                  data-autofocus
                >
                  ×
                </button>
              )}
            </div>
          ) : (
            <header className="dialog-head">
              <h2 className="dialog-title" id={titleId} tabIndex={-1} data-autofocus={!onRequestClose || undefined}>
                {title}
              </h2>
              {onRequestClose && (
                <button type="button" className="dialog-close" aria-label={closeLabel} onClick={onRequestClose}>
                  ×
                </button>
              )}
            </header>
          )}
          {description && (
            <div className="dialog-description" id={descriptionId}>
              {description}
            </div>
          )}
          {children}
        </div>
      </div>
    </div>,
    host,
  );
}

export type DialogProps = Omit<ModalFrameProps, 'kind'>;

export function Dialog(props: DialogProps) {
  return <ModalFrame kind="dialog" {...props} />;
}
