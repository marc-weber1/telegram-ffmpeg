# syntax = docker/dockerfile:1

FROM node:latest

ENV NODE_ENV=production

WORKDIR /home/facade/telegram-ffmpeg

COPY [ "tsconfig.json", "package.json", "package-lock.json", "./" ]
RUN npm install

ADD src ./src
RUN npx tsc --project tsconfig.json
