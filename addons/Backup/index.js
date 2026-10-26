'use strict';

function parseDuration(value) {
    const match = /^(\d+)\s*(s|m|h|d)$/i.exec(String(value || '24h').trim());
    if (!match) return 24 * 60 * 60 * 1000;
    const units = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return Number(match[1]) * units[match[2].toLowerCase()];
}

module.exports = {
    name: 'Backup',
    version: '1.1.0',
    description: 'Discord server backups and automatic backup scheduling',
    async run(client, eventManager, api) {
        const command = require('./commands/backup');
        api.registerModel('Backup', require('./models/Backup'));
        api.registerService('backup', command);

        if (!api.config.Backup?.Enabled) {
            console.info('[Backup] Automatic backups are disabled in configuration.');
            return () => {};
        }

        let timer;
        let started = false;
        const runBackup = async () => {
            const guilds = [...client.guilds.cache.values()];
            console.info(`[Backup] Automatic backup run started for ${guilds.length} guild(s).`);
            for (const guild of guilds) {
                await command.createAutoBackup(guild, client).catch(error => {
                    console.error('[Backup] Automatic backup failed:', error.message);
                });
            }
        };
        const startSchedule = () => {
            if (started) return;
            started = true;
            console.info('[Backup] Discord is ready; starting the automatic backup schedule.');
            void runBackup();
            timer = setInterval(() => {
                void runBackup();
            }, parseDuration(api.config.Backup.Schedule));
            timer.unref?.();
        };

        let waitingForReady = false;
        if (client.isReady()) {
            startSchedule();
        } else {
            waitingForReady = true;
            console.info('[Backup] Waiting for Discord clientReady before taking the first snapshot.');
            client.once('clientReady', startSchedule);
        }

        return () => {
            if (timer) clearInterval(timer);
            if (waitingForReady) client.off('clientReady', startSchedule);
        };
    }
};
