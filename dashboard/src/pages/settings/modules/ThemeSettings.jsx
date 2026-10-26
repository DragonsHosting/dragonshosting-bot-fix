import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck } from '@fortawesome/free-solid-svg-icons';
import { toast } from '../../../components/ui/Toast';
import { useTheme } from '../../../contexts/ThemeContext';

function ThemeSettings() {
  const [loadingTheme, setLoadingTheme] = useState(null);
  const { themes, defaultTheme, setDefaultTheme } = useTheme();

  const handleSave = async (selectedTheme) => {
    if (selectedTheme === defaultTheme) return;
    
    setLoadingTheme(selectedTheme);
    try {
      await setDefaultTheme(selectedTheme);
      toast.success('Default theme updated successfully');
    } catch (error) {
      console.error('Theme update error:', error);
      toast.error('Failed to update default theme');
    } finally {
      setLoadingTheme(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-foreground mb-1">Default Theme</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Select the default theme for all users when they first visit the dashboard.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {themes.map((theme) => (
          <button
            key={theme.value}
            onClick={() => handleSave(theme.value)}
            disabled={loadingTheme === theme.value}
            className={`p-4 rounded-lg border transition-colors text-left ${
              defaultTheme === theme.value
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 bg-card hover:bg-secondary/50'
            } ${loadingTheme ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex space-x-1.5">
                <div 
                  className="w-4 h-4 rounded-full border border-border"
                  style={{ backgroundColor: theme.colors.primary }}
                />
                <div 
                  className="w-4 h-4 rounded-full border border-border"
                  style={{ backgroundColor: theme.colors.secondary }}
                />
              </div>
              {defaultTheme === theme.value && !loadingTheme && (
                <FontAwesomeIcon 
                  icon={faCheck} 
                  className="w-3 h-3 text-primary" 
                />
              )}
              {loadingTheme === theme.value && (
                <div className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
              )}
            </div>
            <div>
              <h4 className="font-medium text-sm text-foreground">{theme.label}</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                {theme.value === 'dark' && 'Classic dark theme'}
                {theme.value === 'blue' && 'Ocean-inspired blue theme'}
                {theme.value === 'purple' && 'Rich purple theme'}
                {theme.value === 'green' && 'Natural green theme'}
                {theme.value === 'orange' && 'Warm sunset orange theme'}
                {theme.value === 'teal' && 'Cool ocean teal theme'}
                {theme.value === 'cyberpunk' && 'Futuristic cyberpunk theme'}
                {theme.value === 'sunset' && 'Golden sunset theme'}
                {theme.value === 'corporate' && 'Professional corporate theme'}
              </p>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-5 p-4 bg-secondary rounded-lg">
        <h4 className="font-medium text-sm text-foreground mb-2">How it works</h4>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>• New users will see the default theme when they first visit</li>
          <li>• Users can override the default in their personal settings</li>
          <li>• Existing users with custom themes won't be affected</li>
        </ul>
      </div>
    </div>
  );
}

export default ThemeSettings;
