# `action: notify`

[action.yaml](../action.yaml)

`action: notify` notifies the failure.

![image](https://github.com/user-attachments/assets/3a06184f-2566-4863-9b2f-20548b8bc990)

## Inputs

### Required Inputs

- [`outputs`: `action: prepare`'s outputs](prepare.md#outputs)

```yaml
outputs: ${{ toJson(steps.prepare.outputs) }}
```

### Optional Inputs

- `pull_request_comment`: A pull request comment template. A comment is posted if server actions fail to create a commit. The default value is `## :x: Securefix failed.`

## Outputs

Nothing.
