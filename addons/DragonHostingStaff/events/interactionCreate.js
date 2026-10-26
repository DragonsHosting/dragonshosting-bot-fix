const {
    ActionRowBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits,
    MessageFlags
} = require("discord.js");
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const sharp = require('sharp');
const axios = require('axios');
const { getConfig, getLang, getCommands } = require('../../../utils/core/configLoader.js');
const config = getConfig();
const lang = getLang();
const { editComponentsV2Message, createSimplePlaceholderReplacer } = require('../../../utils/core/componentsV2Builder.js');
const { safeInteractionResponse } = require('../../../utils/core/interactionResponse.js');

module.exports = async (client, interaction) => {
    try {
        if (interaction.isButton()) {
            await handleButtonInteraction(client, interaction);
        } else if (interaction.isModalSubmit()) {
            try {
                if (interaction.customId.startsWith('dh_staffrank_')) {
                    await handleDragonshostingStaffRankModal(interaction);
                } else if (interaction.customId === 'dh_application_accepted_modal') {
                    await handleDragonshostingApplicationAcceptedModal(interaction);
                }
            } catch (modalError) {
                console.error('Error handling modal submit:', modalError);
                console.error('Modal custom ID:', interaction.customId);
                console.error('Guild ID:', interaction.guild?.id);
                console.error('Channel ID:', interaction.channel?.id);
                await safeInteractionResponse(interaction, 'An error occurred while processing your modal submission. Please try again.', true);
            }
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
        await safeInteractionResponse(interaction, 'An error occurred while processing your interaction. Please try again later.', true);
    }
};

async function handleButtonInteraction(client, interaction) {
    if (interaction.customId === 'dh_rules_accept') {
        const memberRole = interaction.guild.roles.cache.find(role => role.name === '👥 Members' || role.name.includes('Members'));
        if (!memberRole) {
            return interaction.reply({ content: 'Members rol niet gevonden. Meld dit bij staff.', flags: MessageFlags.Ephemeral });
        }
        if (!interaction.member.roles.cache.has(memberRole.id)) {
            await interaction.member.roles.add(memberRole.id, 'Dragonshosting regels geaccepteerd');
        }
        return interaction.reply({ content: `Regels geaccepteerd. Je hebt nu ${memberRole}.`, flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId.startsWith('dh_staff_duty_')) {
        const allowedRoleNames = ['👑 CEO / Owner', '🏛️ Hoofd Manager', '💼 Manager', '🛡️ Admin', '🧭 Teamleiders', '⭐ Staff Team', '🔷 Senior Moderator', '🔹 Moderator', '🧪 Junior Moderator'];
        const allowed = interaction.member?.roles?.cache?.some(role => allowedRoleNames.includes(role.name));
        if (!allowed) return interaction.reply({ content: 'Alleen staff kan staffdienst gebruiken.', flags: MessageFlags.Ephemeral });

        const action = interaction.customId.replace('dh_staff_duty_', '');
        const afgemeld = interaction.guild.roles.cache.find(role => role.name === 'Afgemeld');
        if (action === 'on' && afgemeld && interaction.member.roles.cache.has(afgemeld.id)) {
            await interaction.member.roles.remove(afgemeld.id, 'Dragonshosting staffdienst aan');
        }
        if ((action === 'off' || action === 'pause') && afgemeld && !interaction.member.roles.cache.has(afgemeld.id)) {
            await interaction.member.roles.add(afgemeld.id, `Dragonshosting staffdienst ${action}`);
        }

        const labels = { on: 'in dienst', off: 'uit dienst', pause: 'op pauze' };
        const embed = new EmbedBuilder()
            .setColor(action === 'on' ? '#57F287' : '#FEE75C')
            .setTitle('🛡️ Staffdienst update')
            .setDescription(`${interaction.user} staat nu **${labels[action] || action}**.`)
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .setFooter({ text: 'Dragonshosting • Staffdienst' })
            .setTimestamp();
        const logChannel = interaction.guild.channels.cache.find(channel => channel.name.includes('staff-meldingen') || channel.name.includes('staff-updates'));
        await logChannel?.send({ embeds: [embed] }).catch(() => {});
        return interaction.reply({ content: `Je staat nu ${labels[action] || action}.`, flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId.startsWith('dh_panel_info_')) {
        const type = interaction.customId.replace('dh_panel_info_', '');
        const messages = {
            ticket_support: 'Open een ticket via het ticketpanel en kies de categorie die bij je vraag past.',
            ticket_bug: 'Meld bugs duidelijk met stappen, screenshots en waar het gebeurde.',
            ticket_unban: 'Vermeld je Discord/Minecraft naam, ban reden en waarom je unban verdient.',
            apply_staff: 'Gebruik het sollicitatiepanel en vul alle vragen serieus en volledig in.',
            apply_dev: 'Vermeld je ervaring, projecten, talen/platformen en voorbeelden.',
            whitelist: 'Whitelist aanvragen lopen via staff. Zorg dat je Discord gekoppeld is en de regels accepteert.',
            status: 'Serverstatus wordt in dit kanaal bijgehouden. Bij storing volgt staff met updates.'
        };
        return interaction.reply({ content: messages[type] || 'Meer informatie volgt via Dragonshosting staff.', flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId === 'dh_staff_promote' || interaction.customId === 'dh_staff_demote') {
        const allowedRoleNames = ['👑 CEO / Owner', '🏛️ Hoofd Manager', '💼 Manager', '🛡️ Admin'];
        const allowed = interaction.member?.roles?.cache?.some(role => allowedRoleNames.includes(role.name));

        if (!allowed) {
            return interaction.reply({
                content: 'Je hebt geen toestemming om staff promoties/demoties te beheren.',
                flags: MessageFlags.Ephemeral
            });
        }

        const action = interaction.customId === 'dh_staff_promote' ? 'promote' : 'demote';
        const modal = new ModalBuilder()
            .setCustomId(`dh_staffrank_${action}`)
            .setTitle(action === 'promote' ? 'Dragonshosting Promote' : 'Dragonshosting Demote');

        const userInput = new TextInputBuilder()
            .setCustomId('target')
            .setLabel('Gebruiker ID of mention')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('@gebruiker of 0');

        const reasonInput = new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Reden')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setPlaceholder('Bijvoorbeeld: goede inzet, proefperiode afgerond, waarschuwingen, etc.');

        modal.addComponents(
            new ActionRowBuilder().addComponents(userInput),
            new ActionRowBuilder().addComponents(reasonInput)
        );

        await interaction.showModal(modal);
        return;
    }

    if (interaction.customId === 'dh_application_accepted') {
        const allowedRoleNames = ['👑 CEO / Owner', '🏛️ Hoofd Manager', '💼 Manager', '🛡️ Admin', '🧭 Teamleiders'];
        const allowed = interaction.member?.roles?.cache?.some(role => allowedRoleNames.includes(role.name));

        if (!allowed) {
            return interaction.reply({
                content: 'Je hebt geen toestemming om sollicitatie-updates te plaatsen.',
                flags: MessageFlags.Ephemeral
            });
        }

        const modal = new ModalBuilder()
            .setCustomId('dh_application_accepted_modal')
            .setTitle('Sollicitatie aangenomen');

        const userInput = new TextInputBuilder()
            .setCustomId('target')
            .setLabel('Gebruiker ID of mention')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('@gebruiker of 0');

        const roleInput = new TextInputBuilder()
            .setCustomId('role')
            .setLabel('Aangenomen voor functie')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('Bijvoorbeeld: Junior Moderator / Support / Developer');

        const noteInput = new TextInputBuilder()
            .setCustomId('note')
            .setLabel('Korte opmerking')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setPlaceholder('Bijvoorbeeld: Welkom in het team!');

        modal.addComponents(
            new ActionRowBuilder().addComponents(userInput),
            new ActionRowBuilder().addComponents(roleInput),
            new ActionRowBuilder().addComponents(noteInput)
        );

        await interaction.showModal(modal);
        return;
    }

    if (interaction.customId.startsWith('dh_role_')) {
        const roleId = interaction.customId.replace('dh_role_', '');
        const role = interaction.guild?.roles?.cache?.get(roleId);

        if (!role) {
            return interaction.reply({
                content: 'Deze rol bestaat niet meer of kan niet worden gevonden. / This role no longer exists or cannot be found.',
                flags: MessageFlags.Ephemeral
            });
        }

        const blockedRoleNames = [
            'CEO', 'Owner', 'Hoofd Manager', 'Manager', 'Admin', 'Teamleiders',
            'Staff', 'Moderator', 'Developer', 'Support', 'Geschorst', 'Ontslagen',
            'Bot'
        ];

        if (blockedRoleNames.some(name => role.name.includes(name))) {
            return interaction.reply({
                content: 'Deze rol kan niet via dit panel worden gekozen. / This role cannot be selected from this panel.',
                flags: MessageFlags.Ephemeral
            });
        }

        const member = interaction.member;
        const hasRole = member.roles.cache.has(role.id);

        if (hasRole) {
            await member.roles.remove(role.id, 'Dragonshosting role panel toggle');
            return interaction.reply({
                content: `Rol verwijderd: ${role} / Role removed: ${role}`,
                flags: MessageFlags.Ephemeral
            });
        }

        await member.roles.add(role.id, 'Dragonshosting role panel toggle');
        return interaction.reply({
            content: `Rol toegevoegd: ${role} / Role added: ${role}`,
            flags: MessageFlags.Ephemeral
        });
    }

}


async function handleDragonshostingStaffRankModal(interaction) {
    const action = interaction.customId.replace('dh_staffrank_', '');
    const allowedRoleNames = ['👑 CEO / Owner', '🏛️ Hoofd Manager', '💼 Manager', '🛡️ Admin'];
    const allowed = interaction.member?.roles?.cache?.some(role => allowedRoleNames.includes(role.name));

    if (!allowed) {
        return interaction.reply({
            content: 'Je hebt geen toestemming om staff promoties/demoties te beheren.',
            flags: MessageFlags.Ephemeral
        });
    }

    const staffLadder = [
        '🧪 Junior Moderator',
        '🔹 Moderator',
        '🔷 Senior Moderator',
        '🧭 Teamleiders',
        '💼 Manager',
        '🏛️ Hoofd Manager'
    ];

    const targetRaw = interaction.fields.getTextInputValue('target');
    const reason = interaction.fields.getTextInputValue('reason');
    const targetId = targetRaw.match(/\d{17,20}/)?.[0];

    if (!targetId) {
        return interaction.reply({ content: 'Geen geldige gebruiker ID of mention gevonden.', flags: MessageFlags.Ephemeral });
    }

    const member = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!member) {
        return interaction.reply({ content: 'Gebruiker niet gevonden in deze server.', flags: MessageFlags.Ephemeral });
    }

    const rolesByName = new Map(interaction.guild.roles.cache.map(role => [role.name, role]));
    const currentIndex = staffLadder.findLastIndex(roleName => member.roles.cache.has(rolesByName.get(roleName)?.id));

    if (currentIndex === -1) {
        return interaction.reply({
            content: `${member} heeft nog geen staffrang uit de staff-ladder.`,
            flags: MessageFlags.Ephemeral
        });
    }

    const nextIndex = action === 'promote' ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex < 0 || nextIndex >= staffLadder.length) {
        return interaction.reply({
            content: `${member} kan niet verder worden ${action === 'promote' ? 'gepromoveerd' : 'gedemote'} via deze ladder.`,
            flags: MessageFlags.Ephemeral
        });
    }

    const oldRole = rolesByName.get(staffLadder[currentIndex]);
    const newRole = rolesByName.get(staffLadder[nextIndex]);

    if (!oldRole || !newRole) {
        return interaction.reply({
            content: 'Een staffrol uit de ladder ontbreekt. Controleer de rollenlijst.',
            flags: MessageFlags.Ephemeral
        });
    }

    await member.roles.remove(oldRole.id, `Dragonshosting ${action} door ${interaction.user.tag}: ${reason}`);
    await member.roles.add(newRole.id, `Dragonshosting ${action} door ${interaction.user.tag}: ${reason}`);

    const color = action === 'promote' ? '#57F287' : '#ED4245';
    const title = action === 'promote' ? '✅ Staff promotie uitgevoerd' : '⚠️ Staff demotie uitgevoerd';
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(`${member} is aangepast binnen de Dragonshosting staff-ladder.`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields(
            { name: 'Gebruiker', value: `${member.user.tag} (${member.id})`, inline: false },
            { name: 'Van', value: `${oldRole}`, inline: true },
            { name: 'Naar', value: `${newRole}`, inline: true },
            { name: 'Uitgevoerd door', value: `${interaction.user}`, inline: false },
            { name: 'Reden', value: reason.slice(0, 1024), inline: false }
        )
        .setFooter({ text: 'Dragonshosting • Staff Management' })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    const publicChannel = interaction.guild.channels.cache.find(channel => channel.name === '📈・staff-updates' || channel.name.includes('staff-updates'));
    const imagePath = path.join(__dirname, '..', '..', '..', 'data', 'dragonshosting-staff-panel.png');
    if (publicChannel && fs.existsSync(imagePath)) {
        const publicEmbed = EmbedBuilder.from(embed).setImage('attachment://dragonshosting-staff-panel.png');
        await publicChannel.send({
            embeds: [publicEmbed],
            files: [new AttachmentBuilder(imagePath, { name: 'dragonshosting-staff-panel.png' })]
        }).catch(() => {});
    } else {
        await publicChannel?.send({ embeds: [embed] }).catch(() => {});
    }
}

async function handleDragonshostingApplicationAcceptedModal(interaction) {
    const allowedRoleNames = ['👑 CEO / Owner', '🏛️ Hoofd Manager', '💼 Manager', '🛡️ Admin', '🧭 Teamleiders'];
    const allowed = interaction.member?.roles?.cache?.some(role => allowedRoleNames.includes(role.name));

    if (!allowed) {
        return interaction.reply({
            content: 'Je hebt geen toestemming om sollicitatie-updates te plaatsen.',
            flags: MessageFlags.Ephemeral
        });
    }

    const targetRaw = interaction.fields.getTextInputValue('target');
    const functionName = interaction.fields.getTextInputValue('role');
    const note = interaction.fields.getTextInputValue('note') || 'Welkom bij het Dragonshosting team.';
    const targetId = targetRaw.match(/\d{17,20}/)?.[0];

    if (!targetId) {
        return interaction.reply({ content: 'Geen geldige gebruiker ID of mention gevonden.', flags: MessageFlags.Ephemeral });
    }

    const member = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!member) {
        return interaction.reply({ content: 'Gebruiker niet gevonden in deze server.', flags: MessageFlags.Ephemeral });
    }

    const assignableRoleNames = [
        '🧪 Junior Moderator',
        '🔹 Moderator',
        '🔷 Senior Moderator',
        '⭐ Staff Team',
        '🎫 Ticket Support',
        '🐞 Bug Support',
        'Player Reports',
        'Unban Coordinator',
        '📣 Marketing Team',
        'Content Creator',
        '💻 Discord Developer',
        '⛏️ Minecraft Developer',
    ];
    const normalizedFunction = functionName.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    const assignRole = interaction.guild.roles.cache.find(role => {
        if (!assignableRoleNames.includes(role.name)) return false;
        const normalizedRole = role.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
        return normalizedRole === normalizedFunction || normalizedRole.includes(normalizedFunction) || normalizedFunction.includes(normalizedRole);
    });

    if (assignRole && !member.roles.cache.has(assignRole.id)) {
        await member.roles.add(assignRole.id, `Dragonshosting sollicitatie aangenomen door ${interaction.user.tag}: ${functionName}`);
    }

    const embed = new EmbedBuilder()
        .setColor('#39FF14')
        .setTitle('🎉 Sollicitatie aangenomen')
        .setDescription(`${member} is aangenomen binnen Dragonshosting.`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields(
            { name: 'Gebruiker', value: `${member.user.tag} (${member.id})`, inline: false },
            { name: 'Functie', value: assignRole ? `${assignRole}` : functionName.slice(0, 256), inline: true },
            { name: 'Geplaatst door', value: `${interaction.user}`, inline: true },
            { name: 'Rol toegewezen', value: assignRole ? 'Ja' : 'Nee, geen passende bestaande rol gevonden.', inline: false },
            { name: 'Opmerking', value: note.slice(0, 1024), inline: false }
        )
        .setFooter({ text: 'Dragonshosting • Sollicitaties' })
        .setTimestamp();

    await interaction.reply({ content: 'Sollicitatie-update geplaatst.', flags: MessageFlags.Ephemeral });
    const publicChannel = interaction.guild.channels.cache.find(channel => channel.name === '📈・staff-updates' || channel.name.includes('staff-updates'));
    const imagePath = path.join(__dirname, '..', '..', '..', 'data', 'dragonshosting-staff-panel.png');
    if (publicChannel && fs.existsSync(imagePath)) {
        embed.setImage('attachment://dragonshosting-staff-panel.png');
        await publicChannel.send({
            embeds: [embed],
            files: [new AttachmentBuilder(imagePath, { name: 'dragonshosting-staff-panel.png' })]
        }).catch(() => {});
    } else {
        await publicChannel?.send({ embeds: [embed] }).catch(() => {});
    }
}

