# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HapsApp is a React Native location tracking app built with Expo. The app tracks user location in the background, syncs data to a remote server, and provides timeline views of location history.

## Development Commands

### Running the App
- `npm start` - Start Expo development server
- `npm run dev:ios` - Run on iOS simulator/device (development)
- `npm run dev:android` - Run on Android emulator/device (development)
- `npm run dev:ios:prod` - Run iOS with production API URL
- `npm run dev:android:prod` - Run Android with production API URL

### Production Builds
- `npm run release:ios` - Build iOS for device in Release configuration
- `npm run release:android` - Build Android for device in Release configuration
- `npm run build` - Build using local build script (skips credentials)
- `npm run build:submit` - Build and auto-submit to App Store/TestFlight
- `npm run build:android` - Build Android and submit to Play Store
- `npm run build:clean` - Force clean build

## Architecture

### Core Structure
- **App.js** - Main entry point with authentication flow and bottom tab navigation
- **AuthContext.js** - Authentication provider with secure token storage
- **components/** - React Native UI components (screens and reusable components)
- **services/** - Business logic and background services

### Key Services Architecture
All services are centralized in `services/index.js`:

- **LocationService** - Background location tracking using Expo Location with TaskManager
- **LocationCacheService** - SQLite-based local location data caching
- **LocationSyncService** - Syncs cached location data to remote API
- **HeartbeatService** - Maintains connection during stationary periods
- **LoggingService** - Centralized logging with Better Stack integration
- **TimelineService** - Manages location timeline data

### Background Processing
The app uses sophisticated background processing:
- Expo TaskManager for background location updates
- Background fetch for data synchronization
- SQLite for offline data persistence
- Intelligent heartbeat system for stationary tracking

### Authentication & API
- JWT token-based authentication stored in Expo SecureStore
- Production API: `https://haps.app`
- Environment-specific configuration via `EXPO_PUBLIC_API_URL`
- Better Stack logging with separate dev/prod tokens

### Navigation & Screens
Bottom tab navigation with:
- **HomeScreen** - Main dashboard with location status and controls
- **MapViewScreen** - Map visualization of location data
- **TimelineListScreen** - List view of location timeline
- **HeartbeatDebugScreen** - Debug interface for background services

## Build Configuration

### EAS Build Profiles (eas.json)
- **development** - Development client for testing
- **preview** - Internal distribution builds
- **production** - App Store/Play Store releases with auto-increment
- **production-simulator** - iOS Simulator builds with production config

### Environment Variables
- `EXPO_PUBLIC_API_URL` - Backend API URL
- `EXPO_PUBLIC_LOGTAIL_TOKEN` - Better Stack logging token (dev/prod variants)

### iOS Configuration
- Background modes: location, fetch, remote-notification, processing
- Location usage descriptions configured in app.json
- Bundle ID: `com.fzf.HapsApp`
- Background task identifiers for location and sync tasks

## Permissions & Background Tasks
- Location: Always access for background tracking
- Notifications: For debug and status updates
- Background processing: Multiple background modes configured
- Android: Location and wake lock permissions

## Development Notes

### Code Style
- JavaScript (not TypeScript) throughout the project
- React hooks pattern for state management
- Async/await for asynchronous operations
- Sentry integration for error tracking

### Local Build System
Reference `README-BUILD.md` for comprehensive local build instructions. The project uses local Xcode builds to avoid EAS build costs while still using EAS for submissions.

### Debug Features
- Comprehensive logging via LoggingService
- Debug notifications for location events
- HeartbeatDebugScreen for monitoring background services
- Build info components for version tracking

## Common Patterns

### Service Usage
Import services from the centralized export:
```javascript
import { LocationService, LoggingService, HeartbeatService } from '../services';
```

### Authentication Context
Components use `useAuth()` hook from AuthContext for user state and API calls.

### Background Location Handling
Location updates are processed through TaskManager with proper error handling and caching to SQLite.