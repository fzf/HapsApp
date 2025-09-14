import React from 'react';
import { SafeAreaView, ScrollView, View, StyleSheet } from 'react-native';
import ErrorBoundary from './ErrorBoundary';
import LoadingSpinner from './LoadingSpinner';
import ErrorMessage from './ErrorMessage';

/**
 * Reusable screen container component with common screen patterns
 */
const Screen = ({
  children,
  style,
  contentStyle,
  safeArea = true,
  scrollable = false,
  loading = false,
  error = null,
  onRetry,
  loadingMessage = 'Loading...',
  errorTitle = 'Something went wrong',
  showErrorBoundary = true,
  errorBoundaryName,
  ...props
}) => {
  const Container = safeArea ? SafeAreaView : View;
  const Content = scrollable ? ScrollView : View;
  
  const renderContent = () => {
    if (loading) {
      return (
        <LoadingSpinner 
          message={loadingMessage}
          style={styles.centerContent}
        />
      );
    }
    
    if (error) {
      return (
        <ErrorMessage
          error={error}
          title={errorTitle}
          onRetry={onRetry}
          style={styles.centerContent}
        />
      );
    }
    
    return children;
  };

  const content = (
    <Container style={[styles.container, style]} {...props}>
      <Content 
        style={scrollable ? styles.scrollContainer : [styles.content, contentStyle]}
        contentContainerStyle={scrollable ? [styles.content, contentStyle] : undefined}
        showsVerticalScrollIndicator={false}
      >
        {renderContent()}
      </Content>
    </Container>
  );

  if (showErrorBoundary) {
    return (
      <ErrorBoundary
        name={errorBoundaryName}
        onRetry={onRetry}
        friendlyMessage="This screen encountered an error. Please try refreshing."
      >
        {content}
      </ErrorBoundary>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  scrollContainer: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
  },
});

export default Screen;