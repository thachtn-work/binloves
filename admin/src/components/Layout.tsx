import { NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Contact,
  Folder,
  GalleryHorizontalEnd,
  Images,
  LayoutDashboard,
  ShoppingBag,
  Store,
  Tag,
  UserCog,
} from 'lucide-react';
import { api } from '../lib/api';
import type { SiteSettings } from '../lib/types';
import { useAuth } from '../auth/AuthProvider';

/*
  The order and the wording this shop ran on before the rebuild.

  The first five are its old menu, unchanged and in its old sequence, down to
  calling collections "Quản lý sections" — a half-English label nobody would
  choose today, and the one the owner has been clicking for a year. A better
  word they have to hunt for is worse than an awkward word they can find.
  (Capitalisation is the exception: the original had "sản phẩm" and "danh mục"
  in lower case while its neighbours were capitalised, which was an oversight
  rather than a decision, and reads as a typo.)

  The four after them did not exist in that version, and cannot simply be left
  out: this shop is running three banners and six shop-info fields through
  them right now. They sit below the familiar five rather than being mixed in,
  so the old path stays exactly where the hand remembers it.
*/
const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/san-pham', label: 'Sản phẩm', icon: ShoppingBag },
  { to: '/danh-muc', label: 'Danh mục', icon: Tag },
  { to: '/bo-suu-tap', label: 'Quản lý sections', icon: Folder },
  { to: '/lien-he', label: 'Thông tin liên hệ', icon: Contact },
  { to: '/banner', label: 'Banner trang chủ', icon: GalleryHorizontalEnd },
  { to: '/thong-tin-cua-hang', label: 'Thông tin cửa hàng', icon: Store },
  { to: '/thu-vien-anh', label: 'Thư viện ảnh', icon: Images },
  { to: '/tai-khoan', label: 'Tài khoản', icon: UserCog },
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
          <p className="sidebar__shop">{settings?.shopName ?? 'Cửa hàng'} Admin</p>
        </div>

        <nav className="sidebar__nav">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end ?? false}
                className={({ isActive }) => `navlink ${isActive ? 'is-active' : ''}`}
              >
                {/* currentColor, so the glyph turns blue with its label rather
                    than staying grey beside it. */}
                <Icon className="navlink__icon" size={18} strokeWidth={1.75} aria-hidden="true" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <div className="contentcol">
        {/* Signed-in identity and the way out, across the top where this admin
            has always kept them — not at the bottom of the menu. */}
        <header className="topbar">
          <span className="topbar__who">{user?.email}</span>
          <button type="button" className="btn btn--primary btn--sm" onClick={logout}>
            Đăng xuất
          </button>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
