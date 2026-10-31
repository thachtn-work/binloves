import { NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { SiteSettings } from '../lib/types';
import { useAuth } from '../auth/AuthProvider';

// Grouped by the job being done, not by database table: the catalogue the shop
// sells, the content around it, then the files. Each entity gets its own
// destination rather than sharing a generic CRUD screen.
const NAV = [
  {
    label: 'Cửa hàng',
    items: [{ to: '/', label: 'Tổng quan', end: true }],
  },
  {
    label: 'Danh mục sản phẩm',
    items: [
      { to: '/san-pham', label: 'Sản phẩm' },
      { to: '/danh-muc', label: 'Danh mục' },
      { to: '/bo-suu-tap', label: 'Bộ sưu tập' },
    ],
  },
  {
    label: 'Nội dung & liên hệ',
    items: [
      { to: '/banner', label: 'Banner trang chủ' },
      { to: '/lien-he', label: 'Kênh liên hệ' },
      { to: '/thong-tin-cua-hang', label: 'Thông tin cửa hàng' },
    ],
  },
  {
    label: 'Khác',
    items: [
      { to: '/thu-vien-anh', label: 'Thư viện ảnh & video' },
      { to: '/tai-khoan', label: 'Tài khoản' },
    ],
  },
];

export function Layout() {
  const { user, logout } = useAuth();
  const { data: settings } = useQuery({
    queryKey: ['site-settings'],
    queryFn: async () => (await api.get<SiteSettings>('/site-settings')).data,
  });

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <p className="sidebar__shop">{settings?.shopName ?? 'Cửa hàng'}</p>
          <p className="sidebar__role">Trang quản trị</p>
        </div>

        <nav>
          {NAV.map((group) => (
            <div className="navgroup" key={group.label}>
              <p className="navgroup__label">{group.label}</p>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={'end' in item ? item.end : false}
                  className={({ isActive }) => `navlink ${isActive ? 'is-active' : ''}`}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar__foot">
          <p className="sidebar__role" style={{ marginBottom: 6 }}>
            {user?.email}
          </p>
          <button type="button" className="btn btn--secondary btn--sm" onClick={logout}>
            Đăng xuất
          </button>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
