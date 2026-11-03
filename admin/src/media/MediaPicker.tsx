import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { upsertRow } from '../lib/cache';
import type { Media } from '../lib/types';
import { ConfirmDialog, Loading } from '../components/ui';
import { useUpload } from './useUpload';
import { MediaThumb } from './MediaThumb';
import { DISPLAY_RATIOS, RATIO_LABEL, type DisplayRatio } from '../lib/ratio';

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
  /**
   * Offers each chosen clip the frame it will be drawn in.
   *
   * Only where that frame is the product gallery's to decide. A banner is
   * drawn in the hero's own fixed shape whatever the file says, and the
   * category and collection pickers are stills-only — a control that changed
   * nothing visible would be worse than no control.
   */
  showRatio?: boolean;
}

/*
  Three rows at a time, the same batch the media library page reveals, and the
  same look-ahead before topping up.
*/
const PAGE_SIZE = 48;
const AHEAD_PX = 600;

/*
  The library as tiles, held behind its own boundary and shown a batch at a
  time.

  This grid sits inside the product form, so before this it was rebuilt on
  every keystroke in every field on that form — a shop with several hundred
  files in the library redrew several hundred tiles per character typed, none
  of which could have changed. It only depends on what is in the library and
  what is selected.
*/
const LibraryGrid = memo(function LibraryGrid({
  library,
  value,
  multiple,
  onToggle,
}: {
  library: Media[];
  value: string[];
  multiple: boolean;
  onToggle: (id: string) => void;
}) {
  /*
    Only the first batch is in the DOM to begin with.

    This grid is mounted every time the add-product panel is opened, and it
    was mounting the entire library each time — a shop with several hundred
    files attached several hundred image elements for the browser to fetch and
    decode, for a field three rows tall. Adding products one after another
    paid that on every single one, and it is the larger half of what made a
    long session degrade. Three rows fill the frame; the rest arrive by
    scrolling, which is what the media library page already does.
  */
  const gridRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(PAGE_SIZE);

  // A narrower filter, or a fresh upload, starts the count again rather than
  // keeping however far the previous library had been scrolled.
  useEffect(() => setShown(PAGE_SIZE), [library]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const topUp = () => {
      if (grid.scrollHeight - grid.scrollTop - grid.clientHeight > AHEAD_PX) return;
      setShown((n) => Math.min(n + PAGE_SIZE, library.length));
    };
    topUp();
    grid.addEventListener('scroll', topUp, { passive: true });
    return () => grid.removeEventListener('scroll', topUp);
  }, [library.length, shown]);

  return (
    // `--picker` is what carries the height cap. The same grid on the media
    // library page fills the screen instead, because there the pictures are
    // the page rather than one field on a form.
    <div className="mediagrid mediagrid--picker" ref={gridRef}>
      {library.slice(0, shown).map((m) => {
        const order = value.indexOf(m.id);
        return (
          <button
            type="button"
            key={m.id}
            className={`mediatile ${order >= 0 ? 'is-selected' : ''}`}
            onClick={() => onToggle(m.id)}
            aria-pressed={order >= 0}
            title={m.filename}
          >
            <MediaThumb media={m} />
            {order >= 0 && <span className="mediatile__order">{multiple ? order + 1 : '✓'}</span>}
          </button>
        );
      })}
    </div>
  );
});

export function MediaPicker({ value, onChange, multiple = true, kind, showRatio }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const { upload, cancel, uploading, progress, error, notice, confirmation } = useUpload();

  const queryClient = useQueryClient();

  const { data: media, isLoading } = useQuery({
    queryKey: ['media'],
    queryFn: async () => (await api.get<Media[]>('/media')).data,
  });

  /*
    Saved on its own, not with the product. The frame belongs to the file and
    applies everywhere it appears, so holding it until Save would make it look
    like a property of the product being edited — and would lose it if the
    owner only came here to fix a clip.
  */
  const setRatio = useMutation({
    mutationFn: async ({ id, displayRatio }: { id: string; displayRatio: DisplayRatio }) =>
      (await api.patch<Media>(`/media/${id}/ratio`, { displayRatio })).data,
    // One file's frame changed; the API answered with that file. Pulling the
    // whole library back for it redrew every tile in the picker.
    onSuccess: (updated) => upsertRow(queryClient, ['media'], updated, 'head'),
  });

  const library = useMemo(
    () => (kind ? (media ?? []).filter((m) => m.mediaType === kind) : (media ?? [])),
    [media, kind],
  );
  const chosen = useMemo(() => {
    const byId = new Map((media ?? []).map((m) => [m.id, m]));
    return value.map((id) => byId.get(id)).filter((m): m is Media => Boolean(m));
  }, [media, value]);

  function toggle(id: string) {
    if (!multiple) {
      onChange(value[0] === id ? [] : [id]);
      return;
    }
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  /*
    A stable handle on `toggle`, which is rebuilt on every render because it
    closes over the current selection. The grid below is memoised and would be
    redrawn by a new function alone — the same reason `EditSurface` keeps its
    `onClose` in a ref. The ref always holds the current one, so the grid stays
    still and the click still does the right thing.
  */
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  const onToggle = useCallback((id: string) => toggleRef.current(id), []);

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
                  {showRatio && m.mediaType === 'video' && (
                    <select
                      className="chosen__ratio"
                      aria-label={`Khung hiển thị cho ${m.filename}`}
                      value={m.displayRatio ?? '1:1'}
                      disabled={setRatio.isPending}
                      onChange={(e) =>
                        setRatio.mutate({
                          id: m.id,
                          displayRatio: e.target.value as DisplayRatio,
                        })
                      }
                    >
                      {DISPLAY_RATIOS.map((ratio) => (
                        <option key={ratio} value={ratio}>
                          {RATIO_LABEL[ratio]} {ratio}
                        </option>
                      ))}
                    </select>
                  )}
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
        <LibraryGrid library={library} value={value} multiple={multiple} onToggle={onToggle} />
      )}
    </div>
  );
}
