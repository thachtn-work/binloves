import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api';
import { matchesSearch } from '../lib/search';
import type { Media } from '../lib/types';
import { ConfirmDialog, Empty, ErrorAlert, Loading, PageHead } from '../components/ui';
import { EditSurface } from '../components/EditSurface';
import { ListSearch } from '../components/ListSearch';
import { useUpload } from '../media/useUpload';
import { MediaThumb } from '../media/MediaThumb';
import { DISPLAY_RATIOS, RATIO_LABEL, type DisplayRatio } from '../lib/ratio';

interface Usages {
  products: { id: string; name: string }[];
  banners: { id: string; title: string | null }[];
  categories: { id: string; name: string }[];
  collections: { id: string; name: string }[];
}

type KindFilter = 'all' | 'image' | 'video';
type UsageFilter = 'all' | 'unused' | 'used';

/**
 * A full page, not a modal. In bin-loves the library was a popup that mixed
 * uploading, browsing, selecting and deleting, so "manage my photos" and "pick
 * a photo for this product" were the same cramped surface. Picking happens in
 * the product/banner forms; this page is only for managing the files.
 */

/*
  Why a page of results rather than the whole library at once:

  the grid fits eight tiles to a row at 137px of pitch, so a thousand files is
  a hundred and twenty-five rows — seventeen thousand pixels, about eighteen
  screens. Before this, the details of whatever you clicked were rendered
  *below* that, which meant clicking a tile near the top and then scrolling
  past everything you own to reach it.

  Two changes fix it. The details moved into the side panel the shop owner
  already chose for editing, so the grid stays put and clicking a second tile
  just swaps the panel's contents. And the grid shows a page at a time, so the
  browser is never holding a thousand images.

  Searching and filtering happen here rather than on the server: the list is
  one request of a few hundred bytes per file, and keeping it in memory is
  what makes typing feel instant. Past roughly ten thousand files that trade
  stops paying and this should move server-side.
*/
const PAGE_SIZE = 48;
/** How close to the end of the grid the next batch is asked for. */
const AHEAD_PX = 600;

