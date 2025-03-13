# Server Commit Action

[action.yaml](action.yaml)

Server Commit Action creates a commit.

## Example

[Workflow](https://github.com/securefix-action/demo-server/blob/main/.github/workflows/securefix.yaml)

```yaml
name: Fix
on:
  label:
    types:
      - created
jobs:
  fix:
    if: startsWith(github.event.label.name, 'securefix-')
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    permissions: {}
    steps:
      - uses: securefix-action/action/server/prepare@main
        id: prepare
        with:
          app_id: ${{ vars.DEMO_SERVER_APP_ID }}
          app_private_key: ${{ secrets.DEMO_SERVER_PRIVATE_KEY }}
      - uses: securefix-action/action/server/commit@main
        with:
          app_id: ${{ vars.DEMO_SERVER_APP_ID }}
          app_private_key: ${{ secrets.DEMO_SERVER_PRIVATE_KEY }}
          outputs: ${{ toJson(steps.prepare.outputs) }}
```

## Inputs

### Required Inputs

- `app_id`: A GitHub App ID
- `app_private_key`: A GitHub App Private Key
- `outputs`: Server Prepare Action's outputs

```yaml
outputs: ${{ toJson(steps.prepare.outputs) }}
```

### Optional Inputs

- `commit_message`: A commit message
- `pull_request_comment`: A pull request comment template. A comment is posted if server actions fail to create a commit. The default value is `:x: Securefix failed.`

The priority of `commit_message` and `pull_request_comment`:

1. client action's input
1. server action's input
1. default value

## Outputs

Nothing.
