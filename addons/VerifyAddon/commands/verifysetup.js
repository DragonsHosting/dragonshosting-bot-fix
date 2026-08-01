const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  MessageFlags
} = require('discord.js');

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function loadConfig() {
  const file = path.resolve(__dirname, '../config.yml');
  if (!fs.existsSync(file)) return {};
  return yaml.load(fs.readFileSync(file, 'utf8')) || {};
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verifysetup')
    .setDescription('Send the verification panel.')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The channel where the verify panel should be sent.')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.editReply({
        content: '❌ You need Administrator permission to use this command.',
      });
    }

    const config = loadConfig().VerifySystem || {};
    const targetChannel = interaction.options.getChannel('channel');

    if (!config.Enabled) {
      return interaction.editReply({
        content: '❌ Verify system is disabled in config.yml.',
      });
    }

    const embed = new EmbedBuilder()
      .setColor(config.Embed?.Color || '#5865F2')
      .setTitle(config.Embed?.Title || '✅ Verification')
      .setDescription(config.Embed?.Description || 'Click the button below to verify yourself.')
      .setFooter({ text: config.Embed?.Footer || 'Verification System' })
      .setTimestamp();

    const button = new ButtonBuilder()
      .setCustomId('dragonshosting_verify_button')
      .setLabel(config.Button?.Label || 'Verify')
      .setStyle(ButtonStyle.Success);

    if (config.Button?.Emoji) button.setEmoji(config.Button.Emoji);

    const row = new ActionRowBuilder().addComponents(button);

    await targetChannel.send({ embeds: [embed], components: [row] });

    return interaction.editReply({
      content: `✅ Verification panel sent to ${targetChannel}.`,
    });
  }
};
