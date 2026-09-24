# Schlanker Live-Prozesse-Dienst (Zero-Dependency, nur Node-Builtins).
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server.mjs topology.mjs ./
COPY public ./public
ENV PORT=8080
EXPOSE 8080
# Healthcheck über den eingebauten /healthz-Endpoint.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null 2>&1 || exit 1
CMD ["node", "server.mjs"]
