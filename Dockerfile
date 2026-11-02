FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8080 DATA_DIR=/app/data
WORKDIR /app
COPY --chown=node:node package.json server.js ./
COPY --chown=node:node public ./public
RUN mkdir -p /app/data && chown node:node /app/data
RUN chmod -R a+rX /app && chown -R node:node /app
USER node
EXPOSE 8080
CMD ["node", "--experimental-sqlite", "server.js"]
