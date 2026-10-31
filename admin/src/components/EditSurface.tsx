import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/**
 * Create and edit happen here, beside the list rather than on their own page,
 * so the shop owner keeps sight of what they already have while adding the
 * next item.
 *
 * This is not the shared cramped modal pattern it might resemble: the panel is
 * wide enough for the full sectioned form, and the heading always states which
 * of the two jobs is happening.
 *
 * A centred-modal and a full-page variant were also built and trialled; the
 * shop owner compared all three and chose this one, so the others were removed
 * rather than left as dead options.
 */
export function EditSurface({
  open,
  title,
  subtitle,
  width = 560,
  blocking = true,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  width?: number;
  /**
   * Blocking is right for a form: a half-typed product should not be left
   * behind by a stray click on the list.
   *
   * The media library wants the opposite. Looking through files means opening
   * one after another, and with a scrim every one of them costs a close before
   * the next click lands — which is the cost of a modal, and the reason this
   * is a panel instead. Pass false there and the list stays live underneath.
   */
  blocking?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Callers pass an inline arrow, so `onClose` is a new function on every
  // render. Held in a ref so the effects below don't list it as a dependency
  // and re-run on every keystroke.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Runs only when the panel opens. Previously this sat in the effect above
  // with `onClose` in its dependencies, so it re-ran on every render and
  // yanked focus out of whatever field was being typed in — one character per
  // click.
  useEffect(() => {
    if (!open) return;
    const node = containerRef.current;
    // A field inside may have autoFocus; don't take focus away from it. This
    // only moves focus into the dialog when nothing inside claimed it.
    if (node && !node.contains(document.activeElement)) node.focus();
  }, [open]);

  if (!open) return null;

  return (
    <>
      {blocking && <div className="surface-scrim" onClick={onClose} />}
      <div
        className="surface surface--panel"
        style={{ width }}
        role="dialog"
        aria-modal={blocking || undefined}
        aria-label={title}
        tabIndex={-1}
        ref={containerRef}
      >
        <header className="surface__head">
          <div>
            <h2 className="surface__title">{title}</h2>
            {subtitle && <p className="surface__subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="surface__close" onClick={onClose} aria-label="Đóng">
            ×
          </button>
        </header>

        <div className="surface__body">{children}</div>

        {footer && <footer className="surface__foot">{footer}</footer>}
      </div>
    </>
  );
}
