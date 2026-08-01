const service = require('../voiceTTSService');
const store = require('../voiceTTSStore');
const workers = require('../voiceTTSWorkers');

function sanitizeMessage(message, config) {
  let text = message.cleanContent || message.content || '';
  text = text.replace(/https?:\/\/\S+/gi, 'link');
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length > config.maxMessageLength) {
    text = `${text.slice(0, config.maxMessageLength)}...`;
  }
  return text;
}

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (!message.guild || message.author.bot) return;

    const session = store.getSessionByTextChannel(message.channel.id);
    if (!session) return;
    if (session.userId !== message.author.id) return;

    const config = service.mergeConfig(store.getGuildConfig(message.guild.id) || {});
    if (!config.enabled) return;

    const mentionCount = message.mentions.users.size + message.mentions.roles.size + message.mentions.channels.size;
    if (mentionCount > config.maxMentions) {
      await message.reply({ content: `Too many mentions. Maximum allowed: ${config.maxMentions}.` })
        .then(reply => setTimeout(() => reply.delete().catch(() => null), 8000))
        .catch(() => null);
      return;
    }

    const text = sanitizeMessage(message, config);
    if (!text) return;

    const result = await workers.speak(message.guild, session.voiceChannelId, session, text, {
      language: config.ttsLanguage,
      textChannel: message.channel
    }).catch(err => ({ ok: false, reason: err.message }));

    if (!result.ok && result.reason === 'no_worker') {
      await message.reply({ content: 'No Voice TTS worker bot is online. Ask staff to check /voicetts status.' })
        .then(reply => setTimeout(() => reply.delete().catch(() => null), 9000))
        .catch(() => null);
    }
  }
};
