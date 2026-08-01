const { PermissionFlagsBits } = require('discord.js');
const service = require('../voiceTTSService');
const store = require('../voiceTTSStore');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    if (!interaction.isButton() || interaction.customId !== 'voice_tts_toggle_access') return;
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'This button can only be used in a server.', ephemeral: true });
    }

    const config = service.mergeConfig(store.getGuildConfig(interaction.guild.id) || {});
    if (!config.enabled || !config.roleId) {
      return interaction.reply({ content: 'Voice TTS is not set up yet.', ephemeral: true });
    }

    const role = interaction.guild.roles.cache.get(config.roleId) ||
      await interaction.guild.roles.fetch(config.roleId).catch(() => null);
    if (!role) {
      return interaction.reply({ content: 'Voice TTS role no longer exists. Run /voicetts setup again.', ephemeral: true });
    }

    if (interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: `Administrators already have Voice TTS access through ${role}.`, ephemeral: true });
    }

    if (interaction.member.roles.cache.has(role.id)) {
      await interaction.member.roles.remove(role, 'Voice TTS access toggle');
      return interaction.reply({ content: `Removed ${role}.`, ephemeral: true });
    }

    await interaction.member.roles.add(role, 'Voice TTS access toggle');
    return interaction.reply({ content: `Added ${role}. Join a voice channel to start a private TTS text channel.`, ephemeral: true });
  }
};
