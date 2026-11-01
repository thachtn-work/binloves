# Shop Platform

Landing page, admin panel and backend for a single shop that displays products
and converts through a private Zalo chat rather than an on-site checkout.

```
landing/          Astro site, rendered per request — the public website
admin/            React SPA — the shop owner's control panel
backend/          NestJS + Prisma + PostgreSQL — data, API, and the server
                  that puts the other two in front of visitors
migrations/       Schema changes as plain .sql, applied by the platform
Dockerfile        Builds all three into one image
```

## How it fits together

One Node process answers everything. `backend/src/main.ts` serves the admin
bundle under `/admin`, hands `/api/v1` to Nest's own router, and gives every
other path to Astro's request handler.

Pages are generated when they are asked for. They read one API snapshot that
the landing caches for a minute (`SNAPSHOT_TTL_MS`), shared by every request
that arrives during it — so twenty simultaneous visitors cause one query, not
twenty. When the owner saves anything, the API emits `content.changed` and
`PublishService` drops that cache, so the very next page load is already
current. No debounce: clearing costs nothing, and waiting would only mean the
owner refreshes and sees the old price.

If the snapshot fetch fails, the **last good copy is served instead of an
error**. Catalogue data a few minutes stale is a better answer for a customer
than a 500, and the next request tries again — while `/api/v1/health/ready`
reports the fault honestly so somebody is told.

### How it used to work, and why it changed

The landing was a fully static site, rebuilt on every content change into a
timestamped release that Nginx picked up through a symlink. That was never a
preference for static output: it was cover for a database that went to sleep
when idle, so the shop had to keep selling while its own data layer was
unreachable.

Two things ended it. The database is now operated by the host, so the shop no
longer needs to outlive it. And the build itself was expensive in exactly the
wrong place — measured on the server it peaked at **280 MB**, which with the
API alongside came to ~362 MB, inside the same budget the app has to serve
requests from. Rendering per request removed that peak entirely: the same
stack now idles at **46 MB** and has never been measured above **90 MB**, in a
container capped at 512 MB.

The build moved to the image, where it costs the running app nothing, and one
image holding all three surfaces means deploy and rollback move them together
— the landing can never be live against an API it was not built alongside.

### Scope, deliberately

There is no cart, checkout or order flow, and no real inventory. Prices and
stock labels are values the owner types in for display; the actual sale happens
over Zalo. Don't add stock-tracking logic without first deciding how it would
stay in sync with sales that happen off-platform.

## Timed sale prices

A product's `salePrice` can carry a window — `saleStartsAt` and `saleEndsAt`,
either of which may be left open. `PublicService` only puts the sale price in
the snapshot while that window is open, so the landing needs no rule of its
own: an expired sale simply arrives as no sale and `hasDiscount` keeps working
untouched. A sale with no window at all runs until the owner removes it, which
is how every sale behaved before windows existed.

**The window lives on `products`, not in a table of its own.** It is the
validity of one value on that row, and splitting it out would let a price exist
with no window, or a window with no price, with nothing in the schema to say
so. A separate table starts earning its keep when a shop wants to queue the
*next* promotion while one is running, keep a history of past ones, or discount
a whole category at once — none of which this shop asked for.

**Nothing has to notice a window closing.** `saleIsLive` is evaluated every
time the snapshot is fetched, so a sale stops showing within one `SNAPSHOT_TTL_MS`
of its end — a minute by default — with no scheduler involved.

This used to need one. While the site was pre-built, an expired sale kept its
price on a page nobody was going to rebuild, so a `SaleWindowService` woke once
a minute, asked the builder when the site was last built, and triggered a
rebuild if a window edge had been crossed since. Rendering per request made the
whole service redundant and it was deleted along with `@nestjs/schedule`.

**Times are Vietnam time, converted at the edge.** The admin sends an explicit
`+07:00` offset rather than letting `new Date()` read a `datetime-local` value
in whatever zone the browser is in — that is right on the owner's own laptop
and quietly wrong from anywhere else. The server stores UTC instants and never
guesses a zone, so nothing depends on the container's `TZ`; `admin/src/lib/vn-time.ts`
holds the conversion, and notes why a fixed offset is exact for Vietnam.

