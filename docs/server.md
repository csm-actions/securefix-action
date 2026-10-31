# `action: server`

[action.yaml](../action.yaml) | [Example](https://github.com/securefix-action/demo-server/blob/main/.github/workflows/securefix.yaml)

`action: server` creates commits and pull requests.

1. Download fixed files and metadata from GitHub Actions Artifacts
1. Get data about associated Workflow Run, Pull Request, and Branch by GitHub API
1. Validate the request
1. Create a commit
1. Create a pull request if it is requested
1. Update the pull request if it is requested

## Inputs

### Required Inputs

- `action`: Must be `server`
- `app_id`: A GitHub App ID
- `app_private_key`: A GitHub App Private Key

### Optional Inputs

- `allow_workflow_fix`: Either `true` or `false`. The default is `false`. If `true`, the action can fix workflow files. You need to grant `workflows:write` permission to the Server GitHub App
- `workflow_name`: An expected client workflow name. If the actual client workflow name is different from this input, the request is denied. The default value is `securefix`. If this is empty, the workflow name is free
- `pull_request_comment`: A pull request comment template. A comment is posted if server actions fail to create a commit. The default value is `:x: Securefix failed.`
- `config`: YAML config to push other repositories and branches. Either `config` or `config_file` is required if you want to change repositories and branches where commits are pushed
- `config_file`: A file path to YAML config to push other repositories and branches. Either `config` or `config_file` is required if you want to change repositories and branches where commits are pushed
- `commit_message`: A commit message
- `pull_request_comment`: A pull request comment template. A comment is posted if server actions fail to create a commit. The default value is `## :x: Securefix failed.`

#### workflow_dispatch

When the server workflow is run by a `workflow_dispatch` event (v0.7.0), the following inputs are read from the event by default, so you don't need to set them:

- `artifact_name`: The name of the artifact uploaded by the client workflow run
- `client_repository_owner`: The owner of the client repository
- `client_repository_name`: The name of the client repository
- `client_workflow_run_id`: The ID of the client workflow run

They are used only if `label_name` is empty, i.e. the event isn't a label event.
The action fails if the event is `workflow_dispatch` and `github.ref` isn't the default branch.
[See also the example of the server workflow.](../README.md#migrate-from-labels-to-workflow_dispatch)

#### `config`, `config_file`

[Please see `prepare`](prepare.md#config-config_file).

## Outputs

Nothing.
