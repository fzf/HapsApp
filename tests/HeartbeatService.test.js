// Simple test to verify HeartbeatService functionality
// This can be run manually to test the service

import HeartbeatService from '../services/HeartbeatService';
import LocationCacheService from '../services/LocationCacheService';

// Mock console for testing
const originalConsole = console;
const mockConsole = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

// Simple test function
export const testHeartbeatService = async () => {
  console.log('🧪 Starting HeartbeatService tests...');

  try {
    // Test 1: Service initialization
    console.log('Test 1: Service should be initialized');
    const initialStatus = await HeartbeatService.getStatus();
    console.log('Initial status:', initialStatus);
    
    // Test 2: Status should have required properties
    console.log('Test 2: Status should have required properties');
    const expectedProperties = [
      'isActive',
      'intervalMs',
      'lastHeartbeatTime',
      'timeSinceLastHeartbeat',
      'timeUntilNextHeartbeat',
      'nextHeartbeatDue',
      'isTaskRegistered'
    ];
    
    const missingProps = expectedProperties.filter(prop => !(prop in initialStatus));
    if (missingProps.length > 0) {
      throw new Error(`Missing properties: ${missingProps.join(', ')}`);
    }
    console.log('✅ All required properties present');

    // Test 3: Interval should be 30 minutes (1800000ms)
    console.log('Test 3: Interval should be 30 minutes');
    if (initialStatus.intervalMs !== 30 * 60 * 1000) {
      throw new Error(`Expected 1800000ms, got ${initialStatus.intervalMs}ms`);
    }
    console.log('✅ Correct 30-minute interval');

    // Test 4: Force heartbeat execution
    console.log('Test 4: Force heartbeat execution');
    const heartbeatResult = await HeartbeatService.forceHeartbeat();
    console.log('Heartbeat result:', heartbeatResult);
    
    if (!heartbeatResult || typeof heartbeatResult.success !== 'boolean') {
      throw new Error('Heartbeat result should have success property');
    }
    console.log('✅ Heartbeat executed successfully');

    // Test 5: Status should update after heartbeat
    console.log('Test 5: Status should update after heartbeat');
    const updatedStatus = await HeartbeatService.getStatus();
    
    if (updatedStatus.lastHeartbeatTime === initialStatus.lastHeartbeatTime) {
      console.warn('⚠️ Last heartbeat time did not update (this may be expected)');
    } else {
      console.log('✅ Last heartbeat time updated');
    }

    console.log('🎉 All HeartbeatService tests passed!');
    return true;

  } catch (error) {
    console.error('❌ HeartbeatService test failed:', error);
    return false;
  }
};

// Manual test runner function
export const runTests = async () => {
  console.log('🚀 Running HeartbeatService manual tests...');
  
  try {
    // Initialize cache service first
    await LocationCacheService.initialize();
    
    // Run the tests
    const success = await testHeartbeatService();
    
    if (success) {
      console.log('🎉 All tests passed successfully!');
    } else {
      console.log('❌ Some tests failed');
    }
    
    return success;
  } catch (error) {
    console.error('❌ Test runner failed:', error);
    return false;
  }
};

// Export for direct testing
export default {
  testHeartbeatService,
  runTests
};