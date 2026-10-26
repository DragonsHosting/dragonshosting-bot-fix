'use strict';

const User = require('../../../models/UserData');
const store = require('../commands/store');
const pets = require('../commands/pets');

async function loadUser(interaction) {
    return User.findOne({ userId: interaction.user.id, guildId: interaction.guild.id });
}

module.exports = async function handleEconomyInteraction(interaction) {
    if (interaction.isStringSelectMenu?.()) {
        if (interaction.customId === 'store_category') {
            await store.handleCategorySelect(interaction);
            return true;
        }
        if (interaction.customId === 'store_purchase') {
            await store.handlePurchase(interaction);
            return true;
        }
        if (interaction.customId === 'pet_select' || interaction.customId === 'adventure_start') {
            const user = await loadUser(interaction);
            if (user) await pets.handleInteraction(interaction, user);
            return true;
        }
    }

    if (!interaction.isButton?.()) return false;
    if (interaction.customId === 'store_back') {
        await store.handleBackButton(interaction);
        return true;
    }
    if (/^(pet_|train_|adventure_)/.test(interaction.customId)) {
        const user = await loadUser(interaction);
        if (user) await pets.handleInteraction(interaction, user);
        return true;
    }
    return false;
};
