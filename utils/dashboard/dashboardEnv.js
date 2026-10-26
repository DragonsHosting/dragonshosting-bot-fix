const fs = require('fs');
const path = require('path');
const colors = require('ansi-colors');
const crypto = require('crypto');
const { getConfig } = require('../core/configLoader');

function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function updateDashboardEnv() {
    try {
        const config = getConfig();
        const dashboardDir = path.join(process.cwd(), 'dashboard');
        const envPath = path.join(dashboardDir, '.env');
        const publicDir = path.join(dashboardDir, 'public');
        const distDir = path.join(dashboardDir, 'dist');
        const publicConfigPath = path.join(publicDir, 'config.js');
        const distConfigPath = path.join(distDir, 'config.js');

        ensureDirectoryExists(publicDir);
        ensureDirectoryExists(distDir);

        const requiredValues = {
            'mongoURI': config.mongoURI,
            'BotToken': config.BotToken,
            'Dashboard.ClientID': config.Dashboard?.ClientID,
            'Dashboard.ClientSecret': config.Dashboard?.ClientSecret,
            'Dashboard.Url': config.Dashboard?.Url,
            'Dashboard.Port': config.Dashboard?.Port,
            'Dashboard.Auth.JWTSecret': config.Dashboard?.Auth?.JWTSecret,
            'Timezone': config.Timezone
        };

        const missingValues = Object.entries(requiredValues)
            .filter(([_, value]) => !value)
            .map(([key]) => key);

        if (missingValues.length > 0) {
            console.error(colors.red('[ENV] Error: Missing required values in dashboard.yml:'));
            missingValues.forEach(key => console.error(colors.red(`  - ${key}`)));
            return false;
        }

        const baseUrl = config.Dashboard.Url;
        const redirectUri = `${baseUrl}/api/auth/callback`;
        const apiUrl = `${baseUrl}/api`;

        let sessionSecret = null;
        if (fs.existsSync(envPath)) {
            const existingEnv = fs.readFileSync(envPath, 'utf8');
            const sessionSecretMatch = existingEnv.match(/^SESSION_SECRET=(.+)$/m);
            if (sessionSecretMatch) {
                sessionSecret = sessionSecretMatch[1].trim();
            }
        }

        if (!sessionSecret) {
            sessionSecret = crypto.randomBytes(64).toString('hex');
        }

        const envContent = `MONGODB_URI=${config.mongoURI}
DISCORD_GUILD_ID=
BOT_TOKEN=${config.BotToken}
DISCORD_CLIENT_ID=${config.Dashboard.ClientID}
DISCORD_CLIENT_SECRET=${config.Dashboard.ClientSecret}
DISCORD_REDIRECT_URI=${redirectUri}
APP_URL=${baseUrl}
VITE_APP_URL=${baseUrl}
PORT=${config.Dashboard.Port}
JWT_SECRET=${config.Dashboard.Auth.JWTSecret}
SESSION_SECRET=${sessionSecret}
TIMEZONE=${config.Timezone}
DASHBOARD_LOGIN_ROLES=${(config.Dashboard?.Permissions?.Dashboard?.Login || []).filter(r => r).join(',')}
DASHBOARD_SETTINGS_ROLES=${(config.Dashboard?.Permissions?.Dashboard?.Settings || []).filter(r => r).join(',')}
DASHBOARD_EMBED_ROLES=${(config.Dashboard?.Permissions?.Dashboard?.Embed || []).filter(r => r).join(',')}`;

        const configJsContent = `// Generated from dashboard.yml - DO NOT EDIT DIRECTLY
window.DASHBOARD_CONFIG = {
    API_URL: '${apiUrl}',
    CLIENT_URL: '${baseUrl}',
    TIMEZONE: '${config.Timezone}',
    DISCORD: {
        CLIENT_ID: '${config.Dashboard.ClientID}',
        REDIRECT_URI: '${redirectUri}',
        GUILD_ID: ''
    },
    PERMISSIONS: {
        Dashboard: {
            Login: ${JSON.stringify(config.Dashboard?.Permissions?.Dashboard?.Login || [])},
            Settings: ${JSON.stringify(config.Dashboard?.Permissions?.Dashboard?.Settings || [])},
            Embed: ${JSON.stringify(config.Dashboard?.Permissions?.Dashboard?.Embed || [])}
        }
    },
    TICKETS: {
        TYPES: ${JSON.stringify(config.TicketTypes ? Object.entries(config.TicketTypes)
            .filter(([_, type]) => type && type.Enabled)
            .reduce((acc, [key, type]) => ({
                ...acc,
                [key]: {
                    name: type.Name,
                    channelName: type.ChannelName,
                    supportRoles: type.SupportRole,
                    userRoles: type.UserRole,
                    claiming: type.Claiming?.Enabled ? {
                        enabled: true,
                        restrictResponse: type.Claiming.RestrictResponse,
                        announceClaim: type.Claiming.AnnounceClaim,
                        button: type.Claiming.Button
                    } : null,
                    button: type.Button,
                    questions: type.Questions || []
                }
            }), {}) : {}, null, 2)}
    }
};`;

        try {
            const tempEnvPath = envPath + '.tmp';
            const tempPublicConfigPath = publicConfigPath + '.tmp';
            const tempDistConfigPath = distConfigPath + '.tmp';

            let createdTempFiles = [];

            try {
                fs.writeFileSync(tempEnvPath, envContent);
                createdTempFiles.push(tempEnvPath);
                
                fs.writeFileSync(tempPublicConfigPath, configJsContent);
                createdTempFiles.push(tempPublicConfigPath);
                
                if (fs.existsSync(path.dirname(distConfigPath))) {
                    fs.writeFileSync(tempDistConfigPath, configJsContent);
                    createdTempFiles.push(tempDistConfigPath);
                }

                fs.renameSync(tempEnvPath, envPath);
                createdTempFiles = createdTempFiles.filter(file => file !== tempEnvPath);
                
                fs.renameSync(tempPublicConfigPath, publicConfigPath);
                createdTempFiles = createdTempFiles.filter(file => file !== tempPublicConfigPath);
                
                if (fs.existsSync(path.dirname(distConfigPath))) {
                    fs.renameSync(tempDistConfigPath, distConfigPath);
                    createdTempFiles = createdTempFiles.filter(file => file !== tempDistConfigPath);
                }
                
                return true;
            } catch (writeError) {
                console.error(colors.red('[ENV] Error writing configuration files:'), writeError);

                for (const tempFile of createdTempFiles) {
                    try {
                        if (fs.existsSync(tempFile)) {
                            fs.unlinkSync(tempFile);
                        }
                    } catch (cleanupError) {
                        console.error(colors.yellow(`[ENV] Error cleaning up temp file ${tempFile}:`), cleanupError);
                    }
                }
                
                return false;
            }
        } catch (writeError) {
            console.error(colors.red('[ENV] Error writing configuration files:'), writeError);
            const tempFiles = [
                envPath + '.tmp',
                publicConfigPath + '.tmp',
                distConfigPath + '.tmp'
            ];
            tempFiles.forEach(file => {
                try {
                    if (fs.existsSync(file)) {
                        fs.unlinkSync(file);
                    }
                } catch (cleanupError) {
                    console.error(colors.yellow('[ENV] Error cleaning up temp file:'), cleanupError);
                }
            });
            return false;
        }
    } catch (error) {
        console.error(colors.red('[ENV] Error updating dashboard configuration:'), error);
        return false;
    }
}

module.exports = { updateDashboardEnv };