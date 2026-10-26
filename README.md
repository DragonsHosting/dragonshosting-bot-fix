# Dragonshosting Discord bot template

This template is based on the bot source currently running on the Dragonshosting hosting panel (version 1.9.6, Node.js 22). Runtime files, server IDs, transcript contents, credentials, and deployment data have been removed or blanked.

## Install

1. Use Node.js 22 and run `npm ci` in the repository root.
2. Copy `.env.example` to `.env` for local setup, or set those values in the hosting panel. Never commit `.env`.
3. Set `BOT_TOKEN`, `SESSION_SECRET`, and `MONGODB_URI`. Add the OAuth application values `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, and `APP_URL`.
4. In the Discord Developer Portal, register the exact value of `DISCORD_REDIRECT_URI` under the application's OAuth2 redirect URLs. For the default dashboard API route, it ends with `/api/auth/callback`.
5. Set `DASHBOARD_LOGIN_ROLES` to comma-separated staff role IDs, or set the role IDs under `Dashboard.Permissions.Dashboard.Login` in `config/modules/dashboard.yml`. The dashboard denies login while no valid role IDs are configured.
6. Run `npm start`. Run `npm run build` when rebuilding the dashboard UI.

The dashboard login uses Discord OAuth2 authorization code flow, validates a one-time session-bound `state`, and checks that the Discord user has an allowed role. The OAuth client secret stays on the server. Only the `identify` scope is requested.

`config/dragonshosting-transcript-upload.json` is a disabled, empty example. Do not add live DirectAdmin credentials, bot tokens, OAuth secrets, database URLs, webhooks, or real server configuration to this public template.

The `transcript-site-dashboard/` folder contains the Discord-authenticated PHP version of the separate transcript website. Its private OAuth config belongs outside `public_html`; see that folder's README before deploying it.
