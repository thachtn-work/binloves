import { memo, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { removeRow, restoreList } from '../../lib/cache';
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
import { ListSearch } from '../../components/ListSearch';
import { matchesSearch } from '../../lib/search';
import { usePublish } from '../../publish/PublishProvider';
import { MediaThumb } from '../../media/MediaThumb';
import { countdown, formatVn, saleState } from '../../lib/vn-time';


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

/*
  One row, and it only redraws when its own product changes.

  The table sits behind the edit panel, so before this every keystroke in the
  product form redrew all of it: at two hundred products that was two hundred
  rows rebuilt per character typed, each one re-sorting its own media array to
  find a cover it had already found. Nothing the owner could see changed.
*/
const ProductRow = memo(function ProductRow({
  product,
  isNew,
  onDelete,
}: {
  product: Product;
  isNew: boolean;
  onDelete: (product: Product) => void;
}) {
  const cover = [...product.media].sort((a, b) => a.sortOrder - b.sortOrder)[0];
  return (
    <tr className={isNew ? 'row-new' : undefined}>
      <td>{cover ? <MediaThumb className="thumb" media={cover.media} /> : <div className="thumb" />}</td>
      <td>
        <div className="cellmain">
          {/* A link, not a button: it goes somewhere, so it should behave like
              every other link — middle-click, open in a new tab, copy address. */}
          <Link className="linklike" to={`/san-pham/${product.id}`}>
            {product.name}
          </Link>
        </div>
        <div className="cellsub">/{product.slug}</div>
      </td>
      <td className="cellsub">{product.category?.name ?? '—'}</td>
      {/*
        Shows what the website is showing, not what is stored. A sale that has
        not started yet — or has already run out — is not the price a customer
        sees, and listing it as the price was the quiet way to believe a
        discount is live when it is not.
      */}
      <td className="num">{renderPrice(product)}</td>
      <td>
        <StatusTag active={product.isActive} />
      </td>
      <td>
        <div className="table__actions">
          <Link className="btn btn--secondary btn--sm" to={`/san-pham/${product.id}`}>
            Sửa
          </Link>
          <button type="button" className="btn btn--danger btn--sm" onClick={() => onDelete(product)}>
            Xoá
          </button>
        </div>
      </td>
    </tr>
  );
});

/*
  The table as a whole, memoised.

  Memoising the rows alone was not enough. The rows live inside the same
  component as the edit form, so every keystroke still ran the parent's render
  and built four hundred row elements for React to compare and throw away —
  the cost stayed proportional to the catalogue even though not one row
  changed. Held behind its own boundary, the table is skipped entirely unless
  the list, the search or the highlighted row actually moved.
*/
const ProductTable = memo(function ProductTable({
  items,
  newId,
  onDelete,
}: {
  items: Product[];
  newId: string | null;
  onDelete: (product: Product) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 72 }}>Ảnh</th>
            <th>Sản phẩm</th>
            <th>Danh mục</th>
            <th className="num">Giá</th>
            <th style={{ width: 110 }}>Kích hoạt</th>
            <th>Hành động</th>
          </tr>
        </thead>
        <tbody>
          {items.map((product) => (
            <ProductRow
              key={product.id}
              product={product}
              isNew={product.id === newId}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
});

export function ProductListPage() {
  const queryClient = useQueryClient();
  const { notifyChange } = usePublish();
  const location = useLocation();
  const [toDelete, setToDelete] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newId, setNewId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  /*
    The editor page hands back the id of what it just created, and the row
    lights up for a moment. That answer used to be free — the panel closed onto
    the list and the id was still in hand — and it is worth carrying across the
    navigation, because "which one did I just add?" is the first thing the
    owner asks of a list two hundred rows long.
  */
  useEffect(() => {
    const id = (location.state as { newId?: string } | null)?.newId;
    if (!id) return;
    setNewId(id);
    const t = window.setTimeout(() => setNewId(null), 2600);
    // Clears the marker from history, so going back to this list later does
    // not flash a row that was added an hour ago.
    window.history.replaceState({}, '');
    return () => window.clearTimeout(t);
  }, [location.state]);

  const { data: products, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => (await api.get<Product[]>('/products')).data,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/products/${id}`),
    // The row goes the moment the owner confirms, and comes back if the API
    // refuses. Waiting for the round trip to redraw a list the browser can
    // already work out is how a delete comes to feel broken.
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['products'] });
      setToDelete(null);
      return { previous: removeRow<Product>(queryClient, ['products'], id) };
    },
    onSuccess: () => notifyChange(),
    onError: (err, _id, context) => {
      restoreList(queryClient, ['products'], context?.previous);
      setError(errorMessage(err));
    },
  });

  const list = useMemo(() => products ?? [], [products]);
  const searching = search.trim() !== '';
  // Category name is searchable too: "tìm hết hàng thuộc Danh mục 2" is a
  // common way to narrow a long product list.
  //
  // Memoised because the rows below are: a filter run fresh on every render
  // hands them a brand new array each time and defeats the whole point.
  const visible = useMemo(
    () => list.filter((p) => matchesSearch(search, p.name, p.slug, p.category?.name, p.stockLabel)),
    [list, search],
  );

  return (
    <>
      <PageHead
        title="Quản lý Sản phẩm"
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
            <Link className="btn btn--primary" to="/san-pham/them">
              + Thêm Sản phẩm Mới
            </Link>
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
          <ProductTable
            items={visible}
            newId={newId}
            onDelete={setToDelete}
          />
        )}
      </div>

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
