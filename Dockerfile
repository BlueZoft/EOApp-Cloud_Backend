FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
# Optional corporate CA is mounted for installation only, never baked into the image.
RUN --mount=type=secret,id=npm_ca \
    if [ -f /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
    npm ci --omit=dev --no-audit --no-fund
COPY --chown=node:node . .
USER node
EXPOSE 5000
CMD ["npm", "start"]
