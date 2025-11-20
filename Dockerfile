FROM node:18.20.4 AS builder

WORKDIR /mcp
COPY package.json package-lock.json ./
RUN npm install

COPY . .

ENTRYPOINT ["node", "mcpServer.js", "--sse"]