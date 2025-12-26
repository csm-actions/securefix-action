# Configuration File

e.g. config.yaml

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/csm-actions/securefix-action/main/json-schema/config.json
entries:
  - client:
      repositories:
        - suzuki-shunsuke/tfaction-example
      # As of v0.4.2, branches is optional. By default, the default branch of the client repository is used.
      # We recommend settings branches explicitly to decrease GitHub API call to fetch the default branch.
      branches:
        - main
    push:
      # As of v0.4.2, repositories is optional. By default, only the client repository is allowed.
      repositories:
        - suzuki-shunsuke/tfaction-example
      branches:
        - "scaffold-working-directory-*" # Glob
        - "follow-up-*" # Glob
    # Allow to create pull requests
    pull_request:
      # As of v0.4.2, base_branches is optional.
      # By default, the default branch of the pull request base repository is used.
      # We recommend settings branches explicitly to decrease GitHub API call to fetch the default branch.
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

## JSON Schema

You can validate the configuration file using JSON Schema.

main:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/csm-actions/securefix-action/main/json-schema/config.json
```

Specific version:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/csm-actions/securefix-action/v0.1.1/json-schema/config.json
```
