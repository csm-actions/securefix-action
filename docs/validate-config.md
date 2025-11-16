# `action: validate-config`

[action.yaml](../action.yaml)

`action: validate-config` validates the configuration in the server side.

## Example

[Workflow](https://github.com/csm-actions/demo-server/blob/main/.github/workflows/pull_request.yaml)

```yaml
---
name: test
on: pull_request
jobs:
  test:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0
        with:
          persist-credentials: false
      - uses: csm-actions/securefix-action@latest
        with:
          action: validate-config
          config_file: securefix-action.yaml
```

## Required Inputs

- `action`: This must be `validate-config`
- `config_file` or `config`
  - `config_file`: A configuration file path
  - `config`: A configuration content

## Outputs

Nothing.
