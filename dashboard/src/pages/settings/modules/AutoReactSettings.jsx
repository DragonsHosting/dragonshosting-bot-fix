import React, { useState, useEffect } from 'react';
import api from '../../../lib/api/axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTimes, faPencil, faSmile } from '@fortawesome/free-solid-svg-icons';
import { toast } from '../../../components/ui/Toast';

const standardEmojis = [
  '👍', '👎', '❤️', '🎉', '🔥', '👀', '💯', '✅', '❌', '⭐',
  '🌟', '💪', '🙏', '🤔', '😄', '😊', '🙂', '😂', '😍', '😎',
  '😢', '😭', '😤', '😠', '🎮', '🎲', '🎯', '🎨', '🎭', '🎪'
];

const safeIncludes = (str, pattern) => {
  if (!str || typeof str !== 'string') return false;
  return str.includes(pattern);
};

const getEmojiDisplay = (emoji) => {
  if (!emoji) return null;
  
  if (safeIncludes(emoji, ':')) {
    try {
      const parts = emoji.split(':');
      const id = parts[2]?.replace('>', '') || '';
      const name = parts[1] || '';
      return {
        isCustom: true,
        url: `https://cdn.discordapp.com/emojis/${id}.png`,
        name: name
      };
    } catch (err) {
      console.error('Error parsing custom emoji:', err);
      return null;
    }
  }
  
  return {
    isCustom: false,
    emoji: emoji
  };
};

