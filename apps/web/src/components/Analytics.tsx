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

  const calculateGradientColor = (value: number | null, desiredFrequency: number): string => {
    if (value === null) {
      return 'rgba(136, 136, 136, 0.2)';
    }

    const difference = value - desiredFrequency;

    let r, g, b;

    if (difference <= 0) {
      // GREEN GRADIENT: Ahead of schedule or on time
      // Range: -5 (very ahead) to 0 (due today)
      // Color range: Dark green → Light green
      const clampedDiff = Math.max(-5, difference);
      const normalizedPosition = (clampedDiff + 5) / 5; // 0 (very ahead) to 1 (due today)

      // Color gradient:
      // 0.0 (diff -5): Dark green rgb(0, 80, 0)
      // 0.5 (diff -2.5): Medium green rgb(34, 139, 34)
      // 1.0 (diff 0): Light green rgb(76, 175, 80)

      if (normalizedPosition < 0.5) {
        const t = normalizedPosition / 0.5;
        r = Math.round(0 + (34 - 0) * t);
        g = Math.round(80 + (139 - 80) * t);
        b = Math.round(0 + (34 - 0) * t);
      } else {
        const t = (normalizedPosition - 0.5) / 0.5;
        r = Math.round(34 + (76 - 34) * t);
        g = Math.round(139 + (175 - 139) * t);
        b = Math.round(34 + (80 - 34) * t);
      }
    } else {
      // RED GRADIENT: Overdue
      // Range: 0 (just overdue) to +5 (very overdue)
      // Color range: Light red → Dark red
      const clampedDiff = Math.min(5, difference);
      const normalizedPosition = clampedDiff / 5; // 0 (just overdue) to 1 (very overdue)

      // Color gradient:
      // 0.0 (diff 0): Light red/orange rgb(255, 87, 34)
      // 0.5 (diff 2.5): Medium red rgb(211, 47, 47)
      // 1.0 (diff 5): Dark red rgb(139, 0, 0)

      if (normalizedPosition < 0.5) {
        const t = normalizedPosition / 0.5;
        r = Math.round(255 + (211 - 255) * t);
        g = Math.round(87 + (47 - 87) * t);
        b = Math.round(34 + (47 - 34) * t);
      } else {
        const t = (normalizedPosition - 0.5) / 0.5;
        r = Math.round(211 + (139 - 211) * t);
        g = Math.round(47 + (0 - 47) * t);
        b = Math.round(47 + (0 - 47) * t);
      }
    }

    return `rgba(${r}, ${g}, ${b}, 0.8)`;
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
        <div className="analytics-table-wrapper">
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
                  <td
                    style={{ backgroundColor: calculateGradientColor(item.totalAvgFrequency, item.desiredFrequency) }}
                  >
                    {item.totalAvgFrequency > 0 ? item.totalAvgFrequency.toFixed(1) : 'N/A'}
                  </td>
                  <td>{formatDate(item.dateOfFirstActivity)}</td>
                  <td>{item.numberOfActivities}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Streaks</h2>

      {streaks.length === 0 ? (
        <div className="analytics-empty">
          <p>No streaks yet. Add more activities to track streaks!</p>
        </div>
      ) : (
        <div className="analytics-table-wrapper">
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
        </div>
      )}
    </div>
  );
}
