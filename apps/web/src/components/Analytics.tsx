import { useState, useEffect } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import * as TablerIcons from '@tabler/icons-react';
import { useAuth } from '../context/AuthContext';
import { AnalyticsControls } from './AnalyticsControls';
import './Analytics.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface AnalyticsData {
  activityType: string;
  icon: string | null;
  desiredFrequency: number;
  totalAvgFrequency: number;
  dateOfFirstActivity: string | null;
  numberOfActivities: number;
  tag: {
    id: string;
    name: string;
    color: string | null;
  } | null;
}

interface StreakData {
  activityType: string;
  icon: string | null;
  longestStreak: number;
  averageFrequency: number;
  streakStart: string | null;
  streakEnd: string | null;
  tag: {
    id: string;
    name: string;
    color: string | null;
  } | null;
}

interface CurrentStreakData {
  activityType: string;
  icon: string | null;
  currentStreak: number;
  averageFrequency: number;
  streakStart: string | null;
  lastActivity: string | null;
  tag: {
    id: string;
    name: string;
    color: string | null;
  } | null;
}

interface ActivityType {
  id: string;
  name: string;
  desiredFrequency: number;
}

interface Tag {
  id: string;
  name: string;
}

interface OffTime {
  id: string;
  tagId: string;
  startDate: string;
  endDate: string;
  tag: {
    id: string;
    name: string;
    activityTypes: Array<{ id: string; name: string }>;
  };
}

interface IntervalDetail {
  startDate: string;
  endDate: string;
  rawDays: number;
  offTimeDays: number;
  totalDays: number;
  offTimePeriods: Array<{
    tagName: string;
    startDate: string;
    endDate: string;
    daysInInterval: number;
  }>;
}

interface BreakdownData {
  activityType: ActivityType;
  lastPerformedDate: string | null;
  daysSinceLastActivity: number | null;
  desiredFrequency: number;
  offTimePeriods: OffTime[];
  daysUntilNext: number | null;
  averageFrequencyLast3: number | null;
  last3Intervals: IntervalDetail[];
  averageFrequencyLast10: number | null;
  last10Intervals: IntervalDetail[];
  currentStreak: number;
}