function AutoReactSettings() {
  const [reactions, setReactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [serverData, setServerData] = useState({
    emojis: [],
    roles: [],
    channels: []
  });
  const [formData, setFormData] = useState({
    keyword: '',
    emoji: '',
    whitelistRoles: [],
    whitelistChannels: []
  });

  useEffect(() => {
    fetchServerData();
    fetchReactions();
  }, []);

  const fetchServerData = async () => {
    try {
      const response = await api.get('/settings/server-data');
      setServerData(response.data);
    } catch (err) {
      console.error('Failed to fetch server data:', err);
    }
  };

  const fetchReactions = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/settings/auto-reacts');
      setReactions(data || []);
    } catch (error) {
      console.error('Error fetching auto reacts:', error);
      toast.error('Failed to load auto reactions');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      keyword: '',
      emoji: '',
      whitelistRoles: [],
      whitelistChannels: []
    });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async () => {
    if (!formData.keyword.trim()) {
      toast.error('Keyword is required');
      return;
    }

    if (!formData.emoji) {
      toast.error('Emoji is required');
      return;
    }

    const isDuplicate = reactions.some(reaction => 
      reaction.keyword.toLowerCase() === formData.keyword.toLowerCase() &&
      reaction._id !== editingId
    );

    if (isDuplicate) {
      toast.error('A reaction with this keyword already exists');
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        const { data } = await api.put(`/settings/auto-reacts/${editingId}`, formData);
        setReactions(reactions.map(r => r._id === editingId ? data : r));
        toast.success('Reaction updated');
      } else {
        const { data } = await api.post('/settings/auto-reacts', formData);
        setReactions([...reactions, data]);
        toast.success('Reaction added');
      }
      resetForm();
    } catch (error) {
      console.error('Error saving auto react:', error);
      toast.error(error.response?.data?.error || 'Failed to save reaction');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id) => {
    if (!window.confirm('Remove this auto reaction?')) return;

    try {
      await api.delete(`/settings/auto-reacts/${id}`);
      setReactions(reactions.filter(r => r._id !== id));
      if (editingId === id) resetForm();
      toast.success('Reaction removed');
    } catch (error) {
      console.error('Error removing auto react:', error);
      toast.error('Failed to remove reaction');
    }
  };

  const startEdit = (reaction) => {
    setFormData({
      keyword: reaction.keyword,
      emoji: reaction.emoji,
      whitelistRoles: reaction.whitelistRoles || [],
      whitelistChannels: reaction.whitelistChannels || []
    });
    setEditingId(reaction._id);
    setShowForm(true);
  };

  const renderEmoji = (emoji, size = 'md') => {
    const display = getEmojiDisplay(emoji);
    if (!display) return null;

    const sizeClasses = size === 'lg' ? 'w-8 h-8 text-3xl' : 'w-5 h-5 text-xl';

    return display.isCustom ? (
      <img src={display.url} alt={display.name} className={sizeClasses} />
    ) : (
      <span className={sizeClasses}>{display.emoji}</span>
    );
  };

  const toggleRole = (roleId) => {
    setFormData(prev => ({
      ...prev,
      whitelistRoles: prev.whitelistRoles.includes(roleId)
        ? prev.whitelistRoles.filter(id => id !== roleId)
        : [...prev.whitelistRoles, roleId]
    }));
  };

  const toggleChannel = (channelId) => {
    setFormData(prev => ({
      ...prev,
      whitelistChannels: prev.whitelistChannels.includes(channelId)
        ? prev.whitelistChannels.filter(id => id !== channelId)
        : [...prev.whitelistChannels, channelId]
    }));
  };

  const textChannels = serverData.channels?.filter(c => c.type === 'GUILD_TEXT') || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">
            {reactions.length} {reactions.length === 1 ? 'reaction' : 'reactions'}
          </span>
        </div>
        {!showForm && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
          >
            <FontAwesomeIcon icon={faPlus} className="w-3 h-3" />
            Add Reaction
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-secondary/50 border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">
              {editingId ? 'Edit Reaction' : 'New Reaction'}
            </h3>
            <button onClick={resetForm} className="text-muted-foreground hover:text-foreground transition-colors">
              <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Keyword</label>
              <input
                type="text"
                value={formData.keyword}
                onChange={(e) => setFormData({ ...formData, keyword: e.target.value })}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Word or phrase that triggers the reaction"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Emoji</label>
              <select
                value={formData.emoji}
                onChange={(e) => setFormData({ ...formData, emoji: e.target.value })}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Select an emoji</option>
                <optgroup label="Standard Emojis">
                  {standardEmojis.map((emoji) => (
                    <option key={emoji} value={emoji}>{emoji}</option>
                  ))}
                </optgroup>
                {serverData.emojis?.length > 0 && (
                  <optgroup label="Server Emojis">
                    {serverData.emojis.map((emoji) => (
                      <option 
                        key={emoji.id} 
                        value={emoji.isStandard ? emoji.name : `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`}
                      >
                        {emoji.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Whitelist Roles</label>
              <p className="text-xs text-muted-foreground mb-2">Only react to messages from users with these roles</p>
              <div className="max-h-40 overflow-y-auto space-y-1 bg-secondary rounded-lg p-2">
                {serverData.roles?.length > 0 ? (
                  serverData.roles.map((role) => (
                    <label
                      key={role.id}
                      className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={formData.whitelistRoles.includes(role.id)}
                        onChange={() => toggleRole(role.id)}
                        className="rounded border-border bg-background text-primary focus:ring-primary"
                      />
                      <span
                        className="text-sm truncate"
                        style={{ color: role.color !== '#000000' ? role.color : undefined }}
                      >
                        {role.name}
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground p-2">No roles available</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Whitelist Channels</label>
              <p className="text-xs text-muted-foreground mb-2">Only react to messages in these channels</p>
              <div className="max-h-40 overflow-y-auto space-y-1 bg-secondary rounded-lg p-2">
                {textChannels.length > 0 ? (
                  textChannels.map((channel) => (
                    <label
                      key={channel.id}
                      className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={formData.whitelistChannels.includes(channel.id)}
                        onChange={() => toggleChannel(channel.id)}
                        className="rounded border-border bg-background text-primary focus:ring-primary"
                      />
                      <span className="text-sm text-foreground truncate">#{channel.name}</span>
                    </label>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground p-2">No channels available</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={resetForm}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Reaction'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {reactions.length === 0 ? (
          <div className="bg-secondary/50 rounded-lg p-8 text-center">
            <p className="text-muted-foreground text-sm">No auto reactions configured</p>
            <p className="text-muted-foreground/70 text-xs mt-1">Add your first reaction to get started</p>
          </div>
        ) : (
          reactions.map((reaction) => (
            <div
              key={reaction._id}
              className={`group bg-secondary/50 border rounded-lg overflow-hidden transition-colors ${
                editingId === reaction._id ? 'border-primary' : 'border-transparent hover:border-border'
              }`}
            >
              <div className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="p-2.5 rounded-lg bg-amber-500/10 shrink-0">
                    {renderEmoji(reaction.emoji, 'lg')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground">{reaction.keyword}</span>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {reaction.whitelistRoles?.length > 0 && (
                        <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                          {reaction.whitelistRoles.length} role{reaction.whitelistRoles.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {reaction.whitelistChannels?.length > 0 && (
                        <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                          {reaction.whitelistChannels.length} channel{reaction.whitelistChannels.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {!reaction.whitelistRoles?.length && !reaction.whitelistChannels?.length && (
                        <span className="text-xs text-muted-foreground">All roles & channels</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => startEdit(reaction)}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  >
                    <FontAwesomeIcon icon={faPencil} className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleRemove(reaction._id)}
                    className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <FontAwesomeIcon icon={faTimes} className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default AutoReactSettings;
