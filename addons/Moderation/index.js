'use strict';

module.exports = {
    name: 'Moderation',
    version: '1.0.0',
    description: 'Moderation commands, word filters, polls and temporary roles',
    async run(client, eventManager, api) {
        const { EmbedBuilder } = require('discord.js');
        api.registerService('moderation.commands', require('./commands/moderation'));
        const Poll = api.registerModel('Poll', require('./models/poll'));
        const TempRole = api.registerModel('TempRole', require('./models/TempRole'));
        if (require('fs').existsSync(require('path').join(__dirname, 'models', 'blacklist.js'))) {
            api.registerModel('Blacklist', require('./models/blacklist'));
        }

        const { checkBlacklistWords } = require('../../utils/handlers/messageUtils');
        const { clearBlacklistCache } = require('../../utils/handlers/messageUtils');
        const blacklistListener = guildId => clearBlacklistCache(guildId);
        client.on('blacklistWordsUpdated', blacklistListener);
        api.onDiscord('messageCreate', async ({ message }) => {
            if (!message?.guild || !message.member || message.author?.bot) return false;
            await checkBlacklistWords(message, false);
            return false;
        });

        const parseDuration = value => {
            const match = /^(\d+)\s*(s|m|h|d)$/i.exec(String(value || '0'));
            if (!match) return 0;
            return Number(match[1]) * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 })[match[2].toLowerCase()];
        };

        const autoKickTimers = new Set();
        api.onDiscord('guildMemberAdd', async ({ member }) => {
            const autoKick = api.config.AutoKick;
            if (!member || member.user.bot || !autoKick?.Enabled) return false;
            const timer = setTimeout(async () => {
                autoKickTimers.delete(timer);
                const current = await member.guild.members.fetch(member.id).catch(() => null);
                if (!current || (autoKick.Role || []).some(role => current.roles.cache.has(role))) return;
                if (autoKick.DM?.Enabled) {
                    const embed = new EmbedBuilder()
                        .setTitle(autoKick.DM.Embed.Title)
                        .setDescription((autoKick.DM.Embed.Description || []).join('\n'))
                        .setColor(autoKick.DM.Embed.Color)
                        .setFooter({ text: autoKick.DM.Embed.Footer });
                    await current.send({ embeds: [embed] }).catch(() => {});
                }
                await current.kick('Auto-Kick: required role was not acquired in time.').catch(() => {});
            }, parseDuration(autoKick.Time));
            timer.unref?.();
            autoKickTimers.add(timer);
            return false;
        });

        client.polls = client.polls || new Map();
        const updatePoll = async message => {
            const poll = client.polls.get(message.id);
            if (!poll) return;
            for (const choice of poll.choices) {
                choice.votes = Math.max((message.reactions.cache.get(choice.emoji)?.count || 0) - 1, 0);
            }
            await Poll.findOneAndUpdate({ messageId: message.id }, { choices: poll.choices });
            const original = message.embeds[0];
            if (!original) return;
            const embed = EmbedBuilder.from(original).setDescription(
                poll.choices.map(choice => `${choice.emoji} ${choice.name} (${choice.votes} Votes)`).join('\n')
            );
            await message.edit({ embeds: [embed] }).catch(() => {});
        };
        const pollReaction = async (reaction, user, added) => {
            if (user.bot) return;
            if (reaction.partial) await reaction.fetch().catch(() => null);
            const poll = client.polls.get(reaction.message.id);
            if (!poll) return;
            if (added && !poll.multiVote) {
                for (const other of reaction.message.reactions.cache.values()) {
                    if (other.emoji.name !== reaction.emoji.name && other.users.cache.has(user.id)) {
                        await other.users.remove(user.id).catch(() => {});
                    }
                }
            }
            await updatePoll(reaction.message);
        };
        const pollAdd = (reaction, user) => pollReaction(reaction, user, true);
        const pollRemove = (reaction, user) => pollReaction(reaction, user, false);
        client.on('messageReactionAdd', pollAdd);
        client.on('messageReactionRemove', pollRemove);

        const UserData = require('../../models/UserData');
        const expireModeration = async () => {
            const now = new Date();
            const warningMs = parseDuration(api.config.Warnings?.Expiry);
            if (warningMs) {
                const cutoff = new Date(Date.now() - warningMs);
                for (const user of await UserData.find({ 'warnings.date': { $lte: cutoff } })) {
                    user.warnings = user.warnings.filter(warning => warning.date > cutoff);
                    await user.save();
                }
            }
            for (const user of await UserData.find({ 'tempBans.endTime': { $lte: now }, 'tempBans.lifted': false })) {
                const guild = client.guilds.cache.get(user.guildId);
                for (const ban of user.tempBans.filter(item => item.endTime <= now && !item.lifted)) {
                    if (guild) await guild.members.unban(user.userId).catch(() => {});
                    ban.lifted = true;
                }
                await user.save();
            }
            for (const record of await TempRole.find({ expiration: { $lte: now } })) {
                const member = await client.guilds.cache.get(record.guildId)?.members.fetch(record.userId).catch(() => null);
                if (member) await member.roles.remove(record.roleId).catch(() => {});
                await TempRole.deleteOne({ _id: record._id });
            }
        };

        const loadPolls = async () => {
            for (const poll of await Poll.find({}).lean()) {
                const channel = await client.channels.fetch(poll.channelId).catch(() => null);
                const message = await channel?.messages.fetch(poll.messageId).catch(() => null);
                if (message) client.polls.set(poll.messageId, poll);
            }
        };
        if (client.isReady()) await loadPolls();
        else client.once('clientReady', loadPolls);
        const expiryTimer = setInterval(() => expireModeration().catch(error => console.error('[Moderation] Expiry check failed:', error.message)), 60000);
        expiryTimer.unref?.();

        return () => {
            client.off('blacklistWordsUpdated', blacklistListener);
            client.off('messageReactionAdd', pollAdd);
            client.off('messageReactionRemove', pollRemove);
            clearInterval(expiryTimer);
            for (const timer of autoKickTimers) clearTimeout(timer);
        };
    }
};
