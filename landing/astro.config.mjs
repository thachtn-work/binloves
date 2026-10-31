import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

/*
  Rendered per request, not built ahead of time.

  The site used to be fully static, rebuilt on every content change. That was
  not a preference for static output — it was cover for a database that went
  to sleep on us, so the shop had to keep selling while the data layer was
  unreachable. With the database now operated by the host, that cover is no
  longer what is paying for the build, and the build's own cost is real: it
  peaked at 280 MB on the server, inside the same memory budget the app has to
  live in once everything is one process.

  `middleware` mode hands Nest a plain request handler rather than starting a
  second server, so the whole stack answers on one port.
*/
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'middleware' }),
  site: process.env.SITE_URL || 'http://localhost:4321',
  build: {
    // Hashed filenames, so these can be cached for a year; the HTML around
    // them is generated fresh and says so in its own headers.
    assets: 'assets',
  },
});
