const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildTicketPanelPayload } = require('../ticketPanel');
const { saveGuildConfig } = require('../ticketConfig');

function hasTicketButton(message) {
  return message.components?.some(row => row.components?.some(component =>
    String(component.customId || component.data?.custom_id || '').startsWith('ticket_')
  ));
}

async function sendOrUpdatePanel(channel, guild) {
  const payload = buildTicketPanelPayload(guild);
  const recent = await channel.messages.fetch({ limit: 30 }).catch(() => null);
  const existing = recent?.find(message =>
    message.author?.id === guild.client.user.id &&
    (
      message.embeds?.some(embed => String(embed.title || '').toLowerCase().includes('dragonshosting tickets')) ||
      hasTicketButton(message)
    )
  );

  if (existing) {
    await existing.edit(payload);
    return { action: 'bijgewerkt', message: existing };
  }

  const sent = await channel.send(payload);
  return { action: 'aangemaakt', message: sent };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setupticketpanel')
    .setDescription('Stuurt het bestaande DragonsHosting ticketpanel in dit kanaal.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'Dit command kan alleen in een server worden gebruikt.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const result = await sendOrUpdatePanel(interaction.channel, interaction.guild);
    saveGuildConfig(interaction.guild.id, { panelChannelId: interaction.channel.id });

    await interaction.editReply({
      content: `✅ Dragonshosting Tickets panel is ${result.action} in ${interaction.channel}.`
    });
  }
};
