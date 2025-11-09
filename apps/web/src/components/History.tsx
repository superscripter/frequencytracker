import { useState, useEffect } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import { useAuth } from '../context/AuthContext';
import './History.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Activity {
  id: string;
  name: string;
  date: string;
  type: {
    id: string;
    name: string;
  };
}

export function History() {
  const { user } = useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Get user timezone or default to Eastern Time
  const userTimezone = user?.timezone || 'America/New_York';

  // Sync state
  const [syncDate, setSyncDate] = useState<string>(() => {
    // Default to 20 days ago in user's timezone
    const date = new Date();
    date.setDate(date.getDate() - 20);
    return formatInTimeZone(date, userTimezone, 'yyyy-MM-dd');
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  useEffect(() => {
    fetchActivities();
  }, []);

  const fetchActivities = async () => {
    try {
      setIsLoading(true);
      setError('');

      const token = localStorage.getItem('token');
      if (!token) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch(`${API_URL}/api/activities`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch activities');
      }

      const data = await response.json();
      setActivities(data.activities);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activities');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncActivities = async () => {
    try {
      setIsSyncing(true);
      setSyncMessage('');

      const token = localStorage.getItem('token');

      // Convert sync date to ISO string at start of day in user's timezone
      const syncDateTime = `${syncDate}T00:00:00`;
      const isoDate = formatInTimeZone(
        new Date(syncDateTime),
        userTimezone,
        "yyyy-MM-dd'T'HH:mm:ss.SSSxxx"
      );

      const response = await fetch(`${API_URL}/api/strava/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          afterDate: new Date(isoDate).toISOString(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to sync activities');
      }

      const result = await response.json();
      setSyncMessage(
        `Sync complete: ${result.imported} imported, ${result.skipped} skipped${result.errors.length > 0 ? `, ${result.errors.length} errors` : ''}`
      );

      // Refresh activities
      await fetchActivities();

      // Clear message after 5 seconds
      setTimeout(() => setSyncMessage(''), 5000);
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : 'Failed to sync activities');
      setTimeout(() => setSyncMessage(''), 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  const formatDateTime = (dateString: string) => {
    return formatInTimeZone(
      new Date(dateString),
      userTimezone,
      'MMM d, yyyy h:mm a'
    );
  };

  if (isLoading) {
    return <div className="history-loading">Loading history...</div>;
  }

  if (error) {
    return <div className="history-error">{error}</div>;
  }

  if (!user) {
    return <div className="history-error">Please log in to view history</div>;
  }

  return (
    <div className="history-container">
      <div className="sync-section">
        <label htmlFor="sync-date">Sync from third-party platforms:</label>
        <input
          id="sync-date"
          type="date"
          value={syncDate}
          onChange={(e) => setSyncDate(e.target.value)}
          className="sync-date-input"
        />
        <button
          onClick={handleSyncActivities}
          disabled={isSyncing || !user?.stravaId}
          className="sync-btn"
          title={!user?.stravaId ? 'Connect Strava account in Profile to sync' : 'Sync activities from Strava'}
        >
          {isSyncing ? 'Syncing...' : 'Sync'}
        </button>
      </div>

      {syncMessage && (
        <div className={`sync-message ${syncMessage.includes('complete') ? 'success' : 'error'}`}>
          {syncMessage}
        </div>
      )}

      <h2>Activity History</h2>

      {activities.length === 0 ? (
        <div className="history-empty">
          <p>No activities yet. Start tracking your activities!</p>
        </div>
      ) : (
        <table className="history-table">
          <thead>
            <tr>
              <th>Activity Type</th>
              <th>Date & Time</th>
            </tr>
          </thead>
          <tbody>
            {activities.map((activity) => (
              <tr key={activity.id}>
                <td>{activity.type.name}</td>
                <td>{formatDateTime(activity.date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {activities.length === 20 && (
        <div className="table-footer">
          Showing 20 most recent activities
        </div>
      )}
    </div>
  );
}
