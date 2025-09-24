import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Button from './Button';

/**
 * Reusable empty state component for when lists or data are empty
 */
const EmptyState = ({
  title = 'No data available',
  message = 'There\'s nothing to show here yet.',
  icon,
  actionText,
  onAction,
  style,
  titleStyle,
  messageStyle,
  children,
  ...props
}) => {
  return (
    <View style={[styles.container, style]} {...props}>
      {icon && (
        <View style={styles.iconContainer}>
          {typeof icon === 'string' ? (
            <Text style={styles.iconEmoji}>{icon}</Text>
          ) : (
            icon
          )}
        </View>
      )}
      
      <Text style={[styles.title, titleStyle]}>{title}</Text>
      <Text style={[styles.message, messageStyle]}>{message}</Text>
      
      {children}
      
      {actionText && onAction && (
        <Button
          title={actionText}
          onPress={onAction}
          variant="primary"
          size="md"
          style={styles.actionButton}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  iconContainer: {
    marginBottom: 16,
  },
  iconEmoji: {
    fontSize: 48,
    textAlign: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#374151',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  actionButton: {
    minWidth: 120,
  },
});

export default EmptyState;