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
      - uses: actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8 # v6.0.1
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
