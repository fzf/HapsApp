import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const Alert = ({
  children,
  variant = 'info',
  style,
  ...props
}) => {
  const alertStyle = [
    styles.base,
    styles[`variant_${variant}`],
    style
  ];

  const textColor = getTextColor(variant);

  return (
    <View style={alertStyle} {...props}>
      <Text style={[styles.text, { color: textColor }]}>
        {children}
      </Text>
    </View>
  );
};

const getTextColor = (variant) => {
  switch (variant) {
    case 'info':
      return '#1e40af';
    case 'success':
      return '#15803d';
    case 'warning':
      return '#a16207';
    case 'danger':
      return '#b91c1c';
    default:
      return '#1e40af';
  }
};

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
  },
  variant_info: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  variant_success: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  variant_warning: {
    backgroundColor: '#fffbeb',
    borderColor: '#fef3c7',
  },
  variant_danger: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  text: {
    fontSize: 14,
  },
});
