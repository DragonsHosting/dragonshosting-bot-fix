async function deferIfNeeded(interaction, ephemeral = true) {
  if (!interaction || interaction.deferred || interaction.replied) return;
  await interaction.deferReply({ ephemeral }).catch(() => {});
}

async function replyOrFollowUp(interaction, payload, ephemeral = true) {
  const data = typeof payload === 'string' ? { content: payload, ephemeral } : { ephemeral, ...payload };
  if (interaction.deferred || interaction.replied) return interaction.followUp(data).catch(() => null);
  return interaction.reply(data).catch(() => null);
}

async function safeInteractionResponse(interaction, payload, ephemeral = true) {
  const data = typeof payload === 'string' ? { content: payload, ephemeral } : { ephemeral, ...payload };
  if (!interaction) return null;
  if (interaction.deferred) return interaction.editReply(data).catch(() => interaction.followUp(data).catch(() => null));
  if (interaction.replied) return interaction.followUp(data).catch(() => null);
  return interaction.reply(data).catch(() => null);
}

module.exports = { deferIfNeeded, replyOrFollowUp, safeInteractionResponse };