import { useState } from 'react';
import * as TablerIcons from '@tabler/icons-react';
import './IconPicker.css';

interface IconPickerProps {
  selectedIcon: string;
  onSelectIcon: (iconName: string) => void;
  onClose: () => void;
}

export function IconPicker({ selectedIcon, onSelectIcon, onClose }: IconPickerProps) {
  const [searchTerm, setSearchTerm] = useState('');

  // Curated list of activity-related icons (Tabler Icons)
  const iconCategories = {
    sports: [
      'Run', 'Bike', 'Swimming', 'Yoga', 'Stretching', 'Stretching2', 'Gymnastics',
      'BallBasketball', 'PlayBasketball', 'BallFootball', 'PlayFootball',
      'BallVolleyball', 'PlayVolleyball', 'BallTennis', 'BallBaseball',
      'BallBowling', 'Bowling', 'Golf', 'Karate', 'IceSkating', 'Skateboarding', 'Skateboard',
      'Medal', 'Medal2', 'Trophy', 'Target', 'Barbell', 'Weight',
      'Heartbeat', 'Walk', 'PlayHandball', 'SportBillard', 'DiscGolf'
    ],
    wellness: [
      'Heart', 'Heartbeat', 'Mood', 'MoodSmile', 'Coffee', 'Apple',
      'Salad', 'Pill', 'Stethoscope', 'Brain', 'Zzz', 'Sun', 'Moon',
      'Droplet', 'Leaf', 'Sparkles'
    ],
    creative: [
      'Brush', 'Paint', 'Palette', 'Camera', 'Music', 'Microphone',
      'Video', 'Movie', 'Photo', 'Pencil', 'Edit', 'Writing', 'Book',
      'Ballpen'
    ],
    crafts: [
      'Hammer', 'Tool', 'Axe', 'Saw', 'Chisel', 'Fence', 'Garden',
      'Shovel', 'Rake', 'Scissors', 'Ruler', 'Box'
    ],
    learning: [
      'Book', 'Books', 'School', 'Certificate', 'Bulb', 'Brain',
      'Glasses', 'News', 'Bookmark', 'Chess', 'Microscope', 'Flask'
    ],
    social: [
      'Users', 'Message', 'Phone', 'Mail', 'Friends', 'PartyPopper',
      'Confetti', 'Cake', 'Gift', 'Baby', 'Dog', 'Cat', 'Paw'
    ],
    outdoor: [
      'Mountain', 'Trees', 'Tree', 'Tent', 'Compass', 'Map', 'MapPin',
      'Cloud', 'CloudRain', 'CloudSnow', 'Sunset', 'Sunrise',
      'Beach', 'Campfire'
    ],
    other: [
      'Star', 'TrendingUp', 'Calendar', 'Clock', 'Home', 'Briefcase',
      'ShoppingCart', 'Car', 'Plane', 'Train', 'Bus', 'Ship', 'Rocket',
      'DeviceGamepad2', 'Puzzle', 'Dice'
    ]
  };

  // Flatten icons for searching and remove duplicates
  // Filter out reserved icons (Flame is reserved for streaks)
  const allIcons = [...new Set(Object.values(iconCategories).flat())].filter(icon => icon !== 'Flame');

  const filteredIcons = searchTerm
    ? allIcons.filter(icon => icon.toLowerCase().includes(searchTerm.toLowerCase()))
    : allIcons;

  const handleIconClick = (iconName: string) => {
    onSelectIcon(iconName);
    onClose();
  };

  const renderIcon = (iconName: string) => {
    const IconComponent = (TablerIcons as any)[`Icon${iconName}`];
    return IconComponent ? <IconComponent size={24} stroke={1.5} /> : null;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content icon-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="icon-picker-header">
          <h2>Select Icon</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <input
          type="text"
          className="icon-search"
          placeholder="Search icons..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          autoFocus
        />

        <div className="icon-grid">
          {filteredIcons.map((iconName) => (
            <button
              key={iconName}
              className={`icon-option ${iconName === selectedIcon ? 'selected' : ''}`}
              onClick={() => handleIconClick(iconName)}
              title={iconName}
            >
              {renderIcon(iconName)}
              <span className="icon-name">{iconName}</span>
            </button>
          ))}
        </div>

        {filteredIcons.length === 0 && (
          <p className="no-icons">No icons found</p>
        )}
      </div>
    </div>
  );
}
