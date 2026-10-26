const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { useMainPlayer, QueueRepeatMode } = require('discord-player');
const { Logger } = require('../../../utils/core/logger');
const { getMusicManager } = require('../utils/musicManager');
const { isDeezerTrackUrl, getDeezerTrackInfo } = require('../utils/deezerHelper');

function getLang(key, replacements = {}) {
    const keys = key.split('.');
    let value = global.lang?.Music;
    for (const k of keys) {
        if (value && typeof value === 'object') value = value[k];
        else return key;
    }
    if (typeof value !== 'string') return key;
    return Object.entries(replacements).reduce((str, [k, v]) => str.replace(new RegExp(`{${k}}`, 'g'), v), value);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('music')
        .setDescription('Control the music player')
        .addSubcommand(subcommand =>
            subcommand
                .setName('skip')
                .setDescription('Skip the current track')
                .addIntegerOption(option =>
                    option
                        .setName('to')
                        .setDescription('Skip to a specific track in the queue')
                        .setMinValue(1)
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('stop')
                .setDescription('Stop playback and clear the queue'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('pause')
                .setDescription('Pause the current track'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('resume')
                .setDescription('Resume the current track'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('volume')
                .setDescription('Change the player volume')
                .addIntegerOption(option =>
                    option
                        .setName('level')
                        .setDescription('Volume level (0-100)')
                        .setMinValue(0)
                        .setMaxValue(100)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('loop')
                .setDescription('Set loop mode')
                .addStringOption(option =>
                    option
                        .setName('mode')
                        .setDescription('Loop mode')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Off', value: 'off' },
                            { name: 'Track', value: 'track' },
                            { name: 'Queue', value: 'queue' },
                            { name: 'Auto (Similar Songs)', value: 'auto' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('shuffle')
                .setDescription('Shuffle the queue'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('nowplaying')
                .setDescription('Show information about the current track'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('queue')
                .setDescription('Show the current queue')
                .addIntegerOption(option => 
                    option
                        .setName('page')
                        .setDescription('Page number to view')
                        .setMinValue(1)
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('autoloop')
                .setDescription('Show auto-loop status and recently added songs')),
    category: 'Fun',
    async execute(interaction) {
        try {
            if (!global.config.Music.Enabled) {
                return interaction.reply({
                    content: getLang('Errors.SystemDisabled'),
                    flags: MessageFlags.Ephemeral
                });
            }
            
            
            const player = useMainPlayer();
            if (!player) {
                return interaction.reply({
                    content: getLang('Errors.PlayerNotInitialized'),
                    flags: MessageFlags.Ephemeral
                });
            }
            
            const queue = player.nodes.get(interaction.guild);
            const subcommand = interaction.options.getSubcommand();
            
            if (!queue && subcommand === 'nowplaying') {
                return handleNowPlaying(interaction, null);
            }

            const memberVC = interaction.member.voice.channel;
            if (!memberVC) {
                return interaction.reply({
                    content: getLang('Errors.NotInVoiceChannel'),
                    flags: MessageFlags.Ephemeral
                });
            }

            if (!queue && subcommand === 'loop' && interaction.options.getString('mode') === 'auto') {
                return handleAutoLoopStart(interaction, player, memberVC);
            }

            if (!queue) {
                return interaction.reply({
                    content: getLang('Errors.NoActiveSession'),
                    flags: MessageFlags.Ephemeral
                });
            }

            const botVC = interaction.guild.members.me.voice.channel;
            if (botVC && memberVC.id !== botVC.id) {
                return interaction.reply({
                    content: getLang('Errors.NotSameVoiceChannel'),
                    flags: MessageFlags.Ephemeral
                });
            }

            if (global.config.Music.RequiredControlRoles?.length > 0) {
                const hasRole = interaction.member.roles.cache.some(
                    role => global.config.Music.RequiredControlRoles.includes(role.id)
                );
                
                if (!hasRole) {
                    return interaction.reply({
                        content: getLang('Errors.NoRequiredRole'),
                        flags: MessageFlags.Ephemeral
                    });
                }
            }

            switch (subcommand) {
                case 'skip': return handleSkip(interaction, queue);
                case 'stop': return handleStop(interaction, queue);
                case 'pause': return handlePause(interaction, queue);
                case 'resume': return handleResume(interaction, queue);
                case 'volume': return handleVolume(interaction, queue);
                case 'loop': return handleLoop(interaction, queue);
                case 'shuffle': return handleShuffle(interaction, queue);
                case 'nowplaying': return handleNowPlaying(interaction, queue);
                case 'queue': return handleQueue(interaction, queue);
                case 'autoloop': return handleAutoLoopStatus(interaction, queue);
                default:
                    return interaction.reply({
                        content: getLang('Errors.Unknown'),
                        flags: MessageFlags.Ephemeral
                    });
            }
        } catch (error) {
            Logger.error('Error in music controls command:', error);
            return interaction.reply({
                content: getLang('Errors.Unknown'),
                flags: MessageFlags.Ephemeral
            });
        }
    }
};

async function handleSkip(interaction, queue) {
    if (!queue.isPlaying()) {
        return interaction.reply({
            content: getLang('Errors.NothingPlaying'),
            flags: MessageFlags.Ephemeral
        });
    }
    
    const skipToIndex = interaction.options.getInteger('to');
    
    if (skipToIndex) {
        const tracks = queue.tracks.toArray();
        
        if (skipToIndex > tracks.length) {
            return interaction.reply({
                content: getLang('Errors.QueuePositionInvalid', { count: tracks.length }),
                flags: MessageFlags.Ephemeral
            });
        }
        
        const trackTitle = tracks[skipToIndex - 1].title;
        
        try {
            await queue.node.jump(skipToIndex - 1);
            return autoDeleteReply(await interaction.reply({
                content: getLang('Success.SkippedTo', { position: skipToIndex, title: trackTitle }),
                flags: MessageFlags.Ephemeral,
                withResponse: true
            }));
        } catch (error) {
            return interaction.reply({
                content: getLang('Errors.SkipFailed', { error: error.message }),
                flags: MessageFlags.Ephemeral
            });
        }
    } else {
        const currentTrack = queue.currentTrack;
        
        try {
            await queue.node.skip();
            return autoDeleteReply(await interaction.reply({
                content: getLang('Success.Skipped', { title: currentTrack.title }),
                flags: MessageFlags.Ephemeral,
                withResponse: true
            }));
        } catch (error) {
            return interaction.reply({
                content: getLang('Errors.SkipFailed', { error: error.message }),
                flags: MessageFlags.Ephemeral
            });
        }
    }
}

async function handleStop(interaction, queue) {
    try {
        const musicManager = getMusicManager();
        if (musicManager) {
            await musicManager.handleQueueEnd(queue);
        }
        
        queue.delete();
        
        return autoDeleteReply(await interaction.reply({
            content: getLang('Success.Stopped'),
            flags: MessageFlags.Ephemeral
        }));
    } catch (error) {
        return interaction.reply({
            content: getLang('Errors.StopFailed', { error: error.message }),
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handlePause(interaction, queue) {
    if (queue.node.isPaused()) {
        return interaction.reply({
            content: getLang('Errors.AlreadyPaused'),
            flags: MessageFlags.Ephemeral
        });
    }
    
    try {
        queue.node.pause();
        return autoDeleteReply(await interaction.reply({
            content: getLang('Success.Paused'),
            flags: MessageFlags.Ephemeral
        }));
    } catch (error) {
        return interaction.reply({
            content: getLang('Errors.PauseFailed', { error: error.message }),
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleResume(interaction, queue) {
    if (!queue.node.isPaused()) {
        return interaction.reply({
            content: getLang('Errors.AlreadyPlaying'),
            flags: MessageFlags.Ephemeral
        });
    }
    
    try {
        queue.node.resume();
        return autoDeleteReply(await interaction.reply({
            content: getLang('Success.Resumed'),
            flags: MessageFlags.Ephemeral
        }));
    } catch (error) {
        return interaction.reply({
            content: getLang('Errors.ResumeFailed', { error: error.message }),
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleVolume(interaction, queue) {
    const volume = interaction.options.getInteger('level');
    
    try {
        queue.node.setVolume(volume);
        return autoDeleteReply(await interaction.reply({
            content: getLang('Success.VolumeSet', { volume }),
            flags: MessageFlags.Ephemeral,
            withResponse: true
        }));
    } catch (error) {
        return interaction.reply({
            content: getLang('Errors.VolumeFailed', { error: error.message }),
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleLoop(interaction, queue) {
    const mode = interaction.options.getString('mode');
    let repeatMode;
    let autoLoopEnabled = false;
    
    switch (mode) {
        case 'off': repeatMode = QueueRepeatMode.OFF; break;
        case 'track': repeatMode = QueueRepeatMode.TRACK; break;
        case 'queue': repeatMode = QueueRepeatMode.QUEUE; break;
        case 'auto': repeatMode = QueueRepeatMode.OFF; autoLoopEnabled = true; break;
        default: repeatMode = QueueRepeatMode.OFF;
    }
    
    try {
        queue.setRepeatMode(repeatMode);
        
        const musicManager = getMusicManager();
        if (musicManager) {
            if (autoLoopEnabled) {
                await musicManager.enableAutoLoop(queue);
            } else {
                await musicManager.disableAutoLoop(queue);
            }
        }
        
        let responseText;
        if (autoLoopEnabled) {
            responseText = getLang('Loop.Auto');
        } else {
            const modeKey = {
                [QueueRepeatMode.OFF]: 'Disabled',
                [QueueRepeatMode.TRACK]: 'Track',
                [QueueRepeatMode.QUEUE]: 'Queue'
            }[repeatMode];
            responseText = getLang(`Loop.${modeKey}`);
        }
        
        return autoDeleteReply(await interaction.reply({
            content: responseText,
            flags: MessageFlags.Ephemeral
        }));
    } catch (error) {
        return interaction.reply({
            content: getLang('Errors.LoopFailed', { error: error.message }),
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleShuffle(interaction, queue) {
    if (queue.tracks.size === 0) {
        return interaction.reply({
            content: getLang('Errors.QueueEmpty'),
            flags: MessageFlags.Ephemeral
        });
    }
    
    try {
        queue.tracks.shuffle();
        return autoDeleteReply(await interaction.reply({
            content: getLang('Success.Shuffled'),
            flags: MessageFlags.Ephemeral
        }));
    } catch (error) {
        return interaction.reply({
            content: getLang('Errors.ShuffleFailed', { error: error.message }),
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleNowPlaying(interaction, queue) {
    try {
        const musicManager = getMusicManager();
        
        if (!queue || !queue.isPlaying()) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            
            if (musicManager) {
                const emptyMessage = await musicManager.createAndSendEmptyNowPlaying(interaction.channel, interaction.guild);
                if (emptyMessage) {
                    return interaction.editReply({
                        content: getLang('Success.NowPlayingPosted', { channelId: interaction.channel.id }),
                        flags: MessageFlags.Ephemeral
                    });
                }
            }
            
            return interaction.editReply({
                content: getLang('Errors.NothingPlaying'),
                flags: MessageFlags.Ephemeral
            });
        }
        
        const currentTrack = queue.currentTrack;
        if (!currentTrack) {
            return interaction.reply({
                content: getLang('Errors.NoTrackInfo'),
                flags: MessageFlags.Ephemeral
            });
        }
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        if (musicManager) {
            const result = await musicManager.handleNowPlayingMessage(queue, currentTrack);
            
            if (result && result.id) {
                const reply = await interaction.editReply({
                    content: getLang('Success.NowPlayingPosted', { channelId: result.channel.id }),
                    flags: MessageFlags.Ephemeral
                });
                
                if (global.config.Music.AutoDeleteCommands) {
                    setTimeout(() => {
                        if (reply.deletable) reply.delete().catch(() => {});
                    }, global.config.Music.CommandDeleteDelay || 5000);
                }
                
                return;
            }
        }
        
        return interaction.editReply({
            content: getLang('Success.NowPlayingUpToDate'),
            flags: MessageFlags.Ephemeral
        });
        
    } catch (error) {
        Logger.error('Error in nowplaying command:', error);
        
        if (interaction.deferred) {
            return interaction.editReply({
                content: getLang('Errors.Unknown'),
                flags: MessageFlags.Ephemeral
            });
        } else {
            return interaction.reply({
                content: getLang('Errors.Unknown'),
                flags: MessageFlags.Ephemeral
            });
        }
    }
}

async function handleAutoLoopStart(interaction, player, memberVC) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    try {
        const starterQueries = [
            'top hits 2024',
            'popular music 2024',
            'trending songs',
        ];
        
        const randomStarter = starterQueries[Math.floor(Math.random() * starterQueries.length)];
        
        const searchResult = await player.search(randomStarter, {
            requestedBy: interaction.user,
            searchEngine: 'spotifySearch'
        });

        if (!searchResult?.tracks?.length) {
            return interaction.editReply({
                content: getLang('Errors.AutoLoopSearchFailed'),
            });
        }

        const tracksToAdd = searchResult.tracks.slice(0, 5);
        
        const queue = player.nodes.create(interaction.guild, {
            metadata: {
                channel: interaction.channel,
                guild: interaction.guild,
                client: interaction.guild.members.me,
                requestedBy: interaction.user
            },
            selfDeaf: true,
            volume: global.config.Music.DefaultVolume || 50,
            leaveOnEmpty: true,
            leaveOnEmptyCooldown: 300000,
            leaveOnEnd: true,
            leaveOnEndCooldown: 300000
        });

        try {
            if (!queue.connection) await queue.connect(memberVC);
        } catch {
            queue.delete();
            return interaction.editReply({
                content: getLang('Errors.JoinFailed'),
            });
        }

        for (const track of tracksToAdd) {
            queue.addTrack(track);
        }

        if (!queue.isPlaying()) {
            await queue.node.play();
        }

        const musicManager = getMusicManager();
        if (musicManager) {
            await musicManager.enableAutoLoop(queue);
            
            setTimeout(async () => {
                try {
                    const currentQueue = player.nodes.get(interaction.guild);
                    if (currentQueue && musicManager.autoLoopManager) {
                        await musicManager.autoLoopManager.addSimilarSongs(currentQueue);
                    }
                } catch (err) {
                    Logger.error('Error triggering initial autoloop songs:', err);
                }
            }, 5000);
        }

        return interaction.editReply({
            content: getLang('AutoLoop.Started'),
        });

    } catch (error) {
        Logger.error('Error starting autoloop:', error);
        return interaction.editReply({
            content: getLang('Errors.PlayFailed', { error: error.message }),
        });
    }
}

async function handleAutoLoopStatus(interaction, queue) {
    try {
        const musicManager = getMusicManager();
        if (!musicManager) {
            return interaction.reply({
                content: getLang('Errors.Unknown'),
                flags: MessageFlags.Ephemeral
            });
        }

        const autoLoopStatus = musicManager.getAutoLoopStatus(interaction.guild.id);
        
        if (!autoLoopStatus) {
            return interaction.reply({
                content: getLang('AutoLoop.StatusDisabled'),
                flags: MessageFlags.Ephemeral
            });
        }

        const cooldownMinutes = Math.ceil(autoLoopStatus.cooldownRemaining / 60000);
        const cooldownText = autoLoopStatus.cooldownRemaining > 0 
            ? getLang('AutoLoop.CooldownText', { minutes: cooldownMinutes, plural: cooldownMinutes !== 1 ? 's' : '' })
            : '';

        const recentlyAddedText = autoLoopStatus.recentlyAdded.length > 0
            ? getLang('AutoLoop.RecentlyAdded', { songs: autoLoopStatus.recentlyAdded.map(song => `• ${song}`).join('\n') })
            : getLang('AutoLoop.RecentlyAddedNone');

        return interaction.reply({
            content: getLang('AutoLoop.StatusEnabled', { 
                addedCount: autoLoopStatus.addedCount, 
                cooldownText, 
                recentlyAddedText, 
                targetSize: autoLoopStatus.targetQueueSize 
            }),
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        Logger.error('Error in handleAutoLoopStatus:', error);
        return interaction.reply({
            content: getLang('Errors.Unknown'),
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleQueue(interaction, queue) {
    try {
        if (!queue.isPlaying()) {
            return interaction.reply({
                content: getLang('Errors.NothingPlaying'),
                flags: MessageFlags.Ephemeral
            });
        }
        
        const tracks = queue.tracks.toArray();
        const pageInput = interaction.options.getInteger('page') || 1;
        const tracksPerPage = 10;
        const totalPages = Math.ceil(tracks.length / tracksPerPage) || 1;
        const page = Math.min(Math.max(pageInput, 1), totalPages);

        const startIndex = (page - 1) * tracksPerPage;
        const endIndex = Math.min(startIndex + tracksPerPage, tracks.length);

        const parseDuration = (duration) => {
            if (!duration) return 0;
            const parts = duration.split(':').map(Number);
            if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
            if (parts.length === 2) return parts[0] * 60 + parts[1];
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
                currentTrackRequestedBy = getLang('Queue.RequestedByAutoLoop');
            } else if (currentTrack.requestedBy.id) {
                currentTrackRequestedBy = `<@${currentTrack.requestedBy.id}>`;
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
            description = getLang('Queue.NoUpcoming');
        } else {
            description = tracks.slice(startIndex, endIndex).map((track, i) => {
                let requestedBy = '';
                if (track.requestedBy) {
                    if (track.requestedBy.id === 'autoloop') {
                        requestedBy = '🔄';
                    } else if (track.requestedBy.id) {
                        requestedBy = '👤';
                    }
                }
                
                const trackDuration = track.duration || (track.durationMS > 0 ? formatMs(track.durationMS) : '0:00');
                const number = `${startIndex + i + 1}`.padStart(2, '0');
                return `\`${number}.\` [${track.title}](${track.url})\n     \`⏱️ ${trackDuration}\` ${requestedBy}`;
            }).join('\n');
        }

        const musicManager = getMusicManager();
        const autoLoopStatus = musicManager?.getAutoLoopStatus(interaction.guild.id);
        const autoLoopText = autoLoopStatus ? getLang('Queue.AutoLoopActive') : '';

        const embed = {
            color: parseInt((global.config.Music.EmbedColor || '#FF69B4').replace('#', ''), 16),
            author: {
                name: getLang('Queue.Title'),
                icon_url: interaction.guild.iconURL()
            },
            fields: [
                {
                    name: getLang('Queue.NowPlaying'),
                    value: `**[${currentTrack.title}](${currentTrack.url})**\n\`⏱️ ${currentTrackDuration}\` • ${currentTrackRequestedBy}${progressBar}`,
                    inline: false
                },
                {
                    name: getLang('Queue.UpcomingTracks', { count: tracks.length }),
                    value: description || 'None',
                    inline: false
                }
            ],
            footer: {
                text: getLang('Queue.PageFooter', { current: page, total: totalPages, duration: formatDuration(totalQueueDuration) }) + autoLoopText
            }
        };

        const components = [];
        if (totalPages > 1) {
            components.push({
                type: 1,
                components: [
                    {
                        type: 2,
                        style: 1,
                        emoji: '⏮️',
                        custom_id: `queue_prev_${page}_${interaction.user.id}`,
                        disabled: page === 1
                    },
                    {
                        type: 2,
                        style: 2,
                        label: `${page} / ${totalPages}`,
                        custom_id: `queue_page_${page}`,
                        disabled: true
                    },
                    {
                        type: 2,
                        style: 1,
                        emoji: '⏭️',
                        custom_id: `queue_next_${page}_${interaction.user.id}`,
                        disabled: page === totalPages
                    }
                ]
            });
        }
        
        return autoDeleteReply(await interaction.reply({
            embeds: [embed],
            components: components,
            flags: MessageFlags.Ephemeral
        }));
    } catch (error) {
        Logger.error('Error displaying queue:', error);
        return interaction.reply({
            content: getLang('Errors.Unknown'),
            flags: MessageFlags.Ephemeral
        });
    }
}

function autoDeleteReply(reply) {
    if (!reply) return;
    
    if (global.config.Music.AutoDeleteCommands) {
        setTimeout(() => {
            if (reply.deletable) {
                reply.delete().catch(() => {});
            }
        }, global.config.Music.CommandDeleteDelay || 5000);
    }
    
    return reply;
}
