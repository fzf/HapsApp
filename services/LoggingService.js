import { Logtail } from '@logtail/js';
import { Platform } from 'react-native';

class LoggingService {
  constructor() {
    // Initialize Logtail with your Better Stack source token
    this.logtail = null;
    this.isEnabled = false;
    this.initializeLogtail();
  }

  initializeLogtail() {
    try {
      // Get token from environment or config
      const sourceToken = process.env.EXPO_PUBLIC_LOGTAIL_TOKEN;
      
      if (sourceToken) {
        this.logtail = new Logtail(sourceToken);
        this.isEnabled = true;
        console.log('✅ Logtail logging service initialized');
      } else {
        console.warn('⚠️ EXPO_PUBLIC_LOGTAIL_TOKEN not found, logging disabled');
      }
    } catch (error) {
      console.error('❌ Failed to initialize Logtail:', error);
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

  info(message, data = {}) {
    console.log(`[INFO] ${message}`, data);
    
    if (this.isEnabled && this.logtail) {
      this.logtail.info(message, {
        ...this.getBaseContext(),
        ...data
      });
    }
  }

  debug(message, data = {}) {
    console.log(`[DEBUG] ${message}`, data);
    
    if (this.isEnabled && this.logtail) {
      this.logtail.debug(message, {
        ...this.getBaseContext(),
        ...data
      });
    }
  }

  warn(message, data = {}) {
    console.warn(`[WARN] ${message}`, data);
    
    if (this.isEnabled && this.logtail) {
      this.logtail.warn(message, {
        ...this.getBaseContext(),
        ...data
      });
    }
  }

  error(message, error = null, data = {}) {
    console.error(`[ERROR] ${message}`, error, data);
    
    if (this.isEnabled && this.logtail) {
      this.logtail.error(message, {
        ...this.getBaseContext(),
        error: error?.message || error,
        stack: error?.stack,
        ...data
      });
    }
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
    if (this.isEnabled && this.logtail) {
      try {
        await this.logtail.flush();
        console.log('✅ Logs flushed to Logtail');
      } catch (error) {
        console.error('❌ Failed to flush logs:', error);
      }
    }
  }
}

// Export singleton instance
export default new LoggingService();