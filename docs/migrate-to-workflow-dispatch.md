# Migrate from labels to workflow_dispatch

As of v0.6.5, the client workflow can run the server workflow by a `workflow_dispatch` event instead of creating a label in the server repository.
[See also how to trigger the server workflow.](../README.md#how-to-trigger-the-server-workflow)

Updating the action doesn't change the behavior, so you can migrate gradually.

## Steps

1. Add `actions:write` to the Client GitHub App and approve the new permission on the installation. Until it's approved, client actions with `server_workflow_ref` fail. Keep `issues:write` until the migration completes, because clients that still use `server_repository` need it
2. Add a `workflow_dispatch` server workflow alongside the existing label-based one
3. Set `server_workflow_ref` in client workflows. You can keep `server_repository`, but it must point to the same repository
4. After all clients are migrated, remove the label-based server workflow and `issues:write` from the Client GitHub App

Before migrating, read [the risks of `actions:write` and how to protect the server workflow](../README.md#workflow_dispatch-and-actionswrite).

## Server workflow

The server workflow must declare the `workflow_dispatch` inputs below, which the client action sets.
You don't need to pass them to the action, because the action reads them from the event.

```yaml
name: securefix
run-name: securefix (${{ inputs.client_repository_owner }}/${{ inputs.client_repository_name }}/${{ inputs.client_workflow_run_id }})
on:
  workflow_dispatch:
    inputs:
      client_repository_owner:
        required: true
      client_repository_name:
        required: true
      client_workflow_run_id:
        required: true
      artifact_name:
        required: true
jobs:
  fix:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    environment: main # Restrict the deployment branches to the default branch
    permissions:
      id-token: write
    steps:
      - uses: csm-actions/securefix-action@latest
        with:
          action: server
          client_id: ${{ vars.SERVER_APP_CLIENT_ID }}
          aws_kms_key_id: ${{ vars.KMS_KEY_ID }}
          aws_role_to_assume: ${{ vars.ROLE_TO_ASSUME }}
```

## Client workflow

```yaml
- uses: csm-actions/securefix-action@latest
  with:
    client_id: ${{ vars.CLIENT_APP_CLIENT_ID }}
    app_private_key: ${{ secrets.CLIENT_APP_PRIVATE_KEY }}
    # <owner>/<repo>/.github/workflows/<workflow file>@<branch or tag>
    server_workflow_ref: ${{ vars.SECUREFIX_SERVER_WORKFLOW_REF }}
```

Managing `server_workflow_ref` with an organization variable lets you change it later, e.g. when you rename the server repository or the workflow file, without fixing client workflows.
