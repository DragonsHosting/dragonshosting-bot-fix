'use strict';

const fs = require('fs');
const path = require('path');
const { EmbedBuilder, PermissionsBitField } = require('discord.js');

const STATE_PATH = path.join(__dirname, 'data', 'announced-releases.json');

function readState() {
    try {
        return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    } catch {
        return { releases: [] };
    }
}

function writeState(state) {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    const temporary = `${STATE_PATH}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, STATE_PATH);
}

module.exports = {
    name: 'DeploymentAnnouncement',
    version: '1.0.0',
    description: 'Posts one release announcement after a successful bot startup.',
    run: async (client, eventManager, api) => {
        let timer = null;

        const announce = async () => {
            const settings = global.config?.DeploymentAnnouncement;
            const releaseId = String(settings?.ReleaseID || '').trim();
            const channelId = String(settings?.ChannelID || '').trim();
            if (!settings?.Enabled || !releaseId || !channelId) return;

            const state = readState();
            if (state.releases?.includes(releaseId)) return;

            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (!channel?.isTextBased?.()) {
                console.error(`[DeploymentAnnouncement] Channel ${channelId} was not found or is not text based.`);
                return;
            }

            const permissions = channel.permissionsFor?.(client.user);
            if (permissions && !permissions.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages])) {
                console.error(`[DeploymentAnnouncement] Missing permission to post in ${channel.name}.`);
                return;
            }

            const embed = new EmbedBuilder()
                .setColor(0x29d884)
                .setTitle('DragonHosting bot-update voltooid')
                .setDescription('De bot is succesvol bijgewerkt en opnieuw gestart.')
                .addFields(
                    {
                        name: 'Nieuwe modulaire opbouw',
                        value: 'Tickets, muziek, moderatie, verificatie, economie en de overige functies draaien nu als afzonderlijke addons. Bestaande tickets en opgeslagen gegevens zijn behouden.'
                    },
                    {
                        name: 'Uitgebreide 24/7-radio',
                        value: 'Meer dan 100 keuzes: de volledige actuele Radio.nl-catalogus, 538 Hitzone, 538 Non-Stop en andere 538-themakanalen. Het paneel heeft paginaknoppen, pauze, volume, herverbinden en DragonsMusic-bediening.'
                    },
                    {
                        name: 'Bediening',
                        value: 'Bij DragonsMusic kun je nummers skippen en een nieuwe mix starten. Bij live radio kun je pauzeren, het volume wijzigen of meteen een andere zender kiezen.'
                    }
                )
                .setFooter({ text: 'DragonHosting • Systeemupdate' })
                .setTimestamp();

            await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
            state.releases = [...new Set([...(state.releases || []), releaseId])].slice(-25);
            writeState(state);
            console.log(`[DeploymentAnnouncement] Release ${releaseId} announced in ${channel.name}.`);
        };

        const schedule = () => {
            timer = setTimeout(() => announce().catch(error => {
                console.error(`[DeploymentAnnouncement] ${error.stack || error}`);
            }), 5000);
            timer.unref?.();
        };

        if (client.isReady?.()) schedule();
        else client.once('clientReady', schedule);

        api.registerService('deploymentAnnouncement', { announce });
        return () => {
            if (timer) clearTimeout(timer);
            client.off('clientReady', schedule);
        };
    }
};
