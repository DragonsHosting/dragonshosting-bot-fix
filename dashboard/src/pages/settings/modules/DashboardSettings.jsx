import React, { useState, useEffect } from 'react';
import api from '../../../lib/api/axios';
import { toast } from '../../../components/ui/Toast';
import { socket } from '../../../socket';

function DashboardSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    navName: 'DragonHosting',
    favicon: 'None',
    tabName: 'DragonHosting Dashboard',
    logoUrl: '',
    customNavItems: [],
    categories: {
      navigation: 'Navigation',
      custom: 'Custom Links',
      addons: 'Addons'
    }
  });

  useEffect(() => {
    fetchSettings();
    socket.on('dashboardSettingsUpdated', setSettings);
    return () => socket.off('dashboardSettingsUpdated', setSettings);
  }, []);

  const fetchSettings = async () => {
    try {
      const { data } = await api.get('/settings/dashboard');
      setSettings(data);
    } catch (err) {
      console.error('Error fetching settings:', err);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);

    const processedSettings = {
      ...settings,
      favicon: settings.favicon?.trim() || 'None'
    };

    try {
      const { data } = await api.post('/settings/dashboard', processedSettings);

      if (data.success) {
        setSettings(data.settings);
        toast.success('Settings saved successfully');
      } else {
        throw new Error(data.error || 'Failed to save settings');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to save settings';
      toast.error(errorMessage);
    } finally {
      setSaving(false);
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
    <form onSubmit={handleSave} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Navigation Name</label>
        <input
          type="text"
          value={settings.navName}
          onChange={(e) => setSettings({ ...settings, navName: e.target.value })}
          className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
          placeholder="Enter navigation name"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">This will appear in the side navigation bar</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Tab Name</label>
        <input
          type="text"
          value={settings.tabName}
          onChange={(e) => setSettings({ ...settings, tabName: e.target.value })}
          className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
          placeholder="Enter tab name"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">This will appear as the browser tab title</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Favicon URL</label>
        <input
          type="url"
          value={settings.favicon === 'None' ? '' : settings.favicon}
          onChange={(e) => setSettings({ ...settings, favicon: e.target.value || 'None' })}
          className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
          placeholder="Enter favicon URL or leave empty for none"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">This will appear as the browser tab icon</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Logo URL</label>
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <input
              type="url"
              value={settings.logoUrl || ''}
              onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
              placeholder="Enter logo image URL or leave empty for default"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">Used in the sidebar and login page. Leave empty to use the default letter icon.</p>
          </div>
          {settings.logoUrl ? (
            <div className="w-10 h-10 rounded-xl border border-border overflow-hidden bg-secondary flex items-center justify-center shrink-0">
              <img
                src={settings.logoUrl}
                alt="Logo preview"
                className="w-full h-full object-cover"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
              {settings.navName?.charAt(0)?.toUpperCase() || 'D'}
            </div>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="w-full bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Saving...' : 'Save Changes'}
      </button>
    </form>
  );
}

export default DashboardSettings;
