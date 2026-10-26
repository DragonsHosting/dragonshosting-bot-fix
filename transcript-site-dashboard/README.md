# Discord-authenticated transcript site

This PHP 8+ front end replaces public static transcript links with a Discord OAuth2 login and role check. It reads the archive from the existing `transcripts.json` and `t/<transcript-id>/index.html` files, but serves both only after the user passes the configured guild and staff-role check.

## Configure

1. Copy `config.php.example` to `transcript-dashboard-config.php` one directory above the site's `public_html` folder. Set the Discord application client ID and secret, the guild ID, and at least one staff role ID. Keep the secret outside the public web root.
2. Set `discord_redirect_uri` to the site's HTTPS root and register that exact URL under OAuth2 redirect URLs in the Discord Developer Portal. For the current Dragonshosting site, that URL is `https://transcripts.dragonshosting.nl/`. The requested scopes are `identify` and `guilds.members.read`.
3. Upload `index.php` and `.htaccess` to the site's document root. Keep `transcripts.json` and `t/` there; `.htaccess` blocks direct web requests to those paths while PHP reads the files locally.
4. Enable HTTPS and PHP cURL. The app denies login when OAuth or the staff-role allow-list is missing.

Do not publish the private config file, OAuth secret, Discord role IDs, transcript JSON, or transcript HTML files. Keep the current site access protection in place until the OAuth application, role IDs, and PHP setup have been verified.
