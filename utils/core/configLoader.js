const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');
const colors = require('ansi-colors');
const { runConfigUpdates, MIGRATIONS } = require('./configUpdater');
const { version: packageVersion } = require('../../package.json');

const CONFIG_DIR = path.join(__dirname, '..', '..', 'config');
const CORE_CONFIG_PATH = path.join(CONFIG_DIR, 'core.yml');
const MODULES_DIR = path.join(CONFIG_DIR, 'modules');
const LANG_PATH = path.join(CONFIG_DIR, 'lang.yml');
const COMMANDS_PATH = path.join(CONFIG_DIR, 'commands.yml');
const ENV_PATH = path.join(CONFIG_DIR, '.env');
const ADDONS_DIR = path.join(CONFIG_DIR, '..', 'addons');

function getAddonConfigPath(mainKey) {
    if (!fs.existsSync(ADDONS_DIR)) return null;
    for (const entry of fs.readdirSync(ADDONS_DIR, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const configPath = path.join(ADDONS_DIR, entry.name, 'config', 'config.yml');
        if (!fs.existsSync(configPath)) continue;
        try {
            const addonConfig = yaml.load(fs.readFileSync(configPath, 'utf8')) || {};
            if (Object.prototype.hasOwnProperty.call(addonConfig, mainKey)) return configPath;
        } catch (_) {}
    }
    return null;
}

function loadEnvFile() {
    if (!fs.existsSync(ENV_PATH)) {
        return null;
    }
    
    const env = {};
    const content = fs.readFileSync(ENV_PATH, 'utf8');
    const lines = content.split('\n');
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;
        
        const key = trimmed.substring(0, eqIndex).trim();
        let value = trimmed.substring(eqIndex + 1).trim();
        
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        
        env[key] = value;
    }
    
    return Object.keys(env).length > 0 ? env : null;
}

function applyEnvOverrides(config, env) {
    if (!env) return config;
    
    const overrides = {
        'BOT_TOKEN': 'BotToken',
        'MONGO_URI': 'mongoURI',
        'CLIENT_ID': ['Dashboard', 'ClientID'],
        'CLIENT_SECRET': ['Dashboard', 'ClientSecret'],
        'JWT_SECRET': ['Dashboard', 'Auth', 'JWTSecret']
    };
    
    for (const [envKey, configPath] of Object.entries(overrides)) {
        if (env[envKey]) {
            if (Array.isArray(configPath)) {
                let obj = config;
                for (let i = 0; i < configPath.length - 1; i++) {
                    if (!obj[configPath[i]]) obj[configPath[i]] = {};
                    obj = obj[configPath[i]];
                }
                obj[configPath[configPath.length - 1]] = env[envKey];
            } else {
                config[configPath] = env[envKey];
            }
        }
    }
    
    return config;
}

const KEY_TO_FILE = {
    'BotToken': CORE_CONFIG_PATH,
    'mongoURI': CORE_CONFIG_PATH,
    'BotName': CORE_CONFIG_PATH,
    'Statistics': CORE_CONFIG_PATH,
    'Timezone': CORE_CONFIG_PATH,
    'EmbedColors': CORE_CONFIG_PATH,
    'SuccessEmbedColor': CORE_CONFIG_PATH,
    'ErrorEmbedColor': CORE_CONFIG_PATH,
    'Cookie': CORE_CONFIG_PATH,
    'AutoUpdate': CORE_CONFIG_PATH,
    'DataPurge': CORE_CONFIG_PATH,
    'Dashboard': path.join(MODULES_DIR, 'dashboard.yml'),
    'UserUpdateLogs': path.join(MODULES_DIR, 'logging.yml'),
    'RoleAddLogs': path.join(MODULES_DIR, 'logging.yml'),
    'RoleRemoveLogs': path.join(MODULES_DIR, 'logging.yml'),
    'GuildUpdateLogs': path.join(MODULES_DIR, 'logging.yml'),
    'ChannelCreatedLogs': path.join(MODULES_DIR, 'logging.yml'),
    'ChannelDeletedLogs': path.join(MODULES_DIR, 'logging.yml'),
    'MessageDeleteLogs': path.join(MODULES_DIR, 'logging.yml'),
    'MessageUpdateLogs': path.join(MODULES_DIR, 'logging.yml'),
    'VoiceChannelStreamStart': path.join(MODULES_DIR, 'logging.yml'),
    'VoiceChannelStreamStop': path.join(MODULES_DIR, 'logging.yml'),
    'VoiceChannelJoin': path.join(MODULES_DIR, 'logging.yml'),
    'VoiceChannelLeave': path.join(MODULES_DIR, 'logging.yml'),
    'VoiceChannelSwitch': path.join(MODULES_DIR, 'logging.yml'),
    'TimeoutLogs': path.join(MODULES_DIR, 'logging.yml'),
    'UntimeLogs': path.join(MODULES_DIR, 'logging.yml'),
    'WarnLogs': path.join(MODULES_DIR, 'logging.yml'),
    'BanLogs': path.join(MODULES_DIR, 'logging.yml'),
    'UnbanLogs': path.join(MODULES_DIR, 'logging.yml'),
    'KickLogs': path.join(MODULES_DIR, 'logging.yml'),
    'GiveawayLogs': path.join(MODULES_DIR, 'logging.yml'),
    'PurgeLogChannel': path.join(MODULES_DIR, 'logging.yml'),
    'WelcomeMessage': path.join(MODULES_DIR, 'welcome.yml'),
    'LeaveMessage': path.join(MODULES_DIR, 'welcome.yml')
};

function getConfigFileForPath(configPath) {
    const mainKey = (configPath || '').split('.')[0];
    return KEY_TO_FILE[mainKey] || getAddonConfigPath(mainKey) || CORE_CONFIG_PATH;
}

function getDisplayFileLabel(configPath) {
    let filePath;
    if (configPath && (configPath.includes('/') || configPath.includes('\\') || configPath.endsWith('.yml'))) {
        filePath = configPath;
    } else {
        filePath = getConfigFileForPath(configPath);
    }
    const rel = path.relative(path.join(__dirname, '..', '..'), filePath).replace(/\\/g, '/');
    return rel || path.basename(filePath);
}

const MODULE_FILES = [
    'dashboard.yml',
    'logging.yml',
    'welcome.yml'
];

let configCache = null;
let langCache = null;
let commandsCache = null;

function ensureLangAndCommandsInConfig() {
    const rootLang = path.join(__dirname, '..', '..', 'lang.yml');
    const rootCommands = path.join(__dirname, '..', '..', 'commands.yml');

    try {
        if (fs.existsSync(rootLang)) {
            const legacyLangPath = path.join(__dirname, '..', '..', 'lang_legacy.yml');
            try { fs.renameSync(rootLang, legacyLangPath); } catch (_) {}
        }
    } catch (e) {}

    try {
        if (fs.existsSync(rootCommands)) {
            fs.copyFileSync(rootCommands, COMMANDS_PATH);
            try { fs.unlinkSync(rootCommands); } catch (_) {}
        }
    } catch (e) {}
}

function loadAllConfigs() {
    try {
        ensureLangAndCommandsInConfig();
        
        runConfigUpdates();
        
        configCache = loadModularConfig();
        
        try {
            langCache = yaml.load(fs.readFileSync(LANG_PATH, 'utf8'));
            if (fs.existsSync(ADDONS_DIR)) {
                for (const entry of fs.readdirSync(ADDONS_DIR, { withFileTypes: true })) {
                    if (!entry.isDirectory()) continue;
                    const addonLangPath = path.join(ADDONS_DIR, entry.name, 'config', 'lang.yml');
                    if (!fs.existsSync(addonLangPath)) continue;
                    const addonLang = yaml.load(fs.readFileSync(addonLangPath, 'utf8')) || {};
                    langCache = { ...langCache, ...addonLang };
                }
            }
        } catch (error) {
            handleYAMLError(error, LANG_PATH);
            process.exit(1);
        }
        
        try {
            commandsCache = yaml.load(fs.readFileSync(COMMANDS_PATH, 'utf8'));
        } catch (error) {
            handleYAMLError(error, COMMANDS_PATH);
            process.exit(1);
        }
        
        if (configCache && !process.env.DRAGONHOSTING_CONFIG_VALIDATED) {
            process.env.DRAGONHOSTING_CONFIG_VALIDATED = 'true';
            const { errors, warnings, info } = validateConfig(configCache);
            displayConfigErrors(errors, warnings, info);
        }
        
        return true;
    } catch (error) {
        handleYAMLError(error, CORE_CONFIG_PATH);
        process.exit(1);
    }
}

