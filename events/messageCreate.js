const { addMessageToGuildBatch } = require('../utils/guild/guildBatchHandler');

module.exports = async (client, message) => {
    if (!message.guild || !message.member || message.author.bot) return;

    await addMessageToGuildBatch(message.guild.id);
};
