import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * Reusable status indicator component for showing connection/sync status
 */
const StatusIndicator = ({
  status = 'unknown',
  title,
  message,
  showDot = true,
  size = 'md',
  style,
  titleStyle,
  messageStyle,
  ...props
}) => {
  const getStatusConfig = (status) => {
    const configs = {
      online: { color: '#16a34a', title: 'Online', message: 'Connected to server' },
      offline: { color: '#dc2626', title: 'Offline', message: 'No internet connection' },
      syncing: { color: '#d97706', title: 'Syncing', message: 'Uploading data...' },
      synced: { color: '#16a34a', title: 'Synced', message: 'Data up to date' },
      error: { color: '#dc2626', title: 'Error', message: 'Sync failed' },
      unknown: { color: '#6b7280', title: 'Unknown', message: 'Status unavailable' },
    };
    
    return configs[status] || configs.unknown;
  };

  const config = getStatusConfig(status);
  const displayTitle = title || config.title;
  const displayMessage = message || config.message;

  return (
    <View style={[styles.container, styles[`size_${size}`], style]} {...props}>
      {showDot && (
        <View
          style={[
            styles.dot,
            styles[`dotSize_${size}`],
            { backgroundColor: config.color }
          ]}
        />
      )}
      
      <View style={styles.textContainer}>
        <Text style={[styles.title, styles[`titleSize_${size}`], { color: config.color }, titleStyle]}>
          {displayTitle}
        </Text>
        {displayMessage && (
          <Text style={[styles.message, styles[`messageSize_${size}`], messageStyle]}>
            {displayMessage}
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
  },
  dot: {
    borderRadius: 50,
  },
  title: {
    fontWeight: '600',
  },
  message: {
    color: '#6b7280',
  },
  
  // Size variants
  size_sm: {
    gap: 6,
  },
  size_md: {
    gap: 8,
  },
  size_lg: {
    gap: 10,
  },
  
  dotSize_sm: {
    width: 6,
    height: 6,
  },
  dotSize_md: {
    width: 8,
    height: 8,
  },
  dotSize_lg: {
    width: 10,
    height: 10,
  },
  
  titleSize_sm: {
    fontSize: 12,
  },
  titleSize_md: {
    fontSize: 14,
  },
  titleSize_lg: {
    fontSize: 16,
  },
  
  messageSize_sm: {
    fontSize: 10,
    marginTop: 1,
  },
  messageSize_md: {
    fontSize: 12,
    marginTop: 2,
  },
  messageSize_lg: {
    fontSize: 14,
    marginTop: 2,
  },
});

export default StatusIndicator;