import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Media } from '../lib/types';
import { ConfirmDialog, Loading } from '../components/ui';
import { useUpload } from './useUpload';
import { MediaThumb } from './MediaThumb';

const ACCEPT = {
  image: 'image/jpeg,image/png,image/webp,image/avif',
  video: 'video/mp4,video/webm',
} as const;
const BOTH = `${ACCEPT.image},${ACCEPT.video}`;

interface Props {
  /** Ordered media ids. Order is what the website renders. */
  value: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  /**
   * Narrows both the library and the file dialog to one kind. Used where the
   * slot can only render one — a category circle shows a still, so offering a
   * clip there would only let the owner pick something that arrives as a dead
   * frame. Left out, both kinds are offered.
   */
  kind?: 'image' | 'video';
}

export function MediaPicker({ value, onChange, multiple = true, kind }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const { upload, cancel, uploading, progress, error, notice, confirmation } = useUpload();

  const { data: media, isLoading } = useQuery({
    queryKey: ['media'],
    queryFn: async () => (await api.get<Media[]>('/media')).data,
  });

  const library = kind ? (media ?? []).filter((m) => m.mediaType === kind) : media ?? [];
  const byId = new Map((media ?? []).map((m) => [m.id, m]));
  const chosen = value.map((id) => byId.get(id)).filter((m): m is Media => Boolean(m));

  function toggle(id: string) {
    if (!multiple) {
      onChange(value[0] === id ? [] : [id]);
      return;
    }
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  function move(index: number, delta: number) {
    const next = [...value];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  async function onFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    const created = await upload(files);
    if (created.length === 0) return;
    const ids = created.map((m) => m.id);
    onChange(multiple ? [...value, ...ids] : [ids[0]]);
  }

  return (
    <div>
      {confirmation && <ConfirmDialog {...confirmation} />}
      {error && <div className="alert alert--bad">{error}</div>}
      {notice && <div className="alert alert--warn">{notice}</div>}

      {chosen.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <p className="field__label">
            {multiple ? 'Đã chọn — thứ tự hiển thị trên website' : 'Đã chọn'}
          </p>
          <div className="chosen">
            {chosen.map((m, index) => (
              <div className="chosen__item" key={m.id}>
                <MediaThumb media={m} />
                <div className="chosen__bar">
                  {multiple && (
                    <>
                      <button
                        type="button"
                        className="iconbtn"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        aria-label="Chuyển lên trước"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        className="iconbtn"
                        onClick={() => move(index, 1)}
                        disabled={index === chosen.length - 1}
                        aria-label="Chuyển ra sau"
                      >
                        →
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="iconbtn"
                    onClick={() => onChange(value.filter((v) => v !== m.id))}
                    aria-label="Bỏ mục này"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Đang tải lên…' : kind === 'image' ? 'Tải ảnh từ máy' : 'Tải ảnh / video từ máy'}
        </button>
        {uploading && (
          <button type="button" className="btn btn--secondary btn--sm" onClick={cancel}>
            Huỷ
          </button>
        )}
        {progress && <span className="field__hint">{progress.label}</span>}
        <input
          ref={fileInput}
          type="file"
          accept={kind ? ACCEPT[kind] : BOTH}
          multiple={multiple}
          hidden
          onChange={onFiles}
        />
      </div>

      {isLoading ? (
        <Loading label="Đang tải thư viện…" />
      ) : library.length === 0 ? (
        <p className="field__hint">
          {kind === 'image'
            ? 'Thư viện chưa có ảnh nào. Tải ảnh đầu tiên lên để bắt đầu.'
            : 'Thư viện chưa có gì. Tải ảnh hoặc video đầu tiên lên để bắt đầu.'}
        </p>
      ) : (
        // `--picker` is what carries the height cap. The same grid on the
        // media library page fills the screen instead, because there the
        // pictures are the page rather than one field on a form.
        <div className="mediagrid mediagrid--picker">
          {library.map((m) => {
            const order = value.indexOf(m.id);
            return (
              <button
                type="button"
                key={m.id}
                className={`mediatile ${order >= 0 ? 'is-selected' : ''}`}
                onClick={() => toggle(m.id)}
                aria-pressed={order >= 0}
                title={m.filename}
              >
                <MediaThumb media={m} />
                {order >= 0 && <span className="mediatile__order">{multiple ? order + 1 : '✓'}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
