import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import ActivityCard from './ActivityCard';
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
  currentStreak: number;
  currentStreakStart: string | null;
}

interface UserPreferences {
  highlightOverdueActivities: boolean;
  showDetailedCardData: boolean;
}

export function Recommendations() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [preferences, setPreferences] = useState<UserPreferences>({
    highlightOverdueActivities: false,
    showDetailedCardData: false,
  });
  const { user } = useAuth();

  useEffect(() => {
    fetchRecommendations();
    fetchPreferences();
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

  const fetchPreferences = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch(`${API_URL}/api/preferences`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch preferences');
      }

      const data = await response.json();
      setPreferences(data.preferences);
    } catch (err) {
      console.error('Failed to load preferences:', err);
    }
  };

  const updatePreference = async (key: keyof UserPreferences, value: boolean) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      // Optimistically update UI
      setPreferences(prev => ({ ...prev, [key]: value }));

      const response = await fetch(`${API_URL}/api/preferences`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ [key]: value }),
      });

      if (!response.ok) {
        throw new Error('Failed to update preference');
      }

      const data = await response.json();
      setPreferences(data.preferences);
    } catch (err) {
      console.error('Failed to update preference:', err);
      // Revert on error
      fetchPreferences();
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

  // Get IDs of activities shown in today and tomorrow sections
  const shownActivityIds = new Set([
    ...todayRecommendations.map(rec => rec.activityType.id),
    ...tomorrowRecommendations.map(rec => rec.activityType.id)
  ]);

  // Filter recommendations for all other activities (not shown in today or tomorrow)
  const otherRecommendations = recommendations.filter(rec =>
    !shownActivityIds.has(rec.activityType.id)
  );

  const renderCards = (items: Recommendation[], section: 'today' | 'tomorrow' | 'other') => {
    if (items.length === 0) {
      return <p className="no-recommendations">No recommendations</p>;
    }

    return (
      <div className="activity-cards-grid">
        {items.map((rec) => (
          <ActivityCard
            key={rec.activityType.id}
            recommendation={rec}
            section={section}
            highlightOverdue={preferences.highlightOverdueActivities}
            showDetailedData={preferences.showDetailedCardData}
          />
        ))}
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
            <div className="section-header">
              <h3 className="section-title-today">Due Today</h3>
              {todayRecommendations.length > 0 && (
                <span className="section-count section-count-today">{todayRecommendations.length}</span>
              )}
            </div>
            {renderCards(todayRecommendations, 'today')}
          </div>

          {/* Tomorrow Recommendations */}
          <div className="recommendations-section">
            <div className="section-header">
              <h3 className="section-title-tomorrow">Due Tomorrow</h3>
              {tomorrowRecommendations.length > 0 && (
                <span className="section-count section-count-tomorrow">{tomorrowRecommendations.length}</span>
              )}
            </div>
            {renderCards(tomorrowRecommendations, 'tomorrow')}
          </div>

          {/* All Other Activities */}
          <div className="recommendations-section">
            <div className="section-header">
              <h3 className="section-title-other">All Other Activities</h3>
              {otherRecommendations.length > 0 && (
                <span className="section-count section-count-other">{otherRecommendations.length}</span>
              )}
            </div>
            {renderCards(otherRecommendations, 'other')}
          </div>

          {/* Preferences Section */}
          <div className="recommendations-preferences">
            <h3 className="preferences-title">Display Preferences</h3>
            <div className="preferences-controls">
              <label className="preference-item">
                <input
                  type="checkbox"
                  checked={preferences.highlightOverdueActivities}
                  onChange={(e) => updatePreference('highlightOverdueActivities', e.target.checked)}
                />
                <span className="preference-label">Highlight Overdue Activities</span>
              </label>
              <label className="preference-item">
                <input
                  type="checkbox"
                  checked={preferences.showDetailedCardData}
                  onChange={(e) => updatePreference('showDetailedCardData', e.target.checked)}
                />
                <span className="preference-label">Show Detailed Card Data</span>
              </label>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
