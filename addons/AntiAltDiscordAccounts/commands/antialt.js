const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require('discord.js');

const CONFIG_PATH = path.resolve(__dirname, '../config.yml');

function readRootConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { AntiAltDiscordAccounts: {} };
  }

  return yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8')) || { AntiAltDiscordAccounts: {} };
}

function readConfig() {
  return readRootConfig().AntiAltDiscordAccounts || {};
}

function writeConfig(config) {
  const root = readRootConfig();
  root.AntiAltDiscordAccounts = {
    ...(root.AntiAltDiscordAccounts || {}),
    ...config
  };

  fs.writeFileSync(CONFIG_PATH, yaml.dump(root, { lineWidth: 120 }), 'utf8');
}

function isValidDuration(value) {
  return /^\d+\s*(s|m|h|d|w)$/i.test(String(value || '').trim());
}

function getStrictGate(config) {
  return config.StrictJoinGate || {};
}

function writeStrictGate(config) {
  writeConfig({
    StrictJoinGate: {
      ...(readConfig().StrictJoinGate || {}),
      ...config,
      Rules: {
        ...((readConfig().StrictJoinGate || {}).Rules || {}),
        ...(config.Rules || {})
      }
    }
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('antialt')
    .setDescription('Manage the DragonsHosting anti-alt addon.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Show the current anti-alt settings.')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('enabled')
        .setDescription('Enable or disable the anti-alt addon.')
        .addBooleanOption(option =>
          option
            .setName('value')
            .setDescription('Whether the addon should be enabled.')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('action')
        .setDescription('Set what happens when a new account is detected.')
        .addStringOption(option =>
          option
            .setName('value')
            .setDescription('Moderation action.')
            .setRequired(true)
            .addChoices(
              { name: 'log only', value: 'log' },
              { name: 'quarantine role', value: 'quarantine' },
              { name: 'kick', value: 'kick' },
              { name: 'ban', value: 'ban' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('minimum-age')
        .setDescription('Set the minimum allowed Discord account age.')
        .addStringOption(option =>
          option
            .setName('value')
            .setDescription('Examples: 12h, 7d, 2w')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('log-channel')
        .setDescription('Set the anti-alt log channel.')
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('Text channel for anti-alt logs.')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('quarantine-role')
        .setDescription('Set the role used when action is quarantine.')
        .addRoleOption(option =>
          option
            .setName('role')
            .setDescription('Role to assign to flagged accounts.')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('strict-mode')
        .setDescription('Enable/disable strict join gate checks.')
        .addBooleanOption(option =>
          option
            .setName('enabled')
            .setDescription('Whether strict gate checks should be enabled.')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('mode')
            .setDescription('Suspicious only, or every new join until review.')
            .setRequired(false)
            .addChoices(
              { name: 'suspicious only', value: 'suspicious' },
              { name: 'all new joins', value: 'all' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('risk-threshold')
        .setDescription('Set the strict gate risk score threshold.')
        .addIntegerOption(option =>
          option
            .setName('value')
            .setDescription('Recommended: 60. Lower is stricter.')
            .setMinValue(1)
            .setMaxValue(200)
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('lockdown')
        .setDescription('Make quarantined members unable to see/send/connect in channels.')
        .addBooleanOption(option =>
          option
            .setName('enabled')
            .setDescription('Whether the quarantine role should deny channel access.')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('strict-preset')
        .setDescription('Apply the recommended no-IP strict anti-alt settings.')
        .addStringOption(option =>
          option
            .setName('mode')
            .setDescription('Suspicious only, or every new join until review.')
            .setRequired(false)
            .addChoices(
              { name: 'suspicious only', value: 'suspicious' },
              { name: 'all new joins', value: 'all' }
            )
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const config = readConfig();

    if (subcommand === 'status') {
      const strictGate = getStrictGate(config);
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: [
          '**Anti-alt settings**',
          `Enabled: \`${config.Enabled !== false}\``,
          `Minimum account age: \`${config.MinimumAccountAge || '7d'}\``,
          `Action: \`${config.Action || 'log'}\``,
          `Log channel: ${config.LogChannelID ? `<#${config.LogChannelID}>` : '`not set`'}`,
          `Quarantine role: ${config.QuarantineRoleID ? `<@&${config.QuarantineRoleID}>` : '`not set`'}`,
          `Strict gate: \`${strictGate.Enabled !== false}\``,
          `Strict mode: \`${strictGate.Mode || 'suspicious'}\``,
          `Risk threshold: \`${strictGate.RiskScoreThreshold || 60}\``,
          `Channel lockdown: \`${strictGate.LockdownChannels !== false}\``
        ].join('\n')
      });
    }

    if (subcommand === 'enabled') {
      const enabled = interaction.options.getBoolean('value', true);
      writeConfig({ Enabled: enabled });
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: `Anti-alt is now \`${enabled ? 'enabled' : 'disabled'}\`.` });
    }

    if (subcommand === 'action') {
      const action = interaction.options.getString('value', true);
      writeConfig({ Action: action });
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: `Anti-alt action set to \`${action}\`.` });
    }

    if (subcommand === 'minimum-age') {
      const value = interaction.options.getString('value', true).trim().toLowerCase();
      if (!isValidDuration(value)) {
        return interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Use a valid duration like `12h`, `7d` or `2w`.' });
      }

      writeConfig({ MinimumAccountAge: value });
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: `Minimum account age set to \`${value}\`.` });
    }

    if (subcommand === 'log-channel') {
      const channel = interaction.options.getChannel('channel', true);
      writeConfig({ LogChannelID: channel.id });
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: `Anti-alt logs will go to ${channel}.` });
    }

    if (subcommand === 'quarantine-role') {
      const role = interaction.options.getRole('role', true);
      writeConfig({ QuarantineRoleID: role.id });
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: `Quarantine role set to ${role}.` });
    }

    if (subcommand === 'strict-mode') {
      const enabled = interaction.options.getBoolean('enabled', true);
      const mode = interaction.options.getString('mode');

      writeStrictGate({
        Enabled: enabled,
        ...(mode ? { Mode: mode } : {})
      });

      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: `Strict gate is now \`${enabled ? 'enabled' : 'disabled'}\`${mode ? ` with mode \`${mode}\`` : ''}.`
      });
    }

    if (subcommand === 'risk-threshold') {
      const value = interaction.options.getInteger('value', true);
      writeStrictGate({ RiskScoreThreshold: value });
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: `Anti-alt risk threshold set to \`${value}\`. Lower means stricter.`
      });
    }

    if (subcommand === 'lockdown') {
      const enabled = interaction.options.getBoolean('enabled', true);
      writeStrictGate({ LockdownChannels: enabled });
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: `Quarantine channel lockdown is now \`${enabled ? 'enabled' : 'disabled'}\`.`
      });
    }

    if (subcommand === 'strict-preset') {
      const mode = interaction.options.getString('mode') || 'all';
      writeConfig({
        Enabled: true,
        MinimumAccountAge: '30d',
        Action: 'quarantine',
        StrictJoinGate: {
          Enabled: true,
          Mode: mode,
          RiskScoreThreshold: 60,
          AutoCreateQuarantineRole: true,
          QuarantineRoleName: 'Quarantine',
          LockdownChannels: true,
          LockdownRefresh: '30m',
          Rules: {
            NoAvatar: true,
            DuplicateName: true,
            JoinBurst: {
              Enabled: true,
              Window: '10m',
              MaxJoins: 3,
              AccountMaxAge: '30d'
            }
          }
        }
      });

      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: [
          'Strict anti-alt preset applied.',
          `Mode: \`${mode}\``,
          'Minimum account age: `30d`',
          'Action: `quarantine`',
          'Auto quarantine role and channel lockdown are enabled.'
        ].join('\n')
      });
    }

    return interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Unknown anti-alt subcommand.' });
  }
};
