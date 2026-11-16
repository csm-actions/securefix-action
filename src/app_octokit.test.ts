import { generateKeyPairSync } from "node:crypto";
import { describe, it, expect, vi } from "vitest";
import { createAppAuth } from "@octokit/auth-app";
import { AppOctokit } from "./app_octokit";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

// newFetch returns a fetch which responds by "METHOD path" with the given
// statuses in order.
const newFetch = (routes: Record<string, number[]>) => {
  const counts: Record<string, number> = {};
  return vi.fn(async (url: string | URL, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${new URL(url).pathname}`;
    const statuses = routes[key];
    if (!statuses) {
      throw new Error(`unexpected request: ${key}`);
    }
    const i = counts[key] ?? 0;
    counts[key] = i + 1;
    const status = statuses[Math.min(i, statuses.length - 1)];
    const body =
      status >= 400
        ? {}
        : { id: 1, token: "ghs_x", expires_at: "2099-01-01T00:00:00Z" };
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
};

const calls = (fetch: ReturnType<typeof newFetch>, key: string) =>
  fetch.mock.calls.filter(
    ([url, init]) =>
      `${init?.method ?? "GET"} ${new URL(url).pathname}` === key,
  ).length;

describe("AppOctokit", () => {
  it("retries a GET request authenticated as the app", async () => {
    const fetch = newFetch({ "GET /repos/o/r/installation": [502, 200] });
    const octokit = new AppOctokit({
      authStrategy: createAppAuth,
      auth: { appId: 1, privateKey },
      request: { fetch },
      retry: { retryAfterBaseValue: 0 },
    });
    await octokit.rest.apps.getRepoInstallation({ owner: "o", repo: "r" });
    expect(calls(fetch, "GET /repos/o/r/installation")).toBe(2);
  });

  it("retries creating an installation access token", async () => {
    const fetch = newFetch({
      "POST /app/installations/1/access_tokens": [502, 201],
    });
    const octokit = new AppOctokit({
      authStrategy: createAppAuth,
      auth: { appId: 1, privateKey },
      request: { fetch },
      retry: { retryAfterBaseValue: 0 },
    });
    await octokit.rest.apps.createInstallationAccessToken({
      installation_id: 1,
    });
    expect(calls(fetch, "POST /app/installations/1/access_tokens")).toBe(2);
  });

  it("retries creating an installation access token for a GET request needing it", async () => {
    const fetch = newFetch({
      "POST /app/installations/1/access_tokens": [502, 201],
      "GET /repos/o/r": [200],
    });
    const octokit = new AppOctokit({
      authStrategy: createAppAuth,
      auth: { appId: 1, privateKey, installationId: 1 },
      request: { fetch },
      retry: { retryAfterBaseValue: 0 },
    });
    await octokit.rest.repos.get({ owner: "o", repo: "r" });
    expect(calls(fetch, "POST /app/installations/1/access_tokens")).toBe(2);
    expect(calls(fetch, "GET /repos/o/r")).toBe(1);
  });
});
