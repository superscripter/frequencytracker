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

  const calculateGradientColor = (value: number | null, desiredFrequency: number): string => {
    if (value === null) {
      return 'rgba(136, 136, 136, 0.2)';
    }

    const difference = value - desiredFrequency;

    // Define color stops for the gradient
    // Green for ahead (negative difference), red for behind (positive difference)
    // Range: -5 (very ahead) to +5 (very behind)
    const clampedDiff = Math.max(-5, Math.min(5, difference));

    // Normalize to 0-1 range (0 = very ahead, 1 = very behind)
    const normalizedPosition = (clampedDiff + 5) / 10;

    // Color gradient points:
    // 0.0 (diff -5): Dark green rgb(0, 100, 0)
    // 0.3 (diff -2): Medium green rgb(34, 139, 34)
    // 0.5 (diff 0): Light green/yellow rgb(154, 205, 50)
    // 0.7 (diff +2): Orange rgb(255, 140, 0)
    // 1.0 (diff +5): Dark red rgb(139, 0, 0)

    let r, g, b;

    if (normalizedPosition < 0.3) {
      // Dark green to medium green
      const t = normalizedPosition / 0.3;
      r = Math.round(0 + (34 - 0) * t);
      g = Math.round(100 + (139 - 100) * t);
      b = Math.round(0 + (34 - 0) * t);
    } else if (normalizedPosition < 0.5) {
      // Medium green to light green/yellow
      const t = (normalizedPosition - 0.3) / 0.2;
      r = Math.round(34 + (154 - 34) * t);
      g = Math.round(139 + (205 - 139) * t);
      b = Math.round(34 + (50 - 34) * t);
    } else if (normalizedPosition < 0.7) {
      // Light green/yellow to orange
      const t = (normalizedPosition - 0.5) / 0.2;
      r = Math.round(154 + (255 - 154) * t);
      g = Math.round(205 + (140 - 205) * t);
      b = Math.round(50 + (0 - 50) * t);
    } else {
      // Orange to dark red
      const t = (normalizedPosition - 0.7) / 0.3;
      r = Math.round(255 + (139 - 255) * t);
      g = Math.round(140 + (0 - 140) * t);
      b = Math.round(0 + (0 - 0) * t);
    }

    return `rgba(${r}, ${g}, ${b}, 0.8)`;
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
                  <td
                    className="days-since"
                    style={{ backgroundColor: calculateGradientColor(rec.daysSinceLastActivity, rec.activityType.desiredFrequency) }}
                  >
                    {rec.daysSinceLastActivity !== null ? rec.daysSinceLastActivity : 'N/A'}
                  </td>
                  <td className="desired-frequency">
                    {rec.activityType.desiredFrequency.toFixed(1)}
                  </td>
                  <td
                    className="average-frequency"
                    style={{ backgroundColor: calculateGradientColor(rec.averageFrequencyLast3, rec.activityType.desiredFrequency) }}
                  >
                    {formatAverageFrequency(rec.averageFrequencyLast3)}
                  </td>
                  <td
                    className="average-frequency"
                    style={{ backgroundColor: calculateGradientColor(rec.averageFrequencyLast10, rec.activityType.desiredFrequency) }}
                  >
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
    </div>
  );
}
