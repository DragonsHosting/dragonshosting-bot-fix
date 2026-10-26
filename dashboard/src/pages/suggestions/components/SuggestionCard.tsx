import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faXmark, faClock, faUser, faSpinner, faTrash } from '@fortawesome/free-solid-svg-icons';
import { Suggestion } from '../../../types/suggestions';
import { userDataService } from '../../../utils/userDataService';

interface UserData {
  avatar: string;
  displayName: string;
  username: string;
}

interface SuggestionCardProps {
  suggestion: Suggestion;
  onAccept: (id: string, reason: string) => void;
  onDeny: (id: string, reason: string) => void;
  onDelete: (id: string) => void;
}

export default function SuggestionCard({ suggestion, onAccept, onDeny, onDelete }: SuggestionCardProps) {
  const [isActioning, setIsActioning] = useState(false);
  const [actionReason, setActionReason] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const data = await userDataService.getUserData(suggestion.authorId);
        if (data) setUserData(data);
      } catch (e) {}
    };
    fetchUser();
  }, [suggestion.authorId]);

  const handleAction = async (action: 'accept' | 'deny') => {
    setIsActioning(true);
    try {
      if (action === 'accept') {
        await onAccept(suggestion.uniqueId, actionReason);
      } else {
        await onDeny(suggestion.uniqueId, actionReason);
      }
    } finally {
      setIsActioning(false);
      setActionReason('');
    }
  };

  const formattedDate = new Date(suggestion.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const shouldTruncate = suggestion.text.length > 150;
  const displayText = shouldTruncate && !expanded ? suggestion.text.slice(0, 150) + '...' : suggestion.text;

  const statusConfig = {
    Pending: { bg: 'bg-amber-500/10', text: 'text-amber-500', border: 'border-amber-500/20' },
    Accepted: { bg: 'bg-green-500/10', text: 'text-green-500', border: 'border-green-500/20' },
    Denied: { bg: 'bg-red-500/10', text: 'text-red-500', border: 'border-red-500/20' }
  };

  const status = statusConfig[suggestion.status] || statusConfig.Pending;

  return (
    <>
      <div className="bg-secondary/50 border border-border rounded-xl p-4 flex flex-col h-full">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            {userData ? (
              <img
                src={userData.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}
                alt=""
                className="w-10 h-10 rounded-full flex-shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <FontAwesomeIcon icon={faUser} className="w-4 h-4 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {userData?.displayName || 'Loading...'}
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FontAwesomeIcon icon={faClock} className="w-3 h-3" />
                <span>{formattedDate}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`px-2 py-1 rounded text-xs font-medium ${status.bg} ${status.text}`}>
              {suggestion.status}
            </span>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <FontAwesomeIcon icon={faTrash} className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1">
          <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">{displayText}</p>
          {shouldTruncate && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-primary hover:underline mt-2"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>

        {suggestion.status === 'Pending' && (
          <div className="mt-4 pt-4 border-t border-border space-y-3">
            <input
              type="text"
              placeholder="Reason (optional)"
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg placeholder-muted-foreground text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="flex gap-2">
              <button
                onClick={() => handleAction('accept')}
                disabled={isActioning}
                className="flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-50"
              >
                {isActioning ? (
                  <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                ) : (
                  <>
                    <FontAwesomeIcon icon={faCheck} className="mr-1.5" />
                    Accept
                  </>
                )}
              </button>
              <button
                onClick={() => handleAction('deny')}
                disabled={isActioning}
                className="flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
              >
                {isActioning ? (
                  <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                ) : (
                  <>
                    <FontAwesomeIcon icon={faXmark} className="mr-1.5" />
                    Deny
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {suggestion.status !== 'Pending' && suggestion.reason && (
          <div className={`mt-4 p-3 rounded-lg text-sm ${status.bg} border ${status.border}`}>
            <span className={`font-medium ${status.text}`}>Reason:</span>
            <p className="text-foreground/80 mt-1">{suggestion.reason}</p>
          </div>
        )}
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-medium text-foreground mb-2">Delete Suggestion</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Are you sure? This will remove the suggestion from both the dashboard and Discord.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 bg-secondary text-foreground rounded-lg hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDelete(suggestion.uniqueId);
                  setShowDeleteConfirm(false);
                }}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
