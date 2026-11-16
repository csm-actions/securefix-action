import { describe, it, expect, vi } from "vitest";
import { getOctokit, isGraphQLQuery } from "./octokit";

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

  it("doesn't retry a GET request on a 409 response", async () => {
    const fetch = newFetch([409]);
    await expect(
      newOctokit(fetch).request("GET /repos/{owner}/{repo}", {
        owner: "o",
        repo: "r",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries a GET request of a lowercase method", async () => {
    const fetch = newFetch([502, 200]);
    await newOctokit(fetch).request({ method: "get", url: "/repos/o/r" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("doesn't carry the retry count over to the next request", async () => {
    const fetch = newFetch([502, 502, 502, 200, 502, 200]);
    // The wait before a retry is (retry count + 1)^2 * 50 ms
    const octokit = getOctokit("token", {
      request: { fetch },
      retry: { retryAfterBaseValue: 50 },
    });
    await octokit.request("GET /repos/{owner}/{repo}", {
      owner: "o",
      repo: "r",
    });
    // The first wait of the second request is 50 ms. If the count of the first
    // request (3) were carried over, it would be (3 + 1)^2 * 50 = 800 ms
    const start = Date.now();
    await octokit.request("GET /repos/{owner}/{repo}", {
      owner: "o",
      repo: "r",
    });
    expect(Date.now() - start).toBeLessThan(400);
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it("retries a GraphQL query", async () => {
    const fetch = newFetch([502, 200]);
    await newOctokit(fetch).graphql(
      "query($owner: String!) { repository(owner: $owner) { id } }",
      { owner: "o" },
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("doesn't retry a GraphQL mutation", async () => {
    const fetch = newFetch([502, 200]);
    await expect(
      newOctokit(fetch).graphql(
        "mutation { addStar(input: {}) { clientMutationId } }",
      ),
    ).rejects.toMatchObject({ status: 502 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["blobs", "trees", "commits"])(
    "retries a request creating a Git object (%s)",
    async (kind) => {
      const fetch = newFetch([502, 201]);
      await newOctokit(fetch).request(
        `POST /repos/{owner}/{repo}/git/${kind}`,
        {
          owner: "o",
          repo: "r",
        },
      );
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );

  it("doesn't retry a request creating a ref", async () => {
    const fetch = newFetch([502, 201]);
    await expect(
      newOctokit(fetch).request("POST /repos/{owner}/{repo}/git/refs", {
        owner: "o",
        repo: "r",
        ref: "refs/heads/x",
        sha: "x",
      }),
    ).rejects.toMatchObject({ status: 502 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("doesn't retry a request updating a ref", async () => {
    const fetch = newFetch([502, 200]);
    await expect(
      newOctokit(fetch).request("PATCH /repos/{owner}/{repo}/git/refs/{ref}", {
        owner: "o",
        repo: "r",
        ref: "heads/main",
        sha: "x",
      }),
    ).rejects.toMatchObject({ status: 502 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("isGraphQLQuery", () => {
  it.each([
    "query { viewer { login } }",
    "query($a: Int) { x }",
    "{ viewer { login } }",
    "\n  # comment\n  query Q { x }",
  ])("returns true for %j", (document) => {
    expect(isGraphQLQuery(document)).toBe(true);
  });

  it.each([
    "mutation { x }",
    "subscription { x }",
    "\n  # query\n  mutation { x }",
    "queryX { x }",
    "query A { x } mutation B { y }",
    "{ x } subscription S { y }",
    undefined,
  ])("returns false for %j", (document) => {
    expect(isGraphQLQuery(document)).toBe(false);
  });
});
