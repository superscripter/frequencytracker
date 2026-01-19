import { useState, useEffect, useRef } from 'react';
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  isSameMonth,
  startOfWeek,
  endOfWeek,
  setMonth,
  setYear,
  getMonth,
  getYear,
} from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { IconChevronRight } from '@tabler/icons-react';
import * as TablerIcons from '@tabler/icons-react';
import { useAuth } from '../context/AuthContext';
import './CalendarView.css';

interface Activity {
  id: string;
  name: string;
  date: string;
  type: {
    id: string;
    name: string;
    icon?: string;
  };
}

interface ActivityType {
  id: string;
  name: string;
  icon?: string;
  tag?: {
    id: string;
    name: string;
    color: string | null;
  } | null;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface CalendarViewProps {
  selectedTypeId: string;
  selectedTagId: string;
}

export function CalendarView({ selectedTypeId, selectedTagId }: CalendarViewProps) {
  const { user } = useAuth();
  const userTimezone = user?.timezone || 'America/New_York';

  const [currentDate, setCurrentDate] = useState(() => {
    return toZonedTime(new Date(), userTimezone);
  });

  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: 'activity' | 'day';
    activityId?: string;
    date?: string;
  } | null>(null);
  const [showSubmenu, setShowSubmenu] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMonthData();
  }, [currentDate, selectedTypeId, selectedTagId]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(event.target as Node) &&
        (!submenuRef.current || !submenuRef.current.contains(event.target as Node))
      ) {
        setContextMenu(null);
        setShowSubmenu(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showSubmenu) {
          setShowSubmenu(false);
        } else {
          setContextMenu(null);
        }
      }
    };

    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [contextMenu, showSubmenu]);

  const fetchMonthData = async () => {
    setIsLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');

      // Fetch activities for the entire month (no pagination)
      const params = new URLSearchParams({ limit: '1000' });
      if (selectedTypeId !== 'all') {
        params.append('typeId', selectedTypeId);
      }

      const response = await fetch(
        `${API_URL}/api/activities?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) throw new Error('Failed to fetch activities');
      const data = await response.json();

      // Show all fetched activities (including those in previous/next month that appear on calendar)
      setActivities(data.activities);

      // Fetch activity types for icon rendering
      const typesResponse = await fetch(`${API_URL}/api/activity-types`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (typesResponse.ok) {
        const typesData = await typesResponse.json();
        setActivityTypes(typesData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load calendar');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMonth = parseInt(e.target.value);
    setCurrentDate(setMonth(currentDate, newMonth));
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newYear = parseInt(e.target.value);
    setCurrentDate(setYear(currentDate, newYear));
  };

  // Generate year options (current year and past 50 years, most recent first)
  const currentYear = getYear(new Date());
  const yearOptions = Array.from({ length: 51 }, (_, i) => currentYear - i);

  const handleActivityRightClick = (e: React.MouseEvent, activityId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      type: 'activity',
      activityId,
    });
  };

  const handleDayRightClick = (e: React.MouseEvent, dateKey: string) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      type: 'day',
      date: dateKey,
    });
  };

  const handleDeleteActivity = async () => {
    if (!contextMenu || contextMenu.type !== 'activity' || !contextMenu.activityId) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/activities/${contextMenu.activityId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to delete activity');

      // Refresh the calendar data
      await fetchMonthData();
      setContextMenu(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete activity');
    }
  };

  const handleAddActivity = async (typeId: string) => {
    if (!contextMenu || contextMenu.type !== 'day' || !contextMenu.date) return;

    try {
      const token = localStorage.getItem('token');

      // Find the activity type to get its name
      const activityType = activityTypes.find(t => t.id === typeId);
      if (!activityType) {
        setError('Activity type not found');
        return;
      }

      // Create a datetime for the selected date at noon in the user's timezone
      // Parse the date string (yyyy-MM-dd) and create a date at noon in user's timezone
      const [year, month, day] = contextMenu.date.split('-').map(Number);
      const selectedDate = new Date(year, month - 1, day, 12, 0, 0, 0);

      const response = await fetch(`${API_URL}/api/activities`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          typeId,
          name: activityType.name,
          date: selectedDate.toISOString(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.isOffTime) {
          throw new Error('Cannot add activity during off-time period');
        }
        throw new Error('Failed to add activity');
      }

      // Refresh the calendar data
      await fetchMonthData();
      setContextMenu(null);
      setShowSubmenu(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add activity');
    }
  };

  // Generate calendar grid (7 columns x 5-6 rows)
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);

  const calendarDays = eachDayOfInterval({
    start: calendarStart,
    end: calendarEnd,
  });

  // Filter activities by tag if needed
  const filteredActivities = selectedTagId === 'all'
    ? activities
    : activities.filter(activity => {
        const activityType = activityTypes.find(t => t.id === activity.type.id);
        return activityType?.tag?.id === selectedTagId;
      });

  // Group activities by date
  const activitiesByDate: Record<string, Activity[]> = {};
  filteredActivities.forEach((activity) => {
    const activityDate = toZonedTime(new Date(activity.date), userTimezone);
    const dateKey = format(activityDate, 'yyyy-MM-dd');
    if (!activitiesByDate[dateKey]) {
      activitiesByDate[dateKey] = [];
    }
    activitiesByDate[dateKey].push(activity);
  });

  const renderIcon = (iconName?: string, color?: string | null) => {
    if (!iconName) iconName = 'Run';
    const IconComponent = (TablerIcons as any)[`Icon${iconName}`];
    // Fallback to Run icon if the icon doesn't exist
    const FallbackIcon = IconComponent || (TablerIcons as any)['IconRun'];
    return FallbackIcon ? <FallbackIcon size={40} stroke={1.5} style={{ color: color || 'currentColor' }} /> : null;
  };

  if (isLoading) {
    return <div className="calendar-loading">Loading calendar...</div>;
  }

  return (
    <div className="calendar-view">
      <div className="calendar-header">
        <div className="calendar-selectors">
          <select
            className="month-select"
            value={getMonth(currentDate)}
            onChange={handleMonthChange}
          >
            <option value={0}>January</option>
            <option value={1}>February</option>
            <option value={2}>March</option>
            <option value={3}>April</option>
            <option value={4}>May</option>
            <option value={5}>June</option>
            <option value={6}>July</option>
            <option value={7}>August</option>
            <option value={8}>September</option>
            <option value={9}>October</option>
            <option value={10}>November</option>
            <option value={11}>December</option>
          </select>
          <select
            className="year-select"
            value={getYear(currentDate)}
            onChange={handleYearChange}
            size={1}
          >
            {yearOptions.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="calendar-grid">
        {/* Day headers */}
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day} className="calendar-day-header">
            {day}
          </div>
        ))}

        {/* Calendar days */}
        {calendarDays.map((day) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const dayActivities = activitiesByDate[dateKey] || [];
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isToday = format(toZonedTime(new Date(), userTimezone), 'yyyy-MM-dd') === dateKey;

          return (
            <div
              key={dateKey}
              className={`calendar-day ${!isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}`}
              onContextMenu={(e) => handleDayRightClick(e, dateKey)}
            >
              <div className="day-number">{format(day, 'd')}</div>

              <div className="day-activities">
                {dayActivities.slice(0, 6).map((activity) => {
                  // Find the activity type to get the tag color
                  const activityType = activityTypes.find(t => t.id === activity.type.id);
                  const tagColor = activityType?.tag?.color;

                  return (
                    <div
                      key={activity.id}
                      className="activity-icon"
                      title={`${activity.type.name} - ${format(toZonedTime(new Date(activity.date), userTimezone), 'h:mm a')}`}
                      onContextMenu={(e) => handleActivityRightClick(e, activity.id)}
                    >
                      {renderIcon(activity.type.icon, tagColor)}
                    </div>
                  );
                })}
                {dayActivities.length > 6 && (
                  <div className="activity-overflow" title={`${dayActivities.length - 6} more activities`}>
                    +{dayActivities.length - 6}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="context-menu"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
        >
          {contextMenu.type === 'activity' && (
            <button className="context-menu-item delete" onClick={handleDeleteActivity}>
              Delete Activity
            </button>
          )}
          {contextMenu.type === 'day' && (
            <div
              className="context-menu-item with-submenu"
              onMouseEnter={() => setShowSubmenu(true)}
              onMouseLeave={() => setShowSubmenu(false)}
            >
              <span>Add Activity</span>
              <IconChevronRight size={16} stroke={1.5} />

              {/* Submenu */}
              {showSubmenu && (
                <div ref={submenuRef} className="context-submenu">
                  {activityTypes.length === 0 ? (
                    <div className="context-menu-item disabled">
                      No activity types available
                    </div>
                  ) : (
                    activityTypes
                      .filter(type => selectedTagId === 'all' || type.tag?.id === selectedTagId)
                      .map((type) => (
                        <button
                          key={type.id}
                          className="context-menu-item"
                          onClick={() => handleAddActivity(type.id)}
                        >
                          <span className="submenu-icon">
                            {renderIcon(type.icon, type.tag?.color)}
                          </span>
                          <span>{type.name}</span>
                        </button>
                      ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