Clearing the sale price clears the window with it, in the admin and in the
validator. Otherwise the next sale on that product would silently inherit the
schedule of the last one.

## Running it

### Production

The platform builds the `Dockerfile` at the repo root, runs the image, applies
anything new in `migrations/`, and terminates TLS in front of it. `embra.toml`
tells it the port, the liveness path and where the migrations live.

Everything in `backend/.env` becomes a platform secret, **except** `DATABASE_URL`,
which the platform issues for the database it manages. Add `SITE_URL`.

Deploying is a push. There is no step that builds anything on the running
server, and no volume shared between services — the image is the deployment.

#### Schema changes

The app connects with a role that can read and write rows but cannot alter the
schema, so it cannot migrate itself on boot and does not try. Changes ship as
numbered `.sql` files that are rehearsed against a copy of production before
they are applied:

```bash
cd backend
# edit prisma/schema.prisma, then:
npx prisma migrate diff \
  --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma \
  --script > ../migrations/000N_what_it_does.sql
```

Read the generated file before committing it. File order is apply order, so
never renumber or reuse a number.

The existing files were exported from the Prisma migration history and verified
by applying them to an empty database and diffing the result against
`schema.prisma` — which came back empty, meaning the SQL reproduces the model
exactly. Re-run that check after writing a new one.

#### The first admin account

There is no shell on the running app, so `scripts/admin-user.js` cannot reach
it. The first account arrives as a migration like any other change:

```bash
cd backend
node scripts/make-admin-migration.js owner@example.com
```

The password is hashed on your machine and only the hash is written to the
file; omit it and a strong one is generated and printed once. The statement is
`ON CONFLICT DO NOTHING`, so re-applying it is harmless. Change the password
from **Tài khoản** in the admin after the first login.

Later accounts, and recovering a forgotten password, are migrations too — the
owner can change their own password in the admin, but cannot reset it blind.

### Local development

Everything runs on the host with hot reload; only Postgres is containerised.

```bash
# 1. Database (published on 55433, not 5432, to avoid clashing with any
#    Postgres already installed on the machine — or with the sibling shop,
#    which holds 55432)
docker compose -f docker-compose.dev.yml up -d

# 2. Backend
cd backend
cp .env.example .env            # defaults already point at localhost:55433
npm install
npx prisma migrate deploy
node scripts/admin-user.js create owner@example.com devpassword
npm run start:dev               # http://localhost:3200/api/v1

# 3. Admin and landing, each in its own terminal
cd ../admin   && npm install && npm run dev     # http://localhost:5173/admin/
cd ../landing && npm install && npm run dev     # http://localhost:4321
```

Log in at `/admin/` with the account created above. To fill the shop with
placeholder content for a demo, run `npm run seed:demo -- --reset` in
`backend/`.

`backend/.env` is for local development only. In production every one of these
becomes a platform secret, and `DATABASE_URL` is issued by the platform for the
database it manages — setting it yourself there points the app at the wrong
one.

In development the three run separately, the way they did before: Astro on
4321, Vite on 5173, Nest on 3000. The API serves `/admin` and the landing only
when their `dist/` folders exist, so `npm run start:dev` keeps answering on
`/api/v1` alone and logs that it skipped them — the dev servers handle those.

The landing reads `API_URL`, defaulting to the loopback port the API listens on
(`http://127.0.0.1:3000/api/v1`), since in production they are the same
process. The admin dev server proxies `/api` to the backend, so there is no
CORS setup.

To run the way production does, build all three and start the one process:

```bash
(cd landing && npm run build) && (cd admin && npm run build) && (cd backend && npm run build)
cd backend && node dist/main.js     # serves /, /admin and /api/v1 on 3000
```

## Photos and video

### The frame a clip is drawn in

The gallery was square for everything. The shop films product demos on a
phone, so most clips are taller than they are wide and were being letterboxed
into a narrow strip with black down both sides.

