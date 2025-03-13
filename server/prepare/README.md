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

- `workflow_name`: An expected client workflow name. If the actual client workflow name is different from this input, the request is denied. The default value is `securefix`. If this is empty, the workflow name is free
- `pull_request_comment`: A pull request comment template. A comment is posted if server actions fail to create a commit. The default value is `:x: Securefix failed.`

## Outputs

- `pull_request`: A Pull Request Payload ([ref](https://docs.github.com/en/rest/pulls/pulls?apiVersion=2022-11-28#get-a-pull-request))
- `pull_request_number`: A Pull Request Number
- `workflow_run`: A Workflow Run Payload ([ref](https://docs.github.com/en/rest/actions/workflow-runs?apiVersion=2022-11-28#get-a-workflow-run))
- `repository`: A client repository's full name
- `repository_name`: A client repository's name
- `workflow_run_id`: A client workflow run id
- `metadata`: A request's metadata. It's a JSON string.

```json
{
  "context": {
    // github-script's context object
  },
  "inputs": {
    "commit_message": "commit message",
  },
}
```

`context` is a [github-script](https://github.com/actions/github-script)'s context object.

- `fixed_files`: Fixed file paths. Paths are separated with newlines
- `pull_request_comment`: A pull request comment template.
