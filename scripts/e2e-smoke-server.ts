import http from "node:http";

const port = Number(process.env.E2E_PORT ?? "4175");

const server = http.createServer((req, res) => {
  const url = req.url ?? "/";

  if (url === "/api/health" || url === "/api/ready") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (url === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<!doctype html><html><body><h1>CollabStudio E2E Smoke</h1></body></html>");
    return;
  }

  res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(port, "127.0.0.1", () => {
  // Keep output stable for Playwright webServer logs.
  console.log(`E2E smoke server listening on http://127.0.0.1:${port}`);
});
