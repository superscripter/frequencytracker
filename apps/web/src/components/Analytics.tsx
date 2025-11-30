import { useState, useEffect } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import { useAuth } from '../context/AuthContext';
import ActivityChart from './ActivityChart';
import './Analytics.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface AnalyticsData {
  activityType: string;
  desiredFrequency: number;
  totalAvgFrequency: number;
  dateOfFirstActivity: string | null;
  numberOfActivities: number;
}

interface StreakData {
  activityType: string;
  longestStreak: number;
  averageFrequency: number;
  streakStart: string | null;
  streakEnd: string | null;
}

export function Analytics() {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<AnalyticsData[]>([]);
  const [streaks, setStreaks] = useState<StreakData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Get user timezone or default to Eastern Time
  const userTimezone = user?.timezone || 'America/New_York';

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setIsLoading(true);
      setError('');

      const token = localStorage.getItem('token');
      if (!token) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch(`${API_URL}/api/analytics`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch analytics');
      }

      const data = await response.json();
      setAnalytics(data.analytics);
      setStreaks(data.streaks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return formatInTimeZone(
      new Date(dateString),
      userTimezone,
      'MMM d, yyyy'
    );
  };

  if (isLoading) {
    return <div className="analytics-loading">Loading analytics...</div>;
  }

  if (error) {
    return <div className="analytics-error">{error}</div>;
  }

  if (!user) {
    return <div className="analytics-error">Please log in to view analytics</div>;
  }

  // Prepare data for frequency comparison chart
  const frequencyComparisonData = analytics.map(item => ({
    name: item.activityType.length > 15 ? item.activityType.substring(0, 15) + '...' : item.activityType,
    desired: item.desiredFrequency,
    actual: item.totalAvgFrequency > 0 ? item.totalAvgFrequency : 0
  }));

  // Prepare data for streaks chart
  const streaksChartData = streaks
    .filter(item => item.longestStreak > 0)
    .map(item => ({
      name: item.activityType.length > 15 ? item.activityType.substring(0, 15) + '...' : item.activityType,
      value: item.longestStreak
    }));

  return (
    <div className="analytics-container">
      <h2>Activity Performance</h2>

      {analytics.length === 0 ? (
        <div className="analytics-empty">
          <p>No activity types yet. Create some activity types in your Profile!</p>
        </div>
      ) : (
        <>
          <ActivityChart
            type="comparison-bar"
            data={frequencyComparisonData}
            title="Frequency Comparison"
          />

          <details className="analytics-details" open>
            <summary className="analytics-summary">Detailed Statistics</summary>
            <div className="analytics-table-wrapper">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Activity Type</th>
                    <th>Desired</th>
                    <th>Total Avg</th>
                    <th>First Activity</th>
                    <th>Total Count</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.map((item, index) => (
                    <tr key={index}>
                      <td><strong>{item.activityType}</strong></td>
                      <td>{item.desiredFrequency.toFixed(1)}</td>
                      <td
                        style={{
                          color: item.totalAvgFrequency <= item.desiredFrequency
                            ? 'var(--color-status-ahead)'
                            : 'var(--color-status-overdue-light)'
                        }}
                      >
                        <strong>{item.totalAvgFrequency > 0 ? item.totalAvgFrequency.toFixed(1) : 'N/A'}</strong>
                      </td>
                      <td>{formatDate(item.dateOfFirstActivity)}</td>
                      <td>{item.numberOfActivities}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}

      <h2>Longest Streaks</h2>

      {streaks.length === 0 ? (
        <div className="analytics-empty">
          <p>No streaks yet. Add more activities to track streaks!</p>
        </div>
      ) : (
        <>
          {streaksChartData.length > 0 && (
            <ActivityChart
              type="horizontal-bar"
              data={streaksChartData}
              title="Streak Achievements"
            />
          )}

          <details className="analytics-details" open>
            <summary className="analytics-summary">Streak Details</summary>
            <div className="analytics-table-wrapper">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Activity Type</th>
                    <th>Longest Streak</th>
                    <th>Avg Frequency</th>
                    <th>Streak Period</th>
                  </tr>
                </thead>
                <tbody>
                  {streaks.map((item, index) => (
                    <tr key={index}>
                      <td><strong>{item.activityType}</strong></td>
                      <td>
                        <span style={{ color: 'var(--color-aurora-green)', fontWeight: 600 }}>
                          {item.longestStreak > 0 ? `${item.longestStreak} days` : 'N/A'}
                        </span>
                      </td>
                      <td>{item.averageFrequency > 0 ? item.averageFrequency.toFixed(1) : 'N/A'}</td>
                      <td>
                        {item.streakStart && item.streakEnd
                          ? `${formatDate(item.streakStart)} - ${formatDate(item.streakEnd)}`
                          : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
