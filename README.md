# Securefix Action

[![License](http://img.shields.io/badge/license-mit-blue.svg?style=flat-square)](https://raw.githubusercontent.com/securefix-action/action/main/LICENSE) | [Versioning Policy](https://github.com/suzuki-shunsuke/versioning-policy/blob/main/POLICY.md)

Securefix Action is GitHub Actions to fix code securely.

![image](https://github.com/user-attachments/assets/21ec46f9-3c9b-4314-8609-0ef1b8c25791)

![image](https://github.com/user-attachments/assets/5d854cf1-cff1-4af2-ab71-81cba3d8eb1d)

Securefix Action allows you to fix code securely without sharing a GitHub App private key with strong permissions such as `contents:write` and `actions:write` across GitHub Actions workflows.
You don't need to allow external services to access your code.
It elevates the security of your workflows to the next level.

Furthermore, it's easy to use.
You don't need to host a server application.
It achieves a server/client architecture using GitHub Actions by unique approach.

## Features

- 💪 Increase the developer productivity by fixing code in CI
- 🛡 Secure
  - You don't need to pass a GitHub App private key having strong permissions to GitHub Actions workflows on the client side
  - You don't need to allow external services to access your code
  - You can define custom validation before creating a commit
  - Commits are verified (signed)
- 😊 Easy to use
  - You can create a commit by one action on the client side
  - You don't need to host a server application
- 😉 [OSS (MIT License)](LICENSE)

## Overview

Sometimes you want to fix code in CI:

- Format code
- Generate document from code
- etc

In case of public repositories, we strongly recommend [autofix.ci](https://autofix.ci).
autofix.ci allows you to fix code in CI of pull requests including pull requests from fork repositories securely.
autofix.ci is easy to use, and it's free in public repositories. We love it.

autofix.ci is also available in private repositories, but perhaps it's a bit hard to use it in your private repositories for your business.

- It's not free, so you may have to submit a request to your company
- You need to allow the external server of autofix.ci to access your code. Perhaps you can't accept it
- If you don't receive pull requests from fork repositories, the reason to use autofix.ci might not be so string because you can fix code using actions such as [commit-action](https://github.com/suzuki-shunsuke/commit-action)

We think autofix.ci is valuable in private repositories too, but perhaps you can't use it.

If you use fix code in CI, you need to use an access token with `contents:write` permission.
But if the token is abused, malicious code can be committed.
For instance, an attacker can create a malicious commit to a pull request, and he may be able to approve and merge the pull request.
It's so dangerous.

To prevent such a threat, you should protect personal access tokens and GitHub Apps having strong permissions securely.

One solution is the client/server architecture.
Clients are GitHub Actions workflows that want to fix code.
They send a request to the server, then the server fix code.
You don't need to pass an access token having strong permissions to clients (GitHub Actions Workflows).

Then how do you build the server?
For instance, you would be able to build the server using AWS Lambda, Google Cloud Function, or k8s, and so on.
But we don't want to host such a server application.

So we build a server using GitHub Actions workflow by unique approach.
You don't need to host a server application.

## Example

- [demo-server](https://github.com/securefix-action/demo-server): [workflow](https://github.com/securefix-action/demo-server/blob/main/.github/workflows/securefix.yaml)
- [demo-client](https://github.com/securefix-action/demo-client): [workflow](https://github.com/securefix-action/demo-client/blob/main/.github/workflows/securefix.yaml)

## Architecture

Securefix Action adopts client/server architecture.
It uses following GitHub Apps, repositories, and workflows:

- two GitHub Apps
  - a Server GitHub App: a GitHub App to create commits
  - a Client GitHub App: a GitHub App to send requests to a server workflow
- Repositories
  - a Server repository: a repository where a server workflow works
  - Client repositories: repositories where client workflows work
- Workflows
  - a Server Workflow: Receive requests from client workflows and create commits
  - a Client Workflow: Request to fix code to the Server Workflow

![Image](https://github.com/user-attachments/assets/94781831-0aad-4513-ac92-fb5cfa859e19)

- Server: 1 GitHub App, 1 Repository
- Client: 1 GitHub App, N Repositories

![Image](https://github.com/user-attachments/assets/383de1da-a267-4f96-a86c-9151d66cebc5)

1. The client workflow uploads fixed files and metadata to GitHub Actions Artifacts
2. The client workflow creates an issue label to the server repository (The label is deleted immediately)
3. The server workflow is triggered by `label:created` event
4. The server workflow downloads fixed files and metadata from GitHub Actions Artifacts
5. The server workflow validates the request
6. The server workflow pushes a commit to the client repository

## Getting Started

1. Create two repositories from templates [demo-server](https://github.com/new?template_name=demo-server&template_owner=securefix-action) and [demo-client](https://github.com/new?template_name=demo-client&template_owner=securefix-action)
1. [Create a GitHub App for server](#github-app-for-server)
1. [Create a GitHub App for client](#github-app-for-client)
1. Create GitHub App private keys
1. [Add GitHub App's id and private keys to GitHub Secrets and Variables](#add-github-apps-id-and-private-keys-to-github-secrets-and-variables)
1. [Fix the server workflow if necessary](#fix-the-server-workflow-if-necessary)
1. [Fix the client workflow if necessary](#fix-the-client-workflow-if-necessary)
1. [Fix client' repository's `foo.yaml` and create a pull request](#fix-client-repositorys-fooyaml-and-create-a-pull-request)

### GitHub App for server

Deactivate Webhook.

Permissions:

- `contents:write`: To create commits
- `actions:read`: To download GitHub Actions Artifacts to fix code
- `workflows:write`: Optional. This is required if you want to fix GitHub Actions workflows
- `pull_requests:write`: To notify problems on the server side to pull requests

Installed Repositories: Install the app into the server repository and client repositories.

### GitHub App for client

Deactivate Webhook.

Permissions:

- `issues:write`: To create labels

Installed Repositories: Install the app into the server repository and client repositories.

### Add GitHub App's id and private keys to GitHub Secrets and Variables

Add GitHub App's private keys and ID to Repository Secrets and Variables

- client
  - id: client repository's variable `DEMO_CLIENT_APP_ID`
  - private key: client repository's Repository Secret `DEMO_CLIENT_PRIVATE_KEY`
- server
  - id: server repository's variable `DEMO_SERVER_APP_ID`
  - private key: server repository's Repository Secret `DEMO_SERVER_PRIVATE_KEY`

> [!WARNING]
> In the getting started, we add private keys to Repository Secrets simply.
> But when you use Securefix Action actually, you must manage the Server GitHub App's private key and the server workflow securely.
> Only the server workflow must be able to access the server app's private key.
> [See also `How to manage a server GitHub App and a server workflow`](#how-to-manage-a-server-github-app-and-a-server-workflow).

### Fix the server workflow if necessary

[Workflow](https://github.com/securefix-action/demo-server/blob/main/.github/workflows/securefix.yaml)

If you change a variable name and a secret name, please fix the workflow.

### Fix the client workflow if necessary

[Workflow](https://github.com/securefix-action/demo-client/blob/main/.github/workflows/securefix.yaml)

- If you change a variable name and a secret name, please fix the workflow
- If you change the server repository name, please fix the input `server_repository`

### Fix client' repository's `foo.yaml` and create a pull request

1. Fix client repository's `foo.yaml` ([Example](https://github.com/securefix-action/demo-client/pull/6/commits/ba0b0726a972e0b18cccddf8e4b28243bcdab5a4))

```diff
diff --git a/foo.yaml b/foo.yaml
index 74753a3..1cd9439 100644
--- a/foo.yaml
+++ b/foo.yaml
@@ -1,2 +1,2 @@
 names:
-  - foo
+- foo
```

2. Create a pull request ([Example](https://github.com/securefix-action/demo-client/pull/6)):

Then workflows are run and `foo.yaml` is fixed automatically:

![image](https://github.com/user-attachments/assets/d80e0f5e-451f-40b1-9eb8-4336e4c5fd4c)

![image](https://github.com/user-attachments/assets/0ed98d10-471a-4a85-a3a0-06e669a96931)

## Actions

Securefix Action composes of four actions:

- [securefix-action/action](docs/client.md) ([action.yaml](action.yaml)): Client action
- [securefix-action/action/server/prepare](server/prepare) ([action.yaml](server/prepare/action.yaml)): Server action to prepare for creating commits
- [securefix-action/action/server/commit](server/commit) ([action.yaml](server/commit/action.yaml)): Server action to create commits
- [securefix-action/action/server/notify](server/notify) ([action.yaml](server/notify/action.yaml)): Server action to notify the server failure

## Security

> - You don't need to pass a GitHub App private key having strong permissions to GitHub Actions workflows on the client side
> - You don't need to allow external services to access your code
> - You can define custom validation before creating a commit
> - Commits are verified (signed)

Client workflows can use a Client GitHub App, but it has only `issues:write` permission.
Even if the app is abused, the risk is low.
Server action creates a commit to the same repository and branch with the GitHub Actions Artifact.
So it doesn't allow attackers to create a malicious commit to a different repository or a different branch.

### How to manage a server GitHub App and a server workflow

You must protect a server GitHub App and a server workflow from attacks securely.
There are several ideas:

- GitHub App Private Key:
  - [Use GitHub Environment Secret](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment#deployment-protection-rules)
    - Restrict the branch
  - Use a secret manager such as AWS Secrets Manager and [restrict the access by OIDC claims (repository, event, branch, workflow, etc)](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
- Server Workflow
  - Restrict members having the write permission of the server repository
    - For instance, grant the write permission to only system administrators

### Custom Validation

You can insert custom validation between `server/prepare` action and `server/commit` action.
You can use [`server/prepare` action's outputs](server/prepare#outputs).

```yaml
- uses: securefix-action/action/server/prepare@c5696e3325f3906c5054ad80f3b9cdd92d65173b # v0.1.0
  id: prepare
  with:
    app_id: ${{ vars.DEMO_SERVER_APP_ID }}
    app_private_key: ${{ secrets.DEMO_SERVER_PRIVATE_KEY }}
# Custom Validation
- if: fromJson(steps.prepare.outputs.pull_request).user.login != 'suzuki-shunsuke'
  run: |
    exit 1
- uses: securefix-action/action/server/commit@c5696e3325f3906c5054ad80f3b9cdd92d65173b # v0.1.0
  with:
    outputs: ${{ toJson(steps.prepare.outputs) }}
- uses: securefix-action/action/server/notify@c5696e3325f3906c5054ad80f3b9cdd92d65173b # v0.1.0
  failure()
  with:
    outputs: ${{ toJson(steps.prepare.outputs) }}
```

## Design Details

### label event

Securefix Action uses `label` event to trigger a server workflow.
Generally `workflow_dispatch` and `repository_dispatch` events are used to trigger workflows by API, but they require either `repo:write` or `actions:write`.
These permissions are too strong.
So we looked for better events from [all events](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows), and we found `label` event.

## Troubleshooting

### Client Workflow Name

By default, the client workflow name must be `securefix` for security.
Otherwise, the server/prepare action fails.
[You can change the workflow name or remove the restriction using server/prepare action's `workflow_name` input.](server/prepare#optional-inputs)

### How To Fix Workflow Files

By default, Serverfix Action doesn't allow you to fix workflow files for security.
By default, the server action fails if fixed files include workflow files.
[You can allow it by setting server/prepare action's `allow_workflow_fix` to `true`.](server/prepare#optional-inputs)

### GitHub API Rate Limiting

If you use Server Action in many client repositories and face GitHub API limiting, you can avoid the rate limiting by creating new GitHub Apps and a server repository and splitting clients:

![Image](https://github.com/user-attachments/assets/34551fb7-6471-4bf2-bea1-c6056c005330)

Reference:

- [Rate Limit of REST API](https://docs.github.com/en/enterprise-cloud@latest/rest/using-the-rest-api/rate-limits-for-the-rest-api?apiVersion=2022-11-28)
- [Rate Limit of GraphQL API](https://docs.github.com/en/enterprise-cloud@latest/graphql/overview/rate-limits-and-node-limits-for-the-graphql-api)
