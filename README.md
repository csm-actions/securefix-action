# Securefix Action

[![License](http://img.shields.io/badge/license-mit-blue.svg?style=flat-square)](https://raw.githubusercontent.com/securefix-action/action/main/LICENSE)

Securefix Action is GitHub Actions to fix code securely.

![image](https://github.com/user-attachments/assets/21ec46f9-3c9b-4314-8609-0ef1b8c25791)

![image](https://github.com/user-attachments/assets/5d854cf1-cff1-4af2-ab71-81cba3d8eb1d)

Securefix Action allows you to fix code securely without sharing a GitHub App private key having strong permissions such as `contents:write` and `actions:write` with GitHub Actions workflows.
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

![Image](https://github.com/user-attachments/assets/94781831-0aad-4513-ac92-fb5cfa859e19)

- Server: 1 GitHub App, 1 Repository
- Client: 1 GitHub App, N Repositories

![Image](https://github.com/user-attachments/assets/383de1da-a267-4f96-a86c-9151d66cebc5)

1. The client workflow uploads fixed files and metadata to GitHub Actions Artifacts
1. The client workflow creates an issue label to the server repository (The label is deleted immediately)
1. The server workflow is triggered by `label:created` event
1. The server workflow downloads fixed files and metadata from GitHub Actions Artifacts
1. The server workflow validates the request
1. The server workflow pushes a commit to the client repository

## Getting Started

1. Create two repositories
1. Create two GitHub Apps
1. Create GitHub App private keys to add them to GitHub Secrets
1. Add workflows

### GitHub App for server

Permissions:

- `contents:write`: To create commits
- `actions:read`: To download GitHub Actions Artifacts to fix code
- `workflows:write`: Optional. This is required if you want to fix GitHub Actions workfklows
- `pull_requests:write`: To notify problems on the server side to pull requests

Installed Repositories: Install the app into the server repository and client repositories.

### GitHub App for client

Permissions:

- `issues:write`: To create labels

Installed Repositories: Install the app into the server repository and client repositories.

### GitHub Apps' Private Keys

Coming soon.

### Workflows

- [Server workflow](https://github.com/securefix-action/demo-server/blob/main/.github/workflows/securefix.yaml)
- [Client workflow](https://github.com/securefix-action/demo-client/blob/main/.github/workflows/securefix.yaml)

## Actions

- [securefix-action/action](CLIENT.md) ([action.yaml](action.yaml)): Client action
- [securefix-action/action/server/prepare](server/prepare) ([action.yaml](server/prepare/action.yaml)): Server action to prepare for creating commits
- [securefix-action/action/server/commit](server/commit) ([action.yaml](server/commit/action.yaml)): Server action to create commits

## Security

> - You don't need to pass a GitHub App private key having strong permissions to GitHub Actions workflows on the client side
> - You don't need to allow external services to access your code
> - You can define custom validation before creating a commit
> - Commits are verified (signed)

Coming soon.

### Custom Validation

You can insert custom validation between `server/prepare` action and `server/commit` action.
You can use [`server/prepare` action's outputs](server/prepare#outputs).

```yaml
- uses: securefix-action/action/server/prepare@main
  id: prepare
  with:
    app_id: ${{ vars.DEMO_SERVER_APP_ID }}
    app_private_key: ${{ secrets.DEMO_SERVER_PRIVATE_KEY }}
# Custom Validation
- uses: securefix-action/action/server/commit@main
  with:
    app_id: ${{ vars.DEMO_SERVER_APP_ID }}
    app_private_key: ${{ secrets.DEMO_SERVER_PRIVATE_KEY }}
    outputs: ${{ toJson(steps.prepare.outputs) }}
```

## Design Details

Coming soon.

## Troubleshooting

### GitHub API Rate Limiting

Coming soon.

If you use Server Action in many client repositories and face GitHub API limiting, you can create new GitHub Apps and a server repository and split repositories:
