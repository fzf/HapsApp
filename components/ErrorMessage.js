import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Button from './Button';

/**
 * Reusable error message component with optional retry functionality
 */
const ErrorMessage = ({
  error,
  title = 'Something went wrong',
  message,
  showRetry = true,
  onRetry,
  retryText = 'Try Again',
  style,
  titleStyle,
  messageStyle,
  ...props
}) => {
  const displayMessage = message || (typeof error === 'string' ? error : error?.message) || 'An unexpected error occurred.';

  return (
    <View style={[styles.container, style]} {...props}>
      <Text style={[styles.title, titleStyle]}>{title}</Text>
      <Text style={[styles.message, messageStyle]}>{displayMessage}</Text>
      
      {showRetry && onRetry && (
        <Button
          title={retryText}
          onPress={onRetry}
          variant="primary"
          size="sm"
          style={styles.retryButton}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    marginVertical: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#991b1b',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#b91c1c',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#dc2626',
    minWidth: 100,
  },
});

export default ErrorMessage;