import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';

/**
 * Reusable loading spinner component with customizable size and message
 */
const LoadingSpinner = ({ 
  size = 'large', 
  color = '#3b82f6', 
  message = 'Loading...', 
  showMessage = true,
  style,
  textStyle,
  ...props 
}) => {
  return (
    <View style={[styles.container, style]} {...props}>
      <ActivityIndicator size={size} color={color} />
      {showMessage && message && (
        <Text style={[styles.message, textStyle]}>{message}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  message: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
});

export default LoadingSpinner;