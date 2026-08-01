# AntiAltDiscordAccounts

DragonsHosting addon that blocks risky Discord joins without IP tracking.

Important: without IP tracking, a Discord bot cannot prove with 100% certainty that two accounts belong to the same person. This addon instead uses a strict join gate so suspicious accounts cannot access the server until staff reviews them.

Default strict behavior:

- Enabled: yes
- Minimum account age: 30 days
- Action: quarantine
- Mode: all new joins require staff review
- Auto-create quarantine role: yes
- Channel lockdown for quarantined users: yes
- Risk checks: no avatar, duplicate name/display name, young-account join bursts

Useful commands after restart:

- `/antialt status`
- `/antialt strict-preset mode:suspicious`
- `/antialt strict-preset mode:all`
- `/antialt minimum-age value:30d`
- `/antialt quarantine-role role:@Quarantine`
- `/antialt lockdown enabled:true`

Modes:

- `suspicious`: quarantine accounts that trigger the risk checks.
- `all`: quarantine every new join until staff manually removes the quarantine role.

For the hardest no-IP setup, use `mode:all`. That prevents every new account from getting normal server access until staff reviews it.
