import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPalette, faCheck, faUndo } from '@fortawesome/free-solid-svg-icons';
import { motion } from 'framer-motion';
import { toast } from '../components/ui/Toast';
import { useTheme } from '../contexts/ThemeContext';

function UserSettingsPage() {
  const { theme, setTheme, themes, defaultTheme, isUsingDefault } = useTheme();
  const [loading, setLoading] = useState(false);

  const handleThemeChange = async (selectedTheme) => {
    setLoading(true);
    try {
      setTheme(selectedTheme);
      toast.success('Theme updated successfully');
    } catch (error) {
      toast.error('Failed to update theme');
    } finally {
      setLoading(false);
    }
  };

  const resetToDefault = () => {
    setTheme(defaultTheme);
    toast.success('Reset to default theme');
  };

  return (
    <div className="p-4 lg:p-6 max-w-[1200px] mx-auto">
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 mb-8"
      >
        <div className="p-3 rounded-xl bg-gradient-to-br from-primary to-primary/60 shadow-glow">
          <FontAwesomeIcon icon={faPalette} className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">User Settings</h1>
          <p className="text-muted-foreground text-sm">Customize your dashboard experience</p>
        </div>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-card p-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-1">Theme Preference</h2>
            <p className="text-muted-foreground text-sm">
              Choose your preferred color scheme. This will override the default theme.
            </p>
          </div>
          {!isUsingDefault && (
            <button
              onClick={resetToDefault}
              className="flex items-center gap-2 px-4 py-2.5 glass-button rounded-xl text-sm font-medium"
            >
              <FontAwesomeIcon icon={faUndo} className="w-3 h-3" />
              Reset to Default
            </button>
          )}
        </div>

        <div className="mb-6 p-5 glass-subtle rounded-xl">
          <div className="flex items-center gap-4">
            <div className="flex space-x-2">
              {themes.find(t => t.value === theme) && (
                <>
                  <div 
                    className="w-8 h-8 rounded-xl border-2 border-border/50 shadow-lg"
                    style={{ backgroundColor: themes.find(t => t.value === theme)?.colors.primary }}
                  />
                  <div 
                    className="w-8 h-8 rounded-xl border-2 border-border/50"
                    style={{ backgroundColor: themes.find(t => t.value === theme)?.colors.secondary }}
                  />
                </>
              )}
            </div>
            <div>
              <h3 className="font-semibold text-foreground">
                Current: {themes.find(t => t.value === theme)?.label}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isUsingDefault ? `Using default theme (${themes.find(t => t.value === defaultTheme)?.label})` : 'Using custom theme preference'}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {themes.map((themeOption, index) => (
            <motion.button
              key={themeOption.value}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + index * 0.05 }}
              onClick={() => handleThemeChange(themeOption.value)}
              disabled={loading}
              className={`group p-5 rounded-xl transition-all duration-300 text-left ${
                theme === themeOption.value
                  ? 'glass-card border-primary/50 shadow-glow-sm'
                  : 'glass-card-hover'
              } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex space-x-2">
                  <div 
                    className="w-6 h-6 rounded-lg border border-border/50 transition-transform duration-300 group-hover:scale-110"
                    style={{ backgroundColor: themeOption.colors.primary }}
                  />
                  <div 
                    className="w-6 h-6 rounded-lg border border-border/50 transition-transform duration-300 group-hover:scale-110"
                    style={{ backgroundColor: themeOption.colors.secondary }}
                  />
                </div>
                {theme === themeOption.value && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center"
                  >
                    <FontAwesomeIcon 
                      icon={faCheck} 
                      className="w-3 h-3 text-primary" 
                    />
                  </motion.div>
                )}
              </div>
              
              <div>
                <h4 className="font-semibold text-foreground text-sm mb-1">{themeOption.label}</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {themeOption.value === 'dark' && 'Classic dark theme with blue accents'}
                  {themeOption.value === 'blue' && 'Ocean-inspired deep blue theme'}
                  {themeOption.value === 'purple' && 'Rich purple theme'}
                  {themeOption.value === 'green' && 'Natural green theme'}
                  {themeOption.value === 'orange' && 'Warm sunset orange theme'}
                  {themeOption.value === 'teal' && 'Cool ocean teal theme'}
                  {themeOption.value === 'cyberpunk' && 'Futuristic neon pink theme'}
                  {themeOption.value === 'sunset' && 'Golden warm sunset theme'}
                  {themeOption.value === 'corporate' && 'Professional navy blue theme'}
                </p>
                {themeOption.value === defaultTheme && (
                  <div className="mt-3">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-primary/15 text-primary">
                      Default
                    </span>
                  </div>
                )}
              </div>
            </motion.button>
          ))}
        </div>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-6 p-5 glass-subtle rounded-xl"
        >
          <h4 className="font-semibold text-foreground text-sm mb-3">About Theme Settings</h4>
          <ul className="text-xs text-muted-foreground space-y-2">
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              Your theme preference is saved to your browser
            </li>
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              You can reset to the system default theme at any time
            </li>
            <li className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              Theme changes are applied instantly
            </li>
          </ul>
        </motion.div>
      </motion.div>
    </div>
  );
}

export default UserSettingsPage;
