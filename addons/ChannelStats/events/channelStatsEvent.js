const { Events } = require('discord.js');
const store = require('../channelStatsStore');
const {
  queueGuildUpdate,
  startChannelStatsScheduler
} = require('../channelStatsService');

function queueForGuild(client, guild) {
  if (!guild) return;
  if (!store.getGuildConfig(guild.id)) return;
  queueGuildUpdate(client, guild.id);
}

module.exports = {
  async run(client) {
    startChannelStatsScheduler(client);

    client.on(Events.GuildMemberAdd, member => queueForGuild(client, member.guild));
    client.on(Events.GuildMemberRemove, member => queueForGuild(client, member.guild));
    client.on(Events.GuildBanAdd, ban => queueForGuild(client, ban.guild));
    client.on(Events.GuildBanRemove, ban => queueForGuild(client, ban.guild));

    client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
      const config = store.getGuildConfig(newMember.guild.id);
      const watchedRoleIds = [config?.memberRoleId, config?.staffRoleId].filter(Boolean);
      if (watchedRoleIds.length === 0) return;

      const changedWatchedRole = watchedRoleIds.some(roleId =>
        oldMember.roles.cache.has(roleId) !== newMember.roles.cache.has(roleId)
      );
      if (changedWatchedRole) {
        queueGuildUpdate(client, newMember.guild.id);
      }
    });

    console.log('[ChannelStats] Automatic updater ready.');
  }
};