export function MediaLibraryPage() {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const { upload, cancel, uploading, progress, error: uploadError, notice, confirmation } =
    useUpload();
  const [selected, setSelected] = useState<Media | null>(null);
  const [toDelete, setToDelete] = useState<Media | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [term, setTerm] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [usage, setUsage] = useState<UsageFilter>('all');
  /**
   * How many of the matching files are rendered. Everything is already in
   * memory — this is about how many <img> the browser is asked to decode at
   * once, not about fetching. Grows as the grid is scrolled.
   */
  const [visible, setVisible] = useState(PAGE_SIZE);
  const gridRef = useRef<HTMLDivElement>(null);

  const { data: media, isLoading } = useQuery({
    queryKey: ['media'],
    queryFn: async () => (await api.get<Media[]>('/media')).data,
  });

  const { data: usages, isFetching: loadingUsages } = useQuery({
    queryKey: ['media', selected?.id, 'usages'],
    queryFn: async () => (await api.get<Usages>(`/media/${selected!.id}/usages`)).data,
    enabled: Boolean(selected),
  });

  const setRatio = useMutation({
    mutationFn: async ({ id, displayRatio }: { id: string; displayRatio: DisplayRatio }) =>
      (await api.patch<Media>(`/media/${id}/ratio`, { displayRatio })).data,
    onSuccess: async (updated) => {
      // The panel is showing this file right now, so it has to agree with the
      // button that was just pressed without waiting for the list to refetch.
      setSelected(updated);
      await queryClient.invalidateQueries({ queryKey: ['media'] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/media/${id}`),
    onSuccess: async () => {
      setToDelete(null);
      setSelected(null);
      await queryClient.invalidateQueries({ queryKey: ['media'] });
    },
    onError: (err) => {
      setToDelete(null);
      setError(errorMessage(err));
    },
  });

  const all = media ?? [];
  const usedCount = (m: Media) =>
    (m._count?.products ?? 0) +
    (m._count?.banners ?? 0) +
    (m._count?.categories ?? 0) +
    (m._count?.collections ?? 0);

  const matching = useMemo(
    () =>
      all.filter((m) => {
        if (kind !== 'all' && m.mediaType !== kind) return false;
        if (usage === 'unused' && usedCount(m) > 0) return false;
        if (usage === 'used' && usedCount(m) === 0) return false;
        return matchesSearch(term, m.filename);
      }),
    [all, kind, usage, term],
  );

  const shown = matching.slice(0, visible);

  /*
    Reveals the next batch as the end of the list is approached.

    Measured off the grid's own scroll position rather than with a sentinel
    element: a sentinel would have to be a grid child, and with rows now a
    stated 128px it would sit in a row of its own, leaving a tile-high strip
    of blank at the bottom of every scroll.

    Running once per render is what fills a tall screen — each batch triggers
    the next until the remaining scroll is more than a screenful, or until
    everything matching is shown and the state stops changing.
  */
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const topUp = () => {
      const remaining = grid.scrollHeight - grid.scrollTop - grid.clientHeight;
      if (remaining > AHEAD_PX) return;
      setVisible((n) => Math.min(n + PAGE_SIZE, matching.length));
    };
    topUp();
    grid.addEventListener('scroll', topUp, { passive: true });
    // Opening the inspector narrows the grid, which costs a column and leaves
    // a gap at the bottom that nothing would otherwise fill.
    const ro = new ResizeObserver(topUp);
    ro.observe(grid);
    return () => {
      grid.removeEventListener('scroll', topUp);
      ro.disconnect();
    };
  }, [matching.length, shown.length]);

  const change = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    // A narrower filter should start from the top again, not keep rendering
    // as many tiles as the previous, wider one had been scrolled through.
    setVisible(PAGE_SIZE);
    gridRef.current?.scrollTo({ top: 0 });
  };

  const inUse =
    (usages?.products.length ?? 0) +
      (usages?.banners.length ?? 0) +
      (usages?.categories.length ?? 0) +
      (usages?.collections.length ?? 0) >
    0;
  const unusedTotal = all.filter((m) => usedCount(m) === 0).length;

  return (
    // The inspector floats over the right of the page, so everything that can
    // be clicked — the search box and the upload button included, not just the
    // grid — gives up that width while it is open.
    <div className={`medialib ${selected ? 'inspecting' : ''}`}>
      <PageHead
        title="Thư viện ảnh & video"
        hint={
          isLoading
            ? 'Đang tải…'
            : `${all.length} tệp, ${unusedTotal} tệp chưa dùng ở đâu.` +
              (matching.length !== all.length ? ` Đang lọc ra ${matching.length} tệp.` : '')
        }
        actions={
          <>
            <ListSearch value={term} onChange={change(setTerm)} placeholder="Tìm theo tên tệp…" />
            {uploading && (
              <button type="button" className="btn btn--secondary" onClick={cancel}>
                Huỷ
              </button>
            )}
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
            >
              {uploading
                ? progress
                  ? `Đang tải ${progress.label}`
                  : 'Đang tải lên…'
                : 'Tải ảnh / video'}
            </button>
          </>
        }
      />

      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm"
        multiple
        hidden
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          await upload(files);
        }}
      />

      {confirmation && <ConfirmDialog {...confirmation} />}

      <ErrorAlert message={error ?? uploadError} />
      {notice && <div className="alert alert--warn">{notice}</div>}

      <div className="card">
        <div className="fieldset">
          {/* Two questions, because they are the two reasons to open this page:
              "where is that clip" and "what can I throw away". */}
          <div className="filterbar">
            <div className="chips" role="group" aria-label="Lọc theo loại">
              {(
                [
                  ['all', 'Tất cả'],
                  ['image', 'Ảnh'],
                  ['video', 'Video'],
                ] as [KindFilter, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`chip ${kind === value ? 'is-on' : ''}`}
                  aria-pressed={kind === value}
                  onClick={() => change(setKind)(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="chips" role="group" aria-label="Lọc theo tình trạng dùng">
              {(
                [
                  ['all', 'Mọi tình trạng'],
                  ['unused', 'Chưa dùng'],
                  ['used', 'Đang dùng'],
                ] as [UsageFilter, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`chip ${usage === value ? 'is-on' : ''}`}
                  aria-pressed={usage === value}
                  onClick={() => change(setUsage)(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <Loading />
          ) : all.length === 0 ? (
            <Empty title="Thư viện chưa có gì">
              <p>Tải ảnh hoặc video lên để dùng cho sản phẩm và banner.</p>
            </Empty>
          ) : matching.length === 0 ? (
            <Empty title="Không có tệp nào khớp">
              <p>Thử bỏ bớt bộ lọc hoặc đổi từ khoá.</p>
            </Empty>
          ) : (
            <div className="mediagrid" ref={gridRef}>
              {shown.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  className={`mediatile ${selected?.id === m.id ? 'is-selected' : ''}`}
                  onClick={() => setSelected(selected?.id === m.id ? null : m)}
                  title={m.filename}
                >
                  <MediaThumb media={m} />
                  {usedCount(m) === 0 && <span className="mediatile__free">chưa dùng</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <EditSurface
        open={Boolean(selected)}
        title={selected?.filename ?? ''}
        subtitle={
          selected
            ? `Tải lên ${new Date(selected.createdAt).toLocaleDateString('vi-VN')}`
            : undefined
        }
        width={440}
        blocking={false}
        onClose={() => setSelected(null)}
        footer={
          <div className="formbar">
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => selected && setToDelete(selected)}
              disabled={inUse || loadingUsages}
            >
              Xoá khỏi thư viện
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => setSelected(null)}>
              Đóng
            </button>
          </div>
        }
      >
        {selected && (
          <>
            <div className="mediapreview">
              <MediaThumb media={selected} />
            </div>

            {/*
              Only clips get a choice. A photo in this shop is square, and
              offering three frames for one would be three ways to get the
              product grid wrong.

              Usually already correct: the browser reads the clip's own shape
              when it is uploaded. This is for the times the owner wants
              otherwise — a vertical clip shown square to keep a page tidy —
              and for the clips that were here before any of this existed.
            */}
            {selected.mediaType === 'video' && (
              <div className="field">
                <span className="field__label">Khung hiển thị</span>
                <div className="chips" role="group" aria-label="Khung hiển thị video">
                  {DISPLAY_RATIOS.map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      className={`chip ${(selected.displayRatio ?? '1:1') === ratio ? 'is-on' : ''}`}
                      disabled={setRatio.isPending}
                      onClick={() => setRatio.mutate({ id: selected.id, displayRatio: ratio })}
                    >
                      {RATIO_LABEL[ratio]} {ratio}
                    </button>
                  ))}
                </div>
                <p className="field__hint">
                  Áp cho mọi nơi đang dùng tệp này. Ảnh luôn hiển thị vuông.
                </p>
              </div>
            )}

            {loadingUsages ? (
              <p className="field__hint">Đang kiểm tra nơi đang dùng tệp này…</p>
            ) : inUse ? (
              <>
                <div className="alert alert--warn">
                  Tệp đang được dùng. Gỡ khỏi các mục bên dưới trước khi xoá.
                </div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {usages?.products.map((p) => (
                    <li key={p.id} className="cellsub">
                      Sản phẩm: {p.name}
                    </li>
                  ))}
                  {usages?.banners.map((b) => (
                    <li key={b.id} className="cellsub">
                      Banner: {b.title ?? 'Không có tiêu đề'}
                    </li>
                  ))}
                  {usages?.categories.map((c) => (
                    <li key={c.id} className="cellsub">
                      Ảnh đại diện danh mục: {c.name}
                    </li>
                  ))}
                  {usages?.collections.map((c) => (
                    <li key={c.id} className="cellsub">
                      Ảnh đại diện bộ sưu tập: {c.name}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="field__hint">Tệp chưa được dùng ở đâu, có thể xoá an toàn.</p>
            )}
          </>
        )}
      </EditSurface>

      {toDelete && (
        <ConfirmDialog
          title={`Xoá "${toDelete.filename}"?`}
          body="Tệp sẽ bị xoá khỏi kho lưu trữ và không khôi phục được."
          pending={remove.isPending}
          onConfirm={() => remove.mutate(toDelete.id)}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
}
