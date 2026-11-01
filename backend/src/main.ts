import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AppModule } from './app.module';

/*
  One process serves all three surfaces: the API, the admin SPA and the
  landing page.

  This used to be three containers behind Nginx — Nginx split `/`, `/admin/`
  and `/api/v1/` between a static volume, a second static volume and this
  process. Collapsing it means one deploy and one rollback for all three, so
  the landing can never be running against an API it was not built with.

  Order matters: everything registered with `app.use` runs before Nest's own
  router, so each handler below either answers or stands aside for `/api/`.
*/
async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  /*
    ---- One address per page ---------------------------------------------

    Both www and the bare domain reach this process, and until now both were
    answered in full — so every page existed at two addresses. DNS cannot fix
    that: it only says which machine a name lives on, and has no way to say
    "ask for this under another name". A redirect is an HTTP answer, so it has
    to be given here.

    It matters beyond tidiness. `localStorage` is scoped per host, and the
    discreet-mode switch lives there — a visitor who turned it on at one
    address would find the photos uncovered at the other, which is the worst
    possible moment for that setting to be forgotten.

    The target is derived by dropping the "www." rather than configured, so
    the same code is right for every shop built from this repo. The guard
    below is what makes that safe: if a shop ever decides www *is* its real
    address, this stands aside instead of redirecting to itself forever.
  */
  const canonicalHost = (() => {
    try {
      return process.env.SITE_URL ? new URL(process.env.SITE_URL).host : null;
    } catch {
      return null;
    }
  })();

  if (!canonicalHost?.startsWith('www.')) {
    app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      // A chain of proxies appends to this header, and the visitor's own host
      // is the first entry.
      const forwarded = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host;
      const host = forwarded?.split(',')[0]?.trim();
      if (!host?.startsWith('www.')) return next();

      const proto = ((req.headers['x-forwarded-proto'] as string | undefined) ?? 'https')
        .split(',')[0]
        .trim();

      // 301 for a reader, 308 for everything else: both are permanent, but a
      // 301 lets a client turn a POST into a GET and drop its body, which
      // would silently lose an admin's save.
      const permanent = req.method === 'GET' || req.method === 'HEAD' ? 301 : 308;
      res.redirect(permanent, `${proto}://${host.slice(4)}${req.originalUrl}`);
    });
  }

  // dist/main.js → backend/dist → backend → repo root
  const root = join(__dirname, '..', '..');
  const adminDir = join(root, 'admin', 'dist');
  const landingDir = join(root, 'landing', 'dist', 'client');
  const landingEntry = join(root, 'landing', 'dist', 'server', 'entry.mjs');

  // ---- Admin SPA ------------------------------------------------------
  if (existsSync(adminDir)) {
    app.use('/admin', express.static(adminDir, { index: false }));
    app.use('/admin', (req: express.Request, res: express.Response, next: express.NextFunction) => {
      // A hashed bundle that isn't on disk is a broken deploy, not a route.
      // Answering it with index.html would turn that into a blank screen with
      // a 200 next to it, which is the hardest kind of fault to find.
      if (req.path.startsWith('/assets/')) return next();
      res.sendFile(join(adminDir, 'index.html'));
    });
  } else {
    logger.warn('admin/dist chưa có — bỏ qua /admin (bình thường khi chạy dev)');
  }

  // ---- Landing ---------------------------------------------------------
  if (existsSync(landingEntry)) {
    // Hashed filenames, so these can be held for a year. Everything else in
    // the folder keeps its real name — the logo, the favicon, the contact
    // icons — and those are versioned by query string instead, so they get a
    // short life here rather than an immutable one.
    app.use(
      '/assets',
      express.static(join(landingDir, 'assets'), { immutable: true, maxAge: '1y' }),
    );
    app.use(express.static(landingDir, { index: false, maxAge: '1h' }));

    /*
      Nest compiles to CommonJS, where TypeScript rewrites `import()` into
      `require()` — and `require` cannot load an ESM `.mjs` file. Building the
      import through `new Function` keeps it an import at runtime.
    */
    const importEsm = new Function('p', 'return import(p)') as (p: string) => Promise<any>;
    const { handler } = await importEsm(pathToFileURL(landingEntry).href);

    app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (req.path.startsWith('/api/')) return next();
      // Pages are generated per request and the shop expects an edit to show
      // on the next load, so nothing in front of this may hold the HTML.
      res.setHeader('Cache-Control', 'no-cache');
      handler(req, res, next);
    });
  } else {
    logger.warn('landing/dist chưa có — chỉ phục vụ API (bình thường khi chạy dev)');
  }

  await app.listen(process.env.PORT ?? 3000);
  logger.log(`Đang nghe cổng ${process.env.PORT ?? 3000}`);
}
bootstrap();
