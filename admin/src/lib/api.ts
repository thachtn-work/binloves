import axios from 'axios';
import { IS_DEMO, mockAdapter } from '../demo/mockApi';

const TOKEN_KEY = 'admin-token';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
});

// UI-only build: every request is answered from memory, so the admin can be
// reviewed with no backend deployed and nothing exposed. Stripped from normal
// builds, where VITE_DEMO_MODE is unset.
if (IS_DEMO) {
  api.defaults.adapter = mockAdapter;
}

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // An expired token should drop the shop owner back to the login screen
    // rather than leaving every page stuck on a silent error.
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
      tokenStore.clear();
      if (!window.location.pathname.endsWith('/dang-nhap')) {
        window.location.assign('/admin/dang-nhap');
      }
    }
    return Promise.reject(error);
  },
);

// The API returns validation problems as an array of messages; surface the
// actual reason instead of a generic "có lỗi xảy ra".
export function errorMessage(error: unknown, fallback = 'Không thực hiện được, vui lòng thử lại.') {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join('. ');
    if (typeof message === 'string') return message;
  }
  return fallback;
}
