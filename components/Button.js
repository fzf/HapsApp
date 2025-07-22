import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';

export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  onPress,
  style,
  ...props
}) => {
  const buttonStyle = [
    styles.base,
    styles[`variant_${variant}`],
    styles[`size_${size}`],
    disabled && styles.disabled,
    style
  ];

  const textColor = getTextColor(variant);

  return (
    <TouchableOpacity
      style={buttonStyle}
      onPress={onPress}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'outline' || variant === 'ghost' ? '#2563eb' : '#ffffff'}
        />
      ) : (
        <Text style={[styles.text, { color: textColor }]}>
          {children}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const getTextColor = (variant) => {
  switch (variant) {
    case 'outline':
    case 'ghost':
      return '#2563eb';
    default:
      return '#ffffff';
  }
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  variant_primary: {
    backgroundColor: '#2563eb',
  },
  variant_secondary: {
    backgroundColor: '#4b5563',
  },
  variant_success: {
    backgroundColor: '#16a34a',
  },
  variant_warning: {
    backgroundColor: '#d97706',
  },
  variant_danger: {
    backgroundColor: '#dc2626',
  },
  variant_outline: {
    borderWidth: 2,
    borderColor: '#2563eb',
    backgroundColor: 'transparent',
  },
  variant_ghost: {
    backgroundColor: 'transparent',
  },
  size_sm: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  size_md: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  size_lg: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  size_xl: {
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontWeight: '500',
    fontSize: 14,
  },
});
