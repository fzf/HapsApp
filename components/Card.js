import React from 'react';
import { View, Text } from 'react-native';

export const Card = ({ children, className = '', ...props }) => {
  return (
    <View
      className={`bg-white rounded-lg shadow-md border border-gray-200 p-6 ${className}`}
      {...props}
    >
      {children}
    </View>
  );
};

export const CardHeader = ({ children, className = '' }) => {
  return (
    <View className={`mb-4 pb-3 border-b border-gray-200 ${className}`}>
      {children}
    </View>
  );
};

export const CardTitle = ({ children, className = '' }) => {
  return (
    <Text className={`text-xl font-semibold text-gray-900 ${className}`}>
      {children}
    </Text>
  );
};

export const CardContent = ({ children, className = '' }) => {
  return (
    <View className={`${className}`}>
      {children}
    </View>
  );
};
