import React, { useState, useEffect } from 'react';
import api from '../../../lib/api/axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faPen, faPlus } from '@fortawesome/free-solid-svg-icons';
import { toast } from '../../../components/ui/Toast';

const statTypes = [
  { value: 'MemberCount', label: 'Member Count' },
  { value: 'HumanMemberCount', label: 'Human Member Count' },
  { value: 'BotCount', label: 'Bot Count' },
  { value: 'CurrentDate', label: 'Current Date' },
  { value: 'NitroBoosterCount', label: 'Nitro Booster Count' },
  { value: 'ServerCreationDate', label: 'Server Creation Date' },
  { value: 'TotalRolesCount', label: 'Total Roles Count' },
  { value: 'TotalEmojisCount', label: 'Total Emojis Count' },
  { value: 'TotalChannelsCount', label: 'Total Channels Count' },
  { value: 'OnlineMembersCount', label: 'Online Members Count' },
  { value: 'ServerRegion', label: 'Server Region' },
  { value: 'TotalBannedMembers', label: 'Total Banned Members' },
  { value: 'TotalMembersWithRole', label: 'Total Members With Role' },
  { value: 'OnlineMembersWithRole', label: 'Online Members With Role' },
  { value: 'TotalTickets', label: 'Total Tickets' },
  { value: 'OpenTickets', label: 'Open Tickets' },
  { value: 'ClosedTickets', label: 'Closed Tickets' },
  { value: 'DeletedTickets', label: 'Deleted Tickets' },
  { value: 'TotalMessages', label: 'Total Messages' },
  { value: 'BotUptime', label: 'Bot Uptime' },
  { value: 'TotalCases', label: 'Total Moderation Cases' },
  { value: 'TotalSuggestions', label: 'Total Suggestions' }
];

