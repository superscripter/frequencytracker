import { useState, useEffect } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import { useAuth } from '../context/AuthContext';
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

  const calculateStatusForValue = (value: number | null, desiredFrequency: number): string => {
    if (value === null || value === 0) {
      return 'status-grey';
    }

    const difference = value - desiredFrequency;
    const absDifference = Math.abs(difference);

    if (absDifference < 1) {
      return 'status-yellow'; // due_today
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

  if (isLoading) {
    return <div className="analytics-loading">Loading analytics...</div>;
  }

  if (error) {
    return <div className="analytics-error">{error}</div>;
  }

  if (!user) {
    return <div className="analytics-error">Please log in to view analytics</div>;
  }

  return (
    <div className="analytics-container">
      <h2>Overview</h2>

      {analytics.length === 0 ? (
        <div className="analytics-empty">
          <p>No activity types yet. Create some activity types in your Profile!</p>
        </div>
      ) : (
        <table className="analytics-table">
          <thead>
            <tr>
              <th>Activity Type</th>
              <th>Desired Frequency</th>
              <th>Total Avg Frequency</th>
              <th>Date of First Activity</th>
              <th>Number of Activities</th>
            </tr>
          </thead>
          <tbody>
            {analytics.map((item, index) => (
              <tr key={index}>
                <td>{item.activityType}</td>
                <td>{item.desiredFrequency.toFixed(1)}</td>
                <td className={calculateStatusForValue(item.totalAvgFrequency, item.desiredFrequency)}>
                  {item.totalAvgFrequency > 0 ? item.totalAvgFrequency.toFixed(1) : 'N/A'}
                </td>
                <td>{formatDate(item.dateOfFirstActivity)}</td>
                <td>{item.numberOfActivities}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Streaks</h2>

      {streaks.length === 0 ? (
        <div className="analytics-empty">
          <p>No streaks yet. Add more activities to track streaks!</p>
        </div>
      ) : (
        <table className="analytics-table">
          <thead>
            <tr>
              <th>Activity Type</th>
              <th>Longest Streak</th>
              <th>Average Frequency</th>
              <th>Streak Start</th>
              <th>Streak End</th>
            </tr>
          </thead>
          <tbody>
            {streaks.map((item, index) => (
              <tr key={index}>
                <td>{item.activityType}</td>
                <td>{item.longestStreak > 0 ? item.longestStreak : 'N/A'}</td>
                <td>{item.averageFrequency > 0 ? item.averageFrequency.toFixed(1) : 'N/A'}</td>
                <td>{formatDate(item.streakStart)}</td>
                <td>{formatDate(item.streakEnd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
