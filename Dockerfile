# syntax=docker/dockerfile:1

# One image holding all three surfaces, built on the platform's machine rather
# than on the shop's. That is the point of the move: the Astro build peaked at
# 280 MB on the server when it ran there, inside the same budget the app has
# to serve requests from. Here it costs the build host nothing the app can
# feel, and deploy and rollback move landing, admin and API together, so the
# landing can never be live against an API it was not built alongside.

# ---------- landing ----------------------------------------------------
FROM node:20-alpine AS landing
WORKDIR /src/landing
COPY landing/package.json landing/package-lock.json ./
RUN npm ci
COPY landing/ ./
# Nothing is fetched here: every page is rendered per request, so the build
# needs no database and no API to be reachable.
RUN npm run build

# ---------- admin ------------------------------------------------------
FROM node:20-alpine AS admin
ARG VITE_SHOP_NAME="Cửa hàng"
WORKDIR /src/admin
COPY admin/package.json admin/package-lock.json ./
RUN npm ci
COPY admin/ ./
RUN npm run build

# ---------- backend ----------------------------------------------------
FROM node:20-alpine AS backend
# Prisma picks its engine by running `openssl version`, and when that fails by
# looking for libssl at /lib64, /usr/lib64 or /lib. Alpine ships the library at
# /usr/lib and no CLI, so detection quietly falls back to openssl-1.1.x and
# loads an engine that cannot run. `apk add openssl` fixes that but needs
# Alpine's package CDN, which the build host cannot reach; one symlink into a
# path Prisma already probes costs no network. The test guards the symlink, so
# a base image that moves the library fails the build instead of the queries.
RUN test -f /usr/lib/libssl.so.3 && ln -s /usr/lib/libssl.so.3 /lib/libssl.so.3
WORKDIR /src/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
RUN npx prisma generate && npm run build

# ---------- runtime ----------------------------------------------------
FROM node:20-alpine
# Same reason as the backend stage: let Prisma find libssl without the CLI.
RUN test -f /usr/lib/libssl.so.3 && ln -s /usr/lib/libssl.so.3 /lib/libssl.so.3
WORKDIR /app
ENV NODE_ENV=production

# Backend: production dependencies, then the generated Prisma client copied
# from the build stage — generating again here would need the schema engine a
# second time for a result that is already sitting next door.
COPY backend/package.json backend/package-lock.json backend/
RUN cd backend && npm ci --omit=dev && npm cache clean --force
COPY --from=backend /src/backend/node_modules/.prisma backend/node_modules/.prisma
COPY --from=backend /src/backend/node_modules/@prisma backend/node_modules/@prisma
COPY --from=backend /src/backend/dist backend/dist
COPY backend/prisma backend/prisma

# Landing: the SSR bundle still imports Astro's runtime, so its production
# dependencies come along.
COPY landing/package.json landing/package-lock.json landing/
RUN cd landing && npm ci --omit=dev && npm cache clean --force
COPY --from=landing /src/landing/dist landing/dist

# Admin: plain static files, nothing to install.
COPY --from=admin /src/admin/dist admin/dist

# main.js resolves the other two from here: backend/dist → backend → /app.
EXPOSE 3000
CMD ["node", "backend/dist/main.js"]
