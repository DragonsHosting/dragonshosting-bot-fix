'use strict';

module.exports = (config, helpers) => {
    const settings = config.Music;
    if (!settings?.Enabled) return [];

    const warnings = [];
    const guide = 'https://feather.dragonshosting.nl/core-features/music';
    const range = (key, min, max, description, hint) => {
        const value = settings[key];
        if (value === undefined || (value >= min && value <= max)) return;
        warnings.push({
            path: `Music.${key}`,
            name: `Music ${key}`,
            description,
            docs: guide,
            type: 'invalid_format',
            hint
        });
    };

    range('DefaultVolume', 0, 100, 'Volume must be between 0 and 100', 'Set DefaultVolume to a number between 0 and 100');
    range('LeaveEndDelay', 10000, 3600000, 'Leave delay should be between 10 seconds and 1 hour', 'Recommended range: 60000-600000 (1-10 minutes)');
    range('LeaveEmptyDelay', 5000, 300000, 'Empty delay should be between 5 seconds and 5 minutes', 'Recommended range: 30000-120000 (30 seconds - 2 minutes)');
    range('MaxQueueSize', 1, 1000, 'Queue size should be between 1 and 1000', 'Recommended range: 50-200 tracks');

    if (settings.EmbedColor && !/^#[0-9A-Fa-f]{6}$/.test(settings.EmbedColor)) {
        warnings.push({
            path: 'Music.EmbedColor',
            name: 'Music Embed Color',
            description: 'Invalid hex color format',
            docs: guide,
            type: 'invalid_format',
            hint: 'Use a six digit hex color such as #1769FF'
        });
    }

    warnings.push(...helpers.validatePlaceholderRoles(settings.RequiredRoles, 'Music.RequiredRoles', 'Music Required Roles'));
    warnings.push(...helpers.validatePlaceholderRoles(settings.RequiredControlRoles, 'Music.RequiredControlRoles', 'Music Control Roles'));
    warnings.push(...helpers.validatePlaceholderChannels(settings.AllowedChannels, 'Music.AllowedChannels', 'Music Allowed Channels'));
    warnings.push(...helpers.validatePlaceholderCategories(settings.AllowedCategories, 'Music.AllowedCategories', 'Music Allowed Categories'));
    return warnings;
};
