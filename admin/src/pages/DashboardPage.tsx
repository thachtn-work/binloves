import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Banner, Category, Collection, ContactChannel, Product, PublishStatus } from '../lib/types';
import { Loading, PageHead } from '../components/ui';

export function DashboardPage() {
  const products = useQuery({
    queryKey: ['products'],
    queryFn: async () => (await api.get<Product[]>('/products')).data,
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<Category[]>('/categories')).data,
  });
  const collections = useQuery({
    queryKey: ['collections'],
    queryFn: async () => (await api.get<Collection[]>('/collections')).data,
  });
  const banners = useQuery({
    queryKey: ['banners'],
    queryFn: async () => (await api.get<Banner[]>('/banners')).data,
  });
  const channels = useQuery({
    queryKey: ['contact-channels'],
    queryFn: async () => (await api.get<ContactChannel[]>('/contact-channels')).data,
  });
  const publish = useQuery({
    queryKey: ['publish-status'],
    queryFn: async () => (await api.get<PublishStatus>('/publish/status')).data,
    refetchInterval: 30_000,
  });

  const loading = products.isLoading || categories.isLoading || collections.isLoading;
  const visible = (products.data ?? []).filter((p) => p.isActive).length;
  const hidden = (products.data ?? []).length - visible;

  // Things that would make the website look broken or unusable to a customer,
  // surfaced here instead of waiting for the owner to notice.
  const warnings: { text: string; to: string; action: string }[] = [];
  if (!channels.isLoading && !(channels.data ?? []).some((c) => c.type === 'zalo' && c.isActive)) {
    warnings.push({
      text: 'Chưa có kênh Zalo đang bật — khách không có nút đặt hàng trên website.',
      to: '/lien-he',
      action: 'Thêm Zalo',
    });
  }
  if (!products.isLoading && visible === 0) {
    warnings.push({
      text: 'Chưa có sản phẩm nào đang hiển thị trên website.',
      to: '/san-pham',
      action: 'Thêm sản phẩm',
    });
  }
  if (!banners.isLoading && (banners.data ?? []).filter((b) => b.isActive).length === 0) {
    warnings.push({
      text: 'Trang chủ chưa có banner nào đang bật.',
      to: '/banner',
      action: 'Thêm banner',
    });
  }

  if (loading) return <Loading />;

  return (
    <>
      <PageHead title="Tổng quan" hint="Tình trạng nội dung đang hiển thị trên website." />

      {warnings.map((w) => (
        <div className="alert alert--warn" key={w.to}>
          {w.text}{' '}
          <Link to={w.to} style={{ textDecoration: 'underline' }}>
            {w.action}
          </Link>
        </div>
      ))}

      <div className="stats">
        <div className="stat">
          <p className="stat__label">Sản phẩm đang hiện</p>
          <p className="stat__value">{visible}</p>
          {hidden > 0 && <p className="cellsub">{hidden} sản phẩm đang ẩn</p>}
        </div>
        <div className="stat">
          <p className="stat__label">Danh mục</p>
          <p className="stat__value">{(categories.data ?? []).length}</p>
        </div>
        <div className="stat">
          <p className="stat__label">Bộ sưu tập</p>
          <p className="stat__value">{(collections.data ?? []).length}</p>
        </div>
        <div className="stat">
          <p className="stat__label">Banner đang hiện</p>
          <p className="stat__value">{(banners.data ?? []).filter((b) => b.isActive).length}</p>
        </div>
      </div>

      <div className="card">
        <div className="fieldset">
          <h2 className="fieldset__title">Trạng thái website</h2>
          <p className="fieldset__hint">
            Mỗi khi bạn lưu thay đổi, website được dựng lại sau khoảng 10-30 giây.
          </p>
          <PublishSummary status={publish.data} loading={publish.isLoading} />
        </div>
      </div>
    </>
  );
}

function PublishSummary({ status, loading }: { status?: PublishStatus; loading: boolean }) {
  if (loading) return <p className="field__hint">Đang kiểm tra…</p>;

  if (!status?.reachable) {
    return (
      <div className="alert alert--warn" style={{ marginBottom: 0 }}>
        Không kết nối được tới dịch vụ cập nhật website. Thay đổi vẫn được lưu, nhưng website
        chưa được dựng lại. Vui lòng báo kỹ thuật.
      </div>
    );
  }

  if (status.isBuilding) {
    return <p className="field__hint">Đang dựng lại website…</p>;
  }

  if (!status.lastBuild) {
    return <p className="field__hint">Website chưa được dựng lần nào.</p>;
  }

  const when = new Date(status.lastBuild.finishedAt ?? status.lastBuild.at).toLocaleString('vi-VN');

  if (status.lastBuild.status === 'failed') {
    return (
      <div className="alert alert--bad" style={{ marginBottom: 0 }}>
        Lần cập nhật gần nhất ({when}) không thành công. Website vẫn đang hiển thị bản trước đó.
      </div>
    );
  }

  return <p className="field__hint">Cập nhật gần nhất: {when} — thành công.</p>;
}
