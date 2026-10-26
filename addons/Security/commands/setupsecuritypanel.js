const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require('discord.js');

const security = require('../../SecuritySystemUltimatePanel/SecuritySystemUltimatePanelHandler');

const SETUP_ROLE_IDS = new Set([
  '0', // Custom Bot
  '0', // All Perms
  '0', // CEO
  '0', // Eigenaar Perms
  '0', // Admin Perms
  '0', // Admin
  '0', // Teamleider Perms
  '0', // Staff-team
]);

function canUseSetup(interaction) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  return interaction.member?.roles?.cache?.some(role => SETUP_ROLE_IDS.has(role.id));
}

async function ensureCategory(guild) {
  const existing = guild.channels.cache.find(channel =>
    channel.type === ChannelType.GuildCategory &&
    channel.name.toLowerCase() === 'security'
  );

  if (existing) return existing;

  return guild.channels.create({
    name: 'Security',
    type: ChannelType.GuildCategory,
    reason: 'Security panel setup'
  });
}

async function ensureChannel(guild, category) {
  const existing = guild.channels.cache.find(channel =>
    channel.type === ChannelType.GuildText &&
    channel.name.toLowerCase() === 'security-panel'
  );

  if (existing) {
    if (existing.parentId !== category.id) {
      await existing.setParent(category.id, { reason: 'Security panel setup' }).catch(() => null);
    }
    return existing;
  }

  return guild.channels.create({
    name: 'security-panel',
    type: ChannelType.GuildText,
    parent: category.id,
    reason: 'Security panel setup'
  });
}

function buildPanel() {
  const embed = new EmbedBuilder()
    .setTitle('Security Control Panel')
    .setDescription([
      'Gebruik de knoppen om security-status, hulp en lockdown te beheren.',
      '',
      'Actieve bescherming: scam invites, token/webhook leaks, mass mentions, spam en gevaarlijke bijlagen.'
    ].join('\n'))
    .setColor(0x5865f2)
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('security_status')
      .setLabel('Status')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('security_help')
      .setLabel('Help')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('security_lockdown_on')
      .setLabel('Lockdown ON')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('security_lockdown_off')
      .setLabel('Lockdown OFF')
      .setStyle(ButtonStyle.Success)
  );

  return { embeds: [embed], components: [row] };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setupsecuritypanel')
    .setDescription('Maak een Security categorie met security-panel kanaal.'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!canUseSetup(interaction)) {
      return interaction.editReply('Je hebt geen toestemming om het securitypanel te maken.');
    }

    const category = await ensureCategory(interaction.guild);
    const channel = await ensureChannel(interaction.guild, category);

    security.setGuildChannels(interaction.guild.id, {
      categoryId: category.id,
      panelChannelId: channel.id,
      logChannelId: channel.id
    });

    await channel.send(buildPanel());
    await interaction.editReply(`Security panel is klaar in ${channel}.`);
  }
};
