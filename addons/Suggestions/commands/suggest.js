const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, LabelBuilder } = require('discord.js');
const suggestionActions = require('../events/suggestionActions');
const { addToBlacklist, removeFromBlacklist, isBlacklisted } = require('../utils/blacklist');
const { containsBlacklistedWordsText, buildBlacklistResponse, userHasAllowedRole } = require('../utils/validation');
const { getConfig, getLang, getCommands } = require('../../../utils/core/configLoader.js');

const config = getConfig();
const lang = getLang();

function createLabelComponent(inputConfig) {
    if (inputConfig.Type === 'StringSelect') {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(inputConfig.ID)
            .setPlaceholder(inputConfig.Placeholder || 'Select an option...')
            .setMinValues(inputConfig.Required ? 1 : 0)
            .setMaxValues(1);

        inputConfig.Options.forEach(option => {
            const selectOption = new StringSelectMenuOptionBuilder()
                .setLabel(option.Label)
                .setValue(option.Value);
            
            if (option.Description) selectOption.setDescription(option.Description);
            if (option.Emoji) selectOption.setEmoji(option.Emoji);
            
            selectMenu.addOptions(selectOption);
        });

        const labelComponent = new LabelBuilder()
            .setLabel(inputConfig.Label)
            .setStringSelectMenuComponent(selectMenu);
        
        if (inputConfig.Description) {
            labelComponent.setDescription(inputConfig.Description);
        }

        return labelComponent;
    } else {
        const textInput = new TextInputBuilder()
            .setCustomId(inputConfig.ID)
            .setPlaceholder(inputConfig.Placeholder || '')
            .setStyle(inputConfig.Style === 'Paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
            .setRequired(inputConfig.Required || false);

        if (inputConfig.maxLength) {
            textInput.setMaxLength(inputConfig.maxLength);
        }

        const labelComponent = new LabelBuilder()
            .setLabel(inputConfig.Question || inputConfig.Label)
            .setTextInputComponent(textInput);
        
        if (inputConfig.Description) {
            labelComponent.setDescription(inputConfig.Description);
        }

        return labelComponent;
    }
}

async function openQuestionModal(interaction) {
    try {
        if (!config.SuggestionSettings) {
            console.error("Suggestion system configuration is missing from config file");
            await interaction.reply({ 
                content: "❌ **Configuration Error**\n\nThe suggestion system is not properly configured. Please contact an administrator.\n\n🔧 **Admin Fix:** Add the `SuggestionSettings` section to your config file.", 
                flags: MessageFlags.Ephemeral 
            });
            return;
        }

        if (config.SuggestionSettings.AdditionalModalInputs === undefined || config.SuggestionSettings.AdditionalModalInputs === null) {
            console.error("AdditionalModalInputs configuration is missing or null");
            await interaction.reply({ 
                content: "❌ **Configuration Error**\n\nThe suggestion modal inputs are not properly configured. Please contact an administrator.\n\n🔧 **Admin Fix:** Add the `AdditionalModalInputs` section to your `SuggestionSettings` configuration.", 
                flags: MessageFlags.Ephemeral 
            });
            return;
        }

        const hasNewComponents = Object.values(config.SuggestionSettings.AdditionalModalInputs || {})
            .some(inputConfig => inputConfig && inputConfig.Type === 'StringSelect');
        
        if (hasNewComponents) {
            const modal = new ModalBuilder()
                .setCustomId('suggestionModal')
                .setTitle(lang.Suggestion.ModalTitle);

            const labelComponents = [];

            // Add the main suggestion text input
            const suggestionTextInput = new TextInputBuilder()
                .setCustomId('suggestionText')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            const suggestionLabelComponent = new LabelBuilder()
                .setLabel(lang.Suggestion.ModalQuestion)
                .setTextInputComponent(suggestionTextInput);

            labelComponents.push(suggestionLabelComponent);

            // Add additional modal inputs
            Object.entries(config.SuggestionSettings.AdditionalModalInputs || {}).forEach(([key, inputConfig]) => {
                if (inputConfig && inputConfig.ID && labelComponents.length < 5) {
                    const labelComponent = createLabelComponent(inputConfig);
                    labelComponents.push(labelComponent);
                } else if (inputConfig && !inputConfig.ID) {
                    console.error(`Invalid configuration for AdditionalModalInput: ${key} - missing ID property`, inputConfig);
                }
            });

            modal.addLabelComponents(...labelComponents);
            await interaction.showModal(modal);
        } else {
            const modal = new ModalBuilder()
                .setCustomId('suggestionModal')
                .setTitle(lang.Suggestion.ModalTitle);

            const suggestionInput = new TextInputBuilder()
                .setCustomId('suggestionText')
                .setLabel(lang.Suggestion.ModalQuestion)
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            const firstActionRow = new ActionRowBuilder().addComponents(suggestionInput);
            modal.addComponents(firstActionRow);

            Object.entries(config.SuggestionSettings.AdditionalModalInputs || {}).forEach(([key, inputConfig]) => {
                if (inputConfig && inputConfig.ID && inputConfig.Type !== 'StringSelect') {
                    const additionalInput = new TextInputBuilder()
                        .setCustomId(inputConfig.ID)
                        .setLabel(inputConfig.Question || inputConfig.Label)
                        .setPlaceholder(inputConfig.Placeholder)
                        .setStyle(inputConfig.Style === 'Paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
                        .setRequired(inputConfig.Required)
                        .setMaxLength(inputConfig.maxLength);

                    const actionRow = new ActionRowBuilder().addComponents(additionalInput);
                    modal.addComponents(actionRow);
                } else if (inputConfig && !inputConfig.ID) {
                    console.error(`Invalid configuration for AdditionalModalInput: ${key} - missing ID property`, inputConfig);
                }
            });

            await interaction.showModal(modal);
        }
    } catch (error) {
        console.error("Error in openQuestionModal: ", error);
        if (!interaction.replied) {
            await interaction.reply({ content: lang.Suggestion.Error, flags: MessageFlags.Ephemeral });
        }
    }
}

const command = new SlashCommandBuilder()
    .setName('suggestion')
    .setDescription('Manage suggestions');

const useQuestionModal = config.SuggestionSettings.UseQuestionModal;

if (!useQuestionModal) {
    command.addSubcommand(subcommand =>
        subcommand
            .setName('create')
            .setDescription('Create a new suggestion')
            .addStringOption(option =>
                option.setName('text')
                    .setDescription('The suggestion text')
                    .setRequired(true)
            )
    );
} else {
    command.addSubcommand(subcommand =>
        subcommand
            .setName('create')
            .setDescription('Create a new suggestion')
    );
}

command.addSubcommand(subcommand =>
    subcommand
        .setName('accept')
        .setDescription('Accept a suggestion')
        .addStringOption(option =>
            option.setName('id')
                .setDescription('The ID of the suggestion to accept')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for accepting the suggestion')
                .setRequired(false)
        )
)
    .addSubcommand(subcommand =>
        subcommand
            .setName('deny')
            .setDescription('Deny a suggestion')
            .addStringOption(option =>
                option.setName('id')
                    .setDescription('The ID of the suggestion to deny')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('reason')
                    .setDescription('Reason for denying the suggestion')
                    .setRequired(false)
            )
    )
    .addSubcommandGroup(group =>
        group
            .setName('blacklist')
            .setDescription('Manage blacklist')
            .addSubcommand(sub =>
                sub
                    .setName('add')
                    .setDescription('Add a user to the blacklist')
                    .addUserOption(option =>
                        option.setName('user')
                            .setDescription('The user to blacklist')
                            .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('remove')
                    .setDescription('Remove a user from the blacklist')
                    .addUserOption(option =>
                        option.setName('user')
                            .setDescription('The user to remove from the blacklist')
                            .setRequired(true)
                    )
            )
    );

 

module.exports = {
    data: command,
    category: 'General',
    async execute(interaction, client) {
        try {
            if (!config.SuggestionSettings.Enabled) {
                await interaction.reply({ content: lang.Suggestion.SuggestionsDisabled, flags: MessageFlags.Ephemeral });
                return;
            }

            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'create') {
                if (!userHasAllowedRole(interaction.member)) {
                    await interaction.reply({ content: lang.NoPermsMessage, flags: MessageFlags.Ephemeral });
                    return;
                }

                const blocked = await isBlacklisted(interaction.user.id);
                if (blocked) {
                    await interaction.reply({ content: lang.Suggestion.BlacklistMessage, flags: MessageFlags.Ephemeral });
                    return;
                }

                if (useQuestionModal) {
                    await openQuestionModal(interaction);
                } else {
                    const suggestionText = interaction.options.getString('text');

                    if (config.SuggestionSettings.blockBlacklistWords && await containsBlacklistedWordsText(suggestionText)) {
                        const blacklistMessage = buildBlacklistResponse(interaction.user);
                        await interaction.reply({ content: blacklistMessage, flags: MessageFlags.Ephemeral });
                        return;
                    }

                    try {
                        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                        await suggestionActions.createSuggestion(client, interaction, suggestionText);
                        await interaction.editReply({ content: lang.Suggestion.SuggestionCreated });
                    } catch (error) {
                        console.error("Error creating suggestion:", error);
                        if (!interaction.replied) {
                            await interaction.reply({ content: lang.Suggestion.Error, flags: MessageFlags.Ephemeral });
                        } else {
                            await interaction.editReply({ content: lang.Suggestion.Error });
                        }
                    }
                }
            } else if (subcommand === 'accept' || subcommand === 'deny') {
                const validAcceptDenyRoles = config.SuggestionSettings.SuggestionAcceptDenyRoles.filter(roleId => 
                    roleId && roleId !== "" && roleId !== "ROLE_ID" && interaction.guild.roles.cache.has(roleId)
                );
                const hasAcceptDenyRole = validAcceptDenyRoles.some(roleId => interaction.member.roles.cache.has(roleId));

                if (!hasAcceptDenyRole) {
                    await interaction.reply({ content: lang.NoPermsMessage, flags: MessageFlags.Ephemeral });
                    return;
                }

                const suggestionId = interaction.options.getString('id');
                const reason = interaction.options.getString('reason') || lang.Suggestion.Reason;

                if (subcommand === 'accept') {
                    await suggestionActions.acceptSuggestion(client, interaction, suggestionId, reason);
                } else {
                    await suggestionActions.denySuggestion(client, interaction, suggestionId, reason);
                }
            } else if (subcommand === 'add' || subcommand === 'remove') {
                const action = subcommand;
                const user = interaction.options.getUser('user');
                const validAcceptDenyRoles = config.SuggestionSettings.SuggestionAcceptDenyRoles.filter(roleId => 
                    roleId && roleId !== "" && roleId !== "ROLE_ID" && interaction.guild.roles.cache.has(roleId)
                );
                const hasAcceptDenyRole = validAcceptDenyRoles.some(roleId => interaction.member.roles.cache.has(roleId));

                if (!hasAcceptDenyRole) {
                    await interaction.reply({ content: lang.NoPermsMessage, flags: MessageFlags.Ephemeral });
                    return;
                }

                if (action === 'add') {
                    await addToBlacklist(user.id);
                    await interaction.reply({ content: `${user} has been added to the blacklist.`, flags: MessageFlags.Ephemeral });
                } else if (action === 'remove') {
                    await removeFromBlacklist(user.id);
                    await interaction.reply({ content: `${user} has been removed from the blacklist.`, flags: MessageFlags.Ephemeral });
                }
            }
        } catch (error) {
            console.error("Error in suggestion command: ", error);
            if (!interaction.replied) {
                await interaction.reply({ content: lang.Suggestion.Error, flags: MessageFlags.Ephemeral });
            }
        }
    },
};