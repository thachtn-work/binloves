import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api';
import { removeRow, restoreList, upsertRow } from '../lib/cache';
import { CONTACT_CHANNEL_TYPES } from '../lib/types';
import type { ContactChannel } from '../lib/types';
import { ConfirmDialog, Empty, ErrorAlert, Field, Loading, PageHead } from '../components/ui';
import { OrderButtons, moveItem } from '../components/OrderButtons';
import { useRowDrag } from '../components/useRowDrag';
import type { GripProps } from '../components/useRowDrag';
import { usePublish } from '../publish/PublishProvider';

const TYPE_LABEL = new Map<string, string>(CONTACT_CHANNEL_TYPES.map((t) => [t.value, t.label]));
const TYPE_HINT = new Map<string, string>(CONTACT_CHANNEL_TYPES.map((t) => [t.value, t.hint]));

/**
 * One row per channel rather than one card: there are at most eight of these,
 * each holding two short values, so a full card apiece turned a small job into
 * a long scroll. The per-field hints moved into placeholders, which puts them
 * where they are actually read.
 *
 * Still not merged into one shared form — bin-loves bundled every channel plus
 * the address behind a single save, so changing a phone number re-submitted
 * everything. Each row saves on its own.
 */
export function ContactChannelPage() {
  const queryClient = useQueryClient();
  const { notifyChange } = usePublish();
  const [adding, setAdding] = useState(false);
  const [toDelete, setToDelete] = useState<ContactChannel | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: channels, isLoading } = useQuery({
    queryKey: ['contact-channels'],
    queryFn: async () => (await api.get<ContactChannel[]>('/contact-channels')).data,
  });

  const list = channels ?? [];
  const usedTypes = new Set(list.map((c) => c.type));

  const reorder = useMutation({
    mutationFn: async (ids: string[]) => api.put('/contact-channels/reorder', { ids }),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: ['contact-channels'] });
      const previous = queryClient.getQueryData<ContactChannel[]>(['contact-channels']);
      if (previous) {
        const byId = new Map(previous.map((c) => [c.id, c]));
        queryClient.setQueryData(
          ['contact-channels'],
          ids.map((id) => byId.get(id)).filter(Boolean),
        );
      }
      return { previous };
    },
    onError: (err, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(['contact-channels'], context.previous);
      setError(errorMessage(err, 'Không lưu được thứ tự.'));
    },
    // No refetch after: the order just written is the order the API was told
    // to store, so asking for it back redraws the same rows.
    onSuccess: () => notifyChange('Đã lưu thứ tự kênh liên hệ'),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/contact-channels/${id}`),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['contact-channels'] });
      setToDelete(null);
      return { previous: removeRow<ContactChannel>(queryClient, ['contact-channels'], id) };
    },
    onSuccess: () => notifyChange('Đã xoá kênh liên hệ'),
    onError: (err, _id, context) => {
      restoreList(queryClient, ['contact-channels'], context?.previous);
      setError(errorMessage(err));
    },
  });

  function onMove(from: number, to: number) {
    const next = moveItem(list, from, to);
    if (next !== list) reorder.mutate(next.map((c) => c.id));
  }

  // Nothing filters this list — at most eight channels, all on screen — so the
  // grip is live whenever a previous move is not still saving.
  const drag = useRowDrag(
    list,
    (c) => c.id,
    (ids) => reorder.mutate(ids),
    reorder.isPending,
  );

  return (
    <>
      <PageHead
        title="Kênh liên hệ"
        hint="Các cách khách liên lạc với bạn. Zalo là nút chính trên website. Kéo tay nắm đầu dòng, hoặc dùng mũi tên, để đổi thứ tự."
        actions={
          !adding && (
            <button type="button" className="btn btn--primary" onClick={() => setAdding(true)}>
              Thêm kênh liên hệ
            </button>
          )
        }
      />

      <ErrorAlert message={error} />

      {adding && <ChannelCreateCard usedTypes={usedTypes} onDone={() => setAdding(false)} />}

      <div className="card">
        {isLoading ? (
          <Loading />
        ) : list.length === 0 ? (
          <Empty title="Chưa có kênh liên hệ nào">
            <p>Thêm Zalo trước — website dùng kênh này cho nút đặt hàng.</p>
          </Empty>
        ) : (
          <div className="chanlist">
            <div className="chanrow chanrow--head" aria-hidden="true">
              <span />
              <span>Kênh</span>
              <span>Nội dung</span>
              <span>Nhãn hiển thị</span>
              <span>Hiện</span>
              <span />
            </div>
            {list.map((channel, index) => (
              <ChannelRow
                key={channel.id}
                channel={channel}
                index={index}
                total={list.length}
                reordering={reorder.isPending}
                onMove={onMove}
                onDelete={() => setToDelete(channel)}
                rowProps={drag.rowProps(channel)}
                grip={drag.gripProps(channel)}
              />
            ))}
          </div>
        )}
      </div>

      {toDelete && (
        <ConfirmDialog
          title={`Xoá kênh ${TYPE_LABEL.get(toDelete.type) ?? toDelete.type}?`}
          body="Kênh này sẽ không còn hiển thị trên website."
          pending={remove.isPending}
          onConfirm={() => remove.mutate(toDelete.id)}
          onCancel={() => setToDelete(null)}
        />
      )}
    </>
  );
}

function ChannelRow({
  channel,
  index,
  total,
  reordering,
  onMove,
  onDelete,
  rowProps,
  grip,
}: {
  channel: ContactChannel;
  index: number;
  total: number;
  reordering: boolean;
  onMove: (from: number, to: number) => void;
  onDelete: () => void;
  rowProps: { 'data-row-key': string; className: string };
  grip: GripProps;
}) {
  const queryClient = useQueryClient();
  const { notifyChange } = usePublish();
  const [value, setValue] = useState(channel.value);
  const [label, setLabel] = useState(channel.label ?? '');
  const [isActive, setIsActive] = useState(channel.isActive);
  const [saved, setSaved] = useState(false);

  // Reordering replaces the row objects, so local edits must re-sync or a
  // moved row would show the previous row's values.
  useEffect(() => {
    setValue(channel.value);
    setLabel(channel.label ?? '');
    setIsActive(channel.isActive);
  }, [channel.id, channel.value, channel.label, channel.isActive]);

  const dirty =
    value !== channel.value ||
    label !== (channel.label ?? '') ||
    isActive !== channel.isActive;

  const update = useMutation({
    mutationFn: async () =>
      (
        await api.patch<ContactChannel>(`/contact-channels/${channel.id}`, {
          value: value.trim(),
          label: label.trim() || undefined,
          isActive,
        })
      ).data,
    // Editing one channel used to refetch all of them, which also rebuilt the
    // other rows' inputs underneath whatever the owner was doing.
    onSuccess: (saved) => {
      upsertRow(queryClient, ['contact-channels'], saved, 'tail');
      notifyChange('Cập nhật kênh liên hệ thành công');
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    },
  });

  return (
    <div
      data-row-key={rowProps['data-row-key']}
      className={`chanrow ${rowProps.className}`.trim()}
    >
      <OrderButtons
        index={index}
        total={total}
        disabled={reordering}
        onMove={onMove}
        grip={grip}
      />

      <span className="chanrow__name">{TYPE_LABEL.get(channel.type) ?? channel.type}</span>

      <input
        className="input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={TYPE_HINT.get(channel.type)}
        aria-label={`Nội dung kênh ${TYPE_LABEL.get(channel.type) ?? channel.type}`}
      />

      <input
        className="input"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Mặc định theo tên kênh"
        aria-label="Nhãn hiển thị"
      />

      <label className="chanrow__toggle">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          aria-label="Hiện kênh này trên website"
        />
      </label>

      {/* Fixed-width slot so rows stay aligned whether or not a save button
          is showing. The button appears only when something changed, which
          doubles as the signal that the row has unsaved edits. */}
      <div className="chanrow__actions">
        {dirty ? (
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => update.mutate()}
            disabled={update.isPending}
          >
            {update.isPending ? '…' : 'Lưu'}
          </button>
        ) : (
          saved && <span className="chanrow__saved">Đã lưu</span>
        )}
        <button
          type="button"
          className="iconbtn iconbtn--danger"
          onClick={onDelete}
          aria-label="Xoá kênh"
          title="Xoá kênh"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function ChannelCreateCard({ usedTypes, onDone }: { usedTypes: Set<string>; onDone: () => void }) {
  const queryClient = useQueryClient();
  const { notifyChange } = usePublish();
  const available = CONTACT_CHANNEL_TYPES.filter((t) => !usedTypes.has(t.value));
  const [type, setType] = useState<string>(available[0]?.value ?? 'zalo');
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post<ContactChannel>('/contact-channels', {
          type,
          value: value.trim(),
          label: label.trim() || undefined,
        })
      ).data,
    // 'tail': the API gives a new channel max(sortOrder) + 1.
    onSuccess: (saved) => {
      upsertRow(queryClient, ['contact-channels'], saved, 'tail');
      notifyChange('Thêm kênh liên hệ thành công');
      onDone();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  if (available.length === 0) {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="fieldset">
          <p className="field__hint">Đã thêm tất cả các kênh liên hệ hỗ trợ.</p>
          <div className="formbar">
            <button type="button" className="btn btn--secondary" onClick={onDone}>
              Đóng
            </button>
          </div>
        </div>
      </div>
    );
  }

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
        <h2 className="fieldset__title">Kênh liên hệ mới</h2>
        <p className="fieldset__hint">Kênh mới sẽ nằm cuối danh sách.</p>

        {error && <div className="alert alert--bad">{error}</div>}

        <div className="grid2">
          <Field label="Loại kênh">
            <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
              {available.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Nội dung" hint={TYPE_HINT.get(type)}>
            <input className="input" value={value} onChange={(e) => setValue(e.target.value)} required />
          </Field>

          <Field label="Nhãn hiển thị" hint="Không bắt buộc.">
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
        </div>

        <div className="formbar">
          <button type="submit" className="btn btn--primary" disabled={create.isPending}>
            {create.isPending ? 'Đang lưu…' : 'Thêm kênh'}
          </button>
          <button type="button" className="btn btn--secondary" onClick={onDone}>
            Huỷ
          </button>
        </div>
      </div>
    </form>
  );
}
