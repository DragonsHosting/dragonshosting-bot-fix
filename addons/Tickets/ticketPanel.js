const fs = require('fs');
const path = require('path');
const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');
const { getGuildBrand, getTicketTypes } = require('./ticketConfig');

function buttonStyle(value) {
  return ButtonStyle[value] || ButtonStyle.Primary;
}

function chunkButtons(buttons) {
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(...buttons.slice(i, i + 5)));
  }
  return rows;
}

function buildTicketPanelPayload(guild) {
  const brand = getGuildBrand(guild);
  const dashboardImagePath = path.resolve(__dirname, '../../public/assets/dragonshosting-dashboard.png');
  const files = fs.existsSync(dashboardImagePath)
    ? [new AttachmentBuilder(dashboardImagePath, { name: 'dragonshosting-dashboard.png' })]
    : [];

  const embed = new EmbedBuilder()
    .setAuthor({ name: 'Dragonshosting Tickets', iconURL: brand.guildIcon || undefined })
    .setTitle('Dragonshosting Tickets')
    .setDescription([
      'Hallo daar!',
      '',
      'Heb je hulp nodig, een betaalvraag, een credit-order, technische support of wil je iets melden? Open hieronder het juiste ticket.',
      '',
      '**Voor betalingen/credits:** vermeld altijd je ordernummer, betaalmethode, bedrag en datum. Staff voegt credits pas toe nadat betaling echt is gecontroleerd.',
      '',
      'Maak maar één ticket tegelijk aan en geef direct duidelijke informatie.'
    ].join('\n'))
    .setColor(0x00b7ff)
    .setThumbnail(brand.guildIcon || null);

  if (files.length > 0) {
    embed.setImage('attachment://dragonshosting-dashboard.png');
  }

  const buttons = Object.values(getTicketTypes(guild))
    .filter(ticketType => ticketType.enabled !== false)
    .map(ticketType => new ButtonBuilder()
      .setCustomId(ticketType.id)
      .setLabel(ticketType.shortLabel || ticketType.label)
      .setEmoji(ticketType.emoji || '🎫')
      .setStyle(buttonStyle(ticketType.style)));

  return {
    embeds: [embed],
    components: chunkButtons(buttons),
    files
  };
}

module.exports = {
  buildTicketPanelPayload
};
