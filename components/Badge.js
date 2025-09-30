import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const Badge = ({
  children,
  variant = 'primary',
  size = 'md',
  style,
  ...props
}) => {
  const badgeStyle = [
    styles.base,
    styles[`variant_${variant}`],
    styles[`size_${size}`],
    style
  ];

  const textColor = getTextColor(variant);

  return (
    <View style={badgeStyle} {...props}>
      <Text style={[styles.text, { color: textColor }]}>
        {children}
      </Text>
    </View>
  );
};

const getTextColor = (variant) => {
  switch (variant) {
    case 'primary':
      return '#1e40af';
    case 'success':
      return '#15803d';
    case 'warning':
      return '#a16207';
    case 'danger':
      return '#b91c1c';
    case 'info':
      return '#0369a1';
    case 'gray':
      return '#374151';
    case 'dark':
      return '#f3f4f6';
    default:
      return '#1e40af';
  }
};

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    fontWeight: '500',
  },
  variant_primary: {
    backgroundColor: '#dbeafe',
  },
  variant_success: {
    backgroundColor: '#dcfce7',
  },
  variant_warning: {
    backgroundColor: '#fef3c7',
  },
  variant_danger: {
    backgroundColor: '#fee2e2',
  },
  variant_info: {
    backgroundColor: '#dbeafe',
  },
  variant_gray: {
    backgroundColor: '#f3f4f6',
  },
  variant_dark: {
    backgroundColor: '#1f2937',
  },
  size_sm: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  size_md: {
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  size_lg: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  text: {
    fontWeight: '500',
    fontSize: 12,
  },
});

export default Badge;
