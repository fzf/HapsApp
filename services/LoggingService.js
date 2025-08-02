import { Platform } from 'react-native';
import Constants from 'expo-constants';

class LoggingService {
  constructor() {
    this.sourceToken = null;
    this.isEnabled = false;
    this.logtailUrl = 'https://in.logs.betterstack.com';
    this.initializeLogging();
  }

  initializeLogging() {
    try {
      // Get token from environment or config
      this.sourceToken = Constants.expoConfig?.extra?.EXPO_PUBLIC_LOGTAIL_TOKEN || 
                        process.env.EXPO_PUBLIC_LOGTAIL_TOKEN;
      
      if (this.sourceToken) {
        this.isEnabled = true;
        console.log('✅ Better Stack logging service initialized');
      } else {
        console.warn('⚠️ EXPO_PUBLIC_LOGTAIL_TOKEN not found, logging disabled');
      }
    } catch (error) {
      console.error('❌ Failed to initialize logging service:', error);
    }
  }

  // Add context to all logs
  getBaseContext() {
    return {
      platform: Platform.OS,
      version: Platform.Version,
      timestamp: new Date().toISOString(),
      app: 'HapsApp'
    };
  }

  async sendToLogtail(level, message, data = {}) {
    if (!this.isEnabled || !this.sourceToken) {
      return;
    }

    try {
      const logData = {
        dt: new Date().toISOString(),
        level,
        message,
        ...this.getBaseContext(),
        ...data
      };

      await fetch(this.logtailUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.sourceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(logData),
      });
    } catch (error) {
      // Don't console.error here to avoid infinite loops
      console.warn('Failed to send log to Better Stack:', error.message);
    }
  }

  info(message, data = {}) {
    console.log(`[INFO] ${message}`, data);
    this.sendToLogtail('info', message, data);
  }

  debug(message, data = {}) {
    console.log(`[DEBUG] ${message}`, data);
    this.sendToLogtail('debug', message, data);
  }

  warn(message, data = {}) {
    console.warn(`[WARN] ${message}`, data);
    this.sendToLogtail('warn', message, data);
  }

  error(message, error = null, data = {}) {
    console.error(`[ERROR] ${message}`, error, data);
    
    const errorData = {
      ...data,
      error: error?.message || error,
      stack: error?.stack,
    };
    
    this.sendToLogtail('error', message, errorData);
  }

  // Specific method for location logs
  location(event, locationData) {
    const logData = {
      event_type: 'location',
      event,
      ...locationData
    };
    
    this.info(`Location: ${event}`, logData);
  }

  // Specific method for sync logs
  sync(event, syncData) {
    const logData = {
      event_type: 'sync',
      event,
      ...syncData
    };
    
    this.info(`Sync: ${event}`, logData);
  }

  // Background task logs
  backgroundTask(event, taskData) {
    const logData = {
      event_type: 'background_task',
      event,
      ...taskData
    };
    
    this.info(`Background: ${event}`, logData);
  }

  // Flush logs (useful before app closes)
  async flush() {
    if (this.isEnabled) {
      try {
        // Since we're using fetch, logs are sent immediately
        // This method exists for API compatibility
        console.log('✅ Logs are sent immediately via fetch API');
      } catch (error) {
        console.error('❌ Failed to flush logs:', error);
      }
    }
  }
}

// Export singleton instance
export default new LoggingService();