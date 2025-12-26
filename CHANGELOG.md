# Changelog

## v0.4.1

[Issues](https://github.com/csm-actions/securefix-action/issues?q=is%3Aissue+is%3Aclosed+milestone%3Av0.4.1) | [Pull Requests](https://github.com/csm-actions/securefix-action/pulls?q=is%3Apr+is%3Aclosed+milestone%3Av0.4.1) | https://github.com/csm-actions/securefix-action/compare/v0.3.6...v0.4.1 | [Base revision](https://github.com/csm-actions/securefix-action/tree/e589497d69922a54440ea42d8a1c336795fc26c6)

## :warning: Breaking Changes :warning:

> [!IMPORTANT]
> Actions for server workflows support the client action v0.3.x, which means you can update actions for server workflows before updating client action to v0.4.

### 1. prepare, commit, notify, and js actions were removed. They were unified to csm-actions/securefix-action

Before:

```yaml
- uses: csm-actions/securefix-action/server/prepare@latest
```

After:

```yaml
- uses: csm-actions/securefix-action@latest
  with:
    action: prepare # client, prepare, commit, notify
```

### 2. `pull_request_team_reviewers` and `project_number` don't work by default anymore.

To assign team reviewers and add pull requests to projects, `allow_members_read` and `allow_organization_projects_write` must be true.

```yaml
- uses: csm-actions/securefix-action@latest
  with:
    action: prepare
    allow_members_read: true
    allow_organization_projects_write: true
```

### 3. Some outputs are removed from prepare action

- pull_request_number: Use the output `pull_request.number`
- workflow_run_id: Use the output `workflow_run.id`
- github_token_for_push: Use the output `github_token`
- root_dir:
- automerge_method: Use the output `create_pull_request.automerge_method`
- project_owner: Use the output `create_pull_request.project.owner`
- project_number: Use the output `create_pull_request.project.number`

## Performance Improvement

This release rewrites composite actions in a single JavaScript Action.
This improves the performance of both client and server drastically.

1. Speeding up Action download time
2. Rewriting shell scripts in Node.js
3. Converting composite actions into a single JavaScript Action to eliminate step-to-step overhead
4. Various smaller performance improvements such as deferring label removal, reducing the number of generated access tokens from two to one, and parallelizing API calls

Among these improvements, the most impactful is the reduction of **Action download time**.
A GitHub Actions job first runs the `Set up job` step, during which it downloads all actions referenced in the job.
The download time scales with the number of actions, and as that number increases, the cost becomes significant.

Originally, Securefix Action consisted of four composite actions, and each composite action depended on additional actions.
As a result, the entire job depended on a considerable number of actions, leading to noticeable download time.

This release dramatically reduces that download time by rewriting all of these actions into a **single JavaScript Action**.
By switching behavior based on the `action` input, the new implementation can still perform the same four types of processing as before.

```yaml
- uses: csm-actions/securefix-action@latest
  with:
    action: prepare # client, prepare, commit, notify
```

- GitHub Actions downloads only single action.

## `issues:write` permission is unnecessary

This release fixes the wrong document.
`pull_request_labels` don't require `issues:write` permission.
But note that this action doesn't create labels.
Labels must exist in advance.

## Features

1. Support `project_id`. project_id can be used instead of `project_number`. If `project_number` is used, the action retrieves the project id by GitHub API. By setting `project_id`, the action doesn't need to call GitHub API to get the project id.
1. Support the new action `server`, which merges actions `prepare`, `commit`, and `notify`

Before:

```yaml
- uses: csm-actions/securefix-action@latest
  id: prepare
  with:
    action: prepare
    app_id: ${{ vars.AUTOFIX_APP_ID }}
    app_private_key: ${{ secrets.AUTOFIX_APP_PRIVATE_KEY }}
    allow_workflow_fix: true
    allow_members_read: true
    allow_organization_projects_write: true
    config_file: config.yaml
    workflow_name: ""
- uses: csm-actions/securefix-action@latest
  with:
    action: commit
    outputs: ${{ toJson(steps.prepare.outputs) }}
- uses: csm-actions/securefix-action@latest
  if: failure()
  with:
    action: notify
    outputs: ${{ toJson(steps.prepare.outputs) }}
      - uses: csm-actions/securefix-action@latest
        with:
          action: server
          app_id: ${{ vars.AUTOFIX_APP_ID }}
          app_private_key: ${{ secrets.AUTOFIX_APP_PRIVATE_KEY }}
          allow_workflow_fix: true
          allow_members_read: true
          allow_organization_projects_write: true
          config_file: config.yaml
          workflow_name: ""
```

After:

```yaml
- uses: csm-actions/securefix-action@latest
  with:
    action: server
    app_id: ${{ vars.AUTOFIX_APP_ID }}
    app_private_key: ${{ secrets.AUTOFIX_APP_PRIVATE_KEY }}
    allow_workflow_fix: true
    allow_members_read: true
    allow_organization_projects_write: true
    config_file: config.yaml
    workflow_name: ""
```

3. Improve pull request comments

The error message is added.

<img width="966" height="369" alt="image" src="https://github.com/user-attachments/assets/ea9e1a08-281d-4f82-9b8d-f9e66c21ae57" />

You can post the error of commit action by passing the error to notify action via `commit_error` input.

```yaml
- uses: csm-actions/securefix-action@latest
  id: commit
  with:
    action: commit
    outputs: ${{ toJson(steps.prepare.outputs) }}
- uses: csm-actions/securefix-action@latest
  if: failure()
  with:
    action: notify
    outputs: ${{ toJson(steps.prepare.outputs) }}
    commit_error: ${{steps.commit.outputs.error}}
```

4. Embed github-comment metadata.

```html
<!-- github-comment: {"SHA1":"30a47811124cc53ea812075a8b1b20134264574f","Program":"securefix-action","TemplateKey":"notify"} -->
```

5. Log links to client workflow run, pull request, and posted comment.

<img width="916" height="353" alt="image" src="https://github.com/user-attachments/assets/205376f3-a5fb-4d3f-964b-3a08356f5530" />

6. Skip a pr comment when `Update is not a fast forward`.

## v0.3.6

[Issues](https://github.com/csm-actions/securefix-action/issues?q=is%3Aissue+is%3Aclosed+milestone%3Av0.3.6) | [Pull Requests](https://github.com/csm-actions/securefix-action/pulls?q=is%3Apr+is%3Aclosed+milestone%3Av0.3.6) | https://github.com/csm-actions/securefix-action/compare/v0.3.5...v0.3.6 | [Base revision](https://github.com/csm-actions/securefix-action/tree/f9cf7410433db80d5111f58b4f858c16e885f11e)

## 🐛 Bug Fixes

#337 Fix invalid template errors by fromJSON

## v0.3.5

[Issues](https://github.com/csm-actions/securefix-action/issues?q=is%3Aissue+is%3Aclosed+milestone%3Av0.3.5) | [Pull Requests](https://github.com/csm-actions/securefix-action/pulls?q=is%3Apr+is%3Aclosed+milestone%3Av0.3.5) | https://github.com/csm-actions/securefix-action/compare/v0.3.4...v0.3.5 | [Base revision](https://github.com/csm-actions/securefix-action/tree/2a811220ee23a47fdcd8787456a40bd013b46dfd)

## Features

#317 Support enabling `auto-merge` after creating pull requests

You can enable auto-merge after creating pull requests.
To use this feature, you need to set the input `automerge_method` of the client action.

e.g.

```yaml
- uses: csm-actions/securefix-action@latest
  with:
    app_id: ${{vars.APP_ID}}
    app_private_key: ${{secrets.APP_PRIVATE_KEY}}
    server_repository: securefix-demo-server
    branch: test-4
    pull_request_title: Title
    pull_request_base_branch: develop
    automerge_method: "squash" # Enable auto-merge. The merge method is `squash`
```

## v0.3.4

[Issues](https://github.com/csm-actions/securefix-action/issues?q=is%3Aissue+is%3Aclosed+milestone%3Av0.3.4) | [Pull Requests](https://github.com/csm-actions/securefix-action/pulls?q=is%3Apr+is%3Aclosed+milestone%3Av0.3.4) | https://github.com/csm-actions/securefix-action/compare/v0.3.3...v0.3.4 | [Base revision](https://github.com/csm-actions/securefix-action/tree/3f37d71b39c10d9e23d6cdc63ac8ef1a841d1451)

## Features

#309 Use the default branch as the default value of `pull_request_base_branch`

## v0.3.3

[Issues](https://github.com/csm-actions/securefix-action/issues?q=is%3Aissue+is%3Aclosed+milestone%3Av0.3.3) | [Pull Requests](https://github.com/csm-actions/securefix-action/pulls?q=is%3Apr+is%3Aclosed+milestone%3Av0.3.3) | https://github.com/csm-actions/securefix-action/compare/v0.3.2...v0.3.3 | [Base revision](https://github.com/csm-actions/securefix-action/tree/0888bf6a5ab198d450120005fcbf6078af4caf5b)

## Features

#308 Support adding pull requests to milestones

e.g.

```yaml
- uses: csm-actions/securefix-action@latest
  with:
    app_id: ${{vars.APP_ID}}
    app_private_key: ${{secrets.APP_PRIVATE_KEY}}
    server_repository: securefix-demo-server
    branch: test-1
    pull_request_title: Title
    pull_request_base_branch: main
    milestone_number: 1 # Add a created pull request to the milestone
```

## v0.3.2

[Issues](https://github.com/csm-actions/securefix-action/issues?q=is%3Aissue+is%3Aclosed+milestone%3Av0.3.2) | [Pull Requests](https://github.com/csm-actions/securefix-action/pulls?q=is%3Apr+is%3Aclosed+milestone%3Av0.3.2) | https://github.com/csm-actions/securefix-action/compare/v0.3.1...v0.3.2 | [Base revision](https://github.com/csm-actions/securefix-action/tree/0b643ec4aac158e391d10e20424d7050779a3add)

## Features

#304 Support adding created pull requests to GitHub Organization Projects

## v0.3.1

[Issues](https://github.com/csm-actions/securefix-action/issues?q=is%3Aissue+is%3Aclosed+milestone%3Av0.3.1) | [Pull Requests](https://github.com/csm-actions/securefix-action/pulls?q=is%3Apr+is%3Aclosed+milestone%3Av0.3.1) | https://github.com/csm-actions/securefix-action/compare/v0.3.0...v0.3.1 | [Base revision](https://github.com/csm-actions/securefix-action/tree/e73ef8ff1b196bdef9b687a9d2c3bf134447aad8)

## 🐛 Bug Fixes

#303 Fix a bug that it fails to push a commit to other repositories

## v0.3.0

[Issues](https://github.com/csm-actions/securefix-action/issues?q=is%3Aissue+is%3Aclosed+milestone%3Av0.3.0) | [Pull Requests](https://github.com/csm-actions/securefix-action/pulls?q=is%3Apr+is%3Aclosed+milestone%3Av0.3.0) | https://github.com/csm-actions/securefix-action/compare/v0.2.2...v0.3.0 | [Base revision](https://github.com/csm-actions/securefix-action/tree/0733ec3787ee85cb3f13220c89bbcddaef2f0341)

## ⚠️ Breaking Changes

#301 If the repository or branch is changed, the source branch must be protected for security.

## Features

#301 Support glob in configuration

## v0.2.2

[Issues](https://github.com/csm-actions/securefix-action/issues?q=is%3Aissue+is%3Aclosed+milestone%3Av0.2.2) | [Pull Requests](https://github.com/csm-actions/securefix-action/pulls?q=is%3Apr+is%3Aclosed+milestone%3Av0.2.2) | https://github.com/csm-actions/securefix-action/compare/v0.2.1...v0.2.2 | [Base revision](https://github.com/csm-actions/securefix-action/tree/da7f64b3d2860f8986d29eb6ea0933007f928f51)

## Features

#208 Support specifying the root directory path of fixed files

The input `root_dir` is added to the client action.

e.g.

```yaml
- uses: csm-actions/securefix-action@latest
  with:
    app_id: ${{ vars.APP_ID }}
    app_private_key: ${{ secrets.APP_PRIVATE_KEY }}
    server_repository: demo-server
    root_dir: docs # By default, this is empty (${{github.workspace}})
    # files must be relative paths from root_dir
    files: index.html
```

This is useful when the repository is checked out on the different path from `${{github.workspace}}`.

## v0.2.1

[Issues](https://github.com/csm-actions/securefix-action/issues?q=is%3Aissue+is%3Aclosed+milestone%3Av0.2.1) | [Pull Requests](https://github.com/csm-actions/securefix-action/pulls?q=is%3Apr+is%3Aclosed+milestone%3Av0.2.1) | https://github.com/csm-actions/securefix-action/compare/v0.2.0...v0.2.1 | [Base revision](https://github.com/csm-actions/securefix-action/tree/2e2ade3d5d76b24c05466d279cbce3e294f1d6e4)

## 🐛 Bug Fixes

#210 Fix a bug that labels can't be deleted

```
Run gh label delete --yes "$LABEL_NAME" || :
failed to run git: fatal: not a git repository (or any of the parent directories): .git
```

#211 Fix a bug that the notification isn't sent when the server workflow failed

## Others

#209 Replace the GitHub Action tibdex/github-app-token with actions/create-github-app-token

tibdex/github-app-token was archived.

## v0.2.0

[Issues](https://github.com/csm-actions/securefix-action/issues?q=is%3Aissue+is%3Aclosed+milestone%3Av0.2.0) | [Pull Requests](https://github.com/csm-actions/securefix-action/pulls?q=is%3Apr+is%3Aclosed+milestone%3Av0.2.0) | https://github.com/csm-actions/securefix-action/compare/v0.1.0...v0.2.0 | [Base revision](https://github.com/csm-actions/securefix-action/tree/5970e1bc9bb1de9ee0dedf1ea0258bfb723fd054)

## Overview

- Breaking Changes
  - #164 The process label deletion was moved from the client side to the server side
- Features
  - #123 Support pushing a commit to another repository and branch
  - #123 Support creating a pull request when pushing a commit to another repository and branch
  - #123 Support specifying files to be pushed
- Bug Fixes
  - Fix a bug that it fails to push a commit if hidden files are included

## ⚠️ Breaking Changes

#164 The process label deletion was moved from the client side to the server side

The server side requires the permission `issues:write` to delete labels.

```yaml
jobs:
  fix:
    permissions: issues:write
```

## Features

You can now change the repository and branch where a commit is pushed.
And you can also create pull requests.

### Why?

By default, Securefix Action pushes a commit to the repository and branch where the action is run.
But actually there are usecases that you want to push a commit to other repository and branch.

- Scaffold a pull request by `workflow_dispatch`
- Update GitHub Pages
- Create a pull request to the repository A when the repository B is updated
- etc

### Security

Allowing to push any repository and branch without any restriction is dangerous, so by default changing the repository and branch isn't allowed, meaning it the action fails.
You can change the repository and branch only if they are allowed.

### ⚠️ Additional Permissions

Additional Permissions of the server app are required if some inputs are given.

- `issues:write`: This is required if the input `pull_request_labels` is set
- `members:read`: This is required if the input `pull_request_team_reviewers` is set

### How to use

1. (Optional) Grant additional permissions to the server app (`issues:write` and `members:read`)
1. Add the input `config` or `config_file` to `csm-actions/securefix-action/server/prepare` in the server workflow:

```yaml
- uses: csm-actions/securefix-action/server/prepare@latest
  id: prepare
  with:
    app_id: ${{ vars.APP_ID }}
    app_private_key: ${{ secrets.APP_PRIVATE_KEY }}
    config: |
      entries:
        - client:
            repositories:
              - suzuki-shunsuke/tfaction-example
            branches:
              - main
          push:
            repositories:
              - suzuki-shunsuke/tfaction-example
            branches:
              - "scaffold-working-directory-*" # Glob
              - "follow-up-*" # Glob
        - client:
            repositories:
              - suzuki-shunsuke/tfaction
            branches:
              - main
          push:
            repositories:
              - suzuki-shunsuke/tfaction-docs
            branches:
              - gh-pages
```

:bulb: To improve the maintainability, it's good to manage config in a dedicated file and read it from action.

e.g.

```yaml
- uses: actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8 # v6.0.1
  with:
    persist-credentials: false
    sparse-checkout: |
      config.yaml
    sparse-checkout-cone-mode: false
- uses: csm-actions/securefix-action/server/prepare@latest
  id: prepare
  with:
    app_id: ${{ vars.AUTOFIX_APP_ID }}
    app_private_key: ${{ secrets.AUTOFIX_APP_PRIVATE_KEY }}
    config_file: config.yaml
```

3. (Optional) Add the workflow to validate config in the server repository

e.g.

```yaml
---
name: Validate Config
on: pull_request
jobs:
  validate-config:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8 # v6.0.1
        with:
          persist-credentials: false
          sparse-checkout: |
            config.yaml
          sparse-checkout-cone-mode: false

      - uses: csm-actions/securefix-action/js@latest
        with:
          action: validate-config
          config_file: config.yaml
```

4. Specify the repository and branch to be pushed in the client workflow:

```yaml
- uses: csm-actions/securefix-action@latest
  with:
    app_id: ${{ vars.APP_ID }}
    app_private_key: ${{ secrets.APP_PRIVATE_KEY }}
    server_repository: securefix-demo-server
    # Push csm-actions/demo-client's foo branch
    repository: csm-actions/demo-client
    branch: foo
```

### New Inputs and Outputs of actions

All of them are optional.

#### csm-actions/securefix-action

`repository` or `branch` is required if you want to change them.

- `repository`: A repository full name where a commit will be pushed. By default, this is `$GITHUB_REPOSITORY`
- `branch`: A branch where a commit will be pushed. By default, this is a branch where the action is run

--

`pull_request_title` and `pull_request_base_branch` are required if you want to create a pull request.

- `pull_request_title`: A pull request title
- `pull_request_body`: A pull request description
- `pull_request_labels`: Pull request labels. This requires `issues:write` permission
- `pull_request_draft`: If true, create a pull request as draft
- `pull_request_reviewers`: Pull request reviewers
- `pull_request_team_reviewers`: Pull request team reviewers. This requires the `members:read` permission
- `pull_request_assignees`: Pull request assignees
- `pull_request_comment`: Pull request comment

--

- `fail_if_changes`: If true, the action fails if there are changes

By default, the client action fails if any files are changed, but if a commit is pushed to the other repository or branch, the action succeeds.
If `fail_if_changes` is `true`, the client action fails if any files are changed.
If `fail_if_changes` is `false`, the client action succeeds even if any files are changed.

#### csm-actions/securefix-action/server/prepare

Either `config` or `config_file` is required to change the repository and branch.

- `config`: YAML config to push other repositories and branches
- `config_file`: A file path to YAML config

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/csm-actions/securefix-action/main/json-schema/config.json
entries:
  - source:
      repositories:
        - suzuki-shunsuke/tfaction-example
      branches:
        - main
    destination:
      pull_request: true
      repositories:
        - suzuki-shunsuke/tfaction-example
      branches:
        - "scaffold-working-directory-*" # Glob
        - "follow-up-*" # Glob
  - source:
      repositories:
        - suzuki-shunsuke/tfaction
      branches:
        - main
    destination:
      repositories:
        - suzuki-shunsuke/tfaction-docs
      branches:
        - gh-pages
```

config is ignored if no repository or branch is set by the client action.
If branch or repository is set, they are validated config.
If there is no entry matching with source repository and branch and destination repository and branch.

## v0.1.0

🎉 First Release
