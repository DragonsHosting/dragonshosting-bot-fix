# DragonsHosting Discord Bot

![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white)
![Discord.js](https://img.shields.io/badge/Discord.js-14-5865F2?logo=discord&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)
![Status](https://img.shields.io/badge/Public%20Template-Sanitized-success)

A public, sanitized version of the Discord bot used within **DragonsHosting**.

This repository is intended as a usable template and project showcase. Runtime files, production server IDs, transcript contents, credentials and private deployment data are removed or left blank.

## Features

- Ticket system and transcript handling
- Moderation and staff tools
- Discord OAuth2 dashboard with role-based access
- Giveaways, suggestions and reaction roles
- Leveling and economy systems
- Music and utility modules
- Security and anti-abuse tooling
- Server backup functionality
- Optional FeatherPanel integration
- Separate authenticated transcript dashboard

## Project structure

| Folder | Purpose |
| --- | --- |
| `addons/` | Optional bot modules and feature packages |
| `config/` | Public example configuration |
| `dashboard/` | Web dashboard frontend and backend |
| `events/` | Discord event handlers |
| `models/` | Database models |
| `transcript-site-dashboard/` | Separate authenticated transcript viewer |
| `utils/` | Shared bot, dashboard and security utilities |

## Installation

1. Install **Node.js 22**.
2. Run `npm ci` in the repository root.
3. Copy `.env.example` to `.env`, or configure the same variables in your hosting panel.
4. Configure the required values:
   - `BOT_TOKEN`
   - `SESSION_SECRET`
   - `MONGODB_URI`
   - `DISCORD_CLIENT_ID`
   - `DISCORD_CLIENT_SECRET`
   - `DISCORD_REDIRECT_URI`
   - `APP_URL`
5. Register the exact `DISCORD_REDIRECT_URI` in the Discord Developer Portal. The default dashboard callback ends with `/api/auth/callback`.
6. Configure `DASHBOARD_LOGIN_ROLES`, or set the allowed roles in `config/modules/dashboard.yml`.
7. Start the bot with `npm start`.

To rebuild the dashboard UI, run:

```bash
npm run build
```

## Security

The public repository deliberately keeps production secrets outside the source code.

- `.env` and generated/runtime files are ignored by Git.
- Bot tokens, OAuth secrets, database credentials, DirectAdmin credentials and API keys belong in environment variables or private configuration.
- The dashboard uses Discord OAuth2 with a one-time session-bound state value.
- Dashboard access can be restricted by Discord role.
- CSRF protection is used for authenticated dashboard actions.
- XP formulas use a restricted arithmetic parser instead of JavaScript `eval()`.

Never commit live credentials, database connection strings, Discord webhooks or production-only configuration.

## Transcript dashboard

The `transcript-site-dashboard/` directory contains the PHP version of the private transcript archive.

Its private OAuth configuration should remain outside `public_html`. See the README in that directory before deployment.

## Public template

Some values are intentionally empty or replaced with examples. Users of this repository must provide their own Discord application, database, server IDs and hosting configuration.

The public source can be inspected and reused without exposing the private DragonsHosting production environment.

## License

Released under the **MIT License**. See `LICENSE` for details.