`media.displayRatio` holds `16:9`, `9:16`, `1:1`, or null for that square —
per file, not per product, because one product can hold photos and a clip
filmed sideways in the same strip. Null renders exactly as everything did
before, so nothing had to be filled in for the column to be added safely.

It is the frame, not the file's shape. The two usually agree and the admin
preselects the one that matches, reading the clip's own dimensions in the
browser before it is uploaded — `videoWidth`/`videoHeight`, which have any
rotation a phone recorded already applied, where the raw header would call a
portrait clip landscape. The owner can still disagree: a vertical clip is
allowed in a square frame if that is what suits the page.

Two layout details hold it up. `.gallery` sets `align-items: start`, because a
stretched grid item has a height of its own and that silently overrules
`aspect-ratio` — a square photo beside a vertical clip would be pulled tall
and cropped. And the mobile cap pins `width: 100%`, because a height ceiling
meeting an aspect ratio pulls the *width* down instead, leaving the tall item
narrower than the photos next to it.


Uploads go **straight from the browser to S3-compatible storage**. The backend
only signs an upload URL and records the metadata afterwards, so file bytes
never pass through Node and memory stays flat regardless of upload size.

`S3_ENDPOINT` makes this provider-agnostic — AWS S3, Cloudflare R2,
DigitalOcean Spaces and MinIO all work. Leave `S3_ENDPOINT` unset for AWS.
`S3_PUBLIC_BASE_URL` is the public prefix stored with each file, so the bucket
must allow public reads.

### One address per page

Both `www` and the bare domain resolve to this process, and both used to be
answered in full, so every page existed at two addresses. DNS cannot fix that:
it only says which machine a name lives on and has no way to say "ask for this
under another name". The redirect is an HTTP answer, so it lives in
`main.ts`, ahead of everything else.

The reason is not only tidiness. `localStorage` is scoped per host and the
discreet-mode switch lives there, so a visitor who turned it on at one address
would find the photos uncovered at the other.

The target is derived by dropping the `www.`, never configured, so the same
code is right for any shop built from this repo. A shop whose `SITE_URL` *is*
a `www` host disables it rather than redirecting to itself forever. Readers
get a 301; anything else gets a 308, which keeps the method and body — a 301
lets a client turn a POST into a GET and drop what an admin was saving.

### Search

The header box is a plain GET to `/tim-kiem` and stays one if the script never
runs. On top of that, `/tim-kiem.json` hands the browser the whole catalogue
once — 262 products, about 22 KB compressed — and suggestions are matched
locally from then on. A round trip per keystroke would cost more than the
index does in total, answer slower, and put the API in the path of every
letter typed.

Matching folds accents away, because Vietnamese phone keyboards make them slow
enough that people leave them off: "am dao" has to find "âm đạo". `đ` is
handled separately from the rest, being a letter rather than a `d` with a mark
on it, which NFD leaves alone. `src/lib/search.ts` holds that folding and is
imported by both the endpoint that builds the index and the script that
searches it — if the two ever disagreed, a typed word would miss a product
whose name contains it.

The dropdown reads names and categories; the search page also reads
descriptions. So "Xem tất cả kết quả" is always the last row, whatever matched.

### Image sizes

Photos are served at whatever size they were uploaded at. A product card on a
phone is 165px wide and the average upload is 145 KB, so the home page pulled
4.8 MB of images where a few hundred KB would look identical.

Setting `IMAGE_TRANSFORM` routes every `<img>` through the media host's own
resizer and adds a 2x `srcset`. It is off by default and should stay off until
transformations are enabled for that zone in the Cloudflare dashboard: the
resized URLs 404 until then, which would empty the page rather than slow it.

### Two buckets, one of them frozen

Each file's **absolute** URL is stored on its row, not rebuilt from the key at
read time. That is what lets the bucket change without a migration: everything
uploaded before the change keeps serving itself from where it already is,
while new uploads go wherever `S3_*` now points.

