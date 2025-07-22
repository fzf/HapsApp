import React from 'react';
import { View, Text } from 'react-native';

export const Alert = ({
  children,
  variant = 'info',
  className = '',
  ...props
}) => {
  const variants = {
    info: 'bg-primary-50 border-primary-200 text-primary-800',
    success: 'bg-success-50 border-success-200 text-success-800',
    warning: 'bg-warning-50 border-warning-200 text-warning-800',
    danger: 'bg-danger-50 border-danger-200 text-danger-800',
  };

  return (
    <View
      className={`border rounded-lg p-4 ${variants[variant]} ${className}`}
      {...props}
    >
      <Text className={variants[variant].split(' ')[2]}>
        {children}
      </Text>
    </View>
  );
};
