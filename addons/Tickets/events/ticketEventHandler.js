const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const http = require('http');
const {
  getGuildBrand,
  getLogChannelId,
  getStaffRoleIds,
  getTicketType,
  getTicketTypeByCategoryId,
  getTranscriptChannelId
} = require('../ticketConfig');

const TRANSCRIPT_SECRET = process.env.TRANSCRIPT_SECRET;
const TRANSCRIPT_PORT = process.env.SERVER_PORT || 25590;

function safeUsername(username, userId = 'user') {
  return String(username || userId)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 20) || String(userId).slice(0, 20);
}

function hasTicketStaffRole(member) {
  if (!member) return false;
  if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  return getStaffRoleIds(member.guild).some(roleId => member.roles.cache.has(roleId));
}

function getExistingStaffRoleIds(guild) {
  return getStaffRoleIds(guild).filter(roleId => guild.roles.cache.has(roleId));
}

async function replyTicketError(interaction, content) {
  const payload = typeof content === 'string'
    ? { content, flags: MessageFlags.Ephemeral }
    : { ...content, flags: MessageFlags.Ephemeral };
  if (interaction.deferred || interaction.replied) {
    return interaction.followUp(payload).catch(() => null);
  }
  return interaction.reply(payload).catch(() => null);
}

function isUnknownInteraction(error) {
  return error?.code === 10062 || error?.rawError?.code === 10062 || /unknown interaction/i.test(error?.message || '');
}

async function safeDeferReply(interaction, options = {}) {
  if (interaction.deferred || interaction.replied) return true;
  try {
    await interaction.deferReply(options);
    return true;
  } catch (error) {
    if (!isUnknownInteraction(error)) {
      console.error('[Ticket System] Could not defer interaction:', error.message);
    }
    return false;
  }
}

async function safeDeferUpdate(interaction) {
  if (interaction.deferred || interaction.replied) return true;
  try {
    await interaction.deferUpdate();
    return true;
  } catch (error) {
    if (!isUnknownInteraction(error)) {
      console.error('[Ticket System] Could not defer component interaction:', error.message);
    }
    return false;
  }
}

function saveTranscript(data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const options = {
      hostname: '127.0.0.1',
      port: Number(TRANSCRIPT_PORT),
      path: '/save',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-transcript-secret': TRANSCRIPT_SECRET
      }
    };
    const req = http.request(options, res => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseBody).url);
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function buildTicketButtons(claimLabel = 'Claim') {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('Close')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔒'),
    new ButtonBuilder()
      .setCustomId('ticket_claim')
      .setLabel(claimLabel)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🎫')
  );
}

async function findTicketCategory(guild, ticketType) {
  if (ticketType.categoryId) {
    const byId = guild.channels.cache.get(ticketType.categoryId)
      || await guild.channels.fetch(ticketType.categoryId).catch(() => null);
    if (byId && byId.type === ChannelType.GuildCategory) return byId;
  }

  return guild.channels.cache.find(channel =>
    channel.type === ChannelType.GuildCategory && channel.name === ticketType.categoryName
  ) || null;
}

function userAlreadyHasOpenTicket(guild, userId, username) {
  const safeName = safeUsername(username, userId);
  return guild.channels.cache.find(channel =>
    channel.type === ChannelType.GuildText &&
    channel.name?.startsWith('ticket-') &&
    (
      channel.topic?.includes(`UserID:${userId}`) ||
      channel.name.includes(safeName)
    )
  );
}

function ticketChannelName(ticketType, member) {
  return `ticket-${ticketType.slug || 'support'}-${safeUsername(member.user.username, member.id)}`.slice(0, 95);
}