Keys cannot tell the two apart — a file uploaded last year sits under the same
`images/` prefix as one uploaded today — so **deleting** routes on the stored
URL instead. The optional `LEGACY_S3_*` variables describe the frozen bucket
so that deleting one of its files from the admin still reaches the object. Had
the delete gone to the current bucket it would have *succeeded*, because a
delete for a key that is not there is not an error, and the file would have
survived unreachable and still billed. Drop the variables once the old bucket
is empty; the code notices they are gone.

Neither bucket is ever written to by the other's credentials, and nothing
copies files between them. Moving the old files is a separate job, done with
`rclone` and nothing in this repo.

JPEG, PNG, WebP, AVIF, MP4 and WebM are accepted; the allow-list lives in
`presign-media.dto.ts` and is enforced where the upload URL is signed, which is
the only moment the server is in the loop at all.

Each file's kind is **recorded at upload time** and travels with its URL all
the way to the landing's build-time snapshot. Nothing anywhere guesses it from
the file extension: the extension is whatever the owner's phone produced, and a
wrong guess renders a clip as a broken image on the shop's front page.

Where a clip plays, and why:

| Where | Behaviour |
| --- | --- |
| Product card | First frame, plus a badge. Plays only while hovered, so a page of products doesn't pull a stream per card over someone's mobile data. |
| Product page | Native controls, muted until the visitor turns sound on, never starts by itself. |
| Home banner | Autoplays muted on loop — but only the slide actually on screen, and never while discreet mode is on. |

That last exclusion is the point of the feature rather than a detail: blur hides
what a clip shows, but something *moving* behind the blur still catches the eye
of whoever is sitting next to the visitor, which is what discreet mode exists to
prevent. Revealing a frame opts back in and the clip resumes.

### Collection covers

The homepage opens with a circle per collection under the hero. Each shows the
collection's own photo when the owner picked one, and otherwise the first photo
of the first product inside — so a new collection is never a gap on the
homepage, and the field only needs touching to override that choice.

Categories carry the same field and the same fallback, and the API still
resolves `coverUrl` for them, but nothing renders it: the row was switched from
categories to collections at the shop's request. The admin field says so rather
than pretending otherwise, and turning a category row back on needs no backend
work.

The fallback is resolved in `PublicService`, not on the landing. It is a content
rule, so every page that draws one gets the same answer rather than each
re-deriving it. A collection borrows from its own membership order, not the
global product order, because that is the order it is displayed in. A product
whose only media is a clip is skipped rather than blocking its group, and the
picker refuses a video outright: these render as stills, so a clip would arrive
as a dead frame.

The photos are shown as they are. An earlier version tinted the whole row into
one colour so the white studio backgrounds would not glare against the dark
page; the shop compared the two and chose the real pictures, so the glare is a
trade they made knowingly rather than something left unnoticed.

The circles carry `.media`, which means discreet mode blurs them with everything
else. The names underneath stay sharp, so the section still works as navigation
while blurred — you read where you are going rather than looking at it.

A cover counts as usage: the media library will not delete a file a category or
collection points at, the same as for a product or a banner.

### Size, and how big files go up

| Size | What happens |
| --- | --- |
| up to 500 MiB | one presigned PUT, as before |
| over 500 MiB | **multipart** — the file is sliced and the parts uploaded separately |
| over 1 GB | the owner is shown the file's real size and asked first; nothing is signed until they answer |
| over 10 GB | refused |

The 500 MiB line is not arbitrary: S3-compatible storage, R2 included, refuses
a single PUT above ~5 GiB. It sits well below that because by then one
unbroken PUT has stopped being a good idea anyway — a part that fails can be
retried on its own (three attempts, backing off), a 2 GB PUT cannot.

Multipart is three calls — `multipart/start`, the browser PUTs each part three
at a time, then `multipart/complete`. Two things about it are deliberate:

- **The part ETags are read back from storage, not collected by the browser.**
  The usual approach has the browser keep each part's ETag and send them up to
  finish the upload, which needs the bucket's CORS policy to expose that
  header. Ours does not, and the R2 token the API holds has no permission to
  change it. `ListParts` server-side sidesteps the question, and describes what
  storage actually received rather than what the browser believes it sent.
