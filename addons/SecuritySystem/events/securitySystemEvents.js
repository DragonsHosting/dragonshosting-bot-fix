const { Events } = require('discord.js');
const {
  handleGuildMemberAdd,
  handleSecurityInteraction,
  handleSecurityMessage,
} = require('../securitySystemService');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    client.on(Events.MessageCreate, message => {
      handleSecurityMessage(message).catch(error => {
        console.error('[SecuritySystem] messageCreate failed:', error.message);
      });
    });

    client.on(Events.GuildMemberAdd, member => {
      handleGuildMemberAdd(member).catch(error => {
        console.error('[SecuritySystem] guildMemberAdd failed:', error.message);
      });
    });

    client.on(Events.InteractionCreate, interaction => {
      handleSecurityInteraction(interaction).catch(error => {
        console.error('[SecuritySystem] interactionCreate failed:', error.message);
      });
    });

    console.log('[SecuritySystem] Event handlers loaded');
  },
};
