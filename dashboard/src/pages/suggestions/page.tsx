import { useState, useEffect, useMemo, Fragment } from 'react';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch, faSpinner, faLightbulb, faCheck, faXmark, faClock } from "@fortawesome/free-solid-svg-icons";
import { Suggestion } from '../../types/suggestions';
import SuggestionCard from './components/SuggestionCard';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

const getCsrfToken = (): string | null => {
    const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
};

export default function SuggestionsPage() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'accepted' | 'denied'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 12;

  useEffect(() => {
    fetchSuggestions();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery]);

  const fetchSuggestions = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/suggestions');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch suggestions (${response.status})`);
      }
      const data = await response.json();
      setSuggestions(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (id: string, reason: string) => {
    try {
      setError(null);
      const csrfToken = getCsrfToken();
      const response = await fetch(`/api/suggestions/${id}/accept`, {
        method: 'POST',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
          ...(csrfToken && { 'X-XSRF-TOKEN': csrfToken }),
        },
        body: JSON.stringify({ reason: reason.trim() || 'No reason provided' }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to accept suggestion');
      }

      setSuggestions((prev) =>
        prev.map((s) =>
          s.uniqueId === id
            ? { ...s, status: 'Accepted', reason: reason.trim() || 'No reason provided' }
            : s
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept suggestion');
    }
  };

  const handleDeny = async (id: string, reason: string) => {
    try {
      setError(null);
      const csrfToken = getCsrfToken();
      const response = await fetch(`/api/suggestions/${id}/deny`, {
        method: 'POST',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
          ...(csrfToken && { 'X-XSRF-TOKEN': csrfToken }),
        },
        body: JSON.stringify({ reason: reason.trim() || 'No reason provided' }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to deny suggestion');
      }

      setSuggestions((prev) =>
        prev.map((s) =>
          s.uniqueId === id
            ? { ...s, status: 'Denied', reason: reason.trim() || 'No reason provided' }
            : s
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deny suggestion');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setError(null);
      const csrfToken = getCsrfToken();
      const response = await fetch(`/api/suggestions/${id}`, { 
        method: 'DELETE',
        credentials: 'include',
        headers: csrfToken ? { 'X-XSRF-TOKEN': csrfToken } : {},
      });
      if (!response.ok) throw new Error('Failed to delete suggestion');
      setSuggestions((prev) => prev.filter((s) => s.uniqueId !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete suggestion');
    }
  };

  const filteredSuggestions = useMemo(() => {
    const searchLower = searchQuery.toLowerCase();
    return suggestions.filter(suggestion => {
      if (!suggestion) return false;
      const matchesSearch = 
        (suggestion.text?.toLowerCase() || '').includes(searchLower) ||
        (suggestion.authorId?.toLowerCase() || '').includes(searchLower);
      const matchesStatus = 
        (activeTab === 'pending' && suggestion.status === 'Pending') ||
        (activeTab === 'accepted' && suggestion.status === 'Accepted') ||
        (activeTab === 'denied' && suggestion.status === 'Denied');
      return matchesSearch && matchesStatus;
    });
  }, [suggestions, searchQuery, activeTab]);

  const totalPages = Math.ceil(filteredSuggestions.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedSuggestions = filteredSuggestions.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const stats = {
    total: suggestions.length,
    pending: suggestions.filter(s => s.status === 'Pending').length,
    accepted: suggestions.filter(s => s.status === 'Accepted').length,
    denied: suggestions.filter(s => s.status === 'Denied').length,
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6 min-w-0 px-4 lg:px-6 max-w-[1600px] mx-auto w-full">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <FontAwesomeIcon icon={faLightbulb} className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <FontAwesomeIcon icon={faClock} className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.pending}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <FontAwesomeIcon icon={faCheck} className="w-4 h-4 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.accepted}</p>
              <p className="text-xs text-muted-foreground">Accepted</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/10 rounded-lg">
              <FontAwesomeIcon icon={faXmark} className="w-4 h-4 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.denied}</p>
              <p className="text-xs text-muted-foreground">Denied</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-xl p-5 border border-border">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'pending'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              Pending ({stats.pending})
            </button>
            <button
              onClick={() => setActiveTab('accepted')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'accepted'
                  ? 'bg-green-600 text-white'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              Accepted ({stats.accepted})
            </button>
            <button
              onClick={() => setActiveTab('denied')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'denied'
                  ? 'bg-red-600 text-white'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              Denied ({stats.denied})
            </button>
          </div>
          <div className="relative w-full md:w-72">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <FontAwesomeIcon icon={faSearch} className="h-4 w-4 text-muted-foreground" />
            </div>
            <input
              type="text"
              placeholder="Search suggestions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-secondary border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm w-full placeholder-muted-foreground text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
        )}

        <div className="relative">
          {pageLoading && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg z-10">
              <FontAwesomeIcon icon={faSpinner} className="w-6 h-6 text-primary animate-spin" />
            </div>
          )}

          {paginatedSuggestions.length === 0 ? (
            <div className="text-center py-12">
              <FontAwesomeIcon icon={faLightbulb} className="w-12 h-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">
                {searchQuery ? `No suggestions matching "${searchQuery}"` : 'No suggestions in this category'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {paginatedSuggestions.map((suggestion) => (
                <SuggestionCard
                  key={suggestion.uniqueId}
                  suggestion={suggestion}
                  onAccept={handleAccept}
                  onDeny={handleDeny}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>

        {filteredSuggestions.length > ITEMS_PER_PAGE && (
          <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="text-sm text-muted-foreground">
              Showing {startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, filteredSuggestions.length)} of {filteredSuggestions.length}
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  currentPage === 1
                    ? 'bg-secondary text-muted-foreground cursor-not-allowed'
                    : 'bg-secondary text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                Previous
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(page => page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1))
                .map((page, index, array) => (
                  <Fragment key={page}>
                    {index > 0 && array[index - 1] !== page - 1 && (
                      <span className="text-muted-foreground px-1">...</span>
                    )}
                    <button
                      onClick={() => setCurrentPage(page)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        currentPage === page
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      {page}
                    </button>
                  </Fragment>
                ))}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  currentPage === totalPages
                    ? 'bg-secondary text-muted-foreground cursor-not-allowed'
                    : 'bg-secondary text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
