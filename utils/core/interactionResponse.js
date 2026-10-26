'use strict';

const { MessageFlags } = require('discord.js');

async function safeInteractionResponse(interaction, message, isError = false) {
    try {
        const content = typeof message === 'string' ? message : message?.content;
        const embeds = typeof message === 'object' && message ? message.embeds : undefined;
        const components = typeof message === 'object' && message ? message.components : undefined;
        const response = { flags: MessageFlags.Ephemeral };
        response.content = content || (!embeds && !components ? 'An error occurred.' : undefined);
        if (embeds) response.embeds = embeds;
        if (components) response.components = components;

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply(response);
        } else if (interaction.deferred && !interaction.replied) {
            await interaction.editReply(response);
        } else {
            await interaction.followUp(response);
        }
    } catch (error) {
        console.error(`Failed to send ${isError ? 'error' : 'response'} to interaction:`, error);
    }
}

module.exports = { safeInteractionResponse };
