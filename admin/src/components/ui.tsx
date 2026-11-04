import type { ReactNode } from 'react';

export function PageHead({
  title,
  hint,
  actions,
}: {
  title: string;
  hint?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="pagehead">
      <div>
        <h1 className="pagehead__title">{title}</h1>
        {hint && <p className="pagehead__hint">{hint}</p>}
      </div>
      {actions && <div className="pagehead__actions">{actions}</div>}
    </div>
  );
}

export function Fieldset({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="fieldset">
      <h2 className="fieldset__title">{title}</h2>
      {hint && <p className="fieldset__hint">{hint}</p>}
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint && !error && <span className="field__hint">{hint}</span>}
      {error && <span className="field__error">{error}</span>}
    </label>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}

export function Loading({ label = 'Đang tải…' }: { label?: string }) {
  return <div className="loading">{label}</div>;
}

export function ErrorAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="alert alert--bad" role="alert">
      {message}
    </div>
  );
}

/*
  Plain words, the way this admin has always said it.

  A coloured pill per row put a run of green down the column, and since nearly
  every row is visible that run carried no information — it only drew the eye
  away from the rare row that is hidden. "Có" and "Không" under a heading that
  reads "Kích hoạt" answer the question the column asks, and the odd "Không"
  stands out precisely because nothing around it is shouting.
*/
export function StatusTag({ active }: { active: boolean }) {
  return <span className={active ? undefined : 'statusoff'}>{active ? 'Có' : 'Không'}</span>;
}

// Deleting is the one destructive action in this admin, and the shop owner is
// not technical — never let it happen on a single click.
export function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Xoá',
  pending,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal__title">{title}</h2>
        <p className="modal__body">{body}</p>
        <div className="modal__actions">
          <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={pending}>
            Huỷ
          </button>
          <button type="button" className="btn btn--primary" onClick={onConfirm} disabled={pending}>
            {pending ? 'Đang xoá…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function formatPrice(value: string | null) {
  if (value === null) return '—';
  return `${new Intl.NumberFormat('vi-VN').format(Number(value))}đ`;
}

// Vietnamese-aware slug: strips diacritics so "Đồ chơi" becomes "do-choi"
// instead of an empty string.
export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
