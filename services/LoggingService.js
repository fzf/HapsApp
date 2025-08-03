import { Platform } from 'react-native';
import Constants from 'expo-constants';

class LoggingService {
  constructor() {
    this.sourceToken = null;
    this.isEnabled = false;
    this.logtailUrl = 'https://s1464181.eu-nbg-2.betterstackdata.com';
    
    // Set log levels based on environment
    this.logLevels = {
      error: 0,
      warn: 1, 
      info: 2,
      debug: 3
    };
    
    // Allow all log levels in both development and production for now
    this.minLogLevel = this.logLevels.debug;
    
    this.initializeLogging();
  }

  initializeLogging() {
    try {
      // Select token based on environment
      const isDev = __DEV__;
      const extra = Constants.expoConfig?.extra;
      
      console.log('🔍 Environment variables:', {
        env_token: process.env.EXPO_PUBLIC_LOGTAIL_TOKEN,
        extra_config: extra
      });

      if (isDev) {
        // TEMPORARY: Use production token in development for testing
        // Switch back to dev token later: extra?.EXPO_PUBLIC_LOGTAIL_TOKEN_DEV
        this.sourceToken = extra?.EXPO_PUBLIC_LOGTAIL_TOKEN_PROD || 
                          extra?.EXPO_PUBLIC_LOGTAIL_TOKEN_DEV || 
                          process.env.EXPO_PUBLIC_LOGTAIL_TOKEN ||
                          extra?.EXPO_PUBLIC_LOGTAIL_TOKEN;
      } else {
        // Production: use prod token from eas.json environment variables or app.json extra
        this.sourceToken = process.env.EXPO_PUBLIC_LOGTAIL_TOKEN ||
                          extra?.EXPO_PUBLIC_LOGTAIL_TOKEN_PROD;
      }
      
      console.log('🔍 Logtail token selection:', {
        isDevelopment: isDev,
        tokenSource: isDev ? 'DEV' : 'PROD',
        tokenFound: !!this.sourceToken,
        environment: this.getBaseContext().environment,
        minLogLevel: Object.keys(this.logLevels).find(key => this.logLevels[key] === this.minLogLevel)
      });
      
      if (this.sourceToken) {
        this.isEnabled = true;
        const minLevel = Object.keys(this.logLevels).find(key => this.logLevels[key] === this.minLogLevel);
        console.log(`✅ Better Stack logging service initialized (${isDev ? 'DEV' : 'PROD'} token, min level: ${minLevel})`);
      } else {
        console.warn('⚠️ EXPO_PUBLIC_LOGTAIL_TOKEN not found, logging disabled');
        console.warn('Available config:', extra);
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
      app: 'HapsApp',
      environment: __DEV__ ? 'development' : 'production'
    };
  }

  async sendToLogtail(level, message, data = {}) {
    // Always log debug info to console first
    console.log('🔍 sendToLogtail called:', { 
      level, 
      message: message.substring(0, 50), 
      enabled: this.isEnabled, 
      hasToken: !!this.sourceToken,
      isDev: __DEV__,
      minLogLevel: this.minLogLevel,
      levelValue: this.logLevels[level]
    });

    if (!this.isEnabled || !this.sourceToken) {
      console.log('🚫 Logtail disabled:', { 
        enabled: this.isEnabled, 
        hasToken: !!this.sourceToken,
        tokenPreview: this.sourceToken ? `${this.sourceToken.substring(0, 8)}...` : 'none'
      });
      return;
    }

    // Check if log level meets minimum threshold
    if (this.logLevels[level] > this.minLogLevel) {
      console.log('🚫 Log level filtered out:', { 
        level, 
        levelValue: this.logLevels[level], 
        minLogLevel: this.minLogLevel 
      });
      return; // Skip logs below minimum level
    }

    try {
      // Better Stack expects this exact format
      const logData = {
        dt: new Date().toISOString(),
        level: level.toUpperCase(),
        message,
        ...this.getBaseContext(),
        ...data
      };

      console.log('📤 Sending to Better Stack:', { 
        message: message.substring(0, 50), 
        level, 
        url: this.logtailUrl,
        tokenPreview: `${this.sourceToken.substring(0, 8)}...`,
        bodySize: JSON.stringify(logData).length
      });

      const response = await fetch(this.logtailUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.sourceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(logData),
      });

      console.log('📥 Better Stack response:', { 
        status: response.status, 
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (!response.ok) {
        console.warn('❌ Better Stack response not OK:', response.status, response.statusText);
        const responseText = await response.text();
        console.warn('Response body:', responseText);
      } else {
        console.log('✅ Log sent to Better Stack successfully');
      }
    } catch (error) {
      // Don't console.error here to avoid infinite loops
      console.warn('❌ Failed to send log to Better Stack:', {
        error: error.message,
        stack: error.stack,
        url: this.logtailUrl
      });
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

  // Test method to send a test log
  async test() {
    console.log('🧪 Testing Better Stack connection...');
    
    // Test with error level (should always get through in production)
    await this.error('TEST: Production logging test', null, {
      test: true,
      timestamp: new Date().toISOString(),
      buildType: __DEV__ ? 'development' : 'production'
    });
    
    // Test with info level (might be filtered in production)
    await this.info('TEST: Info level test log', {
      test: true,
      timestamp: new Date().toISOString(),
      buildType: __DEV__ ? 'development' : 'production'
    });
  }

  // Production-specific test that only sends error/warn level logs
  async testProduction() {
    console.log('🧪 Testing Better Stack production logging...');
    
    // Force send an error level log (always passes production filter)
    await this.error('PROD-TEST: Force error log test', null, {
      test: true,
      test_type: 'production_forced',
      timestamp: new Date().toISOString(),
      buildType: __DEV__ ? 'development' : 'production',
      minLogLevel: this.minLogLevel,
      currentLogLevels: this.logLevels
    });
    
    // Force send a warn level log (should pass production filter)
    await this.warn('PROD-TEST: Force warn log test', {
      test: true,
      test_type: 'production_forced',
      timestamp: new Date().toISOString(),
      buildType: __DEV__ ? 'development' : 'production',
      minLogLevel: this.minLogLevel,
      currentLogLevels: this.logLevels
    });

    // Try info level (should be filtered in production)
    await this.info('PROD-TEST: Info level test (should be filtered)', {
      test: true,
      test_type: 'production_filtered',
      timestamp: new Date().toISOString(),
      buildType: __DEV__ ? 'development' : 'production'
    });
    
    console.log('🧪 Production test completed. Check console for detailed debug output.');
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
const loggingService = new LoggingService();

// Make test methods available globally for debugging
if (__DEV__ || global.window) {
  global.LoggingService = loggingService;
  global.testBetterStack = () => loggingService.test();
  global.testBetterStackProduction = () => loggingService.testProduction();
  console.log('🔧 Better Stack debugging available: testBetterStack() and testBetterStackProduction()');
}

export default loggingService;