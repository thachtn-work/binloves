import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CheckResult {
  ok: boolean;
  detail?: string;
}

export interface ReadinessReport {
  /** ok = everything works; down = customers are affected. */
  status: 'ok' | 'down';
  checks: {
    database: CheckResult;
  };
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  /*
    One check now, and no `degraded` state left to report.

    That state existed for the separate landing builder: a dead builder meant
    edits stopped reaching a site that was otherwise serving fine, which is a
    "fix today", not a "wake someone". There is no builder any more, and the
    landing is rendered by this process from this database — so the database
    is the whole answer. Keeping a degraded tier with nothing able to trigger
    it would just be a tier nobody ever reads.
  */
  async getReadiness(): Promise<ReadinessReport> {
    const database = await this.checkDatabase();
    return { status: database.ok ? 'ok' : 'down', checks: { database } };
  }

  private async checkDatabase(): Promise<CheckResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch (err) {
      return { ok: false, detail: (err as Error).message.slice(0, 200) };
    }
  }
}
