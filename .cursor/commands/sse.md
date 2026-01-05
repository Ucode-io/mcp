## SSE (HTTP) тест локально для этого MCP сервера

Этот репозиторий умеет SSE режим: `node mcpServer.js --sse`.

### Как это работает (1 абзац)
- `GET /sse` открывает SSE‑стрим и **первым событием** присылает:
  - `event: endpoint`
  - `data: /messages?sessionId=<uuid>`
- Далее клиент должен отправлять **JSON-RPC** сообщения в `POST /messages?sessionId=<uuid>`.
- Все ответы сервера приходят обратно в SSE‑стрим как `event: message`.

---

## Для Anthropic / hosted клиентов (рекомендуется)

Legacy схема `/sse + /messages` часто плохо работает через прокси/туннели и может приводить к таймаутам.
Для этого в сервер добавлен **Streamable HTTP** endpoint:

- **`/mcp`** (POST/GET) — современный MCP transport.

Если Anthropic пишет `Connection to MCP server timed out`, почти всегда нужно:
- выставить `MCP_SERVER_URL` на **`https://<tunnel-host>/mcp`** (а не `/sse`)
- убедиться, что туннель прокидывает путь `/mcp`

---

## Запуск локально

```bash
node mcpServer.js --sse
```

По умолчанию порт `3001` (можно поменять через env `PORT`).

---

## Тест через curl (самый надёжный)

### 1) Открой SSE и получи endpoint (sessionId)

```bash
curl -N 'http://localhost:3001/sse'
```

В выводе будет примерно так:

```text
event: endpoint
data: /messages?sessionId=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

Скопируй `sessionId` (или весь `data` путь).

### 2) MCP initialize (обязательно)

Подставь `sessionId` в URL:

```bash
curl -i -X POST 'http://localhost:3001/messages?sessionId=<SESSION_ID>' \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": { "name": "curl", "version": "1.0" }
    }
  }'
```

### 3) notifications/initialized (обязательно)

```bash
curl -i -X POST 'http://localhost:3001/messages?sessionId=<SESSION_ID>' \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "method": "notifications/initialized",
    "params": {}
  }'
```

### 4) tools/list

```bash
curl -i -X POST 'http://localhost:3001/messages?sessionId=<SESSION_ID>' \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'
```

### 5) tools/call (пример)

```bash
curl -i -X POST 'http://localhost:3001/messages?sessionId=<SESSION_ID>' \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "get_dbml",
      "arguments": {
        "projectId": "<PROJECT_ID>",
        "environmentId": "<ENVIRONMENT_ID>"
      }
    }
  }'
```

**Ответы на `id:1/2/3` смотри в окне с `curl -N .../sse`** — туда придут `event: message` с JSON.

---

## Тест через Postman (SSE + отдельные POST)

1) Создай request **GET** `http://localhost:3001/sse` → нажми **Send** и держи открытую вкладку (она будет принимать события).
2) В этой вкладке найди `event: endpoint` и скопируй `data` (там `/messages?sessionId=...`).
3) Создай отдельный request **POST** на `http://localhost:3001/messages?sessionId=...`
   - Header: `Content-Type: application/json`
   - Body (raw JSON): отправь по очереди `initialize`, затем `notifications/initialized`, затем `tools/list`/`tools/call` (payload’ы выше).
4) Ответы будут приходить не в POST вкладку (там обычно `202 Accepted`), а в SSE вкладку (GET `/sse`).

---

## Важно про Anthropic / Claude API и localhost

Если ты передаёшь в Anthropic `MCP_SERVER_URL = http://localhost:3001/sse`, **облако Anthropic не сможет подключиться к твоему localhost**.

Для интеграции “через Anthropic API” MCP сервер должен быть **доступен из интернета** (например, деплой/публичный домен или туннель типа `ngrok/cloudflared`).

