import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import type { Product } from '../../lib/types';
import {
  ConfirmDialog,
  Empty,
  ErrorAlert,
  Loading,
  PageHead,
  StatusTag,
  formatPrice,
} from '../../components/ui';
import { EditSurface } from '../../components/EditSurface';
import { ListSearch } from '../../components/ListSearch';
import { matchesSearch } from '../../lib/search';
import { usePublish } from '../../publish/PublishProvider';
import { ProductForm, emptyProduct, productToValues, valuesToPayload } from './ProductForm';
import type { ProductFormValues } from './ProductForm';
import { MediaThumb } from '../../media/MediaThumb';
import { countdown, formatVn, saleState } from '../../lib/vn-time';

type Editing = { mode: 'create' } | { mode: 'edit'; product: Product } | null;

function renderPrice(product: Product) {
  const state = saleState(product);

  if (state === 'live') {
    const left = countdown(product.saleEndsAt);
    return (
      <>
        <div className="cellmain">{formatPrice(product.salePrice)}</div>
        <div className="cellsub">
          <s>{formatPrice(product.price)}</s>
          {left && (
            <>
              {' '}
              <span className="tag tag--on tag--sm">còn {left}</span>
            </>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="cellmain">{formatPrice(product.price)}</div>
      {state === 'scheduled' && (
        <div className="cellsub">
          <span className="tag tag--soon tag--sm">chờ KM</span> {formatPrice(product.salePrice)} từ{' '}
          {formatVn(product.saleStartsAt)}
        </div>
      )}
      {state === 'expired' && (
        <div className="cellsub">
          <span className="tag tag--over tag--sm">hết KM</span> từ {formatVn(product.saleEndsAt)}
        </div>
      )}
    </>
  );
}

export function ProductListPage() {
  const queryClient = useQueryClient();
  const { notifyChange } = usePublish();
  const [editing, setEditing] = useState<Editing>(null);
  const [values, setValues] = useState<ProductFormValues>(emptyProduct);
  const [toDelete, setToDelete] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [newId, setNewId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const { data: products, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => (await api.get<Product[]>('/products')).data,
  });

  function openCreate() {
    setPanelError(null);
    setValues(emptyProduct());
    setEditing({ mode: 'create' });
  }

  function openEdit(product: Product) {
    setPanelError(null);
    setValues(productToValues(product));
    setEditing({ mode: 'edit', product });
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = valuesToPayload(values);
      if (editing?.mode === 'edit') {
        return (await api.patch<Product>(`/products/${editing.product.id}`, payload)).data;
      }
      return (await api.post<Product>('/products', payload)).data;
    },
    onSuccess: async (saved) => {
      const wasCreate = editing?.mode === 'create';
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      notifyChange();
      setEditing(null);
      if (wasCreate) {
        // Closing onto the list with the new row highlighted is the point of
        // editing in a panel: the owner sees what they just added and what is
        // still missing.
        setNewId(saved.id);
        window.setTimeout(() => setNewId(null), 2600);
      }
    },
    onError: (err) => setPanelError(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/products/${id}`),
    onSuccess: async () => {
      setToDelete(null);
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      notifyChange();
    },
    onError: (err) => {
      setToDelete(null);
      setError(errorMessage(err));
    },
  });

  const list = products ?? [];
  const searching = search.trim() !== '';
  // Category name is searchable too: "tìm hết hàng thuộc Danh mục 2" is a
  // common way to narrow a long product list.
  const visible = list.filter((p) =>
    matchesSearch(search, p.name, p.slug, p.category?.name, p.stockLabel),
  );

  return (
    <>
      <PageHead
        title="Sản phẩm"
        hint={
          searching
            ? `${visible.length} kết quả cho “${search.trim()}”`
            : `${list.length} sản phẩm đang có trên website.`
        }
        actions={
          <>
            {list.length > 0 && (
              <ListSearch
                value={search}
                onChange={setSearch}
                placeholder="Tìm sản phẩm, danh mục…"
              />
            )}
            <button type="button" className="btn btn--primary" onClick={openCreate}>
              Thêm sản phẩm
            </button>
          </>
        }
      />

      <ErrorAlert message={error} />

      <div className="card">
        {isLoading ? (
          <Loading />
        ) : list.length === 0 ? (
          <Empty title="Chưa có sản phẩm nào">
            <p>Thêm sản phẩm đầu tiên để website có nội dung hiển thị.</p>
          </Empty>
        ) : visible.length === 0 ? (
          <Empty title="Không tìm thấy sản phẩm nào">
            <p>Thử từ khoá ngắn hơn, hoặc tìm theo tên danh mục.</p>
          </Empty>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 62 }}>Xem trước</th>
                  <th>Sản phẩm</th>
                  <th>Danh mục</th>
                  <th>Giá</th>
                  <th style={{ width: 120 }}>Hiển thị</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((product) => {
                  const cover = [...product.media].sort((a, b) => a.sortOrder - b.sortOrder)[0];
                  return (
                    <tr key={product.id} className={product.id === newId ? 'row-new' : undefined}>
                      <td>
                        {cover ? (
                          <MediaThumb className="thumb" media={cover.media} />
                        ) : (
                          <div className="thumb" />
                        )}
                      </td>
                      <td>
                        <div className="cellmain">
                          <button type="button" className="linklike" onClick={() => openEdit(product)}>
                            {product.name}
                          </button>
                        </div>
                        <div className="cellsub">/{product.slug}</div>
                      </td>
                      <td className="cellsub">{product.category?.name ?? '—'}</td>
                      {/*
                        Shows what the website is showing, not what is stored.
                        A sale that has not started yet — or has already run
                        out — is not the price a customer sees, and listing it
                        as the price was the quiet way to believe a discount is
                        live when it is not.
                      */}
                      <td>{renderPrice(product)}</td>
                      <td>
                        <StatusTag active={product.isActive} />
                      </td>
                      <td>
                        <div className="table__actions">
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            onClick={() => openEdit(product)}
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            className="btn btn--danger btn--sm"
                            onClick={() => setToDelete(product)}
                          >
                            Xoá
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <EditSurface
        open={editing !== null}
        title={editing?.mode === 'edit' ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}
        subtitle={
          editing?.mode === 'edit'
            ? editing.product.name
            : 'Điền thông tin rồi lưu để đăng lên website.'
        }
        // Wider than the other panels: the product form carries four sections
        // including the image picker.
        width={760}
        onClose={() => setEditing(null)}
        footer={
          <>
            <button
              type="submit"
              form="product-form"
              className="btn btn--primary"
              disabled={save.isPending}
            >
              {save.isPending
                ? 'Đang lưu…'
                : editing?.mode === 'edit'
                  ? 'Lưu thay đổi'
                  : 'Thêm sản phẩm'}
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => setEditing(null)}>
              Huỷ
            </button>
          </>
        }
      >
        <form
          id="product-form"
          onSubmit={(e) => {
            e.preventDefault();
            setPanelError(null);
            save.mutate();
          }}
        >
          <ErrorAlert message={panelError} />
          <ProductForm values={values} onChange={setValues} lockSlug={editing?.mode === 'edit'} />
        </form>
      </EditSurface>

      {toDelete && (
        <ConfirmDialog
          title={`Xoá "${toDelete.name}"?`}
          body="Sản phẩm sẽ bị gỡ khỏi website và không khôi phục được. Ảnh và video trong thư viện vẫn được giữ lại."
          pending={remove.isPending}
          onConfirm={() => remove.mutate(toDelete.id)}
          onCancel={() => setToDelete(null)}
        />
      )}
    </>
  );
}
