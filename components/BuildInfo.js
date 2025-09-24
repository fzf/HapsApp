import React, { useState } from 'react';
import { Text, View, StyleSheet, TouchableOpacity } from 'react-native';
import Card, { CardHeader, CardTitle, CardContent } from './Card';
import Badge from './Badge';

// Import build info if available
let buildInfo = null;
try {
  buildInfo = require('../build-info.json');
} catch (error) {
  // Build info not available (development mode or build hasn't run)
}

// Get environment variables (these are available at runtime)
const getEnvBuildInfo = () => ({
  git: {
    ref: process.env.EXPO_PUBLIC_GIT_REF,
    shortRef: process.env.EXPO_PUBLIC_GIT_SHORT_REF,
    branch: process.env.EXPO_PUBLIC_GIT_BRANCH,
    tag: process.env.EXPO_PUBLIC_GIT_TAG,
    commitMessage: process.env.EXPO_PUBLIC_GIT_COMMIT_MESSAGE,
    commitAuthor: process.env.EXPO_PUBLIC_GIT_COMMIT_AUTHOR,
    commitDate: process.env.EXPO_PUBLIC_GIT_COMMIT_DATE,
    isDirty: process.env.EXPO_PUBLIC_GIT_IS_DIRTY === 'true',
    buildTime: process.env.EXPO_PUBLIC_BUILD_TIME
  },
  version: process.env.EXPO_PUBLIC_APP_VERSION,
  buildNumber: process.env.EXPO_PUBLIC_BUILD_NUMBER
});

export function BuildInfo({ style }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Use environment variables if available, fallback to build info file, then defaults
  const envInfo = getEnvBuildInfo();
  const info = envInfo.git.ref ? envInfo : buildInfo;

  if (!info || !info.git.ref || info.git.ref === 'unknown') {
    // Fallback for development or when git info is not available
    return (
      <View style={[styles.container, style]}>
        <Text style={styles.fallbackText}>
          Haps Tracker v1.0.0 • Development Mode
        </Text>
      </View>
    );
  }

  const { git, version, buildNumber } = info;

  return (
    <Card style={[styles.container, style]}>
      <TouchableOpacity onPress={() => setIsExpanded(!isExpanded)}>
        <CardHeader>
          <View style={styles.headerRow}>
            <CardTitle>Build Information</CardTitle>
            <View style={styles.headerBadges}>
              <Badge variant="secondary">
                {git.shortRef}
              </Badge>
              {git.tag && (
                <Badge variant="success">
                  {git.tag}
                </Badge>
              )}
              {git.isDirty && (
                <Badge variant="warning">
                  Dirty
                </Badge>
              )}
            </View>
          </View>
        </CardHeader>
      </TouchableOpacity>

      {isExpanded && (
        <CardContent>
          <View style={styles.infoGrid}>
            <View style={styles.infoRow}>
              <Text style={styles.label}>App Version</Text>
              <Text style={styles.value}>{version || '1.0.0'}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>Build Number</Text>
              <Text style={styles.value}>{buildNumber || 'N/A'}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>Git Branch</Text>
              <Text style={styles.value}>{git.branch}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>Commit Hash</Text>
              <Text style={[styles.value, styles.monospace]}>{git.shortRef}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.label}>Full Hash</Text>
              <Text style={[styles.value, styles.monospace, styles.fullHash]} numberOfLines={1}>
                {git.ref}
              </Text>
            </View>

            {git.commitMessage && (
              <View style={styles.infoRow}>
                <Text style={styles.label}>Last Commit</Text>
                <Text style={styles.value} numberOfLines={2}>
                  {git.commitMessage}
                </Text>
              </View>
            )}

            {git.commitAuthor && (
              <View style={styles.infoRow}>
                <Text style={styles.label}>Author</Text>
                <Text style={styles.value}>{git.commitAuthor}</Text>
              </View>
            )}

            {git.commitDate && (
              <View style={styles.infoRow}>
                <Text style={styles.label}>Commit Date</Text>
                <Text style={styles.value}>
                  {new Date(git.commitDate).toLocaleDateString()}
                </Text>
              </View>
            )}

            {git.buildTime && (
              <View style={styles.infoRow}>
                <Text style={styles.label}>Build Time</Text>
                <Text style={styles.value}>
                  {new Date(git.buildTime).toLocaleString()}
                </Text>
              </View>
            )}
          </View>
        </CardContent>
      )}

      {!isExpanded && (
        <CardContent>
          <Text style={styles.summaryText}>
            v{version || '1.0.0'} • {git.branch}@{git.shortRef}
            {git.tag && ` • ${git.tag}`}
          </Text>
          <Text style={styles.tapToExpand}>Tap to expand details</Text>
        </CardContent>
      )}
    </Card>
  );
}

export function BuildInfoFooter({ style }) {
  // Simple footer version for minimal display
  const envInfo = getEnvBuildInfo();
  const info = envInfo.git.ref ? envInfo : buildInfo;

  if (!info || !info.git.ref || info.git.ref === 'unknown') {
    return (
      <Text style={[styles.footerText, style]}>
        Haps Location Tracker v1.0.0
      </Text>
    );
  }

  const { git, version } = info;

  return (
    <View style={style}>
      <Text style={styles.footerText}>
        Haps Location Tracker v{version || '1.0.0'}
      </Text>
      <Text style={styles.footerSubtext}>
        {git.branch}@{git.shortRef} • Built {git.buildTime ? new Date(git.buildTime).toLocaleDateString() : 'Unknown'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  fallbackText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#9ca3af',
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBadges: {
    flexDirection: 'row',
    gap: 4,
  },
  infoGrid: {
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 2,
  },
  label: {
    fontSize: 14,
    color: '#6b7280',
    flex: 1,
  },
  value: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  monospace: {
    fontFamily: 'monospace',
    fontSize: 12,
  },
  fullHash: {
    fontSize: 11,
  },
  summaryText: {
    fontSize: 14,
    color: '#374151',
    textAlign: 'center',
    marginBottom: 4,
  },
  tapToExpand: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  footerText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#9ca3af',
  },
  footerSubtext: {
    textAlign: 'center',
    fontSize: 12,
    color: '#d1d5db',
    marginTop: 4,
  },
});

export default BuildInfo;
