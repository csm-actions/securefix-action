# Server Commit Action

[action.yaml](action.yaml) | [Example](https://github.com/securefix-action/demo-server/blob/main/.github/workflows/securefix.yaml)

Server Commit Action creates a commit.

## Inputs

### Required Inputs

- `outputs`: Server Prepare Action's outputs

```yaml
outputs: ${{ toJson(steps.prepare.outputs) }}
```

### Optional Inputs

- `commit_message`: A commit message

The priority of `commit_message`:

1. client action's input
1. server action's input
1. default value

## Outputs

Nothing.
