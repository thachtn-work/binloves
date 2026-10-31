import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api';
import type { Banner } from '../lib/types';
import { ConfirmDialog, Empty, ErrorAlert, Field, Loading, PageHead, StatusTag } from '../components/ui';
import { MediaPicker } from '../media/MediaPicker';
import { usePublish } from '../publish/PublishProvider';
import { MediaThumb } from '../media/MediaThumb';

export function BannerPage() {
  const queryClient = useQueryClient();
  const { notifyChange } = usePublish();
  const [adding, setAdding] = useState(false);
  const [toDelete, setToDelete] = useState<Banner | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: banners, isLoading } = useQuery({
    queryKey: ['banners'],
    queryFn: async () => (await api.get<Banner[]>('/banners')).data,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/banners/${id}`),
    onSuccess: async () => {
      setToDelete(null);
      await queryClient.invalidateQueries({ queryKey: ['banners'] });
      notifyChange();
    },
    onError: (err) => {
      setToDelete(null);
      setError(errorMessage(err));
    },
  });

  const toggle = useMutation({
    mutationFn: async (banner: Banner) =>
      api.patch(`/banners/${banner.id}`, { isActive: !banner.isActive }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['banners'] });
      notifyChange();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <>
      <PageHead
        title="Banner trang chủ"
        hint="Ảnh hoặc video lớn chạy luân phiên ở đầu trang chủ."
        actions={
          !adding && (
            <button type="button" className="btn btn--primary" onClick={() => setAdding(true)}>
              Thêm banner
            </button>
          )
        }
      />

      <ErrorAlert message={error} />

      {adding && <BannerCreateCard onDone={() => setAdding(false)} />}

      <div className="card">
        {isLoading ? (
          <Loading />
        ) : (banners ?? []).length === 0 ? (
          <Empty title="Chưa có banner nào">
            <p>Trang chủ sẽ chỉ hiển thị phần giới thiệu cho tới khi bạn thêm banner.</p>
          </Empty>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 92 }}>Xem trước</th>
                  <th>Tiêu đề</th>
                  <th>Liên kết</th>
                  <th style={{ width: 100 }}>Thứ tự</th>
                  <th style={{ width: 120 }}>Hiển thị</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(banners ?? []).map((banner) => (
                  <tr key={banner.id}>
                    <td>
                      <MediaThumb
                        className="thumb"
                        style={{ width: 76, height: 50 }}
                        media={banner.media}
                      />
                    </td>
                    <td className="cellmain">{banner.title || '—'}</td>
                    <td className="cellsub" style={{ maxWidth: 240, overflowWrap: 'anywhere' }}>
                      {banner.linkUrl || '—'}
                    </td>
                    <td className="cellsub">{banner.sortOrder}</td>
                    <td>
                      <StatusTag active={banner.isActive} />
                    </td>
                    <td>
                      <div className="table__actions">
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          onClick={() => toggle.mutate(banner)}
                          disabled={toggle.isPending}
                        >
                          {banner.isActive ? 'Ẩn' : 'Hiện'}
                        </button>
                        <button
                          type="button"
                          className="btn btn--danger btn--sm"
                          onClick={() => setToDelete(banner)}
                        >
                          Xoá
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toDelete && (
        <ConfirmDialog
          title="Xoá banner này?"
          body="Banner sẽ bị gỡ khỏi trang chủ. Tệp vẫn còn trong thư viện."
          pending={remove.isPending}
          onConfirm={() => remove.mutate(toDelete.id)}
          onCancel={() => setToDelete(null)}
        />
      )}
    </>
  );
}

function BannerCreateCard({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const { notifyChange } = usePublish();
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () =>
      api.post('/banners', {
        mediaId: mediaIds[0],
        title: title.trim() || undefined,
        linkUrl: linkUrl.trim() || undefined,
        sortOrder: Number(sortOrder) || 0,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['banners'] });
      notifyChange();
      onDone();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <form
      className="card"
      style={{ marginBottom: 16 }}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        create.mutate();
      }}
    >
      <div className="fieldset">
        <h2 className="fieldset__title">Banner mới</h2>
        <p className="fieldset__hint">Chọn một ảnh hoặc video, đặt tiêu đề và liên kết nếu cần.</p>

        {error && <div className="alert alert--bad">{error}</div>}

        <Field
          label="Ảnh / video banner"
          hint="Khổ ngang hiển thị đẹp nhất, tỉ lệ khoảng 3:2. Video tự chạy và luôn tắt tiếng."
        >
          <MediaPicker value={mediaIds} onChange={setMediaIds} multiple={false} />
        </Field>

        <div className="grid2" style={{ marginTop: 14 }}>
          <Field label="Tiêu đề" hint="Hiển thị chồng lên banner. Có thể để trống.">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>

          <Field label="Thứ tự hiển thị">
            <input
              className="input"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Liên kết khi bấm vào" hint="Dán đường dẫn đầy đủ, ví dụ https://…">
          <input className="input" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
        </Field>

        <div className="formbar">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={create.isPending || mediaIds.length === 0}
          >
            {create.isPending ? 'Đang lưu…' : 'Lưu banner'}
          </button>
          <button type="button" className="btn btn--secondary" onClick={onDone}>
            Huỷ
          </button>
          {mediaIds.length === 0 && <span className="field__hint">Chọn một ảnh hoặc video để tiếp tục.</span>}
        </div>
      </div>
    </form>
  );
}
