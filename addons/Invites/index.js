'use strict';

module.exports = {
    name: 'Invites',
    version: '1.0.0',
    description: 'Invite tracking, invite logging and invite commands',
    async run(client, eventManager, api) {
        const inviteModel = require('./models/inviteSchema');
        const { handleInviteCreate } = require('./utils/handleInviteCreate');
        const { handleInviteDelete } = require('./utils/handleInviteDelete');

        client.invites = client.invites || new Map();
        api.registerModel('Invite', inviteModel);
        api.registerCommand(require('./commands/invites'));
        api.registerCommand(require('./commands/inviter'));

        const { handleInviteJoin } = require('./utils/handleInviteJoin');
        const { updateInviteRolesForUser } = require('./utils/inviteRoles');
        const inviteService = {
            async resolveJoin(member) {
                const fallback = { inviterName: 'Vanity / Unknown', inviterCount: 0 };
                if (!client.invites.has(member.guild.id)) client.invites.set(member.guild.id, new Map());
                const cached = client.invites.get(member.guild.id);
                const current = await member.guild.invites.fetch({ cache: false }).catch(() => null);
                if (!current) return fallback;
                client.invites.set(member.guild.id, new Map(current.map(invite => [invite.code, invite.uses])));
                const used = current.find(invite => (cached.get(invite.code) || 0) < (invite.uses || 0));
                if (!used) return fallback;

                const record = await inviteModel.findOneAndUpdate(
                    { guildID: member.guild.id, inviteCode: used.code },
                    { $inc: { uses: 1 }, $addToSet: { joinedUsers: { userID: member.id, joinedAt: new Date() } } },
                    { upsert: true, new: true }
                );
                if (!record.inviterID && used.inviter?.id) {
                    record.inviterID = used.inviter.id;
                    await record.save();
                }
                const inviter = record.inviterID
                    ? await member.guild.members.fetch(record.inviterID).catch(() => null)
                    : null;
                const records = record.inviterID
                    ? await inviteModel.find({ guildID: member.guild.id, inviterID: record.inviterID })
                    : [];
                const inviterCount = records.reduce((total, item) => total + (item.joinedUsers?.length || 0), 0);
                await handleInviteJoin(client, member, used, inviter, inviterCount).catch(() => {});
                return { inviterName: inviter?.user?.tag || fallback.inviterName, inviterCount };
            },
            async getMemberInvite(member) {
                return inviteModel.findOne({ guildID: member.guild.id, 'joinedUsers.userID': member.id });
            },
            async handleLeave(member) {
                const record = await this.getMemberInvite(member);
                if (!record) return null;
                await inviteModel.updateOne(
                    { guildID: member.guild.id, inviteCode: record.inviteCode },
                    { $inc: { uses: -1 }, $pull: { joinedUsers: { userID: member.id } } }
                );
                await updateInviteRolesForUser(client, member.guild.id, record.inviterID);
                return record;
            }
        };
        api.registerService('invites', inviteService);

        const cacheGuildInvites = async () => {
            const guilds = Array.from(client.guilds.cache.values());
            const batchSize = 3;
            for (let offset = 0; offset < guilds.length; offset += batchSize) {
                const batch = guilds.slice(offset, offset + batchSize);
                await Promise.allSettled(batch.map(async guild => {
                    try {
                        if (guild.members.me?.permissions.has('ManageGuild')) {
                            const invites = await guild.invites.fetch();
                            client.invites.set(guild.id, new Map(invites.map(invite => [invite.code, invite.uses])));
                        } else {
                            client.invites.set(guild.id, new Map());
                        }
                    } catch (error) {
                        client.invites.set(guild.id, new Map());
                        api.logger.error(`Failed to fetch invite cache for guild ${guild.id}: ${error.message}`);
                    }
                }));
                if (offset + batchSize < guilds.length) await new Promise(resolve => setTimeout(resolve, 2000));
            }
        };

        if (client.isReady?.()) {
            cacheGuildInvites().catch(error => api.logger.error(`Invite cache initialization failed: ${error.message}`));
        } else {
            client.once('clientReady', cacheGuildInvites);
        }

        api.onDiscord('inviteCreate', async ({ invite }) => {
            try {
                const invites = await invite.guild.invites.fetch();
                client.invites.set(invite.guild.id, new Map(invites.map(item => [item.code, item.uses])));
                await handleInviteCreate(client, invite);
            } catch (error) {
                api.logger.error(`Error updating invite cache: ${error.message}`);
            }
            return false;
        });

        api.onDiscord('inviteDelete', async ({ invite }) => {
            try {
                const invites = client.invites.get(invite.guild.id);
                if (invites) {
                    invites.delete(invite.code);
                    client.invites.set(invite.guild.id, invites);
                }
                await handleInviteDelete(client, invite);
            } catch (error) {
                api.logger.error(`Error updating invite cache: ${error.message}`);
            }
            return false;
        });

        return () => client.removeListener('clientReady', cacheGuildInvites);
    }
};
