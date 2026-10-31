import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CONTENT_CHANGED_EVENT } from '../../common/events/content-changed.event';

export interface BuilderStatus {
  reachable: boolean;
  isBuilding?: boolean;
  lastBuild?: { at: string; status: 'success' | 'failed'; error?: string } | null;
  error?: string;
}

/*
  Publishing is now a cache eviction.

  The landing used to be rebuilt into a new release directory on every content
  change, with this service debouncing the trigger. It is rendered per request
  now, so there is nothing to build: the pages read a snapshot that the Astro
  bundle caches for a minute, and making an edit visible means dropping that
  snapshot.

  No debounce either. Clearing is idempotent and costs nothing, where a build
  was expensive enough that ten edits in a row had to be collapsed into one.
  Waiting eight seconds to do something free would only mean the owner hits
  refresh and sees the old price.
*/
@Injectable()
export class PublishService {
  private readonly logger = new Logger(PublishService.name);
  private lastClearedAt: string | null = null;

  @OnEvent(CONTENT_CHANGED_EVENT)
  handleContentChanged() {
    this.clearSnapshot();
  }

  async triggerManual(): Promise<BuilderStatus> {
    this.clearSnapshot();
    return this.getStatus();
  }

  /*
    Kept in the shape the admin already polls for. It used to describe a
    separate builder process; now it describes this one, which is always
    reachable and never mid-build — so the admin's "đang cập nhật website"
    banner resolves on its first poll instead of being taught a new protocol.
  */
  async getStatus(): Promise<BuilderStatus> {
    return {
      reachable: true,
      isBuilding: false,
      lastBuild: this.lastClearedAt ? { at: this.lastClearedAt, status: 'success' } : null,
    };
  }

  private clearSnapshot() {
    const clear = (globalThis as { __clearSnapshot?: () => void }).__clearSnapshot;
    if (!clear) {
      // The landing bundle registers this when it loads. Missing it means the
      // API is running without a landing build — true in local development,
      // where Astro serves itself and fetches live anyway.
      this.logger.debug('Chưa có landing bundle để xoá cache (bình thường khi chạy dev)');
    }
    clear?.();
    this.lastClearedAt = new Date().toISOString();
  }
}
