import { useState, useEffect } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import { useAuth } from '../context/AuthContext';
import './Recommendations.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface ActivityType {
  id: string;
  name: string;
  description: string | null;
  desiredFrequency: number;
}

interface Recommendation {
  activityType: ActivityType;
  lastPerformedDate: string | null;
  daysSinceLastActivity: number | null;
  averageFrequencyLast3: number | null;
  averageFrequencyLast10: number | null;
  trend: 'improving' | 'stable' | 'declining' | 'insufficient_data';
  difference: number | null;
  status: 'ahead' | 'due_soon' | 'due_today' | 'overdue' | 'critically_overdue' | 'no_data';
  priorityScore: number;
}

export function Recommendations() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const { user } = useAuth();

  // Get user timezone or default to Eastern Time
  const userTimezone = user?.timezone || 'America/New_York';

  // Sync state
  const [syncDate, setSyncDate] = useState<string>(() => {
    // Default to 10 days ago in user's timezone
    const date = new Date();
    date.setDate(date.getDate() - 10);
    return formatInTimeZone(date, userTimezone, 'yyyy-MM-dd');
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  useEffect(() => {
    fetchRecommendations();
  }, []);

  const fetchRecommendations = async () => {
    try {
      setIsLoading(true);
      setError('');

      const token = localStorage.getItem('token');
      if (!token) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch(`${API_URL}/api/recommendations`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch recommendations');
      }

      const data = await response.json();
      setRecommendations(data.recommendations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recommendations');
    } finally {
      setIsLoading(false);
    }
  };

  const calculateStatusForValue = (value: number | null, desiredFrequency: number): string => {
    if (value === null) {
      return 'status-grey';
    }

    const difference = value - desiredFrequency;
    const absDifference = Math.abs(difference);

    if (absDifference < 1) {
      return 'status-light-green'; // due_today
    } else if (absDifference >= 1 && absDifference < 2) {
      return 'status-light-green'; // due_soon
    } else if (absDifference >= 2) {
      if (difference > 0) {
        // Overdue (value is higher than desired)
        if (absDifference <= 3) {
          return 'status-red'; // overdue
        } else {
          return 'status-dark-red'; // critically_overdue
        }
      } else {
        // Ahead of schedule (value is lower than desired)
        return 'status-dark-green'; // ahead
      }
    }
    return '';
  };


  const formatAverageFrequency = (avg: number | null): string => {
    if (avg === null) {
      return 'N/A';
    }
    return avg.toFixed(1);
  };

  const getTrendDisplay = (trend: Recommendation['trend']): { icon: string; text: string } => {
    switch (trend) {
      case 'improving':
        return { icon: '⬆️', text: 'Improving' };
      case 'declining':
        return { icon: '⬇️', text: 'Declining' };
      case 'stable':
        return { icon: '➡️', text: 'Stable' };
      case 'insufficient_data':
        return { icon: '—', text: 'N/A' };
      default:
        return { icon: '—', text: 'N/A' };
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

      // Refresh recommendations
      await fetchRecommendations();

      // Clear message after 5 seconds
      setTimeout(() => setSyncMessage(''), 5000);
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : 'Failed to sync activities');
      setTimeout(() => setSyncMessage(''), 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  // Filter recommendations for today (due_today, overdue, critically_overdue)
  const todayRecommendations = recommendations.filter(rec =>
    rec.status === 'due_today' || rec.status === 'overdue' || rec.status === 'critically_overdue'
  );

  // Filter recommendations for tomorrow (due_soon status, which means |difference| >= 1 and < 2)
  const tomorrowRecommendations = recommendations.filter(rec =>
    rec.status === 'due_soon'
  );

  const renderTable = (items: Recommendation[]) => {
    if (items.length === 0) {
      return <p className="no-recommendations">No recommendations</p>;
    }

    return (
      <div className="recommendations-table-wrapper">
        <table className="recommendations-table">
          <thead>
            <tr>
              <th>Activity Type</th>
              <th>Days Since Last Activity</th>
              <th>Desired Frequency</th>
              <th>Last 3 Avg</th>
              <th>Last 10 Avg</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            {items.map((rec) => {
              const trendDisplay = getTrendDisplay(rec.trend);
              return (
                <tr key={rec.activityType.id}>
                  <td className="activity-name">
                    <strong>{rec.activityType.name}</strong>
                    {rec.activityType.description && (
                      <div className="activity-description">{rec.activityType.description}</div>
                    )}
                  </td>
                  <td className={`days-since ${calculateStatusForValue(rec.daysSinceLastActivity, rec.activityType.desiredFrequency)}`}>
                    {rec.daysSinceLastActivity !== null ? rec.daysSinceLastActivity : 'N/A'}
                  </td>
                  <td className="desired-frequency">
                    {rec.activityType.desiredFrequency.toFixed(1)}
                  </td>
                  <td className={`average-frequency ${calculateStatusForValue(rec.averageFrequencyLast3, rec.activityType.desiredFrequency)}`}>
                    {formatAverageFrequency(rec.averageFrequencyLast3)}
                  </td>
                  <td className={`average-frequency ${calculateStatusForValue(rec.averageFrequencyLast10, rec.activityType.desiredFrequency)}`}>
                    {formatAverageFrequency(rec.averageFrequencyLast10)}
                  </td>
                  <td className={`trend-cell trend-${rec.trend}`}>
                    <span className="trend-icon">{trendDisplay.icon}</span>
                    <span className="trend-text">{trendDisplay.text}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  if (isLoading) {
    return <div className="recommendations-loading">Loading recommendations...</div>;
  }

  if (error) {
    return <div className="recommendations-error">{error}</div>;
  }

  if (!user) {
    return <div className="recommendations-error">Please log in to view recommendations</div>;
  }

  return (
    <div className="recommendations-container">
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

      {recommendations.length === 0 ? (
        <div className="recommendations-empty">
          <p>No activity types found. Create some activity types to see recommendations.</p>
        </div>
      ) : (
        <>
          {/* Today Recommendations */}
          <div className="recommendations-section">
            <h3>Today Recommendations</h3>
            {renderTable(todayRecommendations)}
          </div>

          {/* Tomorrow Recommendations */}
          <div className="recommendations-section">
            <h3>Tomorrow Recommendations</h3>
            {renderTable(tomorrowRecommendations)}
          </div>

          {/* All Recommendations */}
          <div className="recommendations-section">
            <h3>All Activity Recommendations</h3>
            {renderTable(recommendations)}
          </div>
        </>
      )}

      <div className="recommendations-legend">
        <h3>Status Legend</h3>
        <div className="legend-items">
          <div className="legend-item">
            <span className="legend-color status-dark-green"></span>
            <span>Ahead of schedule (done more recently than needed)</span>
          </div>
          <div className="legend-item">
            <span className="legend-color status-light-green"></span>
            <span>Due within 2 days or due today</span>
          </div>
          <div className="legend-item">
            <span className="legend-color status-red"></span>
            <span>Overdue by 1-2 days</span>
          </div>
          <div className="legend-item">
            <span className="legend-color status-dark-red"></span>
            <span>Critically overdue ({'>'}2 days)</span>
          </div>
          <div className="legend-item">
            <span className="legend-color status-grey"></span>
            <span>No data (never performed)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
