# Server Prepare Action

[action.yaml](action.yaml) | [Workflow](https://github.com/securefix-action/demo-server/blob/main/.github/workflows/securefix.yaml)

Server Prepare Action prepares for creating a commit.

1. Download fixed files and metadata from GitHub Actions Artifacts
1. Get data about associated Workflow Run, Pull Request, and Branch by GitHub API
1. Validate the request
1. Output data for custom validation and creating a commit

## Inputs

### Required Inputs

- `app_id`: A GitHub App ID
- `app_private_key`: A GitHub App Private Key

### Optional Inputs

- `allow_workflow_fix`: Either `true` or `false`. The default is `false`. If `true`, the action can fix workflow files. You need to grant `workflows:write` permission to the Server GitHub App
- `workflow_name`: An expected client workflow name. If the actual client workflow name is different from this input, the request is denied. The default value is `securefix`. If this is empty, the workflow name is free
- `pull_request_comment`: A pull request comment template. A comment is posted if server actions fail to create a commit. The default value is `:x: Securefix failed.`
- `config`: YAML config to push other repositories and branches. Either `config` or `config_file` is required if you want to change repositories and branches where commits are pushed
- `config_file`: A file path to YAML config to push other repositories and branches. Either `config` or `config_file` is required if you want to change repositories and branches where commits are pushed

#### `config`, `config_file`

`config` and `config_file` are ignored if no repository or branch is set by the client action.
If a branch or repository is set, they are validated by config.
If there is no entry matching with source repository and branch and destination repository and branch.

```yaml
- uses: csm-actions/securefix-action/server/prepare@latest
  id: prepare
  with:
    app_id: ${{ vars.APP_ID }}
    app_private_key: ${{ secrets.APP_PRIVATE_KEY }}
    config: |
      entries:
        - client:
            repositories:
              - suzuki-shunsuke/tfaction
            branches:
              - main
          push:
            repositories:
              - suzuki-shunsuke/tfaction-docs
            branches:
              - gh-pages
```

:bulb: To improve the maintainability, we recommend `config_file` rather than `config`.

e.g. config.yaml

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/csm-actions/securefix-action/main/json-schema/config.json
entries:
  - client:
      repositories:
        - suzuki-shunsuke/tfaction-example
      branches:
        - main
    push:
      repositories:
        - suzuki-shunsuke/tfaction-example
      branches:
        - "scaffold-working-directory-*" # Glob
        - "follow-up-*" # Glob
    # Allow to create pull requests
    pull_request:
      # base_branches is required.
      # The pull request base branch must be included in base_branches.
      base_branches:
        - main
  - client:
      repositories:
        - suzuki-shunsuke/tfaction
      branches:
        - main
    push:
      repositories:
        - suzuki-shunsuke/tfaction-docs
      branches:
        - gh-pages
```

```yaml
- uses: actions/checkout@71cf2267d89c5cb81562390fa70a37fa40b1305e # v6-beta
  with:
    persist-credentials: false
    sparse-checkout: |
      config.yaml
    sparse-checkout-cone-mode: false
- uses: csm-actions/securefix-action/server/prepare@latest
  id: prepare
  with:
    app_id: ${{ vars.AUTOFIX_APP_ID }}
    app_private_key: ${{ secrets.AUTOFIX_APP_PRIVATE_KEY }}
    config_file: config.yaml
```

##### JSON Schema

You can validate the configuration file using JSON Schema.

main:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/csm-actions/securefix-action/main/json-schema/config.json
```

Specific version:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/csm-actions/securefix-action/v0.1.1/json-schema/config.json
```

## Outputs

- `pull_request`: A Pull Request Payload ([ref](https://docs.github.com/en/rest/pulls/pulls?apiVersion=2022-11-28#get-a-pull-request))
- `pull_request_number`: A Pull Request Number
- `workflow_run`: A Workflow Run Payload ([ref](https://docs.github.com/en/rest/actions/workflow-runs?apiVersion=2022-11-28#get-a-workflow-run))
- `client_repository`: A client repository's full name
- `destination_repository`: A destination repository's full name
- `branch`: A destination branch
- `repository_name`: A client repository's name
- `workflow_run_id`: A client workflow run id
- `metadata`: A request's metadata. It's a JSON string.

```json
{
  "context": {
    // github-script's context object
  },
  "inputs": {
    "commit_message": "commit message"
  }
}
```

`context` is a [github-script](https://github.com/actions/github-script)'s context object.

- `fixed_files`: Fixed file paths. Paths are separated with newlines
- `pull_request_comment`: A pull request comment template.

## Validate `config_file`

You can also validate the configuration file by GitHub Actions:

```yaml
- uses: csm-actions/securefix-action/js@latest
  with:
    action: validate-config
    config_file: config.yaml
```
