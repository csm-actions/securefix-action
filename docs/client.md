# Client Action

[action.yaml](../action.yaml)

Client Action uploads fixed files and metadata to GitHub Actions Artifacts and creates and deletes a GitHub Issue label to request fixing code to a server workflow.

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
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
        with:
          persist-credentials: false

      # Fix code as you like
      - run: npm i -g prettier
      - run: prettier -w .

      # Send a request to a server workflow
      - uses: csm-actions/securefix-action@latest
        with:
          app_id: ${{vars.DEMO_CLIENT_APP_ID}}
          app_private_key: ${{secrets.DEMO_CLIENT_PRIVATE_KEY}}
          server_repository: demo-server
```

### Push a commit to the other repository and branch

```yaml
- uses: csm-actions/securefix-action@latest
  with:
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
    app_id: ${{vars.DEMO_CLIENT_APP_ID}}
    app_private_key: ${{secrets.DEMO_CLIENT_PRIVATE_KEY}}
    server_repository: demo-server
    # Push csm-actions/demo-client's foo branch
    repository: csm-actions/demo-client
    branch: foo
    # pull_request_title and pull_request_base_branch are required
    pull_request_title: Title
    pull_request_base_branch: main
```

You can also configure pull request body, labels, reviewers, assignees, and so on.

```yaml
- uses: csm-actions/securefix-action@latest
  with:
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
```

## Inputs

### Required Inputs

- `app_id`: A GitHub App ID
- `app_private_key`: A GitHub App Private Key
- `server_repository`: A GitHub Repository name where a server workflow works

### Optional Inputs

- `commit_message` ([v0.1.0](https://github.com/csm-actions/securefix-action/releases/tag/v0.1.0)): A commit message
- `fail_if_changes` ([v0.2.0](https://github.com/csm-actions/securefix-action/releases/tag/v0.2.0)): If true, the action fails if there are changes
- `repository` ([v0.2.0](https://github.com/csm-actions/securefix-action/releases/tag/v0.2.0)): A repository full name where a commit will be pushed. The Server GitHub App must be installed into this repository
- `branch` ([v0.2.0](https://github.com/csm-actions/securefix-action/releases/tag/v0.2.0)): A branch where a commit will be pushed
- `root_dir` ([v0.2.2](https://github.com/csm-actions/securefix-action/releases/tag/v0.2.2)): A root directory of fixed files
- `files` ([v0.2.0](https://github.com/csm-actions/securefix-action/releases/tag/v0.2.0)): A fixed files. By default, `git ls-files --modified --others --exclude-standard`. If `root_dir` is given, `files` must be relative paths from `root_dir`
- `pull_request_title` ([v0.2.0](https://github.com/csm-actions/securefix-action/releases/tag/v0.2.0)): A pull request title
- `pull_request_body` ([v0.2.0](https://github.com/csm-actions/securefix-action/releases/tag/v0.2.0)): A pull request description
- `pull_request_labels` ([v0.2.0](https://github.com/csm-actions/securefix-action/releases/tag/v0.2.0)): Pull request labels

> [!WARNING]
> `pull_request_labels` requires `issues:write` permission

- `pull_request_draft` ([v0.2.0](https://github.com/csm-actions/securefix-action/releases/tag/v0.2.0)): If true, create a pull request as draft
- `pull_request_reviewers` ([v0.2.0](https://github.com/csm-actions/securefix-action/releases/tag/v0.2.0)): Pull request reviewers
- `pull_request_team_reviewers` ([v0.2.0](https://github.com/csm-actions/securefix-action/releases/tag/v0.2.0)): Pull request team reviewers

> [!WARNING]
> `pull_request_team_reviewers` requires the `members:read` permission

- `pull_request_assignees` ([v0.2.0](https://github.com/csm-actions/securefix-action/releases/tag/v0.2.0)): Pull request assignees
- `pull_request_comment` ([v0.2.0](https://github.com/csm-actions/securefix-action/releases/tag/v0.2.0)): Pull request comment

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
    app_id: ${{ vars.APP_ID }}
    app_private_key: ${{ secrets.APP_PRIVATE_KEY }}
    server_repository: demo-server
    root_dir: docs # By default, this is empty (${{github.workspace}})
    # files must be relative paths from root_dir
    files: index.html
```

## Outputs

Nothing.
