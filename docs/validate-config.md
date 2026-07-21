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
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
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