export function Analytics() {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<AnalyticsData[]>([]);
  const [streaks, setStreaks] = useState<StreakData[]>([]);
  const [currentStreaks, setCurrentStreaks] = useState<CurrentStreakData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);

  // Breakdown section state
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [breakdownTypeId, setBreakdownTypeId] = useState<string>('');
  const [breakdownData, setBreakdownData] = useState<BreakdownData | null>(null);
  const [isLoadingBreakdown, setIsLoadingBreakdown] = useState(false);

  // Filter state
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('all');
  const [selectedTypeId, setSelectedTypeId] = useState<string>('all');

  // Toggle state for Total Averages table
  const [showTotalAverages, setShowTotalAverages] = useState(false);

  // Toggle state for Longest Streaks table
  const [showLongestStreaks, setShowLongestStreaks] = useState(false);

  // Toggle state for Current Streaks table
  const [showCurrentStreaks, setShowCurrentStreaks] = useState(false);

  // Get user timezone or default to Eastern Time
  const userTimezone = user?.timezone || 'America/New_York';

  useEffect(() => {
    fetchAnalytics();
    fetchActivityTypes();
    fetchTags();
  }, []);

  // Fetch breakdown data when selected type changes
  useEffect(() => {
    if (breakdownTypeId) {
      fetchBreakdownData(breakdownTypeId);
    } else {
      setBreakdownData(null);
    }
  }, [breakdownTypeId]);

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
      setCurrentStreaks(data.currentStreaks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchActivityTypes = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/activity-types`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch activity types');
      const data = await response.json();
      setActivityTypes(data);
    } catch (err) {
      console.error('Failed to load activity types:', err);
    }
  };

  const fetchTags = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/tags`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch tags');
      const data = await response.json();
      setTags(data);
    } catch (err) {
      console.error('Failed to load tags:', err);
    }
  };

  const fetchBreakdownData = async (typeId: string) => {
    if (!typeId) {
      setBreakdownData(null);
      return;
    }

    try {
      setIsLoadingBreakdown(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/activity-types/${typeId}/breakdown`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to fetch breakdown data');
      const data = await response.json();
      setBreakdownData(data.breakdown);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load breakdown data');
    } finally {
      setIsLoadingBreakdown(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';

    // Extract just the calendar date (YYYY-MM-DD) from the ISO string
    const datePart = dateString.split('T')[0];
    const [year, month, day] = datePart.split('-');

    // Return in MM/DD/YYYY format
    return `${month}/${day}/${year}`;
  };

  const formatDateTime = (dateString: string) => {
    return formatInTimeZone(
      new Date(dateString),
      userTimezone,
      'MMM d, yyyy h:mm a'
    );
  };

  const renderIcon = (iconName: string | null, color?: string | null) => {
    if (!iconName) return null;
    const IconComponent = (TablerIcons as any)[`Icon${iconName}`];
    return IconComponent ? <IconComponent size={20} stroke={1.5} style={{ color: color || 'currentColor' }} /> : null;
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

  // Get unique tags from analytics data using Map for deduplication
  const tagMap = new Map<string, { id: string; name: string }>();
  analytics.forEach(item => {
    if (item.tag && !tagMap.has(item.tag.id)) {
      tagMap.set(item.tag.id, item.tag);
    }
  });

  // Helper function to filter items by tag and type
  const filterByTagAndType = <T extends { activityType: string; tag: { id: string; name: string; color: string | null } | null }>(
    items: T[]
  ): T[] => {
    return items.filter(item => {
      // Filter by tag first
      if (selectedTagFilter !== 'all') {
        if (selectedTagFilter === 'untagged') {
          if (item.tag !== null) return false;
        } else {
          if (item.tag?.id !== selectedTagFilter) return false;
        }
      }

      // Then filter by activity type
      if (selectedTypeId !== 'all') {
        // Find the activity type that matches this item
        const matchingType = activityTypes.find(type => type.name === item.activityType);
        if (!matchingType || matchingType.id !== selectedTypeId) return false;
      }

      return true;
    });
  };

  // Filter all data using the helper function
  const filteredAnalytics = filterByTagAndType(analytics);
  const filteredStreaks = filterByTagAndType(streaks);
  const filteredCurrentStreaks = filterByTagAndType(currentStreaks);

  return (
    <div className="analytics-container">
      {/* Controls Section */}
      <AnalyticsControls
        onActivityAdded={fetchAnalytics}
        selectedTagFilter={selectedTagFilter}
        onTagFilterChange={setSelectedTagFilter}
        selectedTypeId={selectedTypeId}
        onTypeFilterChange={setSelectedTypeId}
        tags={tags}
      />

      <details className="analytics-details" open={showTotalAverages}>
        <summary
          className="analytics-summary"
          onClick={(e) => {
            e.preventDefault();
            setShowTotalAverages(!showTotalAverages);
          }}
        >
          Total Averages
        </summary>

        {analytics.length === 0 ? (
          <div className="analytics-empty">
            <p>No activity types yet. Create some activity types in the Activities tab!</p>
          </div>
        ) : (
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
                {filteredAnalytics.map((item, index) => (
                  <tr key={index}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {renderIcon(item.icon, item.tag?.color)}
                        <strong>{item.activityType}</strong>
                      </div>
                    </td>
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
        )}
      </details>

      <details className="analytics-details" open={showLongestStreaks}>
        <summary
          className="analytics-summary"
          onClick={(e) => {
            e.preventDefault();
            setShowLongestStreaks(!showLongestStreaks);
          }}
        >
          Longest Streaks
        </summary>

        {filteredStreaks.length === 0 ? (
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
                  <th>Avg Frequency</th>
                  <th>Streak Period</th>
                </tr>
              </thead>
              <tbody>
                {filteredStreaks.map((item, index) => (
                  <tr key={index}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {renderIcon(item.icon, item.tag?.color)}
                        <strong>{item.activityType}</strong>
                      </div>
                    </td>
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
        )}
      </details>

      <details className="analytics-details" open={showCurrentStreaks}>
        <summary
          className="analytics-summary"
          onClick={(e) => {
            e.preventDefault();
            setShowCurrentStreaks(!showCurrentStreaks);
          }}
        >
          Current Streaks
        </summary>

        {filteredCurrentStreaks.length === 0 ? (
          <div className="analytics-empty">
            <p>No current streaks. Start doing activities regularly to build a streak!</p>
          </div>
        ) : (
          <div className="analytics-table-wrapper">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Activity Type</th>
                  <th>Streak</th>
                  <th>Avg Frequency</th>
                  <th>Streak Period</th>
                </tr>
              </thead>
              <tbody>
                {filteredCurrentStreaks.map((item, index) => {
                  // Check if this is a perfect streak by comparing with analytics data
                  const matchingAnalytic = analytics.find(a => a.activityType === item.activityType);
                  const isPerfect = matchingAnalytic &&
                    item.streakStart === matchingAnalytic.dateOfFirstActivity;

                  return (
                    <tr key={index}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{
                            color: isPerfect ? 'var(--color-primary-gold)' : '#c0c0c0',
                            display: 'flex',
                            alignItems: 'center'
                          }}>
                            <TablerIcons.IconFlame size={20} stroke={1.5} />
                          </div>
                          {renderIcon(item.icon, item.tag?.color)}
                          <strong>{item.activityType}</strong>
                        </div>
                      </td>
                      <td>
                        <span style={{
                          color: isPerfect ? 'var(--color-primary-gold)' : 'var(--color-aurora-green)',
                          fontWeight: 600
                        }}>
                          {item.currentStreak > 0 ? `${item.currentStreak} days` : 'N/A'}
                        </span>
                      </td>
                      <td>{item.averageFrequency > 0 ? item.averageFrequency.toFixed(1) : 'N/A'}</td>
                      <td>
                        {item.streakStart && item.lastActivity
                          ? `${formatDate(item.streakStart)} - ${formatDate(item.lastActivity)}`
                          : 'N/A'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </details>

      <h2>Breakdown</h2>

      {/* Breakdown Section */}
      <div className="breakdown-section">
        <div className="breakdown-header">
          <select
            value={breakdownTypeId}
            onChange={(e) => setBreakdownTypeId(e.target.value)}
            className="breakdown-type-select"
          >
            <option value="">Select Activity Type</option>
            {activityTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </div>

        {isLoadingBreakdown && (
          <div className="breakdown-loading">Loading breakdown data...</div>
        )}

        {breakdownData && !isLoadingBreakdown && (
          <div className="breakdown-content">
            <div className="breakdown-subsection">
              <h4>Next Recommendation</h4>
              <div className="breakdown-details">
                <div className="breakdown-item">
                  <span className="breakdown-label">Most Recent Activity:</span>
                  <span className="breakdown-value">
                    {breakdownData.lastPerformedDate
                      ? formatDateTime(breakdownData.lastPerformedDate)
                      : 'No activities recorded'}
                  </span>
                </div>
                <div className="breakdown-item">
                  <span className="breakdown-label">Days Since Last Activity:</span>
                  <span className="breakdown-value">
                    {breakdownData.daysSinceLastActivity !== null
                      ? `${breakdownData.daysSinceLastActivity} days`
                      : 'N/A'}
                  </span>
                </div>
                <div className="breakdown-item">
                  <span className="breakdown-label">Desired Frequency:</span>
                  <span className="breakdown-value">
                    Every {breakdownData.desiredFrequency} days
                  </span>
                </div>
                {breakdownData.offTimePeriods.length > 0 && (
                  <div className="breakdown-item">
                    <span className="breakdown-label">Off Time Periods:</span>
                    <div className="breakdown-value">
                      {breakdownData.offTimePeriods.map((offTime) => (
                        <div key={offTime.id} className="off-time-period">
                          {offTime.tag.name}: {formatDate(offTime.startDate)} - {formatDate(offTime.endDate)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="breakdown-item">
                  <span className="breakdown-label">Recommended Next Activity:</span>
                  <span className="breakdown-value">
                    {breakdownData.daysUntilNext !== null
                      ? breakdownData.daysUntilNext < 0
                        ? `Overdue by ${Math.abs(breakdownData.daysUntilNext)} days`
                        : breakdownData.daysUntilNext === 0
                        ? 'Due today'
                        : `In ${breakdownData.daysUntilNext} days`
                      : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            <div className="breakdown-subsection">
              <h4>Last 3 Average</h4>
              {breakdownData.averageFrequencyLast3 !== null ? (
                <>
                  <div className="breakdown-summary">
                    <strong>Average: {breakdownData.averageFrequencyLast3} days</strong>
                  </div>
                  <div className="interval-details">
                    {breakdownData.last3Intervals.map((interval, idx) => (
                      <div key={idx} className="interval-item">
                        <div className="interval-header">
                          <span className="interval-number">Interval {idx + 1}:</span>
                          <span className="interval-dates">
                            {formatDateTime(interval.endDate)} → {formatDateTime(interval.startDate)}
                          </span>
                        </div>
                        <div className="interval-calculations">
                          <div className="calc-row">
                            <span className="calc-label">Raw Days:</span>
                            <span className="calc-value">{interval.rawDays} days</span>
                          </div>
                          {interval.offTimePeriods.length > 0 && (
                            <>
                              <div className="calc-row">
                                <span className="calc-label">Off-Time Periods:</span>
                                <div className="calc-value">
                                  {interval.offTimePeriods.map((offTime, offIdx) => (
                                    <div key={offIdx} className="off-time-detail">
                                      {offTime.tagName}: {formatDate(offTime.startDate)} - {formatDate(offTime.endDate)} ({offTime.daysInInterval} days)
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="calc-row">
                                <span className="calc-label">Total Off-Time Days:</span>
                                <span className="calc-value">-{interval.offTimeDays} days</span>
                              </div>
                            </>
                          )}
                          <div className="calc-row total-row">
                            <span className="calc-label">Total Duration:</span>
                            <span className="calc-value"><strong>{interval.totalDays} days</strong></span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="breakdown-value">Not enough data (need at least 4 activities)</div>
              )}
            </div>

            <div className="breakdown-subsection">
              <h4>Last 10 Average</h4>
              {breakdownData.averageFrequencyLast10 !== null ? (
                <>
                  <div className="breakdown-summary">
                    <strong>Average: {breakdownData.averageFrequencyLast10} days</strong>
                  </div>
                  <div className="interval-details">
                    {breakdownData.last10Intervals.map((interval, idx) => (
                      <div key={idx} className="interval-item">
                        <div className="interval-header">
                          <span className="interval-number">Interval {idx + 1}:</span>
                          <span className="interval-dates">
                            {formatDateTime(interval.endDate)} → {formatDateTime(interval.startDate)}
                          </span>
                        </div>
                        <div className="interval-calculations">
                          <div className="calc-row">
                            <span className="calc-label">Raw Days:</span>
                            <span className="calc-value">{interval.rawDays} days</span>
                          </div>
                          {interval.offTimePeriods.length > 0 && (
                            <>
                              <div className="calc-row">
                                <span className="calc-label">Off-Time Periods:</span>
                                <div className="calc-value">
                                  {interval.offTimePeriods.map((offTime, offIdx) => (
                                    <div key={offIdx} className="off-time-detail">
                                      {offTime.tagName}: {formatDate(offTime.startDate)} - {formatDate(offTime.endDate)} ({offTime.daysInInterval} days)
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="calc-row">
                                <span className="calc-label">Total Off-Time Days:</span>
                                <span className="calc-value">-{interval.offTimeDays} days</span>
                              </div>
                            </>
                          )}
                          <div className="calc-row total-row">
                            <span className="calc-label">Total Duration:</span>
                            <span className="calc-value"><strong>{interval.totalDays} days</strong></span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="breakdown-value">Not enough data (need at least 11 activities)</div>
              )}
            </div>

            <div className="breakdown-subsection">
              <h4>Current Streak</h4>
              <div className="breakdown-value">
                {breakdownData.currentStreak > 0
                  ? `${breakdownData.currentStreak} days`
                  : 'No active streak'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
