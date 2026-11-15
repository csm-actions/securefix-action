import { describe, it, expect, vi } from "vitest";
import { getOctokit } from "./octokit";

// newFetch returns a fetch which responds with the given statuses in order.
const newFetch = (statuses: number[]) => {
  let i = 0;
  return vi.fn(async () => {
    const status = statuses[Math.min(i, statuses.length - 1)];
    i++;
    return new Response(JSON.stringify(status < 400 ? { ok: true } : {}), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
};

const newOctokit = (fetch: ReturnType<typeof newFetch>) =>
  getOctokit("token", {
    request: { fetch },
    // Not wait between retries
    retry: { retryAfterBaseValue: 0 },
  });

describe("getOctokit", () => {
  it("retries a GET request on a 5xx response", async () => {
    const fetch = newFetch([502, 500, 200]);
    const { data } = await newOctokit(fetch).request(
      "GET /repos/{owner}/{repo}",
      { owner: "o", repo: "r" },
    );
    expect(data).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("gives up a GET request after 3 retries", async () => {
    const fetch = newFetch([502]);
    await expect(
      newOctokit(fetch).request("GET /repos/{owner}/{repo}", {
        owner: "o",
        repo: "r",
      }),
    ).rejects.toMatchObject({ status: 502 });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("doesn't retry a GET request on a 404 response", async () => {
    const fetch = newFetch([404]);
    await expect(
      newOctokit(fetch).request("GET /repos/{owner}/{repo}", {
        owner: "o",
        repo: "r",
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("doesn't retry a POST request on a 5xx response", async () => {
    const fetch = newFetch([502, 200]);
    await expect(
      newOctokit(fetch).request(
        "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
        { owner: "o", repo: "r", issue_number: 1, body: "x" },
      ),
    ).rejects.toMatchObject({ status: 502 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries a GET request after a POST request isn't retried", async () => {
    const fetch = newFetch([502, 502, 200]);
    const octokit = newOctokit(fetch);
    await expect(
      octokit.request("POST /repos/{owner}/{repo}/issues", {
        owner: "o",
        repo: "r",
        title: "x",
      }),
    ).rejects.toMatchObject({ status: 502 });
    const { data } = await octokit.request("GET /repos/{owner}/{repo}", {
      owner: "o",
      repo: "r",
    });
    expect(data).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
