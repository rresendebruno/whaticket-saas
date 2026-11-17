# ---------- Etapa 1: compila o TypeScript ----------
FROM node:18 AS build

# Chrome/Chromium nao e necessario: a conexao usada e a Z-API (HTTP).
# So o provider antigo "wwebjs" (QR code) precisaria dele.
# Puppeteer novo (dependencia do whatsapp-web.js) so respeita
# PUPPETEER_SKIP_DOWNLOAD; o nome antigo fica para versoes antigas.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build \
  # remove TypeScript, tipos, eslint etc. da imagem final
  && npm prune --omit=dev

# ---------- Etapa 2: imagem final, so o necessario para rodar ----------
FROM node:18-slim

# ffmpeg: converte audios gravados no navegador (webm/ogg) para MP3
# wget/ca-certificates: baixar o dockerize
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg wget ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV DOCKERIZE_VERSION v0.6.1
RUN wget -q https://github.com/jwilder/dockerize/releases/download/$DOCKERIZE_VERSION/dockerize-linux-amd64-$DOCKERIZE_VERSION.tar.gz \
  && tar -C /usr/local/bin -xzf dockerize-linux-amd64-$DOCKERIZE_VERSION.tar.gz \
  && rm dockerize-linux-amd64-$DOCKERIZE_VERSION.tar.gz

ADD https://github.com/Yelp/dumb-init/releases/download/v1.2.1/dumb-init_1.2.1_amd64 /usr/local/bin/dumb-init
RUN chmod +x /usr/local/bin/dumb-init

WORKDIR /usr/src/app
COPY --from=build /usr/src/app/package.json ./
COPY --from=build /usr/src/app/.sequelizerc ./
# .env* (bootstrap.ts le ".env"; .env.example garante que o padrao sempre casa)
COPY --from=build /usr/src/app/.env* ./
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD dockerize -wait tcp://${DB_HOST}:3306 \
  && npx sequelize db:migrate \
  && node dist/server.js
