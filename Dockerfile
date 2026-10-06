FROM node:22-alpine
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
WORKDIR /app
COPY server ./server
COPY public ./public
VOLUME /data
EXPOSE 80 8080
HEALTHCHECK --interval=30s --timeout=5s CMD sh -c "wget -qO- http://127.0.0.1:${PORT}/health || exit 1"
CMD ["node", "server/server.js"]
