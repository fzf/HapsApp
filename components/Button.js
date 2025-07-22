import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator } from 'react-native';

export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  onPress,
  className = '',
  ...props
}) => {
  const baseClasses = 'flex-row items-center justify-center rounded-lg font-medium transition-colors';

  const variants = {
    primary: 'bg-primary-600 active:bg-primary-700',
    secondary: 'bg-gray-600 active:bg-gray-700',
    success: 'bg-success-600 active:bg-success-700',
    warning: 'bg-warning-600 active:bg-warning-700',
    danger: 'bg-danger-600 active:bg-danger-700',
    outline: 'border-2 border-primary-600 bg-transparent active:bg-primary-50',
    ghost: 'bg-transparent active:bg-gray-100',
  };

  const sizes = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-5 py-3 text-base',
    xl: 'px-6 py-3.5 text-base',
  };

  const textColors = {
    primary: 'text-white',
    secondary: 'text-white',
    success: 'text-white',
    warning: 'text-white',
    danger: 'text-white',
    outline: 'text-primary-600',
    ghost: 'text-gray-900',
  };

  const disabledClasses = disabled ? 'opacity-50' : '';

  return (
    <TouchableOpacity
      className={`${baseClasses} ${variants[variant]} ${sizes[size]} ${disabledClasses} ${className}`}
      onPress={onPress}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'outline' || variant === 'ghost' ? '#2563eb' : '#ffffff'} />
      ) : (
        <Text className={`${textColors[variant]} font-medium`}>
          {children}
        </Text>
      )}
    </TouchableOpacity>
  );
};
