# `action: commit`

[action.yaml](../action.yaml) | [Example](https://github.com/securefix-action/demo-server/blob/main/.github/workflows/securefix.yaml)

`action: commit` creates a commit and a pull request.

## Inputs

### Required Inputs

- [`outputs`: `action: prepare`'s outputs](prepare.md#outputs)

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
