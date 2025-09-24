#!/bin/bash

# HapsApp Local Build and Submit Script
# Builds the app locally using Expo and optionally submits to TestFlight/Play Store
# Usage: ./scripts/build-and-submit.sh [OPTIONS]

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
PLATFORM="ios"
PROFILE="production"
AUTO_SUBMIT=false
SKIP_CREDENTIALS=false
FORCE_CLEAN=false
HELP=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --platform)
      PLATFORM="$2"
      shift 2
      ;;
    --profile)
      PROFILE="$2"
      shift 2
      ;;
    --auto-submit)
      AUTO_SUBMIT=true
      shift
      ;;
    --skip-credentials)
      SKIP_CREDENTIALS=true
      shift
      ;;
    --force-clean)
      FORCE_CLEAN=true
      shift
      ;;
    --help|-h)
      HELP=true
      shift
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Show help
if [ "$HELP" = true ]; then
  echo "HapsApp Local Build and Submit Script"
  echo ""
  echo "Usage: $0 [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --platform PLATFORM     Platform (ios|android) [default: ios]"
  echo "  --profile PROFILE        Build profile [default: production]"
  echo "  --auto-submit           Auto-submit to store after build"
  echo "  --skip-credentials      Skip credentials validation"
  echo "  --force-clean           Force clean build (remove ios/android dirs)"
  echo "  --help, -h              Show this help"
  echo ""
  echo "Examples:"
  echo "  $0                                    # Build iOS production locally"
  echo "  $0 --auto-submit                     # Build and submit to TestFlight"
  echo "  $0 --platform android --auto-submit  # Build and submit Android"
  echo "  $0 --profile preview                 # Build preview build"
  echo ""
  exit 0
fi

# Validate platform
if [ "$PLATFORM" != "ios" ] && [ "$PLATFORM" != "android" ]; then
  echo -e "${RED}Error: Platform must be 'ios' or 'android'${NC}"
  exit 1
fi

# Function to print section headers
print_section() {
  echo -e "\n${BLUE}=== $1 ===${NC}"
}

# Function to print status
print_status() {
  echo -e "${GREEN}✓${NC} $1"
}

# Function to print warning
print_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

# Function to print error
print_error() {
  echo -e "${RED}✗${NC} $1"
}

# Check prerequisites
print_section "Checking Prerequisites"

# Check if we're on macOS for iOS builds
if [ "$PLATFORM" = "ios" ] && [ "$(uname)" != "Darwin" ]; then
  print_error "iOS builds require macOS"
  exit 1
fi

# Check if Xcode is installed for iOS
if [ "$PLATFORM" = "ios" ]; then
  if ! command -v xcodebuild &> /dev/null; then
    print_error "Xcode is not installed. Please install Xcode from the App Store."
    exit 1
  fi
  print_status "Xcode found"
fi

# Check if Android SDK is set for Android builds
if [ "$PLATFORM" = "android" ]; then
  if [ -z "$ANDROID_HOME" ]; then
    print_error "ANDROID_HOME environment variable is not set"
    print_error "Please install Android Studio and set ANDROID_HOME"
    exit 1
  fi
  print_status "Android SDK found at $ANDROID_HOME"
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
  print_error "Node.js is not installed"
  exit 1
fi
print_status "Node.js $(node --version)"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
  print_error "npm is not installed"
  exit 1
fi
print_status "npm $(npm --version)"

# Install/check EAS CLI
print_section "Setting up EAS CLI"
if ! command -v eas &> /dev/null; then
  print_warning "EAS CLI not found, installing..."
  npm install -g @expo/eas-cli
fi
print_status "EAS CLI $(eas --version)"

# Install/check Expo CLI
print_section "Setting up Expo CLI"
if ! command -v expo &> /dev/null; then
  print_warning "Expo CLI not found, installing..."
  npm install -g @expo/cli
fi
print_status "Expo CLI $(expo --version)"

# Check if logged into EAS (only if not skipping credentials)
if [ "$SKIP_CREDENTIALS" = false ]; then
  print_section "Checking EAS Authentication"
  if ! eas whoami &> /dev/null; then
    print_warning "Not logged into EAS. Please log in:"
    eas login
  else
    print_status "Logged into EAS as $(eas whoami)"
  fi
