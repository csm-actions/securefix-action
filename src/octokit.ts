import * as github from "@actions/github";
import type { Octokit as CoreOctokit } from "@octokit/core";
import type { OctokitOptions } from "@octokit/core/types";
import { retry } from "@octokit/plugin-retry";

/** Methods of requests which are safe to retry */
const idempotentMethods = new Set(["GET", "HEAD"]);

/**
 * An Octokit plugin which disables retries of @octokit/plugin-retry for
 * requests other than GET and HEAD.
 *
 * A request which fails with e.g. a 5xx response may have succeeded on GitHub.
 * Retrying it can fail or duplicate the result, e.g. creating a pull request
 * fails because it already exists, or a comment is posted twice.
 *
 * It must be applied after @octokit/plugin-retry, so that its hook runs before
 * the hooks of @octokit/plugin-retry and they read the number of retries set by
 * it.
 */
export const retryOnlyIdempotentRequests = (octokit: CoreOctokit) => {
  octokit.hook.before("request", (options) => {
    if (!idempotentMethods.has(options.method)) {
      // Not mutate options.request, which can be shared with other requests
      options.request = { ...options.request, retries: 0 };
    }
  });
};

/** Plugins which retry GET and HEAD requests on transient errors */
export const retryPlugins = [retry, retryOnlyIdempotentRequests];

/**
 * Returns an Octokit like github.getOctokit, but it retries GET and HEAD
 * requests on transient errors such as 5xx responses.
 */
export const getOctokit = (
  token: string,
  options?: OctokitOptions,
): ReturnType<typeof github.getOctokit> =>
  github.getOctokit(token, options, ...retryPlugins);
