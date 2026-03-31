# Custom Input

`>= v0.5.5` [#564](https://github.com/csm-actions/securefix-action/pull/564)

You can pass arbitrary custom parameters from the client to the server.

e.g. client

```yaml
- uses: csm-actions/securefix-action@latest
  with:
    # ...
    # JSON object parameter
    custom: |
      {
        "name": "foo"
      }
```

The client and server validate if custom is valid JSON object, and if it's invalid they raise error.
The default value of custom is `{}`.

The server-side prepare or server action outputs this parameter.
The output is a JSON object.
You can add arbitrary processing to the workflow that references this output.

> [!WARNING]
> When the server workflow uses `custom` parameter, it should validate it in terms of security.

Using this mechanism, you can pass arbitrary parameters from the client to the server and perform custom processing on the server side that is not supported by securefix action.
For example, you may want to send a Slack notification after creating a Pull Request with securefix action.
securefix action does not support such functionality, but you can specify the notification destination channel and message via custom parameters and send Slack notifications on the server-side workflow using [slack-github-action](https://github.com/slackapi/slack-github-action).

client:

```yaml
- uses: csm-actions/securefix-action@latest
  with:
    # ...
    custom: |
      {
        "slack": {
          "channel_id": "...",
          "message": "Pull Request was created."
        }
      }
```

server:

```yaml
- uses: csm-actions/securefix-action@latest
  id: server
  with:
    action: server
    app_id: ${{ vars.DEMO_SERVER_APP_ID }}
    app_private_key: ${{ secrets.DEMO_SERVER_PRIVATE_KEY }}
    config_file: securefix-action.yaml

- if: |
    fromJSON(steps.server.outputs.custom).slack &&
    steps.server.outputs.pull_request
  uses: slackapi/slack-github-action@af78098f536edbc4de71162a307590698245be95 # v3.0.1
  id: slack
  with:
    method: chat.postMessage
    token: ${{ secrets.SLACK_BOT_TOKEN }}
    payload: |
      channel: ${{ fromJSON(steps.server.outputs.custom).slack.channel_id }}
      text: "${{fromJSON(steps.server.outputs.custom).slack.message}}: ${{ fromJSON(steps.server.outputs.new_pull_request).html_url }}"

- uses: csm-actions/securefix-action@latest
  if: steps.slack.outcome == 'failure' || steps.slack.outcome == 'cancelled'
  with:
    action: notify
    pull_request_comment: |
      ## :x: Securefix failed

      Slack Notification failed.
```

Of course, Slack notification is just one example.
You can implement arbitrary processing to suit your use case.
