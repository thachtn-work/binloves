import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { HealthService } from './health.service';

/**
 * Lives under /api/v1 on purpose. bin-loves put its health route at a bare
 * /health, which Nginx never proxied to the backend — the endpoint existed in
 * code but returned the landing's 404 from the internet, so it could not be
 * monitored at all. Everything under /api/v1 is already proxied here.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Liveness: is this process up and serving? Touches nothing else, so it
   * stays fast and cannot fail because of a dependency. Used by the container
   * healthcheck and by uptime monitors.
   */
  @Public()
  @Get()
  live() {
    return { status: 'ok' };
  }

  /**
   * Readiness: can the shop actually be run right now? Checks the database and
   * the landing builder, and answers 503 when customers are affected so a
   * monitor can alert on the status code alone.
   */
  @Public()
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const report = await this.healthService.getReadiness();
    res.status(report.status === 'down' ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.OK);
    return report;
  }
}
