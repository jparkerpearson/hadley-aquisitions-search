---
name: Git provider authorization
description: Recover GitHub CLI authentication without confusing general connectors with Git-provider connections.
---
Use the account's Git Providers connection to recover a rejected GitHub push; a general GitHub app connector is not a substitute for Git CLI authorization.

**Why:** Git rejected a push with invalid credentials even while the source-control connection reported healthy. The integration reconnect card could not handle the special source-control connection, rejecting both reconnect and connect forms.

**How to apply:** Confirm commits are safe locally, report that the push has not succeeded, and ask the user to disconnect/reconnect GitHub under account settings → Git Providers before retrying. Do not expose or manually handle credentials, use a force push, or claim the general connector repairs Git authentication.