- **A failed or cancelled upload calls `multipart/abort`.** Parts that are
  uploaded and never assembled keep occupying — and being billed as — storage
  while being invisible as objects. Without the abort they are unreachable
  garbage nobody can see to clean up.

Both upload surfaces show a **Huỷ** button while a transfer is running. It
aborts the in-flight requests, stops the queued parts from starting, and then
cleans up after itself — `multipart/abort` for a part-wise upload, and
`media/discard` for files that had already landed in a cancelled batch of
small ones. Cancelling is reported as a notice, not an error, and never leaves
a row in the library or an object in the bucket.

`media/discard` only ever deletes keys with no Media row behind them: anything
that reached the library is a real file the owner can see and delete there.

The one exit this cannot clean up after is **closing the tab**, since no abort
would ever be sent — so while an upload is running the page registers a
`beforeunload` handler and the browser asks first. For the case where someone
confirms anyway, set a lifecycle rule on the bucket to abort incomplete
multipart uploads after a day.

`MULTIPART_THRESHOLD` in `backend/src/modules/media/upload.constants.ts` sets
the line and must match `MULTIPART_OVER` in `admin/src/media/useUpload.ts`: the
server sizes the parts, the browser slices to that size.

The 1 GB question and the 10 GB refusal live in the browser, because a
presigned PUT cannot carry a size condition and the bytes never reach us. The
10 GB ceiling is re-checked on the server when it signs, so that one holds;
the question is only there to tell the owner before the wait, not after.

## Health checks

Two endpoints, both public and both under `/api/v1` so Nginx already proxies
them (a bare `/health` would be swallowed by the landing site):

| Endpoint | Checks | Use it for |
| --- | --- | --- |
| `GET /api/v1/health` | nothing — just that the process answers | container healthcheck, uptime ping |
| `GET /api/v1/health/ready` | database | alerting, diagnosing a problem |

`/health/ready` reports one of two states:

- **`ok`** (200) — everything works.
- **`down`** (503) — the database is unreachable.

There used to be a `degraded` tier for a landing builder that could die while
the site kept serving. There is no builder now and the landing reads the same
database the admin does, so the database is the whole answer. A tier nothing
can trigger is a tier nobody reads.

Note that `down` does not always mean the shopfront is blank: a visitor may
still be served the last good snapshot while this endpoint reports 503. The
endpoint describes the system, not what one customer happens to see.

Recovery needs no restart — once the database returns, the next request reports
`ok` again.

## Authentication

There is no public signup. Every route requires a valid JWT **by default** — a
global guard is applied and routes opt out explicitly with `@Public()`. Only
`POST /auth/login` and `GET /public/snapshot` do. Adding a new controller
cannot accidentally expose it.

Admin accounts are created explicitly, never automatically:

```bash
docker compose exec api node scripts/admin-user.js create owner@example.com
docker compose exec api node scripts/admin-user.js list
docker compose exec api node scripts/admin-user.js reset  owner@example.com
docker compose exec api node scripts/admin-user.js rename old@example.com new@example.com
docker compose exec api node scripts/admin-user.js delete staff@example.com
```

Omit the password and a strong one is generated and printed once.

This used to be seeded from `ADMIN_EMAIL`/`ADMIN_PASSWORD` on every container
start. Because that seeding upserted, it silently reverted the owner's own
password change on the next restart — so it was removed. Nothing in the
environment can overwrite an account now.

`/public/snapshot` returns only records marked active, so hidden products never
reach the landing build even though the endpoint is unauthenticated.

## Handing the project over

Each shop is an independent deployment — its own code, database and storage.
There is no shared multi-tenant layer, so handing the whole thing to a client
means handing over this repository and its `.env` files, with nothing to strip
out first.

Checklist:

- transfer the repository (one repo: the three packages, `migrations/`,
  `Dockerfile` and `embra.toml` only mean anything together)
- transfer or recreate the S3 bucket and credentials
- `pg_dump` the database and restore it on their infrastructure
- point DNS at their server and reissue TLS certificates
- have them change the admin password
