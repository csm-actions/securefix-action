import * as github from "@actions/github";
import type { Octokit as CoreOctokit } from "@octokit/core";
import type { OctokitOptions } from "@octokit/core/types";
import { retry } from "@octokit/plugin-retry";

/** Methods of requests which are safe to retry */
const idempotentMethods = new Set(["GET", "HEAD"]);

/**
 * Statuses which aren't retried: the default of @octokit/plugin-retry, and 409,
 * which a retry doesn't change, e.g. for an empty repository.
 */
const doNotRetry = [400, 401, 403, 404, 409, 410, 422, 451];

/**
 * Returns true if the document of a GraphQL request is a query, not a mutation
 * or a subscription. A query is either `query ...` or the shorthand `{ ... }`,
 * after whitespace and comments.
 */
export const isGraphQLQuery = (document: unknown): boolean => {
  if (typeof document !== "string") {
    return false;
  }
  const s = document.replace(/^(?:\s|,|#[^\n\r]*)*/, "");
  if (!s.startsWith("{") && !/^query\b/.test(s)) {
    return false;
  }
  // A document can have several operations, and operationName can select a
  // mutation which isn't the first one. Treat a document which has the word
  // anywhere as a mutation. A false match only disables retries
  return !/\b(?:mutation|subscription)\b/.test(s);
};

/**
 * Requests which create a Git object (a blob, a tree, or a commit). They are
 * POST requests, but safe to retry, because creating the same object again
 * doesn't change anything referenced. A commit created again may have another
 * SHA because of its date, but the extra one isn't referenced by any ref.
 */
const createGitObjectURL =
  /^\/repos\/[^/]+\/[^/]+\/git\/(?:blobs|trees|commits)$/;

/** Returns true if the request is safe to retry */
export const isIdempotentRequest = (options: {
  method: string;
  url: string;
  query?: unknown;
}): boolean => {
  const method = options.method.toUpperCase();
  if (idempotentMethods.has(method)) {
    return true;
  }
  if (method !== "POST") {
    return false;
  }
  if (createGitObjectURL.test(options.url)) {
    return true;
  }
  // A GraphQL query is a POST, but it only reads data
  return options.url.endsWith("/graphql") && isGraphQLQuery(options.query);
};

/**
 * An Octokit plugin which retries idempotent requests on transient errors such
 * as 5xx responses, with @octokit/plugin-retry: GET and HEAD requests,
 * requests creating a Git object, and GraphQL queries.
 *
 * Other requests aren't retried. A request which fails with e.g. a 5xx
 * response may have succeeded on GitHub. Retrying it can fail or duplicate the
 * result, e.g. creating a pull request fails because it already exists, or a
 * comment is posted twice.
 *
 * It applies @octokit/plugin-retry itself, and then registers its hook, so that
 * the hook runs before the hooks of @octokit/plugin-retry, which read the
 * number of retries set by it.
 */
export const retryIdempotentRequests = (
  octokit: CoreOctokit,
  octokitOptions: OctokitOptions,
) => {
  const plugin = retry(octokit, {
    ...octokitOptions,
    retry: {
      ...octokitOptions.retry,
      doNotRetry: octokitOptions.retry?.doNotRetry ?? doNotRetry,
    },
  });
  octokit.hook.before("request", (options) => {
    // Copy options.request for every request, because @octokit/plugin-retry
    // writes the retry count into it, and the original object can be shared
    // with other requests
    options.request = {
      ...options.request,
      ...(isIdempotentRequest(options) ? {} : { retries: 0 }),
    };
  });
  return plugin;
};

/**
 * Returns an Octokit like github.getOctokit, but it retries idempotent requests
 * on transient errors. See retryIdempotentRequests.
 */
export const getOctokit = (
  token: string,
  options?: OctokitOptions,
): ReturnType<typeof github.getOctokit> =>
  github.getOctokit(token, options, retryIdempotentRequests);
