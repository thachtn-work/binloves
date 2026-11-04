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
 * A centred-modal and a full-page variant were also built and trialled, and
 * the panel was chosen over both — but that choice belongs to the other shop
 * this architecture came from, not to this one, which inherited the result
 * without being asked. Treat it as a default here, not as settled.
 */
export function EditSurface({
  open,
  title,
  subtitle,
  width = 560,
  variant = 'panel',
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
   * Where the form appears. `panel` slides in from the right; `modal` sits in
   * the middle of a dimmed page.
   *
   * Both exist because this shop learned its admin on the modal and asked for
   * it back. The short forms — a category, a section — are what it suits: the
   * whole thing is visible at once and nothing behind it matters while it is
   * open. The panel stays for the long ones, where keeping the list in view
   * beside the form is worth more than being centred.
   */
  variant?: 'panel' | 'modal';
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

  /*
    Back closes the panel instead of leaving the page.

    Before this, the panel was invisible to the browser: it opened, and the
    address never changed. Someone who finished an edit and reached for Back —
    which is what you do after finishing something, and what this admin's
    previous version trained its owner to do, because there editing really was
    a separate page — did not return to the list. They left it, losing their
    place in two hundred and sixty products and whatever they had scrolled to.

    Opening pushes one history entry; Back pops it and we close. Closing by
    any other route (the ×, Huỷ, Escape, the scrim) removes that entry again,
    so Back never needs pressing twice to leave a page the panel is shut on.
    The marker on the entry is what tells the two apart: once Back has fired,
    the entry is already gone and the cleanup leaves history alone.
  */
  useEffect(() => {
    if (!open) return;
    window.history.pushState({ editSurface: true }, '');

    const onPop = () => onCloseRef.current();
    window.addEventListener('popstate', onPop);

    return () => {
      window.removeEventListener('popstate', onPop);
      if (window.history.state?.editSurface) window.history.back();
    };
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
    //
    // preventScroll because this panel is position:fixed, and focus on a fixed
    // element is a standing invitation for the browser to scroll the document
    // behind it looking for somewhere to put it. Measured at 1440×900 it does
    // not currently move: this guards the behaviour rather than fixing a bug,
    // so that a later change to the panel's height or placement cannot quietly
    // start throwing the list out of position.
    if (node && !node.contains(document.activeElement)) node.focus({ preventScroll: true });
  }, [open]);

  if (!open) return null;

  return (
    <>
      {blocking && (
        <div className={`surface-scrim surface-scrim--${variant}`} onClick={onClose} />
      )}
      <div
        className={`surface surface--${variant}`}
        style={variant === 'modal' ? { maxWidth: width } : { width }}
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
