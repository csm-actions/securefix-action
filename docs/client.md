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

- `commit_message`: A commit message
- `fail_if_changes`: If true, the action fails if there are changes
- `repository`: A repository full name where a commit will be pushed. The Server GitHub App must be installed into this repository
- `branch`: A branch where a commit will be pushed
- `pull_request_title`: A pull request title
- `pull_request_body`: A pull request description
- `pull_request_labels`: Pull request labels

> [!WARNING]
> `pull_request_labels` requires `issues:write` permission

- `pull_request_draft`: If true, create a pull request as draft
- `pull_request_reviewers`: Pull request reviewers
- `pull_request_team_reviewers`: Pull request team reviewers

> [!WARNING]
> `pull_request_team_reviewers` requires the `members:read` permission

- `pull_request_assignees`: Pull request assignees
- `pull_request_comment`: Pull request comment

#### `fail_if_changes`

By default, this action fails if any files are changed, but if a commit is pushed to the other repository or branch, the action succeeds.
If `fail_if_changes` is `true`, this action fails if any files are changed.
If `fail_if_changes` is `false`, this action succeeds even if any files are changed.

## Outputs

Nothing.
