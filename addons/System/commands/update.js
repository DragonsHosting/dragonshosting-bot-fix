const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getAutoUpdater } = require('../../../utils/core/autoUpdater');
const packageJson = require('../../../package.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('update')
        .setDescription('Check for bot updates')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('check')
                .setDescription('Check for available updates'))
        .addSubcommand(sub =>
            sub.setName('force')
                .setDescription('Force update the bot now'))
        .addSubcommand(sub =>
            sub.setName('status')
                .setDescription('View auto-update status')),

    async execute(interaction) {
        const config = global.config;
        const subcommand = interaction.options.getSubcommand();
        const updater = getAutoUpdater();

        if (subcommand === 'status') {
            const embed = new EmbedBuilder()
                .setTitle('🔄 Auto-Update Status')
                .setColor(config.EmbedColors || '#1769FF')
                .addFields(
                    { name: 'Current Version', value: packageJson.version, inline: true },
                    { name: 'Auto-Update', value: config.AutoUpdate === true ? '✅ Enabled' : '❌ Disabled', inline: true }
                );

            if (config.AutoUpdate === true) {
                embed.addFields(
                    { name: 'Check Interval', value: '60 minutes', inline: true },
                    { name: 'Auto-Restart', value: 'Yes', inline: true },
                    { name: 'Preserve Configs', value: 'Yes', inline: true }
                );
            }

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (!updater) {
            return interaction.reply({ 
                content: '❌ Auto-updater is not initialized. Check your configuration.', 
                ephemeral: true 
            });
        }

        if (subcommand === 'check') {
            await interaction.deferReply({ ephemeral: true });
            
            try {
                const updateInfo = await updater.checkForUpdates();
                
                if (updateInfo) {
                    const embed = new EmbedBuilder()
                        .setTitle('🆕 Update Available!')
                        .setColor('#2ecc71')
                        .setDescription(`A new version is available: **${updateInfo.version}**\nCurrent version: **${packageJson.version}**`)
                        .addFields(
                            { name: 'How to Update', value: 'Use `/update force` to update now, or wait for auto-update if enabled.' }
                        );
                    
                    if (updateInfo.changelog) {
                        embed.addFields({ name: 'Changelog', value: updateInfo.changelog.slice(0, 1024) });
                    }
                    
                    return interaction.editReply({ embeds: [embed] });
                } else {
                    const embed = new EmbedBuilder()
                        .setTitle('✅ Up to Date')
                        .setColor('#2ecc71')
                        .setDescription(`You are running the latest version: **${packageJson.version}**`);
                    
                    return interaction.editReply({ embeds: [embed] });
                }
            } catch (error) {
                return interaction.editReply({ 
                    content: `❌ Failed to check for updates: ${error.message}` 
                });
            }
        }

        if (subcommand === 'force') {
            await interaction.deferReply({ ephemeral: true });
            
            const embed = new EmbedBuilder()
                .setTitle('🔄 Updating...')
                .setColor('#f39c12')
                .setDescription('Checking for updates and applying if available. The bot will restart if an update is found.');
            
            await interaction.editReply({ embeds: [embed] });
            
            try {
                const updated = await updater.forceUpdate();
                
                if (!updated) {
                    const noUpdateEmbed = new EmbedBuilder()
                        .setTitle('✅ Already Up to Date')
                        .setColor('#2ecc71')
                        .setDescription(`No updates available. Current version: **${packageJson.version}**`);
                    
                    await interaction.editReply({ embeds: [noUpdateEmbed] });
                }
            } catch (error) {
                await interaction.editReply({ 
                    content: `❌ Update failed: ${error.message}` 
                });
            }
        }
    }
};

