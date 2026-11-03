import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { removeRow, restoreList, upsertRow } from '../../lib/cache';
import type { Category } from '../../lib/types';
import { ConfirmDialog, Empty, ErrorAlert, Loading, PageHead, StatusTag } from '../../components/ui';
import { MediaThumb } from '../../media/MediaThumb';
import { OrderButtons, moveItem } from '../../components/OrderButtons';
import { ListSearch } from '../../components/ListSearch';
import { matchesSearch } from '../../lib/search';
import { EditSurface } from '../../components/EditSurface';
import { usePublish } from '../../publish/PublishProvider';
import { CategoryForm, categoryPayload, categoryToValues, emptyCategory } from './CategoryForm';
import type { CategoryFormValues } from './CategoryForm';
import { Link } from 'react-router-dom';

type Editing = { mode: 'create' } | { mode: 'edit'; category: Category } | null;

export function CategoryListPage() {
  const queryClient = useQueryClient();
  const { notifyChange } = usePublish();
  const [editing, setEditing] = useState<Editing>(null);
  const [values, setValues] = useState<CategoryFormValues>(emptyCategory);
  const [toDelete, setToDelete] = useState<Category | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [newId, setNewId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const { data: categories, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<Category[]>('/categories')).data,
  });

  function openCreate() {
    setPanelError(null);
    setValues(emptyCategory());
    setEditing({ mode: 'create' });
  }

  const openEdit = useCallback((category: Category) => {
    setPanelError(null);
    setValues(categoryToValues(category));
    setEditing({ mode: 'edit', category });
  }, []);

  const save = useMutation({
    mutationFn: async () => {
      const payload = categoryPayload(values);
      if (editing?.mode === 'edit') {
        return (await api.patch<Category>(`/categories/${editing.category.id}`, payload)).data;
      }
      return (await api.post<Category>('/categories', payload)).data;
    },
    onSuccess: (saved) => {
      const wasCreate = editing?.mode === 'create';
      // The API answered with the saved row, so there is nothing left to go
      // and fetch. 'tail' is where a new one lands: the API gives it
      // max(sortOrder) + 1, which puts it last.
      upsertRow(queryClient, ['categories'], saved, 'tail');
      notifyChange();
      setEditing(null);
      if (wasCreate) {
        // The panel closes onto the list with the new row briefly highlighted,
        // which is the whole point of editing beside the list.
        setNewId(saved.id);
        window.setTimeout(() => setNewId(null), 2600);
      }
    },
    onError: (err) => setPanelError(errorMessage(err)),
  });

  const reorder = useMutation({
    mutationFn: async (ids: string[]) => api.put('/categories/reorder', { ids }),
    onMutate: async (ids) => {
      // Reorder optimistically: waiting for a round trip to see a row move
      // makes the arrows feel broken.
      await queryClient.cancelQueries({ queryKey: ['categories'] });
      const previous = queryClient.getQueryData<Category[]>(['categories']);
      if (previous) {
        const byId = new Map(previous.map((c) => [c.id, c]));
        queryClient.setQueryData(
          ['categories'],
          ids.map((id) => byId.get(id)).filter(Boolean),
        );
      }
      return { previous };
    },
    onError: (err, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(['categories'], context.previous);
      setError(errorMessage(err, 'Không lưu được thứ tự.'));
    },
    // No refetch once it lands: the order written above is the order the
    // API was just told to store, so asking for it back only redraws the
    // table with the rows it already has.
    onSuccess: () => notifyChange(),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/categories/${id}`),
    // Gone on confirm, back if the API refuses.
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['categories'] });
      setToDelete(null);
      return { previous: removeRow<Category>(queryClient, ['categories'], id) };
    },
    onSuccess: () => notifyChange(),
    onError: (err, _id, context) => {
      restoreList(queryClient, ['categories'], context?.previous);
      setError(errorMessage(err));
    },
  });

  const list = useMemo(() => categories ?? [], [categories]);
  const searching = search.trim() !== '';
  const visible = useMemo(() => list.filter((c) => matchesSearch(search, c.name, c.slug)), [list, search]);

  function onMove(from: number, to: number) {
    const next = moveItem(list, from, to);
    if (next !== list) reorder.mutate(next.map((c) => c.id));
  }

  return (
    <>
      <PageHead
        title="Danh mục"
        // While searching the count replaces the instruction, so the header
        // keeps its height instead of growing a line.
        hint={
          searching
            ? `${visible.length} kết quả cho “${search.trim()}”`
            : 'Nhóm sản phẩm theo danh mục. Dùng mũi tên để đổi thứ tự hiển thị trên website.'
        }
        actions={
          <>
            {list.length > 0 && (
              <ListSearch
                value={search}
                onChange={setSearch}
                placeholder="Tìm danh mục…"
              />
            )}
            <button type="button" className="btn btn--primary" onClick={openCreate}>
              Thêm danh mục
            </button>
          </>
        }
      />

      <ErrorAlert message={error} />

      <div className="card">
        {isLoading ? (
          <Loading />
        ) : list.length === 0 ? (
          <Empty title="Chưa có danh mục nào">
            <p>Tạo danh mục để khách dễ tìm sản phẩm hơn.</p>
          </Empty>
        ) : visible.length === 0 ? (
          <Empty title="Không tìm thấy danh mục nào">
            <p>Thử từ khoá ngắn hơn.</p>
          </Empty>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 78 }}>Thứ tự</th>
                  <th style={{ width: 72 }}>Ảnh</th>
                  <th>Danh mục</th>
                  <th style={{ width: 120 }}>Hiển thị</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((category) => (
                  <tr key={category.id} className={category.id === newId ? 'row-new' : undefined}>
                    <td>
                      {/* Position is relative to the whole list, so the arrows
                          are driven by the row's real index. While filtering
                          they are disabled: moving a row inside a filtered
                          view would not mean what it appears to mean. */}
                      <OrderButtons
                        index={list.indexOf(category)}
                        total={list.length}
                        disabled={reorder.isPending || searching}
                        onMove={onMove}
                      />
                    </td>
                    {/* Round, because round is how this photo is drawn on the
                        website: the circles the homepage opens with. The crop
                        a square preview would flatter is not the crop the
                        shopper sees. Empty when the owner has chosen nothing
                        — the site then borrows a photo from the first product
                        inside, which is not this category's own picture and
                        would read as one here. */}
                    <td>
                      {category.cover ? (
                        <MediaThumb className="thumb thumb--round" media={category.cover} />
                      ) : (
                        <span className="thumb thumb--round" />
                      )}
                    </td>
                    <td>
                      <div className="cellmain">
                        <button
                          type="button"
                          className="linklike"
                          onClick={() => openEdit(category)}
                        >
                          {category.name}
                        </button>
                      </div>
                      <div className="cellsub">/{category.slug}</div>
                    </td>
                    <td>
                      <StatusTag active={category.isActive} />
                    </td>
                    <td>
                      <div className="table__actions">
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          onClick={() => openEdit(category)}
                        >
                          Sửa
                        </button>
                        {/* Ordering the products inside a category is a
                            different job from renaming it and needs the whole
                            list on screen, so it gets its own page — the same
                            way collections do. */}
                        <Link className="btn btn--secondary btn--sm" to={`/danh-muc/${category.id}`}>
                          Thứ tự sản phẩm
                        </Link>
                        <button
                          type="button"
                          className="btn btn--danger btn--sm"
                          onClick={() => setToDelete(category)}
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
        open={editing !== null}
        width={760}
        title={editing?.mode === 'edit' ? 'Sửa danh mục' : 'Thêm danh mục'}
        subtitle={editing?.mode === 'edit' ? editing.category.name : 'Danh mục mới sẽ nằm cuối danh sách.'}
        onClose={() => setEditing(null)}
        footer={
          <>
            <button
              type="submit"
              form="category-form"
              className="btn btn--primary"
              disabled={save.isPending}
            >
              {save.isPending ? 'Đang lưu…' : editing?.mode === 'edit' ? 'Lưu thay đổi' : 'Thêm danh mục'}
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => setEditing(null)}>
              Huỷ
            </button>
          </>
        }
      >
        <form
          id="category-form"
          onSubmit={(e) => {
            e.preventDefault();
            setPanelError(null);
            save.mutate();
          }}
        >
          <ErrorAlert message={panelError} />
          <CategoryForm
            values={values}
            onChange={setValues}
            lockSlug={editing?.mode === 'edit'}
          />
        </form>
      </EditSurface>

      {toDelete && (
        <ConfirmDialog
          title={`Xoá danh mục "${toDelete.name}"?`}
          body="Sản phẩm thuộc danh mục này sẽ chuyển về trạng thái chưa phân loại, không bị xoá."
          pending={remove.isPending}
          onConfirm={() => remove.mutate(toDelete.id)}
          onCancel={() => setToDelete(null)}
        />
      )}
    </>
  );
}
