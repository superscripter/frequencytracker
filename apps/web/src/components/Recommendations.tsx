import { useState, useEffect } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import { useAuth } from '../context/AuthContext';
import ActivityCard from './ActivityCard';
import { RecommendationsControls } from './RecommendationsControls';
import './Recommendations.css';
import './ActivitiesManager.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Tag {
  id: string;
  name: string;
  color: string | null;
}

interface ActivityType {
  id: string;
  name: string;
  description: string | null;
  desiredFrequency: number;
  icon: string | null;
  tag?: Tag | null;
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
  firstActivityDate: string | null;
}

interface UserPreferences {
  highlightOverdueActivities: boolean;
  showDetailedCardData: boolean;
  showStreakFlame: boolean;
}

export function Recommendations() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [preferences, setPreferences] = useState<UserPreferences>({
    highlightOverdueActivities: false,
    showDetailedCardData: false,
    showStreakFlame: true,
  });
  const [selectedTagId, setSelectedTagId] = useState<string>('all');
  const [selectedTypeId, setSelectedTypeId] = useState<string>('all');
  const { user } = useAuth();

  // Fetch data on mount AND whenever component becomes visible
  useEffect(() => {
    if (user) {
      fetchRecommendations();
      fetchPreferences();
    }
  }, []); // Empty dependency array - run on every mount

  // Also listen for user changes in case of login/logout
  useEffect(() => {
    if (user) {
      fetchRecommendations();
      fetchPreferences();
    }
  }, [user]);

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

  const handleCompletedToday = async (activityTypeId: string) => {
    try {
      const token = localStorage.getItem('token');
      if (!token || !user) return;

      const userTimezone = user.timezone || 'America/New_York';

      // Create a date for today at noon in the user's timezone
      const today = new Date();
      const dateAtNoon = `${formatInTimeZone(today, userTimezone, 'yyyy-MM-dd')}T12:00`;
      const utcDate = formatInTimeZone(
        new Date(dateAtNoon),
        userTimezone,
        "yyyy-MM-dd'T'HH:mm:ss.SSSxxx"
      );

      // Find the activity type name
      const recommendation = recommendations.find(rec => rec.activityType.id === activityTypeId);
      const activityName = recommendation?.activityType.name || 'Activity';

      const response = await fetch(`${API_URL}/api/activities`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          typeId: activityTypeId,
          name: activityName,
          date: new Date(utcDate).toISOString(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add activity');
      }

      // Refresh recommendations after adding activity
      fetchRecommendations();
    } catch (err) {
      console.error('Failed to mark activity as completed:', err);
      setError(err instanceof Error ? err.message : 'Failed to mark activity as completed');
    }
  };


  // Apply filters to recommendations
  const filteredRecommendations = recommendations.filter(rec => {
    // Filter by tag first
    if (selectedTagId !== 'all') {
      if (!rec.activityType.tag || rec.activityType.tag.id !== selectedTagId) {
        return false;
      }
    }

    // Then filter by activity type
    if (selectedTypeId !== 'all') {
      if (rec.activityType.id !== selectedTypeId) {
        return false;
      }
    }

    return true;
  });

  // Filter recommendations for today (all activities with difference > -1)
  const todayRecommendations = filteredRecommendations.filter(rec =>
    rec.difference !== null && rec.difference > -1
  );

  // Filter recommendations for tomorrow (activities with difference > -2 and <= -1)
  const tomorrowRecommendations = filteredRecommendations.filter(rec =>
    rec.difference !== null && rec.difference > -2 && rec.difference <= -1
  );

  // Get IDs of activities shown in today and tomorrow sections
  const shownActivityIds = new Set([
    ...todayRecommendations.map(rec => rec.activityType.id),
    ...tomorrowRecommendations.map(rec => rec.activityType.id)
  ]);

  // Filter recommendations for all other activities (not shown in today or tomorrow)
  const otherRecommendations = filteredRecommendations.filter(rec =>
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
            showStreakFlame={preferences.showStreakFlame}
            onCompletedToday={handleCompletedToday}
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
      {/* Controls Section */}
      <RecommendationsControls
        onActivityAdded={fetchRecommendations}
        preferences={preferences}
        onPreferenceChange={updatePreference}
        selectedTagId={selectedTagId}
        onTagFilterChange={setSelectedTagId}
        selectedTypeId={selectedTypeId}
        onTypeFilterChange={setSelectedTypeId}
      />

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
        </>
      )}
    </div>
  );
}
