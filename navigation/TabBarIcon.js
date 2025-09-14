import React from 'react';
import { Text } from 'react-native';

/**
 * Tab bar icon component with emoji fallbacks
 * Can be easily extended to use actual icon libraries like react-native-vector-icons
 */
const TabBarIcon = ({ name, color, size, focused }) => {
  const getIcon = (iconName) => {
    const iconMap = {
      home: '🏠',
      map: '🗺️',
      timeline: '📋',
      debug: '💓',
      settings: '⚙️',
      profile: '👤',
      search: '🔍',
      notifications: '🔔',
    };
    
    return iconMap[iconName] || '❓';
  };

  const icon = getIcon(name);
  
  return (
    <Text 
      style={{ 
        color, 
        fontSize: size,
        // Add slight scale for focused state
        transform: [{ scale: focused ? 1.1 : 1.0 }],
      }}
    >
      {icon}
    </Text>
  );
};

export default TabBarIcon;