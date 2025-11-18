# `action: client`

[action.yaml](../action.yaml)

`action: client` uploads fixed files and metadata to GitHub Actions Artifacts and creates and deletes a GitHub Issue label to request fixing code to a server workflow.

## Example

[Workflow](https://github.com/securefix-action/demo-client/blob/main/.github/workflows/securefix.yaml)

```yaml
name: securefix
on: pull_request
jobs:
  test:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@71cf2267d89c5cb81562390fa70a37fa40b1305e # v6-beta
        with:
          persist-credentials: false

      # Fix code as you like
      - run: npm i -g prettier
      - run: prettier -w .

      # Send a request to a server workflow
      - uses: csm-actions/securefix-action@latest
        with:
          action: client
          app_id: ${{vars.DEMO_CLIENT_APP_ID}}
          app_private_key: ${{secrets.DEMO_CLIENT_PRIVATE_KEY}}
          server_repository: demo-server
```

### Push a commit to the other repository and branch

```yaml
- uses: csm-actions/securefix-action@latest
  with:
    action: client
    app_id: ${{vars.DEMO_CLIENT_APP_ID}}
    app_private_key: ${{secrets.DEMO_CLIENT_PRIVATE_KEY}}
    server_repository: demo-server
    # Push csm-actions/demo-client's foo branch
    repository: csm-actions/demo-client
    branch: foo
```

### Create a pull request

```yaml
- uses: csm-actions/securefix-action@latest
  with:
    action: client
    app_id: ${{vars.DEMO_CLIENT_APP_ID}}
    app_private_key: ${{secrets.DEMO_CLIENT_PRIVATE_KEY}}
    server_repository: demo-server
    # Push csm-actions/demo-client's foo branch
    repository: csm-actions/demo-client
    branch: foo
    # pull_request_title is required
    pull_request_title: Title
```

You can also configure pull request body, labels, reviewers, assignees, milestone, and so on.

```yaml
- uses: csm-actions/securefix-action@latest
  with:
    action: client
    app_id: ${{vars.AUTOFIX_TRIGGER_APP_ID}}
    app_private_key: ${{secrets.AUTOFIX_TRIGGER_APP_PRIVATE_KEY}}
    server_repository: securefix-demo-server
    repository: szksh-lab/test-delete-branch
    branch: test-2
    pull_request_title: PR title
    pull_request_base_branch: main
    pull_request_body: PR Body
    pull_request_draft: true
    pull_request_assignees: |
      suzuki-shunsuke
    pull_request_reviewers: |
      suzuki-shunsuke
    pull_request_team_reviewers: |
      sre
    pull_request_labels: |
      enhancement
      yo
    pull_request_comment: Hello, @suzuki-shunsuke
    milestone: 1
    automerge_method: squash
    project_owner: szksh-lab
    # project_number: 1
    project_id: PVT_kwDOCabuec4AlJMy
```

## Inputs

### Required Inputs

- `action`: This must be `client`
- `app_id`: A GitHub App ID
- `app_private_key`: A GitHub App Private Key
- `server_repository`: A GitHub Repository name where a server workflow works

### Optional Inputs

Some inputs like `pull_request_labels` accept multiple values separated by a newline.

```yaml
pull_request_labels: |
  enhancement
  yo
```

- `commit_message` ([v0.1.0](https://github.com/csm-actions/securefix-action/releases/tag/v0.1.0)): A commit message
- `fail_if_changes` ([v0.2.0](https://github.com/csm-actions/securefix-action/releases/tag/v0.2.0)): If true, the action fails if there are changes
- `repository` ([v0.2.0](https://github.com/csm-actions/securefix-action/releases/tag/v0.2.0)): A repository full name where a commit will be pushed. The Server GitHub App must be installed into this repository
- `branch` ([v0.2.0](https://github.com/csm-actions/securefix-action/releases/tag/v0.2.0)): A branch where a commit will be pushed
- `root_dir` ([v0.2.2](https://github.com/csm-actions/securefix-action/releases/tag/v0.2.2)): A root directory of fixed files
- `files` ([v0.2.0](https://github.com/csm-actions/securefix-action/releases/tag/v0.2.0)): A fixed files. By default, `git ls-files --modified --others --exclude-standard`. If `root_dir` is given, `files` must be relative paths from `root_dir`. Each file is separated by a newline.
- `pull_request_title` ([v0.2.0](https://github.com/csm-actions/securefix-action/releases/tag/v0.2.0)): A pull request title
- `pull_request_base_branch` ([v0.2.0](https://github.com/csm-actions/securefix-action/releases/tag/v0.2.0)): A pull request base branch. From v0.3.4, `pull_request_base_branch` becomes optional. By default the default branch is used
- `pull_request_body` ([v0.2.0](https://github.com/csm-actions/securefix-action/releases/tag/v0.2.0)): A pull request description
- `pull_request_labels` ([v0.2.0](https://github.com/csm-actions/securefix-action/releases/tag/v0.2.0)): Pull request labels. Each label is separated by a newline. The action doesn't create labels, so labels must exist.
- `pull_request_draft` ([v0.2.0](https://github.com/csm-actions/securefix-action/releases/tag/v0.2.0)): If true, create a pull request as draft
- `pull_request_reviewers` ([v0.2.0](https://github.com/csm-actions/securefix-action/releases/tag/v0.2.0)): Pull request reviewers. Each reviewer is separated by a newline.
- `pull_request_team_reviewers` ([v0.2.0](https://github.com/csm-actions/securefix-action/releases/tag/v0.2.0)): Pull request team reviewers. Each reviewer is separated by a newline.

> [!WARNING]
> `pull_request_team_reviewers` requires the `members:read` permission

- `pull_request_assignees` ([v0.2.0](https://github.com/csm-actions/securefix-action/releases/tag/v0.2.0)): Pull request assignees. Each assignee is separated by a newline.
- `pull_request_comment` ([v0.2.0](https://github.com/csm-actions/securefix-action/releases/tag/v0.2.0)): Pull request comment
- `project_owner` ([v0.3.2](https://github.com/csm-actions/securefix-action/releases/tag/v0.3.2)): GitHub Project Owner
- `project_number` ([v0.3.2](https://github.com/csm-actions/securefix-action/releases/tag/v0.3.2)): GitHub Project Number
- `project_id` ([v0.4.0](https://github.com/csm-actions/securefix-action/releases/tag/v0.4.0)): GitHub Project ID. `project_id` is better than `project_number` because `project_number` requires a GitHub API call to retrieve the project id everytime.

[You can retrieve the project id from project number using GitHub CLI:](https://cli.github.com/manual/gh_project_view)

```sh
# e.g. gh project view --owner szksh-lab 1 --format json --jq ".id"
gh project view --owner "<Project Owner>" "<Project Number>" --format json --jq ".id"
```

> [!WARNING]
> Adding pull requests to GitHub Projects requires Organization's `projects:write` permission. Also `allow_organization_projects_write` must be `true` in the server side.

```yaml
- uses: csm-actions/securefix-action@latest
  id: prepare
  with:
    action: prepare
    app_id: ${{ vars.AUTOFIX_APP_ID }}
    app_private_key: ${{ secrets.AUTOFIX_APP_PRIVATE_KEY }}
    allow_organization_projects_write: true # Required
```

- `milestone_number` ([v0.3.3](https://github.com/csm-actions/securefix-action/releases/tag/v0.3.3)): Milestone Number
- `automerge_method` ([v0.3.5](https://github.com/csm-actions/securefix-action/releases/tag/v0.3.5)): auto-merge method. One of `merge`, `squash`, and `rebase`. By default, auto-merge is disabled.

#### `fail_if_changes`

By default, this action fails if any files are changed, but if a commit is pushed to the other repository or branch, the action succeeds.
If `fail_if_changes` is `true`, this action fails if any files are changed.
If `fail_if_changes` is `false`, this action succeeds even if any files are changed.

#### `root_dir`

This is useful when the repository is checked out on the different path from `${{github.workspace}}`.

e.g.

```yaml
- uses: csm-actions/securefix-action@latest
  with:
    action: client
    app_id: ${{ vars.APP_ID }}
    app_private_key: ${{ secrets.APP_PRIVATE_KEY }}
    server_repository: demo-server
    root_dir: docs # By default, this is empty (${{github.workspace}})
    # files must be relative paths from root_dir
    files: index.html
```

## Outputs

Nothing.