function buildTicketEmbed(guild, member, ticketType) {
  const brand = getGuildBrand(guild);
  const now = Math.floor(Date.now() / 1000);

  return new EmbedBuilder()
    .setAuthor({
      name: `${brand.guildName} - Ticket`,
      iconURL: brand.guildIcon || undefined
    })
    .setDescription(ticketType.intro || 'Bedankt voor het openen van een ticket. Ons team helpt je zo snel mogelijk.')
    .addFields(
      {
        name: '__Ticket Information:__',
        value: [
          `- Ticket Category: \`${ticketType.label}\``,
          `- Ticket Creator: ${member}`,
          `- Expected Response: \`${ticketType.expectedResponse || 'Binnen 24 uur'}\``,
          `- Date: <t:${now}:f>`
        ].join('\n')
      }
    )
    .setThumbnail(brand.guildIcon || null)
    .setColor(ticketType.style === 'Danger' ? 0xed4245 : ticketType.style === 'Success' ? 0x57f287 : 0x5865f2);
}

function buildAnswerEmbed(ticketType, description) {
  return new EmbedBuilder()
    .setTitle(ticketType.question || 'Beschrijving')
    .setDescription(`\`\`\`${description}\`\`\``)
    .setColor(0x2b2d31);
}

async function sendTicketLog(guild, embedBuilder) {
  const logChannelId = getLogChannelId(guild);
  if (!logChannelId) return;

  const logChannel = guild.channels.cache.get(logChannelId)
    || await guild.channels.fetch(logChannelId).catch(() => null);
  if (!logChannel?.isTextBased?.()) return;

  await logChannel.send({ embeds: [embedBuilder] }).catch(console.error);
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    if (!interaction.guild) return;
    try {

    if (interaction.isButton() && interaction.customId.startsWith('ticket_') &&
      !['ticket_claim', 'ticket_close', 'ticket_confirm_close', 'ticket_cancel_close'].includes(interaction.customId)) {
      const ticketType = getTicketType(interaction.guild, interaction.customId);
      if (!ticketType || ticketType.enabled === false) {
        return replyTicketError(interaction, '⚠️ Dit tickettype bestaat niet meer of is uitgeschakeld.');
      }

      const modal = new ModalBuilder()
        .setCustomId(`ticket_modal_${ticketType.id}`)
        .setTitle(`${ticketType.shortLabel || ticketType.label} Ticket`.slice(0, 45));

      const input = new TextInputBuilder()
        .setCustomId('ticket_description')
        .setLabel((ticketType.question || 'Beschrijf je probleem').slice(0, 45))
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder(ticketType.placeholder || 'Type je antwoord hier...')
        .setRequired(true)
        .setMaxLength(1000);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal).catch(error => {
        if (!isUnknownInteraction(error)) {
          console.error('[Ticket System] Could not show ticket modal:', error.message);
        }
      });
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_modal_')) {
      const ticketTypeId = interaction.customId.replace('ticket_modal_', '');
      const ticketType = getTicketType(interaction.guild, ticketTypeId);
      const guild = interaction.guild;
      const member = interaction.member;
      const description = interaction.fields.getTextInputValue('ticket_description');

      const didDefer = await safeDeferReply(interaction, { flags: MessageFlags.Ephemeral });
      if (!didDefer) return;

      if (!ticketType || ticketType.enabled === false) {
        return interaction.editReply({ content: '⚠️ Dit tickettype bestaat niet meer of is uitgeschakeld.' });
      }

      const category = await findTicketCategory(guild, ticketType);
      if (!category) {
        return interaction.editReply({
          content: `⚠️ Ticketcategorie ontbreekt: \`${ticketType.categoryName}\`. Laat een admin /fixticketsystem draaien.`
        });
      }

      const existingTicket = userAlreadyHasOpenTicket(guild, member.id, member.user.username);
      if (existingTicket) {
        return interaction.editReply({ content: `Je hebt al een open ticket: ${existingTicket}. Sluit dit eerst.` });
      }

      try {
        const staffRoleIds = getExistingStaffRoleIds(guild);
        const ticketChannel = await guild.channels.create({
          name: ticketChannelName(ticketType, member),
          type: ChannelType.GuildText,
          parent: category.id,
          topic: `Dragonshosting ticket | Type:${ticketType.label} | UserID:${member.id} | Username:${member.user.username}`,
          permissionOverwrites: [
            { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            {
              id: member.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles
              ]
            },
            ...staffRoleIds.map(roleId => ({
              id: roleId,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.ManageMessages
              ]
            }))
          ],
          reason: `Ticket opened by ${member.user.tag}`
        });

        const mentionText = staffRoleIds.map(id => `<@&${id}>`).join(' ');
        await ticketChannel.send({
          content: `${member} ${mentionText}`.trim(),
          embeds: [
            buildTicketEmbed(guild, member, ticketType),
            buildAnswerEmbed(ticketType, description)
          ],
          components: [buildTicketButtons()]
        });

        await interaction.editReply({ content: `✅ Je ticket is aangemaakt: ${ticketChannel}` });

        await sendTicketLog(guild, new EmbedBuilder()
          .setTitle('🎫 Ticket aangemaakt')
          .setColor(0x57f287)
          .addFields(
            { name: 'Gebruiker', value: `${member.user.tag}`, inline: true },
            { name: 'Type', value: ticketType.label, inline: true },
            { name: 'Kanaal', value: `<#${ticketChannel.id}>`, inline: true }
          )
          .setTimestamp());
      } catch (error) {
        console.error('[Ticket System] Error creating ticket:', error);
        await interaction.editReply({ content: '❌ Er is een fout opgetreden. Controleer bot-permissies en probeer opnieuw.' });
      }
      return;
    }

    if (!interaction.isButton()) return;

    if (interaction.customId === 'ticket_claim') {
      if (!hasTicketStaffRole(interaction.member)) {
        return replyTicketError(interaction, '❌ Je hebt geen toestemming om tickets te claimen.');
      }

      try {
        const didDefer = await safeDeferUpdate(interaction);
        if (!didDefer) return;
        const originalEmbed = interaction.message.embeds[0];
        const claimedEmbed = originalEmbed
          ? EmbedBuilder.from(originalEmbed)
            .setColor(0xfee75c)
            .setFooter({ text: `Geclaimed door ${interaction.user.tag}` })
          : new EmbedBuilder()
            .setColor(0xfee75c)
            .setDescription(`Geclaimed door ${interaction.user}.`);

        const updatedEmbeds = interaction.message.embeds.map((embed, index) =>
          index === 0 ? claimedEmbed : EmbedBuilder.from(embed)
        );
        if (updatedEmbeds.length === 0) updatedEmbeds.push(claimedEmbed);

        await interaction.message.edit({ embeds: updatedEmbeds, components: [buildTicketButtons('Unclaim')] });
        await interaction.channel.send({ content: `🔒 ${interaction.user} heeft dit ticket geclaimed.` });
      } catch (error) {
        console.error('[Ticket System] Error claiming ticket:', error);
        await replyTicketError(interaction, '❌ Dit ticket kon niet worden geclaimed.');
      }
      return;
    }

    if (interaction.customId === 'ticket_close') {
      const isStaff = hasTicketStaffRole(interaction.member);
      const isOwner = interaction.channel?.topic?.includes(`UserID:${interaction.user.id}`) ||
        interaction.channel?.name?.includes(safeUsername(interaction.user.username, interaction.user.id));

      if (!isStaff && !isOwner) {
        return replyTicketError(interaction, '❌ Je hebt geen toestemming om dit ticket te sluiten.');
      }

      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_confirm_close').setLabel('✅ Bevestig sluiten').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ticket_cancel_close').setLabel('Annuleer').setStyle(ButtonStyle.Secondary)
      );
      await replyTicketError(interaction, {
        content: 'Weet je zeker dat je dit ticket wilt sluiten?',
        components: [confirmRow]
      });
      return;
    }

    if (interaction.customId === 'ticket_confirm_close') {
      const didDefer = await safeDeferUpdate(interaction);
      if (!didDefer) return;

      const guild = interaction.guild;
      const channel = interaction.channel;
      const ticketType = getTicketTypeByCategoryId(guild, channel.parentId);
      const ticketLabel = ticketType?.label || 'Support';

      const fetched = await channel.messages.fetch({ limit: 100 });
      const sortedMessages = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      const transcriptData = {
        guildName: guild.name,
        guildIcon: guild.iconURL({ size: 128 }),
        channelName: channel.name,
        ticketType: ticketLabel,
        createdBy: channel.topic?.match(/UserID:(\d+)/)?.[1] || channel.name.replace(/^ticket-/, ''),
        closedBy: interaction.user.tag,
        createdAt: channel.createdAt,
        messages: sortedMessages.map(msg => ({
          authorId: msg.author.id,
          authorName: msg.author.username,
          authorColor: msg.member?.displayHexColor || '#ffffff',
          avatarUrl: msg.author.displayAvatarURL({ size: 64 }),
          isBot: msg.author.bot,
          content: msg.content,
          timestamp: msg.createdAt,
          embeds: msg.embeds.map(e => ({
            title: e.title,
            description: e.description,
            color: e.color,
            author: e.author,
            fields: e.fields,
            footer: e.footer,
            image: e.image,
            thumbnail: e.thumbnail
          })),
          attachments: [...msg.attachments.values()].map(a => ({
            name: a.name,
            url: a.url,
            contentType: a.contentType
          }))
        }))
      };

      let transcriptUrl = null;
      try {
        transcriptUrl = await saveTranscript(transcriptData);
      } catch (error) {
        console.error('[Ticket System] Failed to save transcript:', error);
      }

      const closeEmbed = new EmbedBuilder()
        .setTitle('🔒 Ticket closing...')
        .setDescription('Dit kanaal wordt over 5 seconden verwijderd.')
        .setColor(0xed4245)
        .setTimestamp();

      if (transcriptUrl) {
        closeEmbed.addFields({ name: '📋 Transcript', value: `[Klik hier om het transcript te bekijken](${transcriptUrl})` });
      }

      await channel.send({ embeds: [closeEmbed] });

      const logEmbed = new EmbedBuilder()
        .setTitle('🔒 Ticket gesloten')
        .setColor(0xed4245)
        .addFields(
          { name: 'Kanaal', value: `#${channel.name}`, inline: true },
          { name: 'Type', value: ticketLabel, inline: true },
          { name: 'Gesloten door', value: interaction.user.tag, inline: true }
        )
        .setTimestamp();
      if (transcriptUrl) {
        logEmbed.addFields({ name: '📋 Transcript', value: `[Bekijk transcript](${transcriptUrl})` });
      }
      await sendTicketLog(guild, logEmbed);

      if (transcriptUrl) {
        const transcriptChannelId = getTranscriptChannelId(guild);
        const transcriptChannel = guild.channels.cache.get(transcriptChannelId)
          || await guild.channels.fetch(transcriptChannelId).catch(() => null);
        if (transcriptChannel?.isTextBased?.()) {
          await transcriptChannel.send({ embeds: [logEmbed] }).catch(console.error);
        }
      }

      setTimeout(async () => {
        await channel.delete('Ticket closed').catch(console.error);
      }, 5000);
      return;
    }

    if (interaction.customId === 'ticket_cancel_close') {
      await interaction.update({ content: '✅ Ticket sluiten geannuleerd.', components: [] }).catch(error => {
        if (!isUnknownInteraction(error)) {
          console.error('[Ticket System] Could not cancel ticket close:', error.message);
        }
      });
    }
    } catch (error) {
      if (!isUnknownInteraction(error)) {
        console.error('[Ticket System] Interaction failed:', {
          customId: interaction?.customId || null,
          message: error.message,
          code: error.code || null,
          status: error.status || null
        });
        await replyTicketError(interaction, '❌ Ticket actie is mislukt. Controleer bot-permissies en probeer opnieuw.').catch(() => null);
      }
    }
  }
};
