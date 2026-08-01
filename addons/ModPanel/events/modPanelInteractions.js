const { Events } = require('discord.js');
const { handleInteraction } = require('../modPanelService');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    await handleInteraction(interaction);
  },
};
