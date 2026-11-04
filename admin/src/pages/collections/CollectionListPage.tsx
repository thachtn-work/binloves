import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { removeRow, restoreList, upsertRow } from '../../lib/cache';
import type { Collection } from '../../lib/types';
import { ConfirmDialog, Empty, ErrorAlert, Loading, PageHead, StatusTag } from '../../components/ui';
import { MediaThumb } from '../../media/MediaThumb';
import { OrderButtons, moveItem } from '../../components/OrderButtons';
import { ListSearch } from '../../components/ListSearch';
import { matchesSearch } from '../../lib/search';
import { EditSurface } from '../../components/EditSurface';
import { usePublish } from '../../publish/PublishProvider';
import {
  CollectionForm,
  collectionPayload,
  collectionToValues,
  emptyCollection,
} from './CollectionForm';
import type { CollectionFormValues } from './CollectionForm';

type Editing = { mode: 'create' } | { mode: 'edit'; collection: Collection } | null;

export function CollectionListPage() {
  const queryClient = useQueryClient();
  const { notifyChange } = usePublish();
  const [editing, setEditing] = useState<Editing>(null);
  const [values, setValues] = useState<CollectionFormValues>(emptyCollection);
  const [toDelete, setToDelete] = useState<Collection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [newId, setNewId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const { data: collections, isLoading } = useQuery({
    queryKey: ['collections'],
    queryFn: async () => (await api.get<Collection[]>('/collections')).data,
  });

  function openCreate() {
    setPanelError(null);
    setValues(emptyCollection());
    setEditing({ mode: 'create' });
  }

  const openEdit = useCallback((collection: Collection) => {
    setPanelError(null);
    setValues(collectionToValues(collection));
    setEditing({ mode: 'edit', collection });
  }, []);

  const save = useMutation({
    mutationFn: async () => {
      const payload = collectionPayload(values);
      if (editing?.mode === 'edit') {
        return (await api.patch<Collection>(`/collections/${editing.collection.id}`, payload)).data;
      }
      return (await api.post<Collection>('/collections', payload)).data;
    },
    onSuccess: (saved) => {
      const wasCreate = editing?.mode === 'create';
      // The API answered with the saved row, so there is nothing left to go
      // and fetch. 'tail' is where a new one lands: the API gives it
      // max(sortOrder) + 1, which puts it last.
      upsertRow(queryClient, ['collections'], saved, 'tail');
      notifyChange();
      setEditing(null);
      if (wasCreate) {
        setNewId(saved.id);
        window.setTimeout(() => setNewId(null), 2600);
      }
    },
    onError: (err) => setPanelError(errorMessage(err)),
  });

  const reorder = useMutation({
    mutationFn: async (ids: string[]) => api.put('/collections/reorder', { ids }),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: ['collections'] });
      const previous = queryClient.getQueryData<Collection[]>(['collections']);
      if (previous) {
        const byId = new Map(previous.map((c) => [c.id, c]));
        queryClient.setQueryData(
          ['collections'],
          ids.map((id) => byId.get(id)).filter(Boolean),
        );
      }
      return { previous };
    },
    onError: (err, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(['collections'], context.previous);
      setError(errorMessage(err, 'Không lưu được thứ tự.'));
    },
    // No refetch once it lands: the order written above is the order the
    // API was just told to store, so asking for it back only redraws the
    // table with the rows it already has.
    onSuccess: () => notifyChange(),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/collections/${id}`),
    // Gone on confirm, back if the API refuses.
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['collections'] });
      setToDelete(null);
      return { previous: removeRow<Collection>(queryClient, ['collections'], id) };
    },
    onSuccess: () => notifyChange(),
    onError: (err, _id, context) => {
      restoreList(queryClient, ['collections'], context?.previous);
      setError(errorMessage(err));
    },
  });

  const list = useMemo(() => collections ?? [], [collections]);
  const searching = search.trim() !== '';
  const visible = useMemo(() => list.filter((c) => matchesSearch(search, c.name, c.slug, c.description)), [list, search]);

  function onMove(from: number, to: number) {
    const next = moveItem(list, from, to);
    if (next !== list) reorder.mutate(next.map((c) => c.id));
  }

  return (
    <>
      <PageHead
        title="Quản lý Sections"
        hint={
          searching
            ? `${visible.length} kết quả cho “${search.trim()}”`
            : 'Các khu vực sản phẩm trên trang chủ. Dùng mũi tên để đổi thứ tự khu vực.'
        }
        actions={
          <>
            {list.length > 0 && (
              <ListSearch
                value={search}
                onChange={setSearch}
                placeholder="Tìm bộ sưu tập…"
              />
            )}
            <button type="button" className="btn btn--primary" onClick={openCreate}>
              + Thêm Section Mới
            </button>
          </>
        }
      />

      <ErrorAlert message={error} />

      <div className="card">
        {isLoading ? (
          <Loading />
        ) : list.length === 0 ? (
          <Empty title="Chưa có bộ sưu tập nào">
            <p>Tạo bộ sưu tập để sắp xếp sản phẩm nổi bật trên trang chủ.</p>
          </Empty>
        ) : visible.length === 0 ? (
          <Empty title="Không tìm thấy bộ sưu tập nào">
            <p>Thử từ khoá ngắn hơn.</p>
          </Empty>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 78 }}>Thứ tự</th>
                  <th style={{ width: 72 }}>Ảnh</th>
                  <th>Tên</th>
                  <th>Slug</th>
                  <th style={{ width: 130 }}>Số sản phẩm</th>
                  <th style={{ width: 110 }}>Kích hoạt</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((collection) => (
                  <tr key={collection.id} className={collection.id === newId ? 'row-new' : undefined}>
                    <td>
                      {/* Index comes from the full list, and the arrows are
                          disabled while filtering — a move inside a filtered
                          view would not mean what it looks like. */}
                      <OrderButtons
                        index={list.indexOf(collection)}
                        total={list.length}
                        disabled={reorder.isPending || searching}
                        onMove={onMove}
                      />
                    </td>
                    {/* Square rather than round: nothing on the website draws
                        a collection as a circle, so a round preview here would
                        promise a shape the shopper never sees. Empty when the
                        owner has chosen nothing. */}
                    <td>
                      {collection.cover ? (
                        <MediaThumb className="thumb" media={collection.cover} />
                      ) : (
                        <span className="thumb" />
                      )}
                    </td>
                    <td>
                      <div className="cellmain">
                        <button type="button" className="linklike" onClick={() => openEdit(collection)}>
                          {collection.name}
                        </button>
                      </div>
                    </td>
                    <td className="cellslug">{collection.slug}</td>
                    <td>{collection._count?.products ?? 0}</td>
                    <td>
                      <StatusTag active={collection.isActive} />
                    </td>
                    <td>
                      <div className="table__actions">
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          onClick={() => openEdit(collection)}
                        >
                          Sửa
                        </button>
                        {/* Choosing which products belong here is a bigger job
                            than editing a name, so it keeps its own screen. */}
                        <Link className="btn btn--secondary btn--sm" to={`/bo-suu-tap/${collection.id}`}>
                          Chọn sản phẩm
                        </Link>
                        <button
                          type="button"
                          className="btn btn--danger btn--sm"
                          onClick={() => setToDelete(collection)}
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

      <EditSurface
        variant="modal"
        open={editing !== null}
        title={editing?.mode === 'edit' ? 'Chỉnh sửa Section' : 'Thêm Section Mới'}
        subtitle={
          editing?.mode === 'edit'
            ? editing.collection.name
            : 'Tạo xong, chọn sản phẩm cho bộ sưu tập ở bước sau.'
        }
        width={500}
        onClose={() => setEditing(null)}
        footer={
          <>
            <button
              type="submit"
              form="collection-form"
              className="btn btn--primary"
              disabled={save.isPending}
            >
              {save.isPending
                ? 'Đang lưu…'
                : editing?.mode === 'edit'
                  ? 'Lưu thay đổi'
                  : 'Thêm bộ sưu tập'}
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => setEditing(null)}>
              Huỷ
            </button>
          </>
        }
      >
        <form
          id="collection-form"
          onSubmit={(e) => {
            e.preventDefault();
            setPanelError(null);
            save.mutate();
          }}
        >
          <ErrorAlert message={panelError} />
          <CollectionForm
            values={values}
            onChange={setValues}
            lockSlug={editing?.mode === 'edit'}
          />
        </form>
      </EditSurface>

      {toDelete && (
        <ConfirmDialog
          title={`Xoá bộ sưu tập "${toDelete.name}"?`}
          body="Khu vực này sẽ biến mất khỏi trang chủ. Các sản phẩm bên trong không bị xoá."
          pending={remove.isPending}
          onConfirm={() => remove.mutate(toDelete.id)}
          onCancel={() => setToDelete(null)}
        />
      )}
    </>
  );
}
