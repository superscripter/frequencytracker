import { useState, useEffect } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import { useAuth } from '../context/AuthContext';
import ActivityCard from './ActivityCard';
import './Recommendations.css';
import './ActivitiesManager.css';

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

  // Get user timezone or default to Eastern Time
  const userTimezone = user?.timezone || 'America/New_York';

  // Add activity form state
  const [addTypeId, setAddTypeId] = useState<string>('');
  const [addDate, setAddDate] = useState<string>(() => {
    // Get current date in user's timezone
    return formatInTimeZone(new Date(), userTimezone, 'yyyy-MM-dd');
  });
  const [addTime, setAddTime] = useState<string>('12:00');

  // Extract unique activity types from recommendations
  const activityTypes = recommendations.map(rec => rec.activityType);

  useEffect(() => {
    if (user) {
      fetchRecommendations();
      fetchPreferences();
    }
  }, [user]);

  // Update the date picker default when timezone changes
  useEffect(() => {
    setAddDate(formatInTimeZone(new Date(), userTimezone, 'yyyy-MM-dd'));
  }, [userTimezone]);

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

  const handleSubmitActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!addTypeId) {
      setError('Please select an activity type');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const selectedType = activityTypes.find(t => t.id === addTypeId);

      // Combine date and time in user's timezone, then convert to UTC
      const dateTimeString = `${addDate}T${addTime}`;
      const utcDate = formatInTimeZone(
        new Date(dateTimeString),
        userTimezone,
        "yyyy-MM-dd'T'HH:mm:ss.SSSxxx"
      );

      const response = await fetch(`${API_URL}/api/activities`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          typeId: addTypeId,
          name: selectedType?.name || 'Activity',
          date: new Date(utcDate).toISOString(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add activity');
      }

      // Reset form
      setAddTypeId('');
      setAddDate(formatInTimeZone(new Date(), userTimezone, 'yyyy-MM-dd'));
      setAddTime('12:00');

      // Refresh recommendations
      await fetchRecommendations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add activity');
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
      {/* Add Activity Form */}
      {activityTypes.length > 0 && (
        <form className="add-activity-form" onSubmit={handleSubmitActivity}>
          <select
            value={addTypeId}
            onChange={(e) => setAddTypeId(e.target.value)}
            className="activity-type-select"
            required
          >
            <option value="">Select Activity Type</option>
            {activityTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={addDate}
            onChange={(e) => setAddDate(e.target.value)}
            className="activity-date-input"
            required
          />
          <input
            type="time"
            value={addTime}
            onChange={(e) => setAddTime(e.target.value)}
            className="activity-time-input"
            required
          />
          <button type="submit" className="add-activity-btn">
            Add Activity
          </button>
        </form>
      )}

      {error && <div className="error-message">{error}</div>}

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
