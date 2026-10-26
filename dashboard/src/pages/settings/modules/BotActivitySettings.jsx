import React, { useState, useEffect } from 'react';
import api from '../../../lib/api/axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faPlus } from '@fortawesome/free-solid-svg-icons';
import { toast } from '../../../components/ui/Toast';

const activityTypes = [
  { value: 'PLAYING', label: 'Playing' },
  { value: 'LISTENING', label: 'Listening' },
  { value: 'WATCHING', label: 'Watching' },
  { value: 'STREAMING', label: 'Streaming' },
  { value: 'COMPETING', label: 'Competing' }
];

const statusTypes = [
  { value: 'online', label: 'Online' },
  { value: 'idle', label: 'Idle' },
  { value: 'dnd', label: 'Do Not Disturb' }
];

const placeholders = {
  'Server Stats': [
    { value: '{total-users}', label: 'Total members' },
    { value: '{online-members}', label: 'Online members' },
    { value: '{total-channels}', label: 'Total channels' },
    { value: '{total-messages}', label: 'Total messages' },
    { value: '{total-boosts}', label: 'Server boosts' }
  ],
  'Bot Stats': [
    { value: '{uptime}', label: 'Bot uptime' },
    { value: '{times-bot-started}', label: 'Start count' },
    { value: '{total-cases}', label: 'Mod cases' }
  ],
  'Tickets': [
    { value: '{open-tickets}', label: 'Open tickets' },
    { value: '{closed-tickets}', label: 'Closed tickets' },
    { value: '{deleted-tickets}', label: 'Deleted tickets' },
    { value: '{total-tickets}', label: 'Total tickets' }
  ],
  'Other': [
    { value: '{total-suggestions}', label: 'Suggestions' }
  ]
};

function BotActivitySettings() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activities, setActivities] = useState([]);
  const [newActivity, setNewActivity] = useState({
    activityType: 'PLAYING',
    statusType: 'online',
    status: '',
    streamingURL: ''
  });

  useEffect(() => {
    fetchActivities();
  }, []);

  const fetchActivities = async () => {
    try {
      const response = await api.get('/settings/bot-activity');
      setActivities(response.data.activities || []);
      setNewActivity(response.data.current || {
        activityType: 'PLAYING',
        statusType: 'online',
        status: '',
        streamingURL: ''
      });
    } catch (err) {
      setError('Failed to fetch bot activities');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddActivity = async (e) => {
    e.preventDefault();
    try {
      if (!newActivity.status.trim()) {
        setError('Activity message is required');
        return;
      }

      if (newActivity.activityType === 'STREAMING' && !newActivity.streamingURL) {
        setError('Streaming URL is required for streaming activity type');
        return;
      }

      const activityData = {
        ...newActivity,
        status: newActivity.status.trim(),
        streamingURL: newActivity.activityType === 'STREAMING' ? newActivity.streamingURL : null
      };

      await api.post('/settings/bot-activity', activityData);
      setNewActivity({
        activityType: 'PLAYING',
        statusType: 'online',
        status: '',
        streamingURL: ''
      });
      setError('');
      toast.success('Activity added successfully');
      fetchActivities();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add activity');
      console.error(err);
    }
  };

  const handleRemoveActivity = async (index) => {
    try {
      await api.delete(`/settings/bot-activity/${index}`);
      toast.success('Activity removed');
      fetchActivities();
    } catch (err) {
      setError('Failed to remove activity');
      console.error(err);
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

      <form onSubmit={handleAddActivity} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Activity Type</label>
            <select
              value={newActivity.activityType}
              onChange={(e) => setNewActivity({ ...newActivity, activityType: e.target.value })}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
            >
              {activityTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Status Type</label>
            <select
              value={newActivity.statusType}
              onChange={(e) => setNewActivity({ ...newActivity, statusType: e.target.value })}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
            >
              {statusTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Activity Message</label>
          <input
            type="text"
            value={newActivity.status}
            onChange={(e) => setNewActivity({ ...newActivity, status: e.target.value })}
            className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
            placeholder="Enter activity message"
          />
          <div className="mt-3 space-y-3">
            {Object.entries(placeholders).map(([category, items]) => (
              <div key={category}>
                <h4 className="text-xs font-medium text-muted-foreground mb-1.5">{category}</h4>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setNewActivity({
                        ...newActivity,
                        status: newActivity.status + item.value
                      })}
                      className="px-2 py-1 text-xs font-medium text-foreground bg-secondary border border-border rounded hover:bg-muted transition-colors"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {newActivity.activityType === 'STREAMING' && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Streaming URL</label>
            <input
              type="url"
              value={newActivity.streamingURL}
              onChange={(e) => setNewActivity({ ...newActivity, streamingURL: e.target.value })}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
              placeholder="Enter streaming URL"
              required
            />
          </div>
        )}

        <button
          type="submit"
          className="w-full bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
        >
          <FontAwesomeIcon icon={faPlus} className="w-3 h-3" />
          Add Activity
        </button>
      </form>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">Current Activities</h3>
          <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">
            {activities.length} {activities.length === 1 ? 'activity' : 'activities'}
          </span>
        </div>
        {activities.length === 0 ? (
          <div className="bg-secondary rounded-lg p-4">
            <p className="text-sm text-muted-foreground text-center">No activities configured</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activities.map((activity, index) => (
              <div
                key={index}
                className="group bg-secondary rounded-lg p-3 flex items-center justify-between hover:bg-muted transition-colors"
              >
                <div className="space-y-0.5">
                  <p className="font-medium text-sm text-foreground">{activity.status}</p>
                  <p className="text-xs text-muted-foreground">
                    {activityTypes.find(t => t.value === activity.activityType)?.label} • 
                    {statusTypes.find(t => t.value === activity.statusType)?.label}
                  </p>
                </div>
                <button
                  onClick={() => handleRemoveActivity(index)}
                  className="p-1.5 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                >
                  <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default BotActivitySettings;
