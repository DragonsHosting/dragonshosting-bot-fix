const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { useMainPlayer } = require('discord-player');
const { isDeezerUrl, isDeezerTrackUrl, getDeezerPlaylistTracks, getDeezerPlaylistInfo, getDeezerTrackInfo } = require('../utils/deezerHelper');
const { searchWithFuzzy } = require('../utils/fuzzySearch');
const { getYouTubeVideoTitle, isYouTubeUrl } = require('../utils/youtubeHelper');

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

function autoDelete(reply) {
    if (!reply) return reply;
    if (global.config.Music?.AutoDeleteCommands) {
        const delay = global.config.Music?.CommandDeleteDelay || 5000;
        setTimeout(() => {
            if (reply.deletable) reply.delete().catch(() => {});
        }, delay);
    }
    return reply;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play music in a voice channel')
        .addStringOption(option => 
            option.setName('query')
                .setDescription('The song you want to play (song name, Spotify/Deezer/SoundCloud links)')
                .setRequired(true))
        .addBooleanOption(option => 
            option.setName('playtop')
                .setDescription('Add the track at the top of the queue')
                .setRequired(false)),
    category: 'Fun',
    async execute(interaction) {
        try {
            const voiceChannel = interaction.member.voice.channel;
            if (!voiceChannel) {
                return interaction.reply({ 
                    content: getLang('Errors.NotInVoiceChannel'),
                    flags: MessageFlags.Ephemeral
                });
            }
            
            const botVC = interaction.guild.members.me.voice.channel;
            if (botVC && voiceChannel.id !== botVC.id) {
                return interaction.reply({ 
                    content: getLang('Errors.NotSameVoiceChannel'),
                    flags: MessageFlags.Ephemeral
                });
            }
            
            if (!global.config.Music?.Enabled) {
                return interaction.reply({ 
                    content: getLang('Errors.SystemDisabled'),
                    flags: MessageFlags.Ephemeral
                });
            }
            
            await interaction.deferReply();
            
            const player = useMainPlayer();
            if (!player) {
                return autoDelete(await interaction.editReply({ content: getLang('Errors.PlayerNotInitialized') }));
            }

            let query = interaction.options.getString('query');
            if (!query) {
                return autoDelete(await interaction.editReply({ content: getLang('Errors.NoQuery') }));
            }


            if (isDeezerUrl(query)) {
                const playlistTracks = await getDeezerPlaylistTracks(query);
                if (playlistTracks && playlistTracks.length > 0) {
                    const playlistInfo = await getDeezerPlaylistInfo(query);
                    const playlistTitle = playlistInfo?.title || 'Deezer Playlist';
                    
                    let successCount = 0;
                    let failCount = 0;
                    
                    await interaction.editReply(getLang('Success.ProcessingPlaylist', { title: playlistTitle }));
                    
                    for (const track of playlistTracks) {
                        try {
                            await player.play(voiceChannel, track.searchQuery, {
                                nodeOptions: {
                                    metadata: {
                                        channel: interaction.channel,
                                        guild: interaction.guild
                                    },
                                    volume: global.config.Music?.DefaultVolume || 80,
                                    leaveOnEmpty: global.config.Music?.LeaveOnEmpty === true,
                                    leaveOnEmptyCooldown: global.config.Music?.LeaveEmptyDelay || 60000,
                                    leaveOnEnd: global.config.Music?.LeaveOnEnd === true,
                                    leaveOnStop: global.config.Music?.LeaveOnEnd === true,
                                    leaveOnEndCooldown: global.config.Music?.LeaveEndDelay || 300000,
                                    selfDeaf: true,
                                    connectionTimeout: 60000,
                                    bufferingTimeout: 30000,
                                },
                                requestedBy: interaction.user,
                                searchEngine: 'spotifySearch'
                            });
                            successCount++;
                        } catch (error) {
                            failCount++;
                        }
                    }
                    
                    const content = failCount > 0 
                        ? getLang('Success.PlaylistAddedWithFails', { success: successCount, title: playlistTitle, failed: failCount })
                        : getLang('Success.PlaylistAdded', { count: successCount, title: playlistTitle });
                    
                    return autoDelete(await interaction.editReply({ content }));
                } else {
                    return autoDelete(await interaction.editReply(getLang('Errors.DeezerPlaylistFailed')));
                }
            }

            if (isDeezerTrackUrl(query)) {
                const deezerInfo = await getDeezerTrackInfo(query);
                if (deezerInfo && deezerInfo.title && deezerInfo.artist) {
                    query = `${deezerInfo.artist} - ${deezerInfo.title}`;
                } else {
                    return autoDelete(await interaction.editReply(getLang('Errors.DeezerTrackFailed')));
                }
            }

            if (isYouTubeUrl(query)) {
                const title = await getYouTubeVideoTitle(query);
                if (title) {
                    query = title;
                } else {
                    return autoDelete(await interaction.editReply(getLang('Errors.YouTubeExtractFailed')));
                }
            }

            const isNonYouTubeUrl = /^https?:\/\//i.test(query) && !isYouTubeUrl(query);
            
            if (isNonYouTubeUrl) {
                try {
                    const { track, searchResult } = await player.play(voiceChannel, query, {
                        nodeOptions: {
                            metadata: {
                                channel: interaction.channel,
                                guild: interaction.guild
                            },
                            volume: global.config.Music?.DefaultVolume || 80,
                            leaveOnEmpty: global.config.Music?.LeaveOnEmpty === true,
                            leaveOnEmptyCooldown: global.config.Music?.LeaveEmptyDelay || 60000,
                            leaveOnEnd: global.config.Music?.LeaveOnEnd === true,
                            leaveOnStop: global.config.Music?.LeaveOnEnd === true,
                            leaveOnEndCooldown: global.config.Music?.LeaveEndDelay || 300000,
                            selfDeaf: true,
                            connectionTimeout: 60000,
                            bufferingTimeout: 30000,
                        },
                        requestedBy: interaction.user
                    });
                    
                    const content = searchResult?.playlist 
                        ? getLang('Success.PlaylistAdded', { count: searchResult.tracks.length, title: searchResult.playlist.title })
                        : getLang('Success.NowPlaying', { title: track.title, author: track.author });
                    
                    return autoDelete(await interaction.editReply({ content }));
                } catch (urlError) {
                    return autoDelete(await interaction.editReply({ content: getLang('Errors.PlayFailed', { error: urlError.message }) }));
                }
            }

            try {
                const fuzzyResult = await searchWithFuzzy(query, interaction.user);
                
                if (!fuzzyResult.success) {
                    return autoDelete(await interaction.editReply({ 
                        content: getLang('Errors.NoResults', { query })
                    }));
                }
                
                const { track, searchResult } = await player.play(voiceChannel, fuzzyResult.result.tracks[0].url, {
                    nodeOptions: {
                        metadata: {
                            channel: interaction.channel,
                            guild: interaction.guild
                        },
                        volume: global.config.Music?.DefaultVolume || 80,
                        leaveOnEmpty: global.config.Music?.LeaveOnEmpty === true,
                        leaveOnEmptyCooldown: global.config.Music?.LeaveEmptyDelay || 60000,
                        leaveOnEnd: global.config.Music?.LeaveOnEnd === true,
                        leaveOnStop: global.config.Music?.LeaveOnEnd === true,
                        leaveOnEndCooldown: global.config.Music?.LeaveEndDelay || 300000,
                        selfDeaf: true,
                        connectionTimeout: 60000,
                        bufferingTimeout: 30000,
                    },
                    requestedBy: interaction.user
                });
                
                const content = searchResult?.playlist 
                    ? getLang('Success.PlaylistAdded', { count: searchResult.tracks.length, title: searchResult.playlist.title })
                    : getLang('Success.NowPlaying', { title: track.title, author: track.author });
                
                return autoDelete(await interaction.editReply({ content }));
            } catch (error) {
                return autoDelete(await interaction.editReply({ content: getLang('Errors.PlayFailed', { error: error.message }) }));
            }
        } catch (error) {
            return autoDelete(await interaction.editReply({ content: getLang('Errors.PlayFailed', { error: error.message }) }));
        }
    }
};
