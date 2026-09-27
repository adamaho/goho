/* oxlint-disable nopeus/prefer-effect-platform-services -- This process-level test controls raw stdio and a disposable HTTP server. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createInterface } from "node:readline";
import { test } from "node:test";

const receipt = {
  id: "42",
  storeName: "North Star Market",
  receiptDate: "2026-09-10",
  category: "Groceries",
  subtotal: "21.5",
  tax: "1.72",
  total: "23.22",
  currency: "USD",
  items: [{ position: 0, name: "Apples", amount: "4.5" }],
};

test("lists Goho receipts through MCP and reports server failures", async () => {
  let receipts = [receipt];
  const server = createServer((request, response) => {
    assert.equal(request.method, "GET");
    assert.equal(request.url, "/receipts");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ data: receipts }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address);

  const child = spawn(process.execPath, ["src/main.ts"], {
    cwd: new URL("../", import.meta.url),
    env: { ...process.env, GOHO_SERVER_URL: `http://127.0.0.1:${address.port}` },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const lines = createInterface({ input: child.stdout });
  const pending = new Map();
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  lines.on("line", (line) => {
    const message = JSON.parse(line);
    const reply = pending.get(message.id);
    if (reply) {
      pending.delete(message.id);
      reply.resolve(message);
    }
  });
  const request = (id, method, params) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}: ${stderr}`));
      }, 10000);
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  const callList = (id) => request(id, "tools/call", { name: "list_receipts", arguments: {} });

  try {
    const initialized = await request(1, "initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "goho-mcp-test", version: "1.0.0" },
    });
    assert.equal(initialized.result.protocolVersion, "2025-11-25");
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
    );

    const discovered = await request(2, "tools/list", {});
    assert.deepEqual(
      discovered.result.tools.map((tool) => tool.name),
      ["hello", "list_receipts"],
    );
    assert.equal(discovered.result.tools[1].annotations.readOnlyHint, true);

    const listed = await callList(3);
    assert.equal(listed.result.isError, false);
    assert.deepEqual(listed.result.structuredContent, { receipts: [receipt] });

    receipts = [];
    const empty = await callList(4);
    assert.deepEqual(empty.result.structuredContent, { receipts: [] });

    await new Promise((resolve) => server.close(resolve));
    const unavailable = await callList(5);
    assert.equal(unavailable.result.isError, true);
    assert.match(unavailable.result.content[0].text, /Could not list receipts/);
  } finally {
    child.kill();
    lines.close();
    server.closeAllConnections();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
});
