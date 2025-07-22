# Local Build and Deployment Guide

This guide explains how to build your Expo app locally and submit to TestFlight and App Store, saving you money on EAS build costs.

## Prerequisites

### For iOS:
1. **macOS with Xcode**: Required for iOS builds
2. **Apple Developer Account**: Required for code signing and TestFlight
3. **EAS CLI**: For submission only (script installs automatically)
4. **Expo CLI**: For prebuild (script installs automatically)

### For Android:
1. **Android SDK**: Set ANDROID_HOME environment variable
2. **Java Development Kit (JDK)**
3. **Google Play Developer Account**: For Play Store submission

## Quick Start

### 1. First Time Setup

```bash
# Install Xcode from App Store (for iOS)
# Install Android Studio and set ANDROID_HOME (for Android)

# Login to EAS (for submission only)
npx eas login

# Configure credentials (one time setup)
npx eas credentials -p ios
```

### 2. Build Commands

```bash
# First time: Set up iOS credentials (must run directly in terminal)
eas credentials:configure-build -p ios --profile production
# OR
eas credentials -p ios

# Build iOS locally (after setup)
npm run build

# Build locally and submit to TestFlight
npm run build:submit

# Build Android locally and submit
npm run build:android
```

## Detailed Usage

### Build Only (No Submission)
```bash
./scripts/build-and-submit.sh
# or
npm run build
```

### Build and Submit to TestFlight
```bash
./scripts/build-and-submit.sh --auto-submit
# or  
npm run build:submit
```

### Android Build and Submit
```bash
./scripts/build-and-submit.sh --platform android --auto-submit
# or
npm run build:android
```

### All Options
```bash
./scripts/build-and-submit.sh [OPTIONS]

Options:
  --platform PLATFORM     Platform (ios|android) [default: ios]
  --profile PROFILE        Build profile [default: production]  
  --auto-submit           Auto-submit to store after build
  --skip-credentials      Skip credentials validation
  --help, -h              Show help
```

## Build Profiles

Your `eas.json` defines these profiles:

- **production**: Auto-increments version, ready for store
- **preview**: Internal distribution for testing
- **development**: Development client build

## Cost Optimization

- **Local builds**: Completely free! No EAS build costs
- **Only pay for**: EAS submission ($99/year for Apple Developer, one-time for Play Store)
- **Build time**: Faster local builds vs waiting in EAS queue
- **Control**: Full control over build environment and dependencies

## Troubleshooting

### Common Issues

1. **"Xcode not found"**
   - Install Xcode from App Store
   - Accept Xcode license: `sudo xcodebuild -license accept`

2. **"ANDROID_HOME not set"**
   ```bash
   export ANDROID_HOME=$HOME/Library/Android/sdk
   export PATH=$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools
   ```

3. **"Expo prebuild failed"**
   - Clear node_modules: `rm -rf node_modules && npm install`
   - Update Expo: `npx expo install --fix`

4. **"Code signing failed"**
   - Configure credentials: `npx eas credentials -p ios`
   - Check Apple Developer portal for certificates

5. **"Submission failed"**
   - Verify App Store Connect access
   - Check if app bundle ID exists in App Store Connect
   - Ensure compliance with App Store guidelines

### Viewing Build Status

- **EAS Dashboard**: https://expo.dev/accounts/[username]/projects/[project]/builds
- **App Store Connect**: https://appstoreconnect.apple.com

## Manual Commands

If you prefer manual control:

```bash
# Clean and prebuild
rm -rf ios && npx expo prebuild --platform ios

# Build iOS manually with Xcode
cd ios && xcodebuild archive -workspace *.xcworkspace -scheme * -configuration Release

# Submit existing IPA
npx eas submit --platform ios --path ./build/App.ipa

# View credentials
npx eas credentials -p ios
```

## Environment Variables

Set these in EAS dashboard or eas.json if needed:

```json
{
  "build": {
    "production": {
      "env": {
        "EXPO_PUBLIC_API_URL": "https://your-api-url.com"
      }
    }
  }
}
```

## Tips

1. **Test First**: Use preview builds before production
2. **Version Management**: EAS auto-increments build numbers
3. **Credentials**: Store securely in EAS, don't commit to repo
4. **CI/CD**: This script works great in GitHub Actions
5. **Monitoring**: Check Sentry for crash reports after release