import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LoggingService from './LoggingService';
import * as Sentry from '@sentry/react-native';

const NOTIFICATION_SETTINGS_KEY = 'notification_settings';

// Default notification settings
const DEFAULT_SETTINGS = {
  enabled: true,
  travelStart: true,
  visitArrival: true,
  silent: true,
};

/**
 * NotificationService - Manages travel and arrival notifications
 * 
 * Features:
 * - Silent notifications for travel start/stop
 * - Arrival notifications for visits
 * - User configurable settings
 * - Intelligent notification throttling
 */
class NotificationService {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
    this.lastNotificationTime = {};
    this.notificationThrottle = 5 * 60 * 1000; // 5 minutes
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) {
      console.log('⏭️ NotificationService already initialized');
      return;
    }
    
    try {
      // Set notification handler
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: false, // Silent by default
          shouldSetBadge: false,
        }),
      });

      // Setup notification channel for Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('travel-notifications', {
          name: 'Travel & Location Updates',
          importance: Notifications.AndroidImportance.DEFAULT,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#007AFF',
          sound: false, // Silent notifications
        });
      }

      // Load settings
      await this.loadSettings();

      // Request permissions
      await this.requestPermissions();

      this.isInitialized = true;
      console.log('✅ NotificationService initialized');
    } catch (error) {
      console.error('❌ Failed to initialize NotificationService:', error);
      Sentry.captureException(error, {
        tags: { section: 'notification_service', error_type: 'initialization_error' }
      });
    }
  }

  async requestPermissions() {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('❌ Notification permissions not granted');
        return false;
      }

      console.log('✅ Notification permissions granted');
      return true;
    } catch (error) {
      console.error('❌ Error requesting notification permissions:', error);
      return false;
    }
  }

  async loadSettings() {
    try {
      const stored = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
      if (stored) {
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
      console.log('📱 Notification settings loaded:', this.settings);
    } catch (error) {
      console.error('❌ Error loading notification settings:', error);
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  async saveSettings() {
    try {
      await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(this.settings));
      console.log('💾 Notification settings saved:', this.settings);
    } catch (error) {
      console.error('❌ Error saving notification settings:', error);
    }
  }

  async updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    await this.saveSettings();
    
    LoggingService.info('Notification settings updated', {
      event_type: 'notification',
      action: 'settings_updated',
      settings: this.settings,
    });
  }

  getSettings() {
    return { ...this.settings };
  }

  shouldSendNotification(type) {
    if (!this.settings.enabled) return false;
    
    // Check type-specific settings
    if (type === 'travel_start' && !this.settings.travelStart) return false;
    if (type === 'visit_arrival' && !this.settings.visitArrival) return false;

    // Check throttling
    const now = Date.now();
    const lastTime = this.lastNotificationTime[type] || 0;
    
    if (now - lastTime < this.notificationThrottle) {
      console.log(`🔕 Notification throttled for ${type}`);
      return false;
    }

    return true;
  }

  async sendTravelStartNotification(activity, location) {
    if (!this.shouldSendNotification('travel_start')) return;

    try {
      const title = 'Travel Started';
      let body = 'You have started moving';
      
      switch (activity) {
        case 'walking':
          body = 'Started walking';
          break;
        case 'cycling':
          body = 'Started cycling';
          break;
        case 'vehicle':
          body = 'Started driving';
          break;
        default:
          body = 'Started traveling';
      }

      await this.scheduleNotification({
        title,
        body,
        data: {
          type: 'travel_start',
          activity,
          location: {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          },
          timestamp: Date.now(),
        },
      });

      this.lastNotificationTime['travel_start'] = Date.now();
      
      LoggingService.info('Travel start notification sent', {
        event_type: 'notification',
        action: 'travel_start',
        activity,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      
    } catch (error) {
      console.error('❌ Error sending travel start notification:', error);
      Sentry.captureException(error);
    }
  }

  async sendVisitArrivalNotification(visit, location) {
    if (!this.shouldSendNotification('visit_arrival')) return;

    try {
      const title = 'Arrived at Destination';
      const body = visit.name || `Arrived at ${visit.address || 'a location'}`;

      await this.scheduleNotification({
        title,
        body,
        data: {
          type: 'visit_arrival',
          visit: {
            id: visit.id,
            name: visit.name,
            address: visit.address,
          },
          location: {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          },
          timestamp: Date.now(),
        },
      });

      this.lastNotificationTime['visit_arrival'] = Date.now();
      
      LoggingService.info('Visit arrival notification sent', {
        event_type: 'notification',
        action: 'visit_arrival',
        visit_id: visit.id,
        visit_name: visit.name,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      
    } catch (error) {
      console.error('❌ Error sending visit arrival notification:', error);
      Sentry.captureException(error);
    }
  }

  async sendTravelStopNotification(location, duration) {
    if (!this.shouldSendNotification('travel_start')) return; // Use same setting

    try {
      const title = 'Travel Stopped';
      const durationMinutes = Math.round(duration / 60000);
      const body = `Stopped moving after ${durationMinutes} minute${durationMinutes !== 1 ? 's' : ''}`;

      await this.scheduleNotification({
        title,
        body,
        data: {
          type: 'travel_stop',
          duration,
          location: {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          },
          timestamp: Date.now(),
        },
      });
      
      LoggingService.info('Travel stop notification sent', {
        event_type: 'notification',
        action: 'travel_stop',
        duration,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      
    } catch (error) {
      console.error('❌ Error sending travel stop notification:', error);
      Sentry.captureException(error);
    }
  }

  async scheduleNotification({ title, body, data }) {
    try {
      const notificationContent = {
        title,
        body,
        data,
        sound: this.settings.silent ? false : 'default',
        priority: this.settings.silent 
          ? Notifications.AndroidNotificationPriority.LOW 
          : Notifications.AndroidNotificationPriority.DEFAULT,
      };

      if (Platform.OS === 'android') {
        notificationContent.channelId = 'travel-notifications';
      }

      await Notifications.scheduleNotificationAsync({
        content: notificationContent,
        trigger: null, // Send immediately
      });

      console.log(`📱 Notification sent: ${title} - ${body}`);
      
    } catch (error) {
      console.error('❌ Error scheduling notification:', error);
      throw error;
    }
  }

  async testNotification() {
    try {
      await this.scheduleNotification({
        title: 'Test Notification',
        body: 'Travel notifications are working correctly',
        data: {
          type: 'test',
          timestamp: Date.now(),
        },
      });
      
      LoggingService.info('Test notification sent', {
        event_type: 'notification',
        action: 'test',
      });
      
      return true;
    } catch (error) {
      console.error('❌ Error sending test notification:', error);
      return false;
    }
  }

  // Integration with location tracking
  onActivityChanged(oldActivity, newActivity, location) {
    // Send travel start notification when transitioning from stationary to moving
    if (oldActivity === 'stationary' && newActivity !== 'stationary') {
      this.sendTravelStartNotification(newActivity, location);
    }
    
    // Send travel stop notification when transitioning from moving to stationary
    if (oldActivity !== 'stationary' && newActivity === 'stationary') {
      // Calculate approximate travel duration (this would need to be tracked elsewhere)
      const estimatedDuration = 10 * 60 * 1000; // 10 minutes as placeholder
      this.sendTravelStopNotification(location, estimatedDuration);
    }
  }

  onVisitDetected(visit, location) {
    this.sendVisitArrivalNotification(visit, location);
  }
}

// Export singleton instance
export default new NotificationService();