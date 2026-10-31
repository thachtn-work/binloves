import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
import type { PublishStatus } from '../lib/types';

type Phase = 'idle' | 'pending' | 'building' | 'done' | 'failed' | 'unknown';

interface PublishContextValue {
  phase: Phase;
  /** Call after any successful save so the owner sees the site catching up. */
  notifyChange: () => void;
  dismiss: () => void;
}

const PublishContext = createContext<PublishContextValue | null>(null);

const POLL_MS = 2000;
// Debounce on the API is ~8s, plus build time. Give up well after that rather
// than polling forever if the builder is wedged.
const GIVE_UP_MS = 3 * 60 * 1000;

export function PublishProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const savedAtRef = useRef<number>(0);
  const timerRef = useRef<number | undefined>(undefined);

  const stop = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = undefined;
  }, []);

  const notifyChange = useCallback(() => {
    savedAtRef.current = Date.now();
    setPhase('pending');
  }, []);

  const dismiss = useCallback(() => {
    stop();
    setPhase('idle');
  }, [stop]);

  useEffect(() => {
    if (phase !== 'pending' && phase !== 'building') return;

    async function poll() {
      try {
        const { data } = await api.get<PublishStatus>('/publish/status');

        if (!data.reachable) {
          setPhase('unknown');
          stop();
          return;
        }

        if (data.isBuilding) {
          setPhase('building');
          return;
        }

        const finished = data.lastBuild?.finishedAt ?? data.lastBuild?.at;
        // Only trust a build that finished *after* this save; an older
        // successful build says nothing about the change just made.
        if (finished && new Date(finished).getTime() > savedAtRef.current) {
          setPhase(data.lastBuild?.status === 'success' ? 'done' : 'failed');
          stop();
          return;
        }

        if (Date.now() - savedAtRef.current > GIVE_UP_MS) {
          setPhase('unknown');
          stop();
        }
      } catch {
        setPhase('unknown');
        stop();
      }
    }

    void poll();
    timerRef.current = window.setInterval(poll, POLL_MS);
    return stop;
  }, [phase, stop]);

  useEffect(() => {
    if (phase !== 'done') return;
    const t = window.setTimeout(() => setPhase('idle'), 4000);
    return () => window.clearTimeout(t);
  }, [phase]);

  return (
    <PublishContext.Provider value={{ phase, notifyChange, dismiss }}>
      {children}
      <PublishToast phase={phase} onDismiss={dismiss} />
    </PublishContext.Provider>
  );
}

export function usePublish() {
  const ctx = useContext(PublishContext);
  if (!ctx) throw new Error('usePublish must be used inside PublishProvider');
  return ctx;
}

const COPY: Record<Exclude<Phase, 'idle'>, { title: string; detail: string; tone: string }> = {
  pending: {
    title: 'Đang cập nhật lên website',
    detail: 'Thay đổi đã lưu. Website sẽ hiển thị sau khoảng 10-30 giây.',
    tone: 'working',
  },
  building: {
    title: 'Đang cập nhật lên website',
    detail: 'Đang dựng lại trang, bạn có thể tiếp tục làm việc.',
    tone: 'working',
  },
  done: {
    title: 'Đã cập nhật lên website',
    detail: 'Khách truy cập đã thấy nội dung mới.',
    tone: 'ok',
  },
  failed: {
    title: 'Cập nhật website chưa thành công',
    detail: 'Dữ liệu đã lưu an toàn, nhưng website vẫn giữ bản cũ. Thử lại hoặc báo kỹ thuật.',
    tone: 'bad',
  },
  unknown: {
    title: 'Chưa rõ trạng thái website',
    detail: 'Dữ liệu đã lưu. Không kết nối được tới dịch vụ cập nhật website.',
    tone: 'warn',
  },
};

function PublishToast({ phase, onDismiss }: { phase: Phase; onDismiss: () => void }) {
  if (phase === 'idle') return null;
  const copy = COPY[phase];

  return (
    <div className={`publish-toast publish-toast--${copy.tone}`} role="status" aria-live="polite">
      <div className="publish-toast__body">
        <p className="publish-toast__title">
          {(phase === 'pending' || phase === 'building') && (
            <span className="publish-toast__spinner" aria-hidden="true" />
          )}
          {copy.title}
        </p>
        <p className="publish-toast__detail">{copy.detail}</p>
      </div>
      <button type="button" className="publish-toast__close" onClick={onDismiss} aria-label="Đóng">
        ×
      </button>
    </div>
  );
}
