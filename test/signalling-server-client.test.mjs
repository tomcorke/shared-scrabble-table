import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSignallingServerClient,
  normalizeSignallingServerUrl,
} from "../src/app/signalling-server-client.ts";

test("normalizes secure server origins and rejects mixed content", () => {
  assert.equal(
    normalizeSignallingServerUrl("https://signal.example/", "https:"),
    "https://signal.example",
  );
  assert.equal(
    normalizeSignallingServerUrl("http://localhost:8787", "https:"),
    "http://localhost:8787",
  );
  assert.throws(
    () => normalizeSignallingServerUrl("http://signal.example", "https:"),
    /Use an HTTPS signalling server address/,
  );
  assert.throws(
    () => normalizeSignallingServerUrl("https://signal.example/path", "https:"),
    /without a path/,
  );
});

test("uses host and guest bearer tokens on their respective requests", async () => {
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push({ url: new URL(url), options });
    return new Response(JSON.stringify({ requests: [] }), { status: 200 });
  };
  const client = createSignallingServerClient("http://localhost:8787", fetcher);

  await client.pendingRequests("7K2M", "host-secret");
  await client.rejectRequest("7K2M", "guest-id", "host-secret");
  await client.cancelJoinRequest(
    "7K2M",
    "6e0d47c2-e6c3-4fb7-8c20-799da440ddc0",
  );

  assert.equal(requests[0].url.pathname, "/api/rooms/7K2M/requests");
  assert.equal(requests[0].options.headers.Authorization, "Bearer host-secret");
  assert.equal(requests[0].options.cache, "no-store");
  assert.equal(requests[1].options.method, "DELETE");
  assert.equal(requests[1].options.headers.Authorization, "Bearer host-secret");
  assert.equal(requests[2].options.method, "DELETE");
  assert.equal(
    requests[2].options.headers.Authorization,
    "Bearer 6e0d47c2-e6c3-4fb7-8c20-799da440ddc0",
  );
});
