# Stage 1 — Build React frontend
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
# Using `npm install` (not `npm ci`) so the build tolerates a stale lockfile
# after dependency bumps. TODO: regenerate package-lock.json locally after
# bumping deps and switch back to `npm ci` for reproducible builds.
RUN npm install

COPY index.html vite.config.js ./
COPY src ./src
RUN npm run build

# Stage 2 — Serve via nginx
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
