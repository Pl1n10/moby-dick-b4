# Stage 1 — Build React frontend
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
# Using `npm install` (not `npm ci`) so the build tolerates a stale lockfile
# after dependency bumps. TODO: regenerate package-lock.json locally after
# bumping deps and switch back to `npm ci` for reproducible builds.
RUN npm install

# Vite reads VITE_* at BUILD TIME and inlines them into the bundle, so they
# must arrive as build args (a .env on the host is read too late).
# Defaults keep demo mode so builds without an Entra app registration succeed.
ARG VITE_AUTH_ENABLED=false
ARG VITE_AZURE_TENANT_ID=
ARG VITE_AZURE_CLIENT_ID=
ARG VITE_AZURE_REDIRECT_URI=http://localhost:5173
ARG VITE_AZURE_API_SCOPE=

ENV VITE_AUTH_ENABLED=$VITE_AUTH_ENABLED \
    VITE_AZURE_TENANT_ID=$VITE_AZURE_TENANT_ID \
    VITE_AZURE_CLIENT_ID=$VITE_AZURE_CLIENT_ID \
    VITE_AZURE_REDIRECT_URI=$VITE_AZURE_REDIRECT_URI \
    VITE_AZURE_API_SCOPE=$VITE_AZURE_API_SCOPE

COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public
RUN npm run build

# Stage 2 — Serve via nginx
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
