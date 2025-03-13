# Server Notify Action

[action.yaml](action.yaml) | [Example](https://github.com/securefix-action/demo-server/blob/main/.github/workflows/securefix.yaml)

Server Notify Action notifies the failure.

![image](https://github.com/user-attachments/assets/014ac821-2609-4e7b-be3f-3076c7250491)

## Inputs

### Required Inputs

- `outputs`: Server Prepare Action's outputs

```yaml
outputs: ${{ toJson(steps.prepare.outputs) }}
```

### Optional Inputs

- `pull_request_comment`: A pull request comment template. A comment is posted if server actions fail to create a commit. The default value is `## :x: Securefix failed.`

## Outputs

Nothing.
