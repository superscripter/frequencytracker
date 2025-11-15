import { useState, useEffect } from 'react';
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

    if (difference < -2) {
      // Way ahead of schedule
      return 'status-dark-green';
    } else if (difference >= -2 && difference < -1) {
      // Ahead but approaching time
      return 'status-dark-green';
    } else if (difference >= -1 && difference < 1) {
      // Within 1 day of target (due today)
      return 'status-light-green';
    } else if (difference >= 1 && difference <= 2) {
      // 1-2 days overdue (due soon)
      return 'status-red';
    } else if (difference > 2 && difference <= 4) {
      // 2-4 days overdue
      return 'status-dark-red';
    } else {
      // More than 4 days overdue
      return 'status-dark-red';
    }
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

  // Filter recommendations for today (all activities with difference > -1)
  const todayRecommendations = recommendations.filter(rec =>
    rec.difference !== null && rec.difference > -1
  );

  // Filter recommendations for tomorrow (activities with difference > -2 and <= -1)
  const tomorrowRecommendations = recommendations.filter(rec =>
    rec.difference !== null && rec.difference > -2 && rec.difference <= -1
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
