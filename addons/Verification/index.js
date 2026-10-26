module.exports = {
    name: 'Verification',
    version: '1.0.0',
    description: 'Member verification and join-role workflows',
    async run(client, eventManager, api) {
        const Verification = require('./models/verificationSchema');
        const verification = require('./events/VerificationEvent');
        const config = api.config || {};

        verification.setContext(config, api.lang || {});
        api.registerModel('Verification', Verification);

        const initializeGuild = async guild => {
            try {
                let data = await Verification.findOne({ guildID: guild.id });
                if (!data) {
                    data = await Verification.create({
                        guildID: guild.id,
                        msgID: null,
                        unverifiedRoleID: null
                    });
                }
                await verification.createUnverifiedRoleIfNeeded(guild, data);
                await verification.handleVerification(client, guild);
            } catch (error) {
                api.logger.error(`Verification setup failed for guild ${guild.id}: ${error.message}`);
            }
        };

        const initializeAllGuilds = async () => {
            await Promise.allSettled(
                Array.from(client.guilds.cache.values(), guild => initializeGuild(guild))
            );
        };

        let unregisterReady = () => false;
        if (client.isReady?.()) {
            initializeAllGuilds();
        } else {
            unregisterReady = api.onDiscord('clientReady', initializeAllGuilds);
        }

        api.onDiscord('interactionCreate', async ({ interaction }) => {
            if (!interaction?.isButton?.() || interaction.customId !== 'verifyButton') return false;
            await verification.handleVerificationInteraction(client, interaction);
            return true;
        });

        api.onDiscord('guildMemberAdd', async ({ member }) => {
            if (!member || member.user?.bot) return false;
            if (config.VerificationSettings?.Enabled && config.VerificationSettings?.EnableUnverifiedRole) {
                try {
                    let data = await Verification.findOne({ guildID: member.guild.id });
                    if (!data?.unverifiedRoleID) {
                        await verification.createUnverifiedRoleIfNeeded(member.guild, data);
                        data = await Verification.findOne({ guildID: member.guild.id });
                    }
                    const role = data?.unverifiedRoleID
                        ? member.guild.roles.cache.get(data.unverifiedRoleID)
                        : null;
                    if (role && !member.roles.cache.has(role.id)) await member.roles.add(role).catch(api.logger.error);
                } catch (error) {
                    api.logger.error(`Failed to assign unverified role in guild ${member.guild.id}: ${error.message}`);
                }
            }
            await verification.handleJoinRoles(member);
            return false;
        });

        const { handleVerificationSettings } = require('./utils/verificationSettings');
        api.onDiscord('messageCreate', async ({ message }) => {
            handleVerificationSettings(message, config);
            return false;
        });

        return () => unregisterReady();
    }
};
