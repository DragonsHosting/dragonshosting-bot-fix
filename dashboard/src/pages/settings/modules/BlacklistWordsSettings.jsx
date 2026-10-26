import React, { useState, useEffect } from 'react';
import api from '../../../lib/api/axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBan, faPlus, faTimes, faShieldAlt, faHashtag } from '@fortawesome/free-solid-svg-icons';
import { toast } from '../../../components/ui/Toast';

function BlacklistWordsSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [serverData, setServerData] = useState({ roles: [], channels: [] });
  const [settings, setSettings] = useState({
    enabled: false,
    patterns: [],
    whitelistWords: [],
    whitelistChannels: [],
    whitelistCategories: [],
    bypassRoles: [],
    logsChannelId: '',
    notificationMessage: '{user}, you used a blacklisted word!'
  });
  const [newPattern, setNewPattern] = useState('');
  const [newWhitelist, setNewWhitelist] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [settingsRes, serverRes] = await Promise.all([
        api.get('/settings/blacklist-words'),
        api.get('/settings/server-data')
      ]);
      const data = settingsRes.data;
      setSettings({
        enabled: data.enabled || false,
        patterns: data.patterns || [],
        whitelistWords: data.whitelistWords || [],
        whitelistChannels: data.whitelistChannels || [],
        whitelistCategories: data.whitelistCategories || [],
        bypassRoles: data.bypassRoles || [],
        logsChannelId: data.logsChannelId || '',
        notificationMessage: data.notificationMessage || '{user}, you used a blacklisted word!'
      });
      setServerData(serverRes.data);
    } catch (err) {
      console.error('Error fetching data:', err);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await api.post('/settings/blacklist-words', settings);
      if (data.success) {
        const saved = data.settings;
        setSettings({
          enabled: saved.enabled || false,
          patterns: saved.patterns || [],
          whitelistWords: saved.whitelistWords || [],
          whitelistChannels: saved.whitelistChannels || [],
          whitelistCategories: saved.whitelistCategories || [],
          bypassRoles: saved.bypassRoles || [],
          logsChannelId: saved.logsChannelId || '',
          notificationMessage: saved.notificationMessage || '{user}, you used a blacklisted word!'
        });
        toast.success('Settings saved successfully');
      }
    } catch (err) {
      console.error('Error saving settings:', err);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const addPattern = () => {
    if (!newPattern.trim()) return;
    if (settings.patterns.includes(newPattern.trim())) {
      toast.error('Pattern already exists');
      return;
    }
    setSettings(prev => ({
      ...prev,
      patterns: [...prev.patterns, newPattern.trim()]
    }));
    setNewPattern('');
  };

  const removePattern = (index) => {
    setSettings(prev => ({
      ...prev,
      patterns: prev.patterns.filter((_, i) => i !== index)
    }));
  };

  const addWhitelist = () => {
    if (!newWhitelist.trim()) return;
    if (settings.whitelistWords.includes(newWhitelist.trim())) {
      toast.error('Word already whitelisted');
      return;
    }
    setSettings(prev => ({
      ...prev,
      whitelistWords: [...prev.whitelistWords, newWhitelist.trim()]
    }));
    setNewWhitelist('');
  };

  const removeWhitelist = (index) => {
    setSettings(prev => ({
      ...prev,
      whitelistWords: prev.whitelistWords.filter((_, i) => i !== index)
    }));
  };

  const toggleRole = (roleId) => {
    setSettings(prev => ({
      ...prev,
      bypassRoles: prev.bypassRoles.includes(roleId)
        ? prev.bypassRoles.filter(id => id !== roleId)
        : [...prev.bypassRoles, roleId]
    }));
  };

  const toggleChannel = (channelId) => {
    setSettings(prev => ({
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
        <div className="flex items-center gap-3">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => setSettings(prev => ({ ...prev, enabled: e.target.checked }))}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-secondary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
          </label>
          <span className="text-sm font-medium text-foreground">Enable Blacklist Words</span>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            <FontAwesomeIcon icon={faBan} className="mr-2 text-destructive" />
            Blocked Patterns
          </label>
          <p className="text-xs text-muted-foreground mb-3">
            Use * for wildcards (e.g., *badword*) or prefix with regex: for regular expressions
          </p>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPattern()}
              placeholder="Enter pattern (e.g., discord.gg/* or *badword*)"
              className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={addPattern}
              className="bg-primary text-primary-foreground rounded-lg px-3 py-2 hover:bg-primary/90 transition-colors"
            >
              <FontAwesomeIcon icon={faPlus} className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {settings.patterns.map((pattern, index) => (
              <div
                key={index}
                className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 text-destructive px-3 py-1.5 rounded-lg text-sm"
              >
                <span className="font-mono">{pattern}</span>
                <button
                  onClick={() => removePattern(index)}
                  className="hover:text-destructive/80 transition-colors"
                >
                  <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
                </button>
              </div>
            ))}
            {settings.patterns.length === 0 && (
              <p className="text-sm text-muted-foreground">No patterns added</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            <FontAwesomeIcon icon={faShieldAlt} className="mr-2 text-green-500" />
            Whitelisted Words
          </label>
          <p className="text-xs text-muted-foreground mb-3">
            These words will bypass the filter even if they match a pattern
          </p>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newWhitelist}
              onChange={(e) => setNewWhitelist(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addWhitelist()}
              placeholder="Enter word to whitelist"
              className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={addWhitelist}
              className="bg-green-600 text-white rounded-lg px-3 py-2 hover:bg-green-700 transition-colors"
            >
              <FontAwesomeIcon icon={faPlus} className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {settings.whitelistWords.map((word, index) => (
              <div
                key={index}
                className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 text-green-500 px-3 py-1.5 rounded-lg text-sm"
              >
                <span>{word}</span>
                <button
                  onClick={() => removeWhitelist(index)}
                  className="hover:text-green-400 transition-colors"
                >
                  <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
                </button>
              </div>
            ))}
            {settings.whitelistWords.length === 0 && (
              <p className="text-sm text-muted-foreground">No words whitelisted</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Bypass Roles</label>
            <p className="text-xs text-muted-foreground mb-3">Users with these roles bypass the filter</p>
            <div className="max-h-48 overflow-y-auto space-y-1 bg-secondary/50 rounded-lg p-2">
              {serverData.roles?.map((role) => (
                <label
                  key={role.id}
                  className="flex items-center gap-2 p-2 rounded hover:bg-secondary cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={settings.bypassRoles.includes(role.id)}
                    onChange={() => toggleRole(role.id)}
                    className="rounded border-border bg-secondary text-primary focus:ring-primary"
                  />
                  <span
                    className="text-sm"
                    style={{ color: role.color !== '#000000' ? role.color : undefined }}
                  >
                    {role.name}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              <FontAwesomeIcon icon={faHashtag} className="mr-2" />
              Whitelisted Channels
            </label>
            <p className="text-xs text-muted-foreground mb-3">Filter is disabled in these channels</p>
            <div className="max-h-48 overflow-y-auto space-y-1 bg-secondary/50 rounded-lg p-2">
              {textChannels.map((channel) => (
                <label
                  key={channel.id}
                  className="flex items-center gap-2 p-2 rounded hover:bg-secondary cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={settings.whitelistChannels.includes(channel.id)}
                    onChange={() => toggleChannel(channel.id)}
                    className="rounded border-border bg-secondary text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-foreground">#{channel.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Logs Channel</label>
            <select
              value={settings.logsChannelId}
              onChange={(e) => setSettings(prev => ({ ...prev, logsChannelId: e.target.value }))}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">No logging</option>
              {textChannels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  #{channel.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Notification Message</label>
            <input
              type="text"
              value={settings.notificationMessage}
              onChange={(e) => setSettings(prev => ({ ...prev, notificationMessage: e.target.value }))}
              placeholder="{user}, you used a blacklisted word!"
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">Use {'{user}'} to mention the user</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BlacklistWordsSettings;