fi

# Clean build if requested
if [ "$FORCE_CLEAN" = true ]; then
  print_section "Cleaning Previous Builds"
  if [ "$PLATFORM" = "ios" ]; then
    rm -rf ios
    print_status "Removed ios directory"
  elif [ "$PLATFORM" = "android" ]; then
    rm -rf android
    print_status "Removed android directory"
  fi
fi

# Install dependencies
print_section "Installing Dependencies"
npm install
print_status "Dependencies installed"

# Prebuild for local development
print_section "Prebuilding Native Code"
if [ "$PLATFORM" = "ios" ]; then
  npx expo prebuild --platform ios --clean
  print_status "iOS prebuild completed"
elif [ "$PLATFORM" = "android" ]; then
  npx expo prebuild --platform android --clean
  print_status "Android prebuild completed"
fi

# Configure credentials if needed and not skipping
if [ "$SKIP_CREDENTIALS" = false ]; then
  print_section "Configuring Credentials"
  if [ "$PLATFORM" = "ios" ]; then
    print_warning "Checking iOS credentials..."
    # This will prompt for credentials if needed
    eas credentials -p ios || {
      print_warning "Credentials not configured. Please configure them manually:"
      print_warning "Run: eas credentials -p ios"
      exit 1
    }
    print_status "iOS credentials configured"
  elif [ "$PLATFORM" = "android" ]; then
    print_warning "Checking Android credentials..."
    eas credentials -p android || {
      print_warning "Credentials not configured. Please configure them manually:"
      print_warning "Run: eas credentials -p android"
      exit 1
    }
    print_status "Android credentials configured"
  fi
fi

# Build locally
print_section "Building App Locally"
if [ "$PLATFORM" = "ios" ]; then
  print_status "Building iOS app with profile: $PROFILE"
  eas build --platform ios --profile "$PROFILE" --local
  
  # Find the built IPA
  IPA_PATH=$(find . -name "*.ipa" -type f | head -1)
  if [ -z "$IPA_PATH" ]; then
    print_error "No IPA file found after build"
    exit 1
  fi
  print_status "Built IPA: $IPA_PATH"
  
elif [ "$PLATFORM" = "android" ]; then
  print_status "Building Android app with profile: $PROFILE"
  eas build --platform android --profile "$PROFILE" --local
  
  # Find the built APK/AAB
  APK_PATH=$(find . -name "*.apk" -o -name "*.aab" | head -1)
  if [ -z "$APK_PATH" ]; then
    print_error "No APK/AAB file found after build"
    exit 1
  fi
  print_status "Built APK/AAB: $APK_PATH"
fi

# Submit to store if requested
if [ "$AUTO_SUBMIT" = true ]; then
  print_section "Submitting to App Store"
  if [ "$PLATFORM" = "ios" ]; then
    print_status "Submitting to TestFlight..."
    eas submit --platform ios --profile "$PROFILE" --path "$IPA_PATH"
    print_status "Successfully submitted to TestFlight!"
    print_warning "Check App Store Connect for processing status: https://appstoreconnect.apple.com"
    
  elif [ "$PLATFORM" = "android" ]; then
    print_status "Submitting to Google Play..."
    eas submit --platform android --profile "$PROFILE" --path "$APK_PATH"
    print_status "Successfully submitted to Google Play!"
    print_warning "Check Google Play Console for processing status"
  fi
else
  print_section "Build Complete"
  if [ "$PLATFORM" = "ios" ]; then
    print_status "iOS build completed: $IPA_PATH"
    print_warning "To submit to TestFlight, run: eas submit --platform ios --path \"$IPA_PATH\""
  elif [ "$PLATFORM" = "android" ]; then
    print_status "Android build completed: $APK_PATH"
    print_warning "To submit to Google Play, run: eas submit --platform android --path \"$APK_PATH\""
  fi
fi

print_section "Summary"
print_status "Platform: $PLATFORM"
print_status "Profile: $PROFILE"
print_status "Auto-submit: $AUTO_SUBMIT"
if [ "$AUTO_SUBMIT" = true ]; then
  print_status "App submitted successfully!"
else
  print_status "App built successfully!"
fi

echo -e "\n${GREEN}🎉 Build process completed successfully!${NC}\n"