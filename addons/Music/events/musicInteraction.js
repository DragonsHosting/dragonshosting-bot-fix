const { MessageFlags } = require('discord.js');
const { Logger } = require('../../../utils/core/logger');
const { getMusicManager } = require('../utils/musicManager');
const { isDeezerTrackUrl, getDeezerTrackInfo } = require('../utils/deezerHelper');

module.exports = async (client, interaction) => {
    try {
        if ((interaction.isButton() && !interaction.customId.startsWith('music_') && !interaction.customId.startsWith('queue_')) ||
            (interaction.isModalSubmit() && interaction.customId !== 'music_play_search')) {
            return;
        }

        if (interaction.isButton() && interaction.customId !== 'music_play' && !interaction.customId.startsWith('queue_')) {
            try {
                await interaction.deferUpdate();
            } catch (err) {
                Logger.error(`Failed to defer music interaction: ${err}`);
            }
        }

        const musicManager = getMusicManager();
        if (!musicManager) {
            Logger.error('Music manager not initialized in musicInteraction event');
            return interaction.followUp({
                content: '❌ Music system is not available.',
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }
        
        if (interaction.isButton() && !interaction.customId.startsWith('queue_')) {
            if (interaction.customId !== 'music_play') {
                const queue = musicManager.player.nodes.get(interaction.guildId);
                
                if (!interaction.member.voice.channel) {
                    return interaction.followUp({
                        content: '❌ You need to be in a voice channel to use music controls.',
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                }

                if (queue && interaction.guild.members.me.voice.channel && 
                    interaction.member.voice.channelId !== interaction.guild.members.me.voice.channelId) {
                    return interaction.followUp({
                        content: '❌ You need to be in the same voice channel as the bot to use music controls.',
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                }
            }
        }

        if (interaction.isButton()) {
            const buttonId = interaction.customId;

            if (buttonId.startsWith('queue_')) {
                const parts = buttonId.split('_');
                const action = parts[1]; // 'next' or 'prev'
                const page = parseInt(parts[2]);
                const userId = parts[3];
                
                if (interaction.user.id !== userId) {
                    return interaction.followUp({
                        content: '❌ You can only navigate your own queue pages.',
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                }
                
                const queue = musicManager.player.nodes.get(interaction.guildId);
                
                if (!queue || !queue.isPlaying()) {
                    return interaction.followUp({
                        content: '❌ Nothing is currently playing.',
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                }

                const tracks = queue.tracks.toArray();
                const tracksPerPage = 10;
                const totalPages = Math.ceil(tracks.length / tracksPerPage) || 1;
                
                let newPage = page;
                if (action === 'next') {
                    newPage = Math.min(page + 1, totalPages);
                } else if (action === 'prev') {
                    newPage = Math.max(page - 1, 1);
                }
                
                const startIndex = (newPage - 1) * tracksPerPage;
                const endIndex = Math.min(startIndex + tracksPerPage, tracks.length);

                const parseDuration = (duration) => {
                    if (!duration) return 0;
                    const parts = duration.split(':').map(Number);
                    if (parts.length === 3) {
                        return parts[0] * 3600 + parts[1] * 60 + parts[2];
                    } else if (parts.length === 2) {
                        return parts[0] * 60 + parts[1];
                    }
                    return 0;
                };

                const formatDuration = (seconds) => {
                    const hours = Math.floor(seconds / 3600);
                    const minutes = Math.floor((seconds % 3600) / 60);
                    const secs = seconds % 60;
                    if (hours > 0) {
                        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                    }
                    return `${minutes}:${secs.toString().padStart(2, '0')}`;
                };

                const formatMs = (ms) => {
                    const totalSecs = Math.floor(ms / 1000);
                    const mins = Math.floor(totalSecs / 60);
                    const secs = totalSecs % 60;
                    return `${mins}:${secs.toString().padStart(2, '0')}`;
                };

                const currentTrack = queue.currentTrack;
                let currentTrackDuration = currentTrack.duration || (currentTrack.durationMS > 0 ? formatMs(currentTrack.durationMS) : '0:00');
                
                if (currentTrackDuration === '0:00' && isDeezerTrackUrl(currentTrack.url)) {
                    try {
                        const deezerInfo = await getDeezerTrackInfo(currentTrack.url);
                        if (deezerInfo?.duration) currentTrackDuration = deezerInfo.duration;
                    } catch (e) {}
                }
                
                const currentDuration = parseDuration(currentTrackDuration);
                const totalQueueDuration = tracks.reduce((acc, track) => {
                    const dur = track.duration || (track.durationMS > 0 ? formatMs(track.durationMS) : '0:00');
                    return acc + parseDuration(dur);
                }, currentDuration);

                let currentTrackRequestedBy = 'Unknown';
                if (currentTrack.requestedBy) {
                    if (currentTrack.requestedBy.id === 'autoloop') {
                        currentTrackRequestedBy = '🔄 Auto Loop';
                    } else if (currentTrack.requestedBy.id) {
                        currentTrackRequestedBy = `<@${currentTrack.requestedBy.id}>`;
                    } else if (typeof currentTrack.requestedBy === 'string') {
                        currentTrackRequestedBy = currentTrack.requestedBy;
                    } else if (currentTrack.requestedBy.username) {
                        currentTrackRequestedBy = currentTrack.requestedBy.username;
                    }
                }

                let progressBar = '';
                if (global.config.Music.ShowProgressBar) {
                    try {
                        const timestamp = queue.node.getTimestamp();
                        if (timestamp && timestamp.total && timestamp.total.value > 0) {
                            const barLength = 20;
                            const progress = Math.min(timestamp.current.value / timestamp.total.value, 1);
                            const filled = Math.floor(progress * barLength);
                            const empty = barLength - filled;
                            progressBar = `\n${'▰'.repeat(filled)}${'▱'.repeat(empty)} \`${timestamp.current.label}/${timestamp.total.label}\``;
                        }
                    } catch (e) {}
                }
                
                let description = '';
                if (tracks.length === 0) {
                    description = '```\nNo upcoming tracks in the queue.\n```';
                } else {
                    description = tracks.slice(startIndex, endIndex).map((track, i) => {
                        let requestedBy = '';
                        if (track.requestedBy) {
                            if (track.requestedBy.id === 'autoloop') {
                                requestedBy = '🔄';
                            } else if (track.requestedBy.id) {
                                requestedBy = `👤`;
                            } else if (typeof track.requestedBy === 'string') {
                                requestedBy = track.requestedBy;
                            } else if (track.requestedBy.username) {
                                requestedBy = track.requestedBy.username;
                            }
                        }
                        
                        const trackDuration = track.duration || (track.durationMS > 0 ? formatMs(track.durationMS) : '0:00');
                        const number = `${startIndex + i + 1}`.padStart(2, '0');
                        return `\`${number}.\` [${track.title}](${track.url})\n     \`⏱️ ${trackDuration}\` ${requestedBy}`;
                    }).join('\n');
                }

                const autoLoopStatus = musicManager?.getAutoLoopStatus(interaction.guild.id);
                const autoLoopText = autoLoopStatus ? ' • 🔄 Auto Loop Active' : '';
                
                const embed = {
                    color: parseInt((global.config.Music.EmbedColor || '#FF69B4').replace('#', ''), 16),
                    author: {
                        name: '🎵 Music Queue',
                        icon_url: interaction.guild.iconURL()
                    },
                    fields: [
                        {
                            name: '🎧 Now Playing',
                            value: `**[${currentTrack.title}](${currentTrack.url})**\n\`⏱️ ${currentTrackDuration}\` • ${currentTrackRequestedBy}${progressBar}`,
                            inline: false
                        },
                        {
                            name: `📋 Upcoming Tracks (${tracks.length})`,
                            value: description || 'None',
                            inline: false
                        }
                    ],
                    footer: {
                        text: `Page ${newPage}/${totalPages} • Total Duration: ${formatDuration(totalQueueDuration)}${autoLoopText}`
                    }
                };
                
                const components = [];
                if (totalPages > 1) {
                    const row = {
                        type: 1,
                        components: [
                            {
                                type: 2,
                                style: 1,
                                emoji: '⏮️',
                                custom_id: `queue_prev_${newPage}_${interaction.user.id}`,
                                disabled: newPage === 1
                            },
                            {
                                type: 2,
                                style: 2,
                                label: `${newPage} / ${totalPages}`,
                                custom_id: `queue_page_${newPage}`,
                                disabled: true
                            },
                            {
                                type: 2,
                                style: 1,
                                emoji: '⏭️',
                                custom_id: `queue_next_${newPage}_${interaction.user.id}`,
                                disabled: newPage === totalPages
                            }
                        ]
                    };
                    components.push(row);
                }
                
                if (!interaction.deferred && !interaction.replied) {
                    await interaction.deferUpdate();
                }
                
                return interaction.editReply({
                    embeds: [embed],
                    components: components
                });
            } else {
                await musicManager.handleButtonInteraction(interaction);
            }
        } else if (interaction.isModalSubmit() && interaction.customId === 'music_play_search') {
            await musicManager.handlePlayModalSubmit(interaction);
        }
    } catch (error) {
        Logger.error(`Error handling music interaction: ${error.stack || error}`);

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: `❌ An error occurred: ${error.message}`,
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            } else {
                await interaction.reply({
                    content: `❌ An error occurred: ${error.message}`,
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
        } catch (replyError) {
            Logger.error(`Failed to reply to interaction: ${replyError}`);
        }
    }
};
