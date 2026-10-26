const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require('discord.js');

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
    channel.name.toLowerCase() === 'modpanel'
  );

  if (existing) return existing;

  return guild.channels.create({
    name: 'ModPanel',
    type: ChannelType.GuildCategory,
    reason: 'Mod panel setup'
  });
}

async function ensureChannel(guild, category) {
  const existing = guild.channels.cache.find(channel =>
    channel.type === ChannelType.GuildText &&
    channel.name.toLowerCase() === 'mod-panel'
  );

  if (existing) {
    if (existing.parentId !== category.id) {
      await existing.setParent(category.id, { reason: 'Mod panel setup' }).catch(() => null);
    }
    return existing;
  }

  return guild.channels.create({
    name: 'mod-panel',
    type: ChannelType.GuildText,
    parent: category.id,
    reason: 'Mod panel setup'
  });
}

function buildPanel() {
  const embed = new EmbedBuilder()
    .setTitle('Persistent Moderation Panel')
    .setDescription('Gebruik de knoppen om kick, ban, timeout, warn, softban, unban en userinfo acties te starten.')
    .setColor(0x992d22)
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('persistent_mod_kick').setLabel('Kick').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('persistent_mod_ban').setLabel('Ban').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('persistent_mod_timeout').setLabel('Timeout').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('persistent_mod_warn').setLabel('Warn').setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('persistent_mod_softban').setLabel('Softban').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('persistent_mod_unban').setLabel('Unban').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('persistent_mod_userinfo').setLabel('User Info').setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [row1, row2] };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setupmodpanel')
    .setDescription('Maak een ModPanel categorie met mod-panel kanaal.'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!canUseSetup(interaction)) {
      return interaction.editReply('Je hebt geen toestemming om het modpanel te maken.');
    }

    const category = await ensureCategory(interaction.guild);
    const channel = await ensureChannel(interaction.guild, category);

    await channel.send(buildPanel());
    await interaction.editReply(`Mod panel is klaar in ${channel}.`);
  }
};