function loadModularConfig() {
    let mergedConfig = {};
    
    if (fs.existsSync(CORE_CONFIG_PATH)) {
        try {
            const coreConfig = yaml.load(fs.readFileSync(CORE_CONFIG_PATH, 'utf8'));
            mergedConfig = { ...mergedConfig, ...coreConfig };
        } catch (error) {
            handleYAMLError(error, CORE_CONFIG_PATH);
            process.exit(1);
        }
    }
    
    let loadedModules = 0;
    MODULE_FILES.forEach(moduleFile => {
        const modulePath = path.join(MODULES_DIR, moduleFile);
        if (fs.existsSync(modulePath)) {
            try {
                const moduleConfig = yaml.load(fs.readFileSync(modulePath, 'utf8'));
                mergedConfig = { ...mergedConfig, ...moduleConfig };
                loadedModules++;
            } catch (error) {
                handleYAMLError(error, modulePath);
                process.exit(1);
            }
        }
    });

    if (fs.existsSync(ADDONS_DIR)) {
        for (const entry of fs.readdirSync(ADDONS_DIR, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            const addonConfigPath = path.join(ADDONS_DIR, entry.name, 'config', 'config.yml');
            if (!fs.existsSync(addonConfigPath)) continue;
            try {
                const addonConfig = yaml.load(fs.readFileSync(addonConfigPath, 'utf8')) || {};
                mergedConfig = { ...mergedConfig, ...addonConfig };
                loadedModules++;
            } catch (error) {
                handleYAMLError(error, addonConfigPath);
                process.exit(1);
            }
        }
    }

    const envVars = loadEnvFile();
    if (envVars) {
        mergedConfig = applyEnvOverrides(mergedConfig, envVars);
    }

    return mergedConfig;
}

function sanitizeSensitiveInfo(line) {
    const sensitivePatterns = [
        {
            pattern: /(BotToken:\s*["']?)([A-Za-z0-9._-]{50,})(["']?)/i,
            replacement: '$1***...***$3'
        },
        {
            pattern: /(mongodb(?:\+srv)?:\/\/)([^:]+):([^@]+)(@.+)/i,
            replacement: '$1***:***$4'
        },
        {
            pattern: /(JWTSecret:\s*["']?)([A-Za-z0-9+/=]{16,})(["']?)/i,
            replacement: '$1***...***$3'
        },
        {
            pattern: /(ClientSecret:\s*["']?)([A-Za-z0-9_-]{16,})(["']?)/i,
            replacement: '$1***...***$3'
        },
        {
            pattern: /((?:api|key|secret|token):\s*["']?)([A-Za-z0-9+/=_-]{20,})(["']?)/i,
            replacement: '$1***...***$3'
        },
        {
            pattern: /(password:\s*["']?)([^"'\s]{6,})(["']?)/i,
            replacement: '$1***...***$3'
        }
    ];
    
    let sanitizedLine = line;
    
    for (const { pattern, replacement } of sensitivePatterns) {
        sanitizedLine = sanitizedLine.replace(pattern, replacement);
    }
    
    return sanitizedLine;
}

function handleYAMLError(error, filePath = CORE_CONFIG_PATH) {
    console.log('\n' + colors.bold.red('────────────────────────────────────────────────────────────────────────'));
    console.log(colors.bold.red('🛠️ CONFIG FILE ERROR - INVALID YAML FORMAT'));
    console.log(colors.bold.red('────────────────────────────────────────────────────────────────────────'));
    console.log(colors.red('│'));
    
    if (error.mark && error.mark.line !== undefined) {
        const line = error.mark.line + 1;
        const column = error.mark.column + 1;
        
        console.log(colors.red(`│  📍 ${colors.bold('Error Location:')}`));
        const targetFile = getDisplayFileLabel(filePath);
        console.log(colors.red(`│     File: ${targetFile}`));
        
        const rangeStart = Math.max(1, line - 2);
        const rangeEnd = line + 2;
        console.log(colors.red(`│     Problem Area: Lines ${rangeStart}-${rangeEnd} (around line ${line})`));
        console.log(colors.red('│'));
        
        console.log(colors.red(`│  📍 ${colors.bold('Problem Area:')}`));
        try {
            const configContent = fs.readFileSync(filePath, 'utf8');
            const lines = configContent.split('\n');
            const errorLine = line - 1;
            
            const startLine = Math.max(0, errorLine - 2);
            const endLine = Math.min(lines.length - 1, errorLine + 2);
            
            for (let i = startLine; i <= endLine; i++) {
                const lineNumber = (i + 1).toString().padStart(3, ' ');
                const currentLine = lines[i] || '';
                const sanitizedLine = sanitizeSensitiveInfo(currentLine);
                
                if (i === errorLine) {
                    console.log(colors.red(`│   ${colors.bold.yellow(`→ ${lineNumber} |`)} ${colors.bold.yellow(sanitizedLine)}`));
                    
                    if (column > 0) {
                        const pointer = ' '.repeat(column + 9) + '^';
                        console.log(colors.red(`│   ${colors.bold.yellow(pointer)}`));
                    }
                } else {
                    console.log(colors.red(`│     ${lineNumber} | ${sanitizedLine}`));
                }
            }
        } catch (fileError) {
            if (error.mark.snippet) {
                const snippetLines = error.mark.snippet.split('\n');
                snippetLines.forEach(line => {
                    if (line.trim()) {
                        console.log(colors.red(`│     ${line}`));
                    }
                });
            }
        }
        console.log(colors.red('│'));
        
        console.log(colors.red(`│  ❗ ${colors.bold('What\'s Wrong:')}`));
        
        const errorMsg = error.message || '';
        const reason = error.reason || '';
        
        if (reason.includes('could not find expected') && reason.includes('"')) {
            console.log(colors.red('│     Missing closing quote (") - you started a quoted string but didn\'t close it'));
        } else if (errorMsg.includes('duplicated mapping key') || reason.includes('found duplicate key')) {
            console.log(colors.red('│     Duplicate setting name - you have the same setting name twice'));
        } else if (reason.includes('could not find expected') && reason.includes('mapping')) {
            console.log(colors.red('│     Missing colon (:) after a setting name, or incorrect indentation'));
        } else if (reason.includes('mapping values are not allowed here')) {
            console.log(colors.red('│     Incorrect indentation - this line should be indented more or less'));
        } else if (reason.includes('could not find expected') && reason.includes(']')) {
            console.log(colors.red('│     Missing closing bracket (]) - you opened a list [ but didn\'t close it'));
        } else if (reason.includes('could not find expected') && reason.includes('}')) {
            console.log(colors.red('│     Missing closing brace (}) - you opened a { but didn\'t close it'));
        } else if (reason.includes('found undefined alias')) {
            console.log(colors.red('│     Invalid reference - you used & or * incorrectly'));
        } else if (reason.includes('expected')) {
            console.log(colors.red(`│     ${reason} - check syntax around this area`));
        } else if (reason) {
            console.log(colors.red(`│     ${reason}`));
        } else {
            console.log(colors.red('│     Invalid YAML syntax - check formatting and punctuation'));
        }
        console.log(colors.red('│'));
        
        console.log(colors.red(`│  🔧 ${colors.bold('How to Fix:')}`));
        const targetConfigFile = getDisplayFileLabel(filePath);
        console.log(colors.red(`│     1. Open ${targetConfigFile} in your text editor`));
        console.log(colors.red(`│     2. Look at lines ${rangeStart}-${rangeEnd} (focus on line ${line})`));
        console.log(colors.red(`│     3. Check for these common issues:`));
        console.log(colors.red('│        • Missing quotes around text values'));
        console.log(colors.red('│        • Incorrect indentation (use spaces, not tabs)'));
        console.log(colors.red('│        • Missing colons after setting names'));
        console.log(colors.red('│        • Unclosed brackets [ ] or braces { }'));
        console.log(colors.red('│        • Duplicate setting names'));
        console.log(colors.red('│'));
    } else {
        console.log(colors.red(`│  ❗ ${colors.bold('YAML Parsing Error:')}`));
        const yamlConfigFile = getDisplayFileLabel(filePath);
        console.log(colors.red(`│     Your ${yamlConfigFile} file has invalid formatting`));
        console.log(colors.red('│'));
        console.log(colors.red(`│  🔧 ${colors.bold('Common Fixes:')}`));
        console.log(colors.red('│     • Check for missing quotes around text'));
        console.log(colors.red('│     • Ensure proper indentation (spaces, not tabs)'));
        console.log(colors.red('│     • Make sure all brackets [ ] are closed'));
        console.log(colors.red('│     • Check for duplicate setting names'));
        console.log(colors.red('│'));
    }
    
    console.log(colors.red('│  💡 Tips:'));
    console.log(colors.red('│     • Use a YAML validator online to check your file'));
    console.log(colors.red('│     • Copy from the example config if needed'));
    console.log(colors.red('│     • Join discord.gg/DragonsHosting for help'));
    console.log(colors.red('│'));
    console.log(colors.bold.red('────────────────────────────────────────────────────────────────────────\n'));
}

const getConfig = () => {
    if (!configCache) {
        loadAllConfigs();
    }
    return configCache;
};

const getLang = () => {
    if (!langCache) {
        loadAllConfigs();
    }
    return langCache;
};

function replacePlaceholders(text, config = null) {
    if (!text || typeof text !== 'string') return text;
    
    const currentConfig = config || getConfig();
    
    // Replace common placeholders
    let result = text
        .replace(/{botName}/g, currentConfig.BotName || 'DragonHosting')
        .replace(/{guildId}/g, '')
        .replace(/{version}/g, currentConfig.Version || packageVersion);
    
    return result;
}

const getCommands = () => {
    if (!commandsCache) {
        loadAllConfigs();
    }
    return commandsCache;
};

function compareVersions(version1, version2) {
    const parseVersion = (v) => {
        return v.toString().split('.').map(num => parseInt(num.replace(/[^0-9]/g, ''), 10) || 0);
    };
    
    const v1Parts = parseVersion(version1);
    const v2Parts = parseVersion(version2);
    const maxLength = Math.max(v1Parts.length, v2Parts.length);
    
    for (let i = 0; i < maxLength; i++) {
        const v1Part = v1Parts[i] || 0;
        const v2Part = v2Parts[i] || 0;
        
        if (v1Part < v2Part) return -1;
        if (v1Part > v2Part) return 1;
    }
    
    return 0;
}

function createWarning(path, name, description, type, hint, docs = GUIDE_URLS.main) {
    return { path, name, description, type, hint, docs };
}

function createError(path, name, description, type, hint, docs = GUIDE_URLS.main) {
    return { path, name, description, type, hint, docs };
}

function validatePlaceholderRoles(roles, path, name) {
    const warnings = [];
    if (Array.isArray(roles)) {
        const placeholderRoles = roles.filter(role => role === 'ROLE_ID' || role === '');
        if (placeholderRoles.length > 0) {
            warnings.push(createWarning(
                path,
                name,
                'Role IDs need to be replaced with actual role IDs',
                'placeholder',
                'Right-click role → Copy Role ID (requires Developer Mode)',
                GUIDE_URLS.developerMode
            ));
        }
    }
    return warnings;
}

function validateChannelConfig(channelId, path, name, isRequired = true) {
    const warnings = [];
    if (isRequired && (!channelId || channelId === 'CHANNEL_ID')) {
        warnings.push(createWarning(
            path,
            name,
            'Valid channel ID required when this feature is enabled',
            'invalid_channel_id',
            'Right-click channel → Copy Channel ID (requires Developer Mode)',
            GUIDE_URLS.developerMode
        ));
    }
    return warnings;
}

function validatePlaceholderChannels(channels, path, name) {
    const warnings = [];
    if (Array.isArray(channels)) {
        const placeholderChannels = channels.filter(channel => channel === 'CHANNEL_ID' || channel === '');
        if (placeholderChannels.length > 0) {
            warnings.push(createWarning(
                path,
                name,
                'Channel IDs need to be replaced with actual channel IDs',
                'placeholder',
                'Right-click channel → Copy Channel ID (requires Developer Mode)',
                GUIDE_URLS.developerMode
            ));
        }
    }
    return warnings;
}

function validatePlaceholderCategories(categories, path, name) {
    const warnings = [];
    if (Array.isArray(categories)) {
        const placeholderCategories = categories.filter(category => category === 'CATEGORY_ID' || category === '');
        if (placeholderCategories.length > 0) {
            warnings.push(createWarning(
                path,
                name,
                'Category IDs need to be replaced with actual category IDs',
                'placeholder',
                'Right-click category → Copy Category ID (requires Developer Mode)',
                GUIDE_URLS.developerMode
            ));
        }
    }
    return warnings;
}

function validateModalPlaceholders(embedConfig, embedPath, embedName, availableModalIds) {
    const warnings = [];
    
    if (!embedConfig) return warnings;
    
    const modalPlaceholderPattern = /\{modal_([a-zA-Z0-9_]+?)(?:_(formatted|label|emoji))?\}/g;
    const usedModalIds = new Set();
    
    function extractModalIds(text) {
        if (typeof text === 'string') {
            let match;
            modalPlaceholderPattern.lastIndex = 0; // Reset regex state
            while ((match = modalPlaceholderPattern.exec(text)) !== null) {
                usedModalIds.add(match[1]);
            }
        } else if (Array.isArray(text)) {
            text.forEach(item => extractModalIds(item));
        } else if (typeof text === 'object' && text !== null) {
            Object.values(text).forEach(value => extractModalIds(value));
        }
    }
    
    extractModalIds(embedConfig);
    
    const missingModalIds = Array.from(usedModalIds).filter(modalId => !availableModalIds.includes(modalId));
    
    if (missingModalIds.length > 0) {
        missingModalIds.forEach(missingId => {
            const examplePlaceholder = `{modal_${missingId}}`;
            warnings.push(createWarning(
                embedPath,
                `${embedName} Modal Placeholder`,
                `Modal placeholder using ID "${missingId}" is referenced but no modal input with this ID is defined in AdditionalModalInputs`,
                'missing_modal_input',
                `Add a modal input with ID: "${missingId}" to SuggestionSettings → AdditionalModalInputs section, or remove placeholders like ${examplePlaceholder}`,
                GUIDE_URLS.suggestions
            ));
        });
    }
    
    return warnings;
}

function validateConfig(config) {
    const errors = [];
    const warnings = [];
    const info = [];
    
    try {
        const packageFile = require('../../package.json');
        
        const minSupportedVersion = "1.8.5";
        if (config.Version && compareVersions(config.Version, minSupportedVersion) < 0) {
            console.log('\n' + colors.bold.red('────────────────────────────────────────────────────────────────────────'));
            console.log(colors.bold.red('🚫 UNSUPPORTED CONFIG VERSION'));
            console.log(colors.bold.red('────────────────────────────────────────────────────────────────────────'));
            console.log(colors.red(`Your config version (${config.Version}) is not supported!`));
            console.log(colors.red(`Minimum required version: ${minSupportedVersion}`));
            console.log(colors.red(`Current bot version: ${packageFile.version}`));
            console.log('');
            console.log(colors.yellow('Please update your configuration to match the current bot version.'));
            console.log(colors.yellow('Do not manually change the version, the bot will not work.'));
            console.log(colors.yellow(`Visit: ${GUIDE_URLS.main}`));
            console.log(colors.bold.red('────────────────────────────────────────────────────────────────────────'));
            console.log('');
            
            process.exit(1);
        }
        
    } catch (error) {
    }
    
    const expectedTopLevelKeys = {
        'BotToken': { required: true, description: 'Discord bot token for authentication', category: 'Core' },
        'mongoURI': { required: true, description: 'MongoDB or local database connection string', category: 'Core' },
        'BotName': { required: false, description: 'Display name for the bot', category: 'Core' },
        'Statistics': { required: false, description: 'Enable/disable startup statistics', category: 'Core' },
        'Timezone': { required: true, description: 'Bot timezone for time-based features', category: 'Core' },
        'EmbedColors': { required: true, description: 'Default embed color', category: 'Core' },
        'SuccessEmbedColor': { required: true, description: 'Success message embed color', category: 'Core' },
        'ErrorEmbedColor': { required: true, description: 'Error message embed color', category: 'Core' },

        'Dashboard': { required: true, description: 'Web dashboard configuration', category: 'Dashboard' },

        'UserUpdateLogs': { required: false, description: 'User profile change logging', category: 'Logging' },
        'RoleAddLogs': { required: false, description: 'Role addition logging', category: 'Logging' },
        'RoleRemoveLogs': { required: false, description: 'Role removal logging', category: 'Logging' },
        'GuildUpdateLogs': { required: false, description: 'Server settings change logging', category: 'Logging' },
        'ChannelCreatedLogs': { required: false, description: 'Channel creation logging', category: 'Logging' },
        'ChannelDeletedLogs': { required: false, description: 'Channel deletion logging', category: 'Logging' },
        'MessageDeleteLogs': { required: false, description: 'Message deletion logging', category: 'Logging' },
        'MessageUpdateLogs': { required: false, description: 'Message edit logging', category: 'Logging' },
        'VoiceChannelStreamStart': { required: false, description: 'Voice streaming start logging', category: 'Logging' },
        'VoiceChannelStreamStop': { required: false, description: 'Voice streaming stop logging', category: 'Logging' },
        'VoiceChannelJoin': { required: false, description: 'Voice channel join logging', category: 'Logging' },
        'VoiceChannelLeave': { required: false, description: 'Voice channel leave logging', category: 'Logging' },
        'VoiceChannelSwitch': { required: false, description: 'Voice channel switch logging', category: 'Logging' },
        'TimeoutLogs': { required: false, description: 'User timeout logging', category: 'Logging' },
        'UntimeLogs': { required: false, description: 'User timeout removal logging', category: 'Logging' },
        'WarnLogs': { required: false, description: 'Warning action logging', category: 'Logging' },
        'BanLogs': { required: false, description: 'Ban action logging', category: 'Logging' },
        'UnbanLogs': { required: false, description: 'Unban action logging', category: 'Logging' },
        'KickLogs': { required: false, description: 'Kick action logging', category: 'Logging' },
        'InviteCreateLogs': { required: false, description: 'Invite creation logging', category: 'Logging' },
        'InviteDeleteLogs': { required: false, description: 'Invite deletion logging', category: 'Logging' },
        'InviteJoinLogs': { required: false, description: 'Member join via invite logging', category: 'Logging' },
        'GiveawayLogs': { required: false, description: 'Giveaway activity logging', category: 'Logging' },

        'TicketTypes': { required: Boolean(getAddonConfigPath('TicketTypes')), description: 'Support ticket system configuration', category: 'Features' },
        'TicketPanelSettings': { required: false, description: 'Ticket panel display settings', category: 'Features' },
        'TicketTranscript': { required: false, description: 'Ticket transcript settings', category: 'Features' },
        'TicketCreation': { required: false, description: 'Ticket creation templates', category: 'Features' },
        'UserLeftDesign': { required: false, description: 'User left server notification design', category: 'Features' },
        'TicketSettings': { required: false, description: 'General ticket system settings', category: 'Features' },
        'WorkingHours': { required: false, description: 'Support working hours configuration', category: 'Features' },
        'Economy': { required: false, description: 'Economy system settings', category: 'Features' },
        'Leveling': { required: false, description: 'User leveling system configuration', category: 'Features' },
        'Suggestions': { required: false, description: 'Suggestion system settings', category: 'Features' },
        'Giveaways': { required: false, description: 'Giveaway system configuration', category: 'Features' },
        'Verification': { required: false, description: 'Member verification system', category: 'Features' },
        'AntiNuke': { required: false, description: 'Anti-nuke protection settings', category: 'Features' },
        'AntiSpam': { required: false, description: 'Anti-spam protection settings', category: 'Features' },
        'AutoMod': { required: false, description: 'Automatic moderation settings', category: 'Features' },
        'ReactionRoles': { required: false, description: 'Reaction role system', category: 'Features' },
        'AutoResponse': { required: false, description: 'Automatic response system', category: 'Features' },
        'AutoReact': { required: false, description: 'Automatic reaction system', category: 'Features' },
        'WelcomeMessages': { required: false, description: 'Welcome message configuration', category: 'Features' },
        'LeaveMessages': { required: false, description: 'Leave message configuration', category: 'Features' },
        'Permissions': { required: false, description: 'Role-based permission system', category: 'Features' }
    };

    Object.entries(expectedTopLevelKeys).forEach(([key, details]) => {
        if (details.required && !(key in config)) {
            errors.push({
                path: key,
                name: key,
                description: details.description,
                category: details.category,
                type: 'missing_section',
                docs: getDocsUrl(key)
            });
        } else if (!details.required && !(key in config)) {
            info.push({
                path: key,
                name: key,
                description: details.description,
                category: details.category,
                type: 'optional_missing'
            });
        }
    });

            const criticalValues = [
        {
            path: 'BotToken',
            value: config.BotToken,
            name: 'Bot Token',
            description: 'Discord bot token is required for authentication',
            docs: GUIDE_URLS.botToken,
            validation: (val) => val && val.length > 50 && val.includes('.'),
            hint: 'Should be in format: MTK4NzM5MTI3NjM4Mjg5MDE5.G4tU7e.xT9bKNLZyGx1BjPQsR3...'
        },
        {
            path: 'mongoURI',
            value: config.mongoURI,
            name: 'Database URI',
            description: 'Database connection string is required',
            docs: GUIDE_URLS.mongoDb,
            validation: (val) => val && (String(val).startsWith('local://') || String(val).startsWith('mongodb://') || String(val).startsWith('mongodb+srv://')),
            hint: 'Use local://ferox-localdb or mongodb://user:pass@host:27017/database'
        }
    ];
    
    

    const commonPlaceholders = [
        'YOUR_', 'REPLACE_', 'CHANGE_', 'UPDATE_', 'FILL_', 'INSERT_',
        'CHANNEL_ID', 'ROLE_ID', 'USER_ID', 'GUILD_ID', 'CATEGORY_ID',
        '123456789', 'XXXXXXXXX', 'PLACEHOLDER', 'EXAMPLE'
    ];

    criticalValues.forEach(({ path, value, name, description, docs, validation, hint }) => {
        if (!value || value === '') {
            errors.push({ path, name, description, docs, type: 'missing', hint });
        } else if (commonPlaceholders.some(placeholder => String(value).includes(placeholder))) {
            errors.push({ path, name, description, docs, type: 'placeholder', hint });
        } else if (validation && !validation(value)) {
            errors.push({ path, name, description, docs, type: 'invalid_format', hint });
        }
    });

    if (config.Dashboard?.Enabled) {
        const dashboardChecks = [
            {
                path: 'Dashboard.ClientID',
                value: config.Dashboard?.ClientID,
                name: 'Dashboard Client ID',
                validation: (val) => val && val.length >= 17 && /^\d+$/.test(val),
                hint: 'Should be your Discord application ID (17-20 digits)'
            },
            {
                path: 'Dashboard.ClientSecret',
                value: config.Dashboard?.ClientSecret,
                name: 'Dashboard Client Secret',
                validation: (val) => val && val.length > 20,
                hint: 'Should be your Discord application client secret'
            },
            {
                path: 'Dashboard.Url',
                value: config.Dashboard?.Url,
                name: 'Dashboard URL',
                validation: (val) => val && (val.startsWith('http://') || val.startsWith('https://')),
                hint: 'Should be a complete URL like https://yourdomain.com'
            },
            {
                path: 'Dashboard.Auth.JWTSecret',
                value: config.Dashboard?.Auth?.JWTSecret,
                name: 'JWT Secret',
                validation: (val) => val && val.length >= 32,
                hint: 'Should be a secure random string (32+ characters)'
            }
        ];

        dashboardChecks.forEach(({ path, value, name, validation, hint }) => {
            const isJwt = path === 'Dashboard.Auth.JWTSecret';
            if (!value || value === '') {
                errors.push(createError(
                    path, name, 
                    'Required for dashboard functionality',
                    'missing', hint, 
                    GUIDE_URLS.dashboard
                ));
            } else if (validation && !validation(value)) {
                if (isJwt) {
                    warnings.push(createWarning(
                        path, name,
                        'JWT Secret is shorter than recommended (32+ characters)',
                        'invalid_format', hint,
                        GUIDE_URLS.dashboard
                    ));
                } else {
                    errors.push(createError(
                        path, name,
                        'Invalid format or value',
                        'invalid_format', hint,
                        GUIDE_URLS.dashboard
                    ));
                }
            }
        });
    }

    const logConfigs = [
        'UserUpdateLogs', 'RoleAddLogs', 'RoleRemoveLogs', 'GuildUpdateLogs',
        'ChannelCreatedLogs', 'ChannelDeletedLogs', 'MessageDeleteLogs', 'MessageUpdateLogs',
        'VoiceChannelStreamStart', 'VoiceChannelStreamStop', 'VoiceChannelJoin', 'VoiceChannelLeave',
        'VoiceChannelSwitch', 'TimeoutLogs', 'UntimeLogs', 'WarnLogs', 'BanLogs', 'UnbanLogs',
        'KickLogs', 'InviteCreateLogs', 'InviteDeleteLogs', 'InviteJoinLogs', 'GiveawayLogs'
    ];

            logConfigs.forEach(logType => {
        const logConfig = config[logType];
        
        if (!logConfig) {
            warnings.push(createWarning(
                logType,
                `${logType} Configuration`,
                'Log configuration section is missing',
                'missing_section',
                'Add this logging section to your logging config file',
                GUIDE_URLS.main
            ));
        } else if (logConfig.Enabled && (!logConfig.LogsChannelID || logConfig.LogsChannelID === 'CHANNEL_ID')) {
            warnings.push(...validateChannelConfig(
                logConfig.LogsChannelID,
                `${logType}.LogsChannelID`,
                `${logType} Channel ID`
            ));
        }
    });

    const ticketSystemEnabled = Boolean(getAddonConfigPath('TicketTypes')) && config.TicketSettings?.Enabled !== false;
    
    if (ticketSystemEnabled) {
        if (!config.TicketTypes || Object.keys(config.TicketTypes).length === 0) {
            errors.push(createError(
                'TicketTypes',
                'Support Ticket System',
                'TicketTypes section is empty or missing ticket type configurations',
                'empty_section',
                'Add at least one ticket type (e.g., TicketType1) under the TicketTypes section',
                GUIDE_URLS.tickets
            ));
        } else {
            const ticketTypeKeys = Object.keys(config.TicketTypes);
            const invalidNames = ticketTypeKeys.filter(key => !key.match(/^TicketType\d+$/));
            
            if (invalidNames.length > 0) {
                // Calculate next available TicketType number
                const validNumbers = ticketTypeKeys
                    .filter(key => key.match(/^TicketType\d+$/))
                    .map(key => parseInt(key.replace('TicketType', '')))
                    .sort((a, b) => a - b);
                
                let nextNumber = 1;
                for (const num of validNumbers) {
                    if (num === nextNumber) {
                        nextNumber++;
                    } else {
                        break;
                    }
                }
                
                // Create example with first invalid name found
                const firstInvalidName = invalidNames[0];
                const exampleText = `Ticket types must be named TicketType1, TicketType2, etc. (Rename "${firstInvalidName}" to "TicketType${nextNumber}")`;
                
                warnings.push(createWarning(
                    'TicketTypes',
                    'Ticket Type Naming Convention',
                    `Some ticket types don't follow the required naming format: ${invalidNames.join(', ')}`,
                    'invalid_format',
                    exampleText,
                    GUIDE_URLS.tickets
                ));
            }
            
            const enabledTicketTypes = Object.entries(config.TicketTypes)
                .filter(([_, type]) => type && type.Enabled === true);

        if (enabledTicketTypes.length > 0) {
            enabledTicketTypes.forEach(([key, ticketType]) => {
                if (!ticketType.CategoryID || ticketType.CategoryID === 'CATEGORY_ID' || ticketType.CategoryID === '') {
                    warnings.push({
                        path: `TicketTypes.${key}.CategoryID`,
                        name: `${ticketType.Name || key} Category ID`,
                        description: 'Category ID is required for ticket creation',
                        docs: GUIDE_URLS.tickets,
                        type: 'missing_category',
                        hint: 'Right-click category → Copy Category ID'
                    });
                } else if (!/^\d{17,20}$/.test(ticketType.CategoryID)) {
                    warnings.push({
                        path: `TicketTypes.${key}.CategoryID`,
                        name: `${ticketType.Name || key} Category ID`,
                        description: 'Invalid category ID format',
                        docs: GUIDE_URLS.tickets,
                        type: 'invalid_format',
                        hint: 'Should be a 17-20 digit Discord snowflake ID'
                    });
                }

                if (!ticketType.SupportRole || ticketType.SupportRole.length === 0 || 
                    ticketType.SupportRole.some(role => role === 'ROLE_ID' || role === '')) {
                    warnings.push({
                        path: `TicketTypes.${key}.SupportRole`,
                        name: `${ticketType.Name || key} Support Role`,
                        description: 'Support role is required for ticket management',
                        docs: GUIDE_URLS.tickets,
                        type: 'missing_support_role',
                        hint: 'Right-click role → Copy Role ID'
                    });
                }

                if (!ticketType.Panel) {
                    warnings.push({
                        path: `TicketTypes.${key}.Panel`,
                        name: `${ticketType.Name || key} Panel Assignment`,
                        description: 'Panel assignment is required for ticket type to be displayed',
                        type: 'missing_panel',
                        hint: 'Should match a panel name in TicketPanelSettings'
                    });
                }

                if (ticketType.Claiming && ticketType.Claiming.Enabled && 
                    ticketType.Claiming.RestrictView === undefined) {
                    warnings.push({
                        path: `TicketTypes.${key}.Claiming.RestrictView`,
                        name: `${ticketType.Name || key} Claiming RestrictView`,
                        description: 'RestrictView setting is missing from claiming configuration',
                        docs: GUIDE_URLS.tickets,
                        type: 'missing_claim_setting',
                        hint: 'Add "RestrictView: true" or "RestrictView: false" to control who can view claimed tickets'
                    });
                }
            });
        }
        }
    }

    if (!config.ReactionRoles) {
        warnings.push(createWarning(
            'ReactionRoles',
            'Reaction Role System',
            'ReactionRoles section is missing from roles config file',
            'missing_section',
            'Add ReactionRoles section to enable reaction role functionality',
            GUIDE_URLS.reactionRoles
        ));
    }

    if (!config.InviteRoles) {
        warnings.push(createWarning(
            'InviteRoles',
            'Invite Role System',
            'InviteRoles section is missing from roles config file',
            'missing_section',
            'Add InviteRoles section to enable invite-based role rewards',
            GUIDE_URLS.inviteRoles
        ));
    } else if (config.InviteRoles.Enabled && config.InviteRoles.Tiers) {
        Object.entries(config.InviteRoles.Tiers).forEach(([tier, tierConfig]) => {
            warnings.push(...validatePlaceholderRoles(
                tierConfig.Roles,
                `InviteRoles.Tiers.${tier}.Roles`,
                `Invite Tier ${tier} Roles`
            ));
        });
    }

    if (config.SuggestionSettings?.Enabled) {
        warnings.push(...validateChannelConfig(
            config.SuggestionSettings.ChannelID,
            'SuggestionSettings.ChannelID',
            'Suggestion Channel ID'
        ));

        if (config.SuggestionAcceptEmbed?.AcceptChannelID) {
            warnings.push(...validateChannelConfig(
                config.SuggestionAcceptEmbed.AcceptChannelID,
                'SuggestionAcceptEmbed.AcceptChannelID',
                'Suggestion Accept Channel ID'
            ));
        }

        if (config.SuggestionDenyEmbed?.DenyChannelID) {
            warnings.push(...validateChannelConfig(
                config.SuggestionDenyEmbed.DenyChannelID,
                'SuggestionDenyEmbed.DenyChannelID',
                'Suggestion Deny Channel ID'
            ));
        }

        warnings.push(...validatePlaceholderRoles(
            config.SuggestionSettings.AllowedRoles,
            'SuggestionSettings.AllowedRoles',
            'Suggestion Allowed Roles'
        ));

        warnings.push(...validatePlaceholderRoles(
            config.SuggestionSettings.SuggestionAcceptDenyRoles,
            'SuggestionSettings.SuggestionAcceptDenyRoles',
            'Suggestion Accept/Deny Roles'
        ));

        const availableModalIds = [];
        if (config.SuggestionSettings.AdditionalModalInputs) {
            Object.values(config.SuggestionSettings.AdditionalModalInputs).forEach(modalInput => {
                if (modalInput && modalInput.ID) {
                    availableModalIds.push(modalInput.ID);
                }
            });
        }

        warnings.push(...validateModalPlaceholders(
            config.SuggestionEmbed,
            'SuggestionEmbed',
            'Suggestion Embed',
            availableModalIds
        ));

        warnings.push(...validateModalPlaceholders(
            config.SuggestionAcceptEmbed,
            'SuggestionAcceptEmbed',
            'Suggestion Accept Embed',
            availableModalIds
        ));

        warnings.push(...validateModalPlaceholders(
            config.SuggestionDenyEmbed,
            'SuggestionDenyEmbed',
            'Suggestion Deny Embed',
            availableModalIds
        ));
    }

    if (fs.existsSync(ADDONS_DIR)) {
        const helpers = { validatePlaceholderRoles, validatePlaceholderChannels, validatePlaceholderCategories };
        for (const entry of fs.readdirSync(ADDONS_DIR, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            const validatorPath = path.join(ADDONS_DIR, entry.name, 'config', 'validate.js');
            if (!fs.existsSync(validatorPath)) continue;
            try {
                delete require.cache[require.resolve(validatorPath)];
                const validator = require(validatorPath);
                const addonWarnings = typeof validator === 'function' ? validator(config, helpers) : [];
                if (Array.isArray(addonWarnings)) warnings.push(...addonWarnings);
            } catch (error) {
                warnings.push({ path: entry.name, name: `${entry.name} addon config`, description: error.message, type: 'addon_config_validation' });
            }
        }
    }
    return { errors, warnings, info };
}

function findConfigLineNumber(configPath, error = null) {
    try {
        const targetFile = getConfigFileForPath(configPath);
        const configContent = fs.readFileSync(targetFile, 'utf8');
        const lines = configContent.split('\n');
        
        if (error && (configPath === 'TicketTypes' || configPath === 'ReactionRoles' || configPath === 'InviteRoles' || configPath === 'DataPurge' || configPath === 'Dashboard')) {
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line === `${configPath}:`) {
                    return i + 2;
                }
            }
        }
        
        const pathParts = configPath.split('.');
        
        let currentIndent = -1;
        let foundSections = [];
        let targetDepth = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            
            if (!trimmedLine || trimmedLine.startsWith('#')) continue;
            
            const indent = line.length - line.trimStart().length;
            const keyMatch = trimmedLine.match(/^([^:]+):/);
            
            if (keyMatch) {
                const key = keyMatch[1].trim();
                
                if (indent <= currentIndent) {
                    foundSections = foundSections.slice(0, Math.floor(indent / 2));
                }
                
                currentIndent = indent;
                const depth = Math.floor(indent / 2);
                foundSections[depth] = key;
                
                const currentPath = foundSections.slice(0, depth + 1).join('.');
                if (currentPath === pathParts.slice(0, depth + 1).join('.')) {
                    if (depth === pathParts.length - 1) {
                        return i + 1;
                    }
                }
            }
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

function getDocsUrl(configKey) {
    const urlMap = {
        'BotToken': GUIDE_URLS.botToken,
        'mongoURI': GUIDE_URLS.mongoDb,
        'Dashboard': GUIDE_URLS.dashboard,
        'TicketTypes': GUIDE_URLS.tickets,
        'Economy': GUIDE_URLS.economy,
        'ReactionRoles': GUIDE_URLS.reactionRoles,
        'InviteRoles': GUIDE_URLS.inviteRoles,
        'SuggestionSettings': GUIDE_URLS.suggestions,
        'Giveaways': GUIDE_URLS.giveaways,
        'LevelingSystem': GUIDE_URLS.leveling,
        'Backup': GUIDE_URLS.backup,
        'WelcomeMessage': GUIDE_URLS.welcomeLeave,
        'LeaveMessage': GUIDE_URLS.welcomeLeave,
        'VerificationSettings': GUIDE_URLS.verification,
        'ModerationRoles': GUIDE_URLS.moderation
    };
    
    return urlMap[configKey] || GUIDE_URLS.main;
}

function displayConfigErrors(errors, warnings, info = []) {
    if (errors.length > 0) {
        console.log('\n' + colors.bold.red('────────────────────────────────────────────────────────────────────────'));
        console.log(colors.bold.red('🛑 CONFIGURATION ERROR - BOT CANNOT START'));
        console.log(colors.bold.red('────────────────────────────────────────────────────────────────────────'));
        console.log(colors.red('│'));
        
        errors.forEach((error, index) => {
            const friendlyName = getUserFriendlyName(error.path);
            const fix = getUserFriendlyFix(error);
            const lineNumber = findConfigLineNumber(error.path, error);
            const fileLabel = getDisplayFileLabel(error.path);
            
            console.log(colors.red(`│  ${index + 1}. ${colors.bold(friendlyName)}`));
            if (error.type === 'empty_section') {
                console.log(colors.red(`│     📍Add content at line ${lineNumber ?? '...'} in ${fileLabel}`));
            } else if (error.suggestedLine === 'add_after_line') {
                console.log(colors.red(`│     Add after line ${lineNumber ?? '...'} in ${fileLabel}`));
            } else {
                const loc = lineNumber ? `Line ${lineNumber} in ${fileLabel}` : fileLabel;
                console.log(colors.red(`│     📍 ${loc}`));
            }
            console.log(colors.red(`│     🔧 ${fix.split('\n').join('\n│        ')}`));
            console.log(colors.red('│'));
        });

        console.log(colors.red('│  🔧 Quick Fix:'));
        const quickFixConfigFile = getDisplayFileLabel('Version');
        console.log(colors.red(`│     1. Open ${quickFixConfigFile} in your text editor`));
        console.log(colors.red('│     2. Go to each line number shown above'));
        console.log(colors.red('│     3. Replace the placeholder values with real ones'));
        console.log(colors.red('│     4. Save and restart the bot'));
        console.log(colors.red('│'));
        console.log(colors.red('│  🆘 Need help? Join discord.gg/DragonsHosting'));
        console.log(colors.red('│'));
        console.log(colors.bold.red('────────────────────────────────────────────────────────────────────────\n'));
        
        process.exit(1);
    }

    if (warnings.length > 0) {
        console.log('\n' + colors.bold.yellow('────────────────────────────────────────────────────────────────────────'));
        console.log(colors.bold.yellow('⚠️  SETUP SUGGESTIONS'));
        console.log(colors.bold.yellow('────────────────────────────────────────────────────────────────────────'));
        console.log(colors.yellow('│'));
        console.log(colors.yellow('│  ✅ Good news! Your bot will start successfully.'));
        console.log(colors.yellow('│     Some features need quick setup to work properly.'));
        console.log(colors.yellow('│'));

        const ticketIssues = warnings.filter(w => w.path.includes('Ticket'));
        const loggingIssues = warnings.filter(w => w.path.includes('Logs'));
        const suggestionIssues = warnings.filter(w => w.path.includes('Suggestion'));
        const dataPurgeIssues = warnings.filter(w => w.path.includes('DataPurge'));
        const welcomeLeaveIssues = warnings.filter(w => w.path.includes('WelcomeMessage') || w.path.includes('LeaveMessage'));
        const verificationIssues = warnings.filter(w => w.path.includes('VerificationSettings') || w.path.includes('JoinRoleSettings'));
        const otherIssues = warnings.filter(w => !w.path.includes('Ticket') && !w.path.includes('Logs') && !w.path.includes('Suggestion') && !w.path.includes('DataPurge') && !w.path.includes('WelcomeMessage') && !w.path.includes('LeaveMessage') && !w.path.includes('VerificationSettings') && !w.path.includes('JoinRoleSettings'));

        if (ticketIssues.length > 0) {
            console.log(colors.yellow('│  🎫 TICKET SYSTEM NEEDS SETUP:'));
            console.log(colors.yellow('│'));
            
            // Handle general ticket system warnings first (like naming convention)
            const generalTicketWarnings = ticketIssues.filter(warning => warning.path === 'TicketTypes');
            const specificTicketWarnings = ticketIssues.filter(warning => warning.path !== 'TicketTypes');
            
            // Display general warnings
            generalTicketWarnings.forEach(warning => {
                const lineNumber = findConfigLineNumber(warning.path);
                const fileLabel = getDisplayFileLabel(warning.path);
                
                console.log(colors.yellow(`│     🎫 ${colors.bold(warning.name)}:`));
                console.log(colors.yellow(`│        ❌ ${warning.description}`));
                console.log(colors.yellow(`│           📍 File: ${lineNumber ? `Line ${lineNumber} in ` : ''}${fileLabel}`));
                console.log(colors.yellow(`│           🔧 ${warning.hint}`));
                console.log(colors.yellow('│'));
            });
            
            // Group specific ticket type warnings by ticket type for better organization
            const ticketGroups = {};
            specificTicketWarnings.forEach(warning => {
                const pathParts = warning.path.split('.');
                const ticketKey = pathParts[1]; // e.g., "TicketType2"
                const ticketName = warning.name.replace(' Category ID', '').replace(' Support Role', '').replace(' Panel Assignment', '');
                
                if (!ticketGroups[ticketKey]) {
                    ticketGroups[ticketKey] = {
                        name: ticketName,
                        warnings: []
                    };
                }
                ticketGroups[ticketKey].warnings.push(warning);
            });
            
            let displayedGroups = 0;
            Object.entries(ticketGroups).forEach(([ticketKey, group]) => {
                if (displayedGroups < 3) { // Limit to 3 ticket types for readability
                    console.log(colors.yellow(`│     🎫 ${colors.bold(group.name)} Ticket Type:`));
                    
                    group.warnings.forEach(warning => {
                        const pathParts = warning.path.split('.');
                        const settingKey = pathParts[2];
                        const lineNumber = findConfigLineNumber(warning.path);
                        const fileLabel = getDisplayFileLabel(warning.path);
                        
                        if (warning.path.includes('CategoryID')) {
                            console.log(colors.yellow(`│        ❌ Missing Category ID`));
                            console.log(colors.yellow(`│           📍 File: ${lineNumber ? `Line ${lineNumber} in ` : ''}${fileLabel}`));
                            console.log(colors.yellow(`│           🔧 Change: ${colors.red('"CATEGORY_ID"')} → ${colors.green('"0"')}`));
                            console.log(colors.yellow(`│           💡 How: Right-click Discord category → Copy Category ID`));
                        } else if (warning.path.includes('SupportRole')) {
                            console.log(colors.yellow(`│        ❌ Missing Support Roles`));
                            console.log(colors.yellow(`│           📍 File: ${lineNumber ? `Line ${lineNumber} in ` : ''}${fileLabel}`));
                            console.log(colors.yellow(`│           🔧 Change: ${colors.red('["ROLE_ID"]')} → ${colors.green('["0"]')}`));
                            console.log(colors.yellow(`│           💡 How: Right-click Discord role → Copy Role ID`));
                        } else if (warning.path.includes('Panel')) {
                            console.log(colors.yellow(`│        ❌ Missing Panel Assignment`));
                            console.log(colors.yellow(`│           📍 File: ${lineNumber ? `Line ${lineNumber} in ` : ''}${fileLabel}`));
                            console.log(colors.yellow(`│           🔧 Set Panel name (e.g., "Panel1")`));
                            console.log(colors.yellow(`│           💡 Must match a panel in TicketPanelSettings`));
                        }
                    });
                    console.log(colors.yellow('│'));
                    displayedGroups++;
                }
            });
            
            const remainingGroups = Object.keys(ticketGroups).length - displayedGroups;
            if (remainingGroups > 0) {
                console.log(colors.yellow(`│     📋 ... and ${remainingGroups} more ticket type${remainingGroups > 1 ? 's' : ''} need${remainingGroups === 1 ? 's' : ''} configuration`));
                console.log(colors.yellow('│'));
            }
        }

        if (loggingIssues.length > 0) {
            console.log(colors.yellow('│  📋 LOGGING FEATURES NEED SETUP:'));
            console.log(colors.yellow('│'));
            
            const displayLimit = Math.min(3, loggingIssues.length);
            for (let i = 0; i < displayLimit; i++) {
                const warning = loggingIssues[i];
                const logType = warning.name.replace(' Channel ID', '').replace(' Configuration', '');
                const lineNumber = findConfigLineNumber(warning.path);
                const fileLabel = getDisplayFileLabel(warning.path);
                
                console.log(colors.yellow(`│     📋 ${colors.bold(logType)}:`));
                console.log(colors.yellow(`│        ❌ Missing log channel`));
                console.log(colors.yellow(`│           📍 File: ${lineNumber ? `Line ${lineNumber} in ` : ''}${fileLabel}`));
                console.log(colors.yellow(`│           🔧 Change: ${colors.red('"CHANNEL_ID"')} → ${colors.green('"0"')}`));
                console.log(colors.yellow(`│           💡 How: Right-click Discord channel → Copy Channel ID`));
                console.log(colors.yellow('│'));
            }
            
            if (loggingIssues.length > 3) {
                console.log(colors.yellow(`│     📋 ... and ${loggingIssues.length - 3} more logging feature${loggingIssues.length - 3 > 1 ? 's' : ''} need channel IDs`));
                console.log(colors.yellow('│'));
            }
        }

        if (suggestionIssues.length > 0) {
            console.log(colors.yellow('│  💭 SUGGESTION SYSTEM NEEDS SETUP:'));
            console.log(colors.yellow('│'));
            suggestionIssues.forEach((warning, index) => {
                if (index < 4) {
                    const pathParts = warning.path.split('.');
                    const configSection = pathParts[0];
                    const settingKey = pathParts[1];
                    
                    const lineNumber = findConfigLineNumber(warning.path);
                    const fileLabel = getDisplayFileLabel(warning.path);
                    const lineInfo = lineNumber ? colors.cyan(`Line ${lineNumber} in ${fileLabel}`) : colors.cyan(fileLabel);
                    
                    if (warning.path.includes('ChannelID')) {
                        let channelType = 'Suggestion';
                        if (warning.path.includes('Accept')) channelType = 'Accept';
                        if (warning.path.includes('Deny')) channelType = 'Deny';
                        
                        console.log(colors.yellow(`│     💭 ${colors.bold(`${channelType} Channel`)} - Missing Channel ID`));
                        console.log(colors.yellow(`│       📍 Location: ${lineInfo} - ${colors.cyan(`${configSection} → ${settingKey}`)}`));
                        console.log(colors.yellow(`│       🔧 Replace: ${colors.red(`"CHANNEL_ID"`)} with a real Discord channel ID`));
                        console.log(colors.yellow(`│       💡 Get ID: Right-click Discord channel → Copy Channel ID`));
                    } else if (warning.path.includes('Roles')) {
                        let roleType = 'Allowed';
                        if (warning.path.includes('AcceptDeny')) roleType = 'Accept/Deny';
                        
                        console.log(colors.yellow(`│     💭 ${colors.bold(`${roleType} Roles`)} - Missing Role IDs`));
                        console.log(colors.yellow(`│       📍 Location: ${lineInfo} - ${colors.cyan(`${configSection} → ${settingKey}`)}`));
                        console.log(colors.yellow(`│       🔧 Replace: ${colors.red(`["ROLE_ID"]`)} with real Discord role IDs`));
                        console.log(colors.yellow(`│       💡 Get ID: Right-click Discord role → Copy Role ID`));
                    } else if (warning.type === 'missing_modal_input') {
                        const embedType = warning.path.includes('Accept') ? 'Accept' : 
                                        warning.path.includes('Deny') ? 'Deny' : 'Main';
                        
                        console.log(colors.yellow(`│     💭 ${colors.bold(`${embedType} Embed Modal`)} - Invalid Modal Placeholder`));
                        console.log(colors.yellow(`│       📍 Location: ${lineInfo} - ${colors.cyan(`${configSection}`)}`));
                        console.log(colors.yellow(`│       ❌ Problem: ${warning.description}`));
                        console.log(colors.yellow(`│       🔧 Solution: ${warning.hint}`));
                        console.log(colors.yellow(`│       💡 Modal IDs are defined in SuggestionSettings → AdditionalModalInputs`));
                    }
                    console.log(colors.yellow('│'));
                }
            });
            if (suggestionIssues.length > 4) {
                console.log(colors.yellow(`│     📋 ... and ${suggestionIssues.length - 4} more suggestion features need setup`));
                console.log(colors.yellow('│'));
            }
        }

        if (dataPurgeIssues.length > 0) {
            console.log(colors.yellow('│  🗑️ DATA PURGE SYSTEM NEEDS SETUP:'));
            console.log(colors.yellow('│'));
            dataPurgeIssues.forEach((warning, index) => {
                if (index < 3) {
                    const lineNumber = findConfigLineNumber(warning.path);
                    const fileLabel = getDisplayFileLabel(warning.path);
                    const lineInfo = lineNumber ? colors.cyan(`Line ${lineNumber} in ${fileLabel}`) : colors.cyan(fileLabel);
                    
                    console.log(colors.yellow(`│     ▶ ${colors.bold('Data Purge System')} - Missing Configuration`));
                    console.log(colors.yellow(`│       📍 Location: ${lineInfo} - ${colors.cyan('DataPurge section')}`));
                    console.log(colors.yellow(`│       🔧 Add DataPurge section to enable automatic data cleanup`));
                    console.log(colors.yellow(`│       💡 Check the default config file for the complete DataPurge structure`));
                    console.log(colors.yellow('│'));
                }
            });
            if (dataPurgeIssues.length > 3) {
                console.log(colors.yellow(`│     📋 ... and ${dataPurgeIssues.length - 3} more data purge settings need attention`));
                console.log(colors.yellow('│'));
            }
        }

        if (welcomeLeaveIssues.length > 0) {
            console.log(colors.yellow('│  👋 WELCOME/LEAVE MESSAGES NEED SETUP:'));
            console.log(colors.yellow('│'));
            welcomeLeaveIssues.forEach((warning, index) => {
                if (index < 3) {
                    const pathParts = warning.path.split('.');
                    const messageType = pathParts[0];
                    const settingKey = pathParts[1];
                    
                    const lineNumber = findConfigLineNumber(warning.path);
                    const fileLabel = getDisplayFileLabel(warning.path);
                    const lineInfo = lineNumber ? colors.cyan(`Line ${lineNumber} in ${fileLabel}`) : colors.cyan(fileLabel);
                    
                    let displayName = messageType === 'WelcomeMessage' ? 'Welcome Message' : 'Leave Message';
                    
                    console.log(colors.yellow(`│     ▶ ${colors.bold(displayName)} - Missing AutoDelete Configuration`));
                    console.log(colors.yellow(`│       📍 Location: ${lineInfo} - ${colors.cyan(`${messageType} → ${settingKey}`)}`));
                    console.log(colors.yellow(`│       🔧 Add AutoDelete section to control automatic message deletion`));
                    console.log(colors.yellow(`│       💡 Check the default config file for the complete AutoDelete structure`));
                    console.log(colors.yellow('│'));
                }
            });
            if (welcomeLeaveIssues.length > 3) {
                console.log(colors.yellow(`│     📋 ... and ${welcomeLeaveIssues.length - 3} more welcome/leave settings need attention`));
                console.log(colors.yellow('│'));
            }
        }

        if (verificationIssues.length > 0) {
            console.log(colors.yellow('│  🔐 VERIFICATION & ROLE SYSTEM NEEDS SETUP:'));
            console.log(colors.yellow('│'));
            
            const verificationGroups = {};
            verificationIssues.forEach(warning => {
                const pathParts = warning.path.split('.');
                const systemType = pathParts[0]; // e.g., "VerificationSettings" or "JoinRoleSettings"
                
                if (!verificationGroups[systemType]) {
                    verificationGroups[systemType] = {
                        name: systemType === 'VerificationSettings' ? 'Verification System' : 'Join Role System',
                        warnings: []
                    };
                }
                verificationGroups[systemType].warnings.push(warning);
            });
            
            let displayedGroups = 0;
            Object.entries(verificationGroups).forEach(([systemKey, group]) => {
                if (displayedGroups < 2) { // Limit to 2 system types for readability
                    console.log(colors.yellow(`│     🔐 ${colors.bold(group.name)}:`));
                    
                    group.warnings.forEach(warning => {
                        const lineNumber = findConfigLineNumber(warning.path);
                        const fileLabel = getDisplayFileLabel(warning.path);
                        
                        if (warning.path.includes('ChannelID')) {
                            console.log(colors.yellow(`│        ❌ Missing verification channel`));
                            console.log(colors.yellow(`│           📍 File: ${lineNumber ? `Line ${lineNumber} in ` : ''}${fileLabel}`));
                            console.log(colors.yellow(`│           🔧 Change: ${colors.red('"CHANNEL_ID"')} → ${colors.green('"0"')}`));
                            console.log(colors.yellow(`│           💡 How: Right-click Discord channel → Copy Channel ID`));
                        } else if (warning.path.includes('VerifiedRoleID')) {
                            console.log(colors.yellow(`│        ❌ Missing verified roles`));
                            console.log(colors.yellow(`│           📍 File: ${lineNumber ? `Line ${lineNumber} in ` : ''}${fileLabel}`));
                            console.log(colors.yellow(`│           🔧 Change: ${colors.red('["ROLE_ID"]')} → ${colors.green('["0"]')}`));
                            console.log(colors.yellow(`│           💡 How: Right-click Discord role → Copy Role ID`));
                        } else if (warning.path.includes('JoinRoles')) {
                            console.log(colors.yellow(`│        ❌ Missing join roles`));
                            console.log(colors.yellow(`│           📍 File: ${lineNumber ? `Line ${lineNumber} in ` : ''}${fileLabel}`));
                            console.log(colors.yellow(`│           🔧 Change: ${colors.red('["ROLE_ID"]')} → ${colors.green('["0"]')}`));
                            console.log(colors.yellow(`│           💡 How: Right-click Discord role → Copy Role ID`));
                        }
                    });
                    console.log(colors.yellow('│'));
                    displayedGroups++;
                }
            });
            
            const remainingGroups = Object.keys(verificationGroups).length - displayedGroups;
            if (remainingGroups > 0) {
                console.log(colors.yellow(`│     📋 ... and ${remainingGroups} more system${remainingGroups > 1 ? 's' : ''} need${remainingGroups === 1 ? 's' : ''} configuration`));
                console.log(colors.yellow('│'));
            }
        }

        if (otherIssues.length > 0) {
            console.log(colors.yellow('│  🔧 OTHER SETUP ITEMS:'));
            otherIssues.forEach((warning, index) => {
                if (index < 3) {
                    const lineNumber = findConfigLineNumber(warning.path);
                    const fileLabel = getDisplayFileLabel(warning.path);
                    const lineInfo = lineNumber ? colors.cyan(`Line ${lineNumber} in ${fileLabel}`) : colors.cyan(fileLabel);
                    console.log(colors.yellow(`│     • ${getUserFriendlyName(warning.path)}: ${getUserFriendlyDescription(warning)}`));
                    console.log(colors.yellow(`│       📍 Location: ${lineInfo}`));
                    if (warning.hint) {
                        console.log(colors.yellow(`│       🔧 ${warning.hint}`));
                    }
                }
            });
            if (otherIssues.length > 3) {
                console.log(colors.yellow(`│     • ... and ${otherIssues.length - 3} more items`));
            }
            console.log(colors.yellow('│'));
        }

        console.log(colors.yellow('│  💡 QUICK SUMMARY:'));
        console.log(colors.yellow('│     • Your bot will work for basic functions'));
        console.log(colors.yellow('│     • Features listed above need configuration to work properly'));
        console.log(colors.yellow('│     • Each issue shows exactly what to change and where'));
        console.log(colors.yellow('│'));
        console.log(colors.yellow('│  🚀 NEXT STEPS:'));
        console.log(colors.yellow('│     1. Open the relevant config files in your text editor'));
        console.log(colors.yellow('│     2. Go to each line number shown above'));
        console.log(colors.yellow('│     3. Replace the red values with the green examples'));
        console.log(colors.yellow('│     4. Save and restart your bot'));
        console.log(colors.yellow('│'));
        console.log(colors.yellow(`│  📚 Need help? ${GUIDE_URLS.main}`));
        console.log(colors.yellow('│'));
        console.log(colors.bold.yellow('────────────────────────────────────────────────────────────────────────\n'));
    }


}

function getUserFriendlyName(path) {
    const names = {
        'BotToken': 'Bot Token (Discord Authentication)',
        'mongoURI': 'Database Connection',
        'Dashboard': 'Web Dashboard Settings',
        'Timezone': 'Time Zone Setting',
        'EmbedColors': 'Message Colors',
        'SuccessEmbedColor': 'Success Message Color',
        'ErrorEmbedColor': 'Error Message Color',
        'TicketTypes': 'Support Ticket System'
    };
    
    const mainKey = path.split('.')[0];
    return names[mainKey] || path;
}

function getUserFriendlyDescription(error) {
    if (error.type === 'missing') {
        return 'This setting is empty and needs to be filled in';
    } else if (error.type === 'placeholder') {
        return 'This still has placeholder text that needs to be replaced with your real information';
    } else if (error.type === 'invalid_format') {
        return 'The format of this setting isn\'t quite right';
    } else if (error.type === 'missing_section') {
        return 'This section is missing from your configuration file';
    }
    return 'This setting needs attention';
}

function displayChannelIdError(channelId, context = '', configPath = '') {
    console.log('\n' + colors.bold.red('────────────────────────────────────────────────────────────────────────'));
    console.log(colors.bold.red('🔗 INVALID CHANNEL ID ERROR'));
    console.log(colors.bold.red('────────────────────────────────────────────────────────────────────────'));
    console.log(colors.red('│'));
    console.log(colors.red(`│  ❌ ${colors.bold('Invalid Channel ID:')} "${channelId}"`));
    if (context) {
        console.log(colors.red(`│  📍 ${colors.bold('Context:')} ${context}`));
    }
    console.log(colors.red('│'));
    
    if (configPath) {
        const lineNumber = findConfigLineNumber(configPath);
        const fileLabel = getDisplayFileLabel(configPath);
        const locationInfo = lineNumber ? `Line ${lineNumber} in ${fileLabel}` : fileLabel;
        console.log(colors.red(`│  📍 ${colors.bold('Configuration Location:')} ${locationInfo}`));
        console.log(colors.red('│'));
    }
    
    console.log(colors.red('│  🔧 ' + colors.bold('How to Fix:')));
    console.log(colors.red('│     1. Right-click the Discord channel you want to use'));
    console.log(colors.red('│     2. Select "Copy Channel ID" (requires Developer Mode)'));
    console.log(colors.red('│     3. Replace "CHANNEL_ID" with the actual channel ID'));
    console.log(colors.red('│     4. Channel IDs should be 17-20 digit numbers'));
    console.log(colors.red('│'));
    console.log(colors.red('│  💡 ' + colors.bold('Example:')));
    console.log(colors.red('│     ❌ Bad:  "CHANNEL_ID"'));
    console.log(colors.red('│     ✅ Good: "0"'));
    console.log(colors.red('│'));
    console.log(colors.red('│  📚 Need help enabling Developer Mode?'));
    console.log(colors.red(`│     ${GUIDE_URLS.developerMode}`));
    console.log(colors.red('│'));
    console.log(colors.bold.red('────────────────────────────────────────────────────────────────────────\n'));
}

function isValidSnowflake(id) {
    return /^\d{17,20}$/.test(id);
}

function validateChannelId(channelId, context = '', configPath = '') {
    if (!channelId || channelId === 'CHANNEL_ID' || !isValidSnowflake(channelId)) {
        displayChannelIdError(channelId, context, configPath);
        return false;
    }
    return true;
}

const GUIDE_URLS = {
    main: 'https://feather.dragonshosting.nl/',
    botToken: ""
    guildId: 'https://feather.dragonshosting.nl/#how-to-find-your-guild-id',
    developerMode: 'https://feather.dragonshosting.nl/getting-started/developer-mode-copying-ids',
    mongoDb: 'https://feather.dragonshosting.nl/getting-started/mongodb-setup',
    dashboard: 'https://feather.dragonshosting.nl/getting-started/dashboard-setup',
    
    // Core features
    tickets: 'https://feather.dragonshosting.nl/core-features/ticket-system',
    customCommands: 'https://feather.dragonshosting.nl/core-features/custom-commands',
    suggestions: 'https://feather.dragonshosting.nl/core-features/suggestions',
    backup: 'https://feather.dragonshosting.nl/core-features/backup',
    
    // Economy and engagement
    leveling: 'https://feather.dragonshosting.nl/economy-and-engagement/leveling',
    giveaways: 'https://feather.dragonshosting.nl/economy-and-engagement/giveaways',
    economy: 'https://feather.dragonshosting.nl/economy-and-engagement/economy',
    
    // Moderation and roles
    verification: 'https://feather.dragonshosting.nl/moderation-and-roles/verification',
    inviteRoles: 'https://feather.dragonshosting.nl/moderation-and-roles/invite-roles',
    reactionRoles: 'https://feather.dragonshosting.nl/moderation-and-roles/reaction-roles',
    moderation: 'https://feather.dragonshosting.nl/moderation-and-roles/moderation',
    
    // Community interaction
    welcomeLeave: 'https://feather.dragonshosting.nl/community-interaction/welcome-and-leave',
    
    // Support
    support: 'discord.gg/DragonsHosting',
    
    timezones: 'https://gist.github.com/diogocapela/12c6617fc87607d11fd62d2a4f42b02a'
};

const CONFIG_FIXES = {
    'BotToken': {
        message: 'Get your bot token from Discord Developer Portal → Your App → Bot → Token',
        guide: GUIDE_URLS.botToken
    },
    'mongoURI': {
        message: 'Use local://ferox-localdb or a MongoDB connection string such as mongodb://user:pass@host:27017/database',
        guide: GUIDE_URLS.mongoDb
    },
    'Dashboard': {
        message: 'Add the Dashboard section to your dashboard config file',
        guide: GUIDE_URLS.dashboard
    },
    'Dashboard.ClientID': {
        message: 'Replace "CLIENT_ID" with your Discord application\'s Client ID',
        guide: GUIDE_URLS.dashboard
    },
    'Dashboard.ClientSecret': {
        message: 'Replace "CLIENT_SECRET" with your Discord application\'s Client Secret',
        guide: GUIDE_URLS.dashboard
    },
    'Timezone': {
        message: 'Set your timezone like "America/New_York" or "Europe/London"',
        guide: GUIDE_URLS.main
    },
    'EmbedColors': {
        message: 'Set a color code like "#1769FF" for message colors',
        guide: GUIDE_URLS.main
    },
    'SuccessEmbedColor': {
        message: 'Set a green color like "#2ecc71" for success messages',
        guide: GUIDE_URLS.main
    },
    'ErrorEmbedColor': {
        message: 'Set a red color like "#E74C3C" for error messages',
        guide: GUIDE_URLS.main
    },
    'TicketTypes': {
        message: 'Add the TicketTypes section with at least one ticket type',
        example: 'TicketTypes:\n           TicketType1:\n             Enabled: true\n             Name: "General Support"\n             CategoryID: "YOUR_CATEGORY_ID"\n             SupportRole: ["YOUR_ROLE_ID"]',
        guide: GUIDE_URLS.tickets
    },
    'ReactionRoles': {
        message: 'Add the ReactionRoles section to enable reaction role functionality',
        example: 'ReactionRoles:\n           Enabled: true\n           Panel1:\n             type: "BUTTON"\n             ChannelID: "YOUR_CHANNEL_ID"',
        guide: GUIDE_URLS.reactionRoles
    },
    'InviteRoles': {
        message: 'Add the InviteRoles section to enable invite-based role rewards',
        example: 'InviteRoles:\n           Enabled: true\n           Tiers:\n             1:\n               Roles: ["YOUR_ROLE_ID"]\n               Amount: 5',
        guide: GUIDE_URLS.inviteRoles
    },
    'DataPurge': {
        message: 'Add the DataPurge section to enable automatic data cleanup',
        example: 'DataPurge:\n           Enabled: true\n           UserMessages:\n             Enabled: true\n             RetentionDays: 90',
        guide: GUIDE_URLS.backup
    },
    'SuggestionSettings': {
        message: 'Add the SuggestionSettings section to enable the suggestion system',
        example: 'SuggestionSettings:\n           Enabled: true\n           ChannelID: "YOUR_CHANNEL_ID"',
        guide: GUIDE_URLS.suggestions
    },
    'LevelingSystem': {
        message: 'Add the LevelingSystem section to enable user leveling',
        example: 'LevelingSystem:\n           Enabled: true\n           XPPerMessage: 15\n           XPCooldown: 60',
        guide: GUIDE_URLS.leveling
    },
    'Giveaways': {
        message: 'Add the Giveaways section to enable giveaway functionality',
        example: 'Giveaways:\n           AllowRoles: ["YOUR_ROLE_ID"]\n           DirectMessageWinners: true',
        guide: GUIDE_URLS.giveaways
    },
    'WelcomeMessage': {
        message: 'Add the WelcomeMessage section to welcome new members',
        example: 'WelcomeMessage:\n           Enabled: true\n           ChannelID: "YOUR_CHANNEL_ID"',
        guide: GUIDE_URLS.welcomeLeave
    },
    'LeaveMessage': {
        message: 'Add the LeaveMessage section to announce member departures',
        example: 'LeaveMessage:\n           Enabled: true\n           ChannelID: "YOUR_CHANNEL_ID"',
        guide: GUIDE_URLS.welcomeLeave
    }
};

function formatConfigFix(configKey, path) {
    const fix = CONFIG_FIXES[configKey];
    if (!fix) {
        return 'Check the documentation for setup instructions';
    }
    
    let message = fix.message;
    
    if (fix.example) {
        message += `:\n         ${fix.example}`;
    }
    
    if (fix.guide) {
        message += `\n         📚 Guide: ${fix.guide}`;
    }
    
    return message;
}

function getUserFriendlyFix(error) {
    const fullPath = error.path;
    const mainKey = error.path.split('.')[0];
    
    return formatConfigFix(fullPath, error.path) !== 'Check the documentation for setup instructions' 
        ? formatConfigFix(fullPath, error.path)
        : formatConfigFix(mainKey, error.path);
}

loadAllConfigs();

module.exports = {
    getConfig,
    getLang,
    getCommands,
    validateConfig,
    displayConfigErrors,
    displayChannelIdError,
    validateChannelId,
    isValidSnowflake,
    replacePlaceholders
};
