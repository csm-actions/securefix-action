# Securefix Action

[![DeepWiki](https://img.shields.io/badge/DeepWiki-csm--actions%2Fsecurefix--action-blue.svg?logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACwAAAAyCAYAAAAnWDnqAAAAAXNSR0IArs4c6QAAA05JREFUaEPtmUtyEzEQhtWTQyQLHNak2AB7ZnyXZMEjXMGeK/AIi+QuHrMnbChYY7MIh8g01fJoopFb0uhhEqqcbWTp06/uv1saEDv4O3n3dV60RfP947Mm9/SQc0ICFQgzfc4CYZoTPAswgSJCCUJUnAAoRHOAUOcATwbmVLWdGoH//PB8mnKqScAhsD0kYP3j/Yt5LPQe2KvcXmGvRHcDnpxfL2zOYJ1mFwrryWTz0advv1Ut4CJgf5uhDuDj5eUcAUoahrdY/56ebRWeraTjMt/00Sh3UDtjgHtQNHwcRGOC98BJEAEymycmYcWwOprTgcB6VZ5JK5TAJ+fXGLBm3FDAmn6oPPjR4rKCAoJCal2eAiQp2x0vxTPB3ALO2CRkwmDy5WohzBDwSEFKRwPbknEggCPB/imwrycgxX2NzoMCHhPkDwqYMr9tRcP5qNrMZHkVnOjRMWwLCcr8ohBVb1OMjxLwGCvjTikrsBOiA6fNyCrm8V1rP93iVPpwaE+gO0SsWmPiXB+jikdf6SizrT5qKasx5j8ABbHpFTx+vFXp9EnYQmLx02h1QTTrl6eDqxLnGjporxl3NL3agEvXdT0WmEost648sQOYAeJS9Q7bfUVoMGnjo4AZdUMQku50McDcMWcBPvr0SzbTAFDfvJqwLzgxwATnCgnp4wDl6Aa+Ax283gghmj+vj7feE2KBBRMW3FzOpLOADl0Isb5587h/U4gGvkt5v60Z1VLG8BhYjbzRwyQZemwAd6cCR5/XFWLYZRIMpX39AR0tjaGGiGzLVyhse5C9RKC6ai42ppWPKiBagOvaYk8lO7DajerabOZP46Lby5wKjw1HCRx7p9sVMOWGzb/vA1hwiWc6jm3MvQDTogQkiqIhJV0nBQBTU+3okKCFDy9WwferkHjtxib7t3xIUQtHxnIwtx4mpg26/HfwVNVDb4oI9RHmx5WGelRVlrtiw43zboCLaxv46AZeB3IlTkwouebTr1y2NjSpHz68WNFjHvupy3q8TFn3Hos2IAk4Ju5dCo8B3wP7VPr/FGaKiG+T+v+TQqIrOqMTL1VdWV1DdmcbO8KXBz6esmYWYKPwDL5b5FA1a0hwapHiom0r/cKaoqr+27/XcrS5UwSMbQAAAABJRU5ErkJggg==)](https://deepwiki.com/csm-actions/securefix-action)
[![License](http://img.shields.io/badge/license-mit-blue.svg?style=flat-square)](https://raw.githubusercontent.com/csm-actions/securefix-action/main/LICENSE) | [Versioning Policy](https://github.com/suzuki-shunsuke/versioning-policy/blob/main/POLICY.md) | [NotebookLM](https://notebooklm.google.com/notebook/558f0a54-6ff2-4d3d-887d-427b3e0d2b13)

Securefix Action is GitHub Actions to fix code securely.

![image](https://github.com/user-attachments/assets/21ec46f9-3c9b-4314-8609-0ef1b8c25791)

![image](https://github.com/user-attachments/assets/5d854cf1-cff1-4af2-ab71-81cba3d8eb1d)

Securefix Action allows you to fix code securely without sharing a GitHub App private key with strong permissions such as `contents:write` across GitHub Actions workflows.
You don't need to allow external services to access your code.
It elevates the security of your workflows to the next level.

Furthermore, it's easy to use.
You don't need to host a server application.
It achieves a server/client architecture using GitHub Actions by unique approach.

## :bulb: NotebookLM And DeepWiki

- [Google NotebookLM](https://notebooklm.google.com/notebook/558f0a54-6ff2-4d3d-887d-427b3e0d2b13)
- [DeepWiki](https://deepwiki.com/csm-actions/securefix-action)

## :rocket: Recent Important Updates

- [v0.4.1 (2025-11)](https://github.com/csm-actions/securefix-action/releases/tag/v0.4.1)
  - The performance was drastically improved
- [v0.3.0 (2025-10)](https://github.com/csm-actions/securefix-action/releases/tag/v0.3.0)
  - :warning: If the repository or branch is changed, the source branch must be protected for security.
- [v0.2.0 (2025-07)](https://github.com/csm-actions/securefix-action/releases/tag/v0.2.0)
  - [You can now push commits to the other repository and branch securely](#push-to-other-repository-and-branch)
  - [You can now create pull requests](#create-pull-requests)
  - Fix a bug that it fails to push a commit if hidden files are included
  - :warning: [Delete labels on the server side](https://github.com/csm-actions/securefix-action/pull/164)

See also [Release Notes](https://github.com/csm-actions/securefix-action/releases).

## Features

- 💪 Increase the developer productivity by fixing code in CI
- 🛡 Secure
  - You don't need to pass a GitHub App private key with strong permissions to GitHub Actions workflows on the client side
  - You don't need to allow external services to access your code
  - You can define custom validation before creating a commit
  - Commits are verified (signed)
- 😊 Easy to use
  - You can create a commit by one action on the client side
  - You don't need to host a server application

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

One solution is [the Client/Server Model](https://github.com/securefix-action/client-server-model-docs).
Clients are GitHub Actions workflows that want to fix code.
They send a request to the server, then the server fix code.
You don't need to pass an access token with strong permissions to clients (GitHub Actions Workflows).

Then how do you build the server?
For instance, you would be able to build the server using AWS Lambda, Google Cloud Function, or k8s, and so on.
But we don't want to host such a server application.

So we build a server using GitHub Actions workflow by unique approach.
You don't need to host a server application.

## Example

- [demo-server](https://github.com/securefix-action/demo-server): [workflow](https://github.com/securefix-action/demo-server/blob/main/.github/workflows/securefix.yaml)
- [demo-client](https://github.com/securefix-action/demo-client): [workflow](https://github.com/securefix-action/demo-client/blob/main/.github/workflows/securefix.yaml)

## Architecture

Securefix Action adopts [the Client/Server Model](https://github.com/csm-actions/docs).
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
2. The client workflow creates an issue label to the server repository
3. The server workflow is triggered by `label:created` event
4. The server workflow deletes the issue label
5. The server workflow downloads fixed files and metadata from GitHub Actions Artifacts
6. The server workflow validates the request
7. The server workflow pushes a commit to the client repository

### :bulb: Why are labels used?

Securefix Action uses `label` event to trigger a server workflow.
Generally `repository_dispatch` events are used to trigger workflows by API, but they require the permission `actions:write`.
`actions:write` permissions is strong and dangerous, so we don't want to grant the permission.
So we looked for alternative events from [all events](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows), and we found `label` event.
Even if the permission is abused, the risk is low.

## Getting Started

1. Create two repositories from templates [demo-server](https://github.com/new?template_name=demo-server&template_owner=securefix-action) and [demo-client](https://github.com/new?template_name=demo-client&template_owner=securefix-action)
1. [Create a GitHub App for server](#github-app-for-server)
1. [Create a GitHub App for client](#github-app-for-client)
1. Create GitHub App private keys
1. [Add GitHub App's id and private keys to GitHub Secrets and Variables](#add-github-apps-id-and-private-keys-to-github-secrets-and-variables)
1. [Fix the server workflow if necessary](#fix-the-server-workflow-if-necessary)
1. [Fix the client workflow if necessary](#fix-the-client-workflow-if-necessary)
1. [Add a new file `bar.yaml` to client' repository and create a pull request](#add-a-new-file-baryaml-to-client-repository-and-create-a-pull-request)

### GitHub App for server

Deactivate Webhook.

Permissions:

- `contents:write`: To create commits
- `actions:read`: To download GitHub Actions Artifacts to fix code
- `pull_requests:write`: To notify problems on the server side to pull requests
- `workflows:write`: Optional. This is required if you want to fix GitHub Actions workflows
- `members:read`: Optional. This is required if you want to request reviews to teams
- Organization's `projects:write`: Optional. This is required if you want to add pull requests to GitHub Organization Projects

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

### Add a new file `bar.yaml` to client' repository and create a pull request

1. Add `bar.yaml` to client repository ([Example](https://github.com/securefix-action/demo-client/pull/8/commits/0a0103a3c319f08739632b72aef6b539377da11b))

bar.yaml:

```yaml
names:
  - bar
```

2. Create a pull request ([Example](https://github.com/securefix-action/demo-client/pull/8)):

Then workflows are run and `bar.yaml` is fixed automatically:

![image](https://github.com/user-attachments/assets/808b7348-f1a6-41ff-97fb-c4125f31ed14)

![image](https://github.com/user-attachments/assets/610668c2-a6e9-4c9b-a02a-381f9f1cd56a)

[commit](https://github.com/securefix-action/demo-client/pull/8/commits/e8b1f71602ecacd7948351fd197a55370bdc38dd)

```diff
--- a/bar.yaml
+++ b/bar.yaml
@@ -1,2 +1,2 @@
 names:
-- bar
+  - bar
```

### Push to other repository and branch

Securefix Action >= v0.2.0 [#123](https://github.com/csm-actions/securefix-action/pull/123)

By default, Securefix Action pushes a commit to the repository and branch where the action is run.
But actually there are usecases that you want to push a commit to other repository and branch.

- Scaffold a pull request by `workflow_dispatch`
- Update GitHub Pages
- Create a pull request to the repository A when the repository B is updated
- etc

Securefix Action can push a commit to the other repository and branch securely.
Allowing to push any repository and branch without any restriction is dangerous, so by default changing the repository and branch isn't allowed, meaning the action fails.
You can push a commit from only allowed repositories and branches to only allowed repositories and branches.
From Securefix Action v0.3.0, the source branch must be protected.

1. [Configure the server side](docs/prepare.md#config-config_file)
2. [Configure the client side](docs/client.md#push-a-commit-to-the-other-repository-and-branch)

### Create pull requests

When pushing a commit to the other repository and branch, you can also create a pull request.

1. [Configure the server side](docs/prepare.md#config-config_file)
2. [Configure the client side](docs/client.md#create-a-pull-request)

## Actions

Securefix Action is a single JavaScript Action.
It has an input `action`, which accepts the following values:

- [`client`: Client Action](docs/client.md)
- [`server`: Server Action](docs/server.md)
  - [`prepare`: Prepare for creating commits](docs/prepare.md)
  - [`commit`: Create commits](docs/commit.md)
  - [`notify`: Notify the failure to the client side](docs/notify.md)
- [`validate-config`: Validate the configuration file of the server side](docs/validate-config.md)

The `server` action is a single action that consolidates the `prepare`, `commit`, and `notify` actions.
In most cases, you can simply use the `server` action.

If you need more flexibility, you can use the individual `prepare`, `commit`, and `notify` actions instead.
For example, you can insert your own validation logic between `prepare` and `commit`, or implement custom notification handling instead of using the default `notify` action.

## Actions' Available Versions

As of Securefix Action v0.2.0, Securefix Action is released using [release-js-action](https://github.com/suzuki-shunsuke/release-js-action).
[About available versions, please see the document.](https://github.com/suzuki-shunsuke/release-js-action/blob/main/docs/available_versions.md)

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

You can insert custom validation between `prepare` action and `commit` action.
You can use [`prepare` action's outputs](docs/prepare.md#outputs).

```yaml
- uses: csm-actions/securefix-action@latest
  id: prepare
  with:
    action: prepare
    app_id: ${{ vars.DEMO_SERVER_APP_ID }}
    app_private_key: ${{ secrets.DEMO_SERVER_PRIVATE_KEY }}
# Custom Validation
- if: fromJson(steps.prepare.outputs.pull_request).user.login != 'suzuki-shunsuke'
  run: |
    exit 1
- uses: csm-actions/securefix-action@latest
  with:
    action: commit
    outputs: ${{ toJson(steps.prepare.outputs) }}
- uses: csm-actions/securefix-action@latest
  failure()
  with:
    action: notify
    outputs: ${{ toJson(steps.prepare.outputs) }}
```

## Troubleshooting

- [Error: No matching entry found in the config for the given repository and branch.](docs/codes/001.md)

### Client Workflow Name

By default, the client workflow name must be `securefix` for security.
Otherwise, the prepare action fails.
[You can change the workflow name or remove the restriction using prepare action's `workflow_name` input.](docs/prepare.md#optional-inputs)

### How To Fix Workflow Files

By default, Serverfix Action doesn't allow you to fix workflow files for security.
By default, the server action fails if fixed files include workflow files.
[You can allow it by setting prepare action's `allow_workflow_fix` to `true`.](docs/prepare.md#optional-inputs)

### GitHub API Rate Limiting

If you use Server Action in many client repositories and face GitHub API limiting, you can avoid the rate limiting by creating new GitHub Apps and a server repository and splitting clients:

![Image](https://github.com/user-attachments/assets/34551fb7-6471-4bf2-bea1-c6056c005330)

Reference:

- [Rate Limit of REST API](https://docs.github.com/en/enterprise-cloud@latest/rest/using-the-rest-api/rate-limits-for-the-rest-api?apiVersion=2022-11-28)
- [Rate Limit of GraphQL API](https://docs.github.com/en/enterprise-cloud@latest/graphql/overview/rate-limits-and-node-limits-for-the-graphql-api)