function ChannelStatsSettings() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState([]);
  const [voiceChannels, setVoiceChannels] = useState([]);
  const [editingStat, setEditingStat] = useState(null);
  const [newStat, setNewStat] = useState({
    type: 'MemberCount',
    channelName: '',
    roleId: '',
    existingChannelId: '',
    createNewChannel: true
  });

  useEffect(() => {
    fetchStats();
    fetchVoiceChannels();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/settings/channel-stats');
      setStats(data || []);
    } catch (err) {
      setError('Failed to fetch channel stats');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchVoiceChannels = async () => {
    try {
      const response = await api.get('/settings/server-data');
      const channels = response.data.channels.filter(channel => channel.type === 'GUILD_VOICE');
      setVoiceChannels(channels);
    } catch (err) {
      console.error('Failed to fetch voice channels:', err);
    }
  };

  const handleAddStat = async (e) => {
    e.preventDefault();
    try {
      if (newStat.createNewChannel) {
        if (!newStat.channelName.trim()) {
          setError('Channel name is required');
          return;
        }

        if (!newStat.channelName.includes('{stats}')) {
          setError('Channel name must include the {stats} placeholder');
          return;
        }
      } else {
        if (!newStat.existingChannelId) {
          setError('Please select a voice channel');
          return;
        }
      }

      if ((newStat.type === 'TotalMembersWithRole' || newStat.type === 'OnlineMembersWithRole') && !newStat.roleId) {
        setError('Role ID is required for role-based stats');
        return;
      }

      setLoading(true);
      await api.post('/settings/channel-stats', {
        type: newStat.type,
        channelName: newStat.createNewChannel ? newStat.channelName : null,
        roleId: newStat.roleId || null,
        existingChannelId: newStat.createNewChannel ? null : newStat.existingChannelId,
        createNewChannel: newStat.createNewChannel
      });

      setNewStat({
        type: 'MemberCount',
        channelName: '',
        roleId: '',
        existingChannelId: '',
        createNewChannel: true
      });
      setError('');
      toast.success('Channel stat added');
      fetchStats();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add channel stat');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveStat = async (channelId) => {
    try {
      setLoading(true);
      await api.delete(`/settings/channel-stats/${channelId}`);
      toast.success('Stat removed');
      fetchStats();
    } catch (err) {
      setError('Failed to remove channel stat');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEditStat = async (stat) => {
    try {
      const channelName = editingStat?.channelName?.trim();
      
      if (!channelName) {
        setError('Channel name is required');
        return;
      }

      if (!channelName.includes('{stats}')) {
        setError('Channel name must include the {stats} placeholder');
        return;
      }

      const templateParts = channelName.split('{stats}');
      const formattedTemplate = templateParts.length === 2 
        ? `${templateParts[0]}{stats}${templateParts[1]}`
        : channelName;

      const response = await api.put(`/settings/channel-stats/${stat.channelId}`, {
        channelName: formattedTemplate
      });

      if (response.data) {
        setStats(prevStats => {
          const newStats = prevStats.map(s => 
            s.channelId === stat.channelId ? response.data : s
          );
          return newStats;
        });
        setEditingStat(null);
        setError('');
        toast.success('Stat updated');
      }
    } catch (error) {
      console.error('Failed to update channel stat:', error);
      setError(error.response?.data?.error || 'Failed to update channel stat');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleAddStat} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Stat Type</label>
          <select
            value={newStat.type}
            onChange={(e) => setNewStat({ ...newStat, type: e.target.value })}
            className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
          >
            {statTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-foreground">Channel</label>
            <button
              type="button"
              onClick={() => setNewStat(prev => ({ ...prev, createNewChannel: !prev.createNewChannel }))}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                newStat.createNewChannel
                  ? 'bg-secondary text-muted-foreground hover:bg-secondary/70'
                  : 'bg-primary/20 text-primary hover:bg-primary/30'
              }`}
            >
              {newStat.createNewChannel ? 'Use Existing' : 'Create New'}
            </button>
          </div>

          {newStat.createNewChannel ? (
            <div>
              <input
                type="text"
                value={newStat.channelName}
                onChange={(e) => setNewStat({ ...newStat, channelName: e.target.value })}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                placeholder="Enter channel name with {stats} placeholder"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Use {'{stats}'} as a placeholder where you want the stat value to appear
              </p>
            </div>
          ) : (
            <select
              value={newStat.existingChannelId}
              onChange={(e) => setNewStat({ ...newStat, existingChannelId: e.target.value })}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
            >
              <option value="">Select a channel</option>
              {voiceChannels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {(newStat.type === 'TotalMembersWithRole' || newStat.type === 'OnlineMembersWithRole') && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Role ID</label>
            <input
              type="text"
              value={newStat.roleId}
              onChange={(e) => setNewStat({ ...newStat, roleId: e.target.value })}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
              placeholder="Enter role ID"
            />
          </div>
        )}

        <button
          type="submit"
          className="w-full bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
        >
          <FontAwesomeIcon icon={faPlus} className="w-3 h-3" />
          Add Channel Stat
        </button>
      </form>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">Current Stats</h3>
          <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">
            {stats.length} {stats.length === 1 ? 'stat' : 'stats'}
          </span>
        </div>
        {stats.length === 0 ? (
          <div className="bg-secondary rounded-lg p-4">
            <p className="text-sm text-muted-foreground text-center">No channel stats configured</p>
          </div>
        ) : (
          <div className="space-y-2">
            {stats.map((stat) => (
              <div
                key={stat.channelId}
                className="group bg-secondary rounded-lg p-3 flex items-center justify-between hover:bg-muted transition-colors"
              >
                <div className="space-y-1">
                  {editingStat?.channelId === stat.channelId ? (
                    <input
                      type="text"
                      value={editingStat.channelName}
                      onChange={(e) => setEditingStat({ ...editingStat, channelName: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleEditStat(stat);
                        } else if (e.key === 'Escape') {
                          setEditingStat(null);
                        }
                      }}
                      className="bg-background border border-border rounded-lg px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="Channel name with {stats}"
                      autoFocus
                    />
                  ) : (
                    <p className="font-medium text-sm text-foreground">{stat.channelName}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {statTypes.find(t => t.value === stat.type)?.label}
                    {stat.roleId && ` • Role ID: ${stat.roleId}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {editingStat?.channelId === stat.channelId ? (
                    <>
                      <button
                        onClick={() => handleEditStat(stat)}
                        className="px-2 py-1 text-xs text-green-400 hover:text-green-300 transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingStat(null)}
                        className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          const templateName = stat.channelName.trim();
                          setEditingStat({
                            ...stat,
                            channelName: templateName
                          });
                        }}
                        className="p-1.5 text-muted-foreground hover:text-primary transition-colors"
                      >
                        <FontAwesomeIcon icon={faPen} className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleRemoveStat(stat.channelId)}
                        className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ChannelStatsSettings;
