'use strict';

const { MessageFlags } = require('discord.js');
const actions = require('./giveawayActions');

module.exports = async function handleGiveawayInteraction(client, interaction) {
    if (!interaction.isButton?.()) return false;
    if (interaction.customId === 'check_percent' || interaction.customId === 'show_entrants') {
        await actions.handleButtonInteraction(interaction);
        return true;
    }
    if (interaction.customId !== 'join_giveaway') return false;

    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await actions.joinGiveaway(
            client,
            interaction.user.id,
            interaction.user.username,
            interaction.member,
            interaction,
            interaction.channelId,
            interaction.message.id
        );
    } catch (error) {
        console.error('[Giveaways] Failed to join giveaway:', error);
        await interaction.followUp({
            content: 'An error occurred while joining the giveaway. Please try again later.',
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
    }
    return true;
};
