const service = require('../voiceTTSService');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState) {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;
    if (oldState.channelId === newState.channelId) return;

    if (oldState.channelId) {
      await service.cleanupUserSession(oldState.guild, member.id, newState.channelId ? 'moved voice channel' : 'left voice');
    }

    if (newState.channel) {
      await service.ensureUserSession(newState.guild, member, newState.channel).catch(err => {
        console.log(`[VoiceTTS] Could not start session for ${member.user.tag}: ${err.message}`);
      });
    }
  }
};
