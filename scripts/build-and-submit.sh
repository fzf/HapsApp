#!/bin/bash

# build-and-submit.sh
# Script to build locally and submit iOS app to TestFlight

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_step() {
    echo -e "${BLUE}🔄 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "eas.json" ]; then
    print_error "eas.json not found. Please run this script from your Expo project root."
    exit 1
fi

# Check required tools
print_step "Checking required tools..."

# We'll use npx for Expo CLI to avoid global installation issues
print_success "Using npx for Expo CLI commands"

# Check if EAS CLI is installed (for submission only)
if ! command -v eas &> /dev/null; then
    print_error "EAS CLI not found. Installing..."
    npm install -g @expo/eas-cli
fi

# Check if Xcode is available (for iOS builds)
if [[ "$OSTYPE" == "darwin"* ]]; then
    if ! command -v xcodebuild &> /dev/null; then
        print_error "Xcode not found. Please install Xcode from the App Store."
        exit 1
    fi
    print_success "Xcode found"
else
    print_warning "Not running on macOS. iOS builds require macOS with Xcode."
fi

# Check if user is logged in to EAS (for submission)
print_step "Checking EAS login status..."
if ! eas whoami &> /dev/null; then
    print_warning "Not logged in to EAS. Please log in:"
    eas login
fi

print_success "EAS login verified"

# Parse command line arguments
PLATFORM="ios"
AUTO_SUBMIT="false"
SKIP_CREDENTIALS_CHECK="true"  # Skip by default for local builds
BUILD_DIR="./build"
FORCE_CLEAN="false"

while [[ $# -gt 0 ]]; do
    case $1 in
        --platform)
            PLATFORM="$2"
            shift 2
            ;;
        --auto-submit)
            AUTO_SUBMIT="true"
            shift
            ;;
        --setup-credentials)
            SKIP_CREDENTIALS_CHECK="false"
            shift
            ;;
        --skip-credentials)
            SKIP_CREDENTIALS_CHECK="true"
            shift
            ;;
        --build-dir)
            BUILD_DIR="$2"
            shift 2
            ;;
        --force-clean)
            FORCE_CLEAN="true"
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --platform PLATFORM     Platform to build for (ios|android) [default: ios]"
            echo "  --auto-submit           Automatically submit to store after successful build"
            echo "  --setup-credentials     Set up EAS credentials (required for iOS first-time)"
            echo "  --skip-credentials      Skip credentials setup entirely"
            echo "  --build-dir DIR         Directory for build output [default: ./build]"
            echo "  --force-clean           Force clean rebuild (removes ios directory)"
            echo "  --help, -h              Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0 --setup-credentials  # First-time setup: configure iOS credentials"
            echo "  $0                       # Build iOS locally (preserves signing settings)"
            echo "  $0 --force-clean        # Clean rebuild (removes signing settings)"
            echo "  $0 --auto-submit        # Build locally and submit to TestFlight"
            echo "  $0 --platform android   # Build Android locally"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

print_step "Building $PLATFORM app locally"

# Create build directory
mkdir -p "$BUILD_DIR"

# Set up credentials for building (required for iOS code signing)
if [ "$PLATFORM" = "ios" ]; then
    print_step "Setting up iOS build credentials..."
    
    # Check if credentials are already configured
    if [ "$SKIP_CREDENTIALS_CHECK" != "true" ]; then
        print_step "Running credentials setup for iOS builds..."
        
        # Check if running interactively
        if [ -t 0 ]; then
            # Interactive mode - can prompt user
            eas credentials:configure-build -p ios --profile production
        else
            # Non-interactive mode - provide instructions
            print_warning "Non-interactive mode detected."
            print_warning "Please run this command manually in a terminal:"
            print_warning "eas credentials:configure-build -p ios --profile production"
            print_warning ""
            print_warning "Or use the general credentials command:"
            print_warning "eas credentials -p ios"
            print_warning ""
            print_warning "This will set up:"
            print_warning "1. Distribution certificate"
            print_warning "2. App Store provisioning profile"
            exit 1
        fi
        
        if [ $? -ne 0 ]; then
            print_error "Failed to configure iOS build credentials!"
            print_error "Please run 'eas credentials -p ios' manually to set up:"
            print_error "1. Distribution certificate"
            print_error "2. Provisioning profile"
            exit 1
        fi
        print_success "iOS build credentials configured"
    else
        print_warning "Skipping credentials setup. Ensure you have:"
        print_warning "1. Distribution certificate in Keychain"
        print_warning "2. Provisioning profile installed"
    fi
elif [ "$PLATFORM" = "android" ] && [ "$AUTO_SUBMIT" = "true" ]; then
    print_step "Checking Android credentials for submission..."
    print_warning "Will validate Android credentials during submission."
fi

# Start the local build
print_step "Starting local build..."
echo "Platform: $PLATFORM"
echo "Build directory: $BUILD_DIR"
echo "Auto-submit: $AUTO_SUBMIT"
echo ""

if [ "$PLATFORM" = "ios" ]; then
    # iOS Local Build using Expo's recommended approach
    print_step "Building iOS app locally using Expo..."
    
    # Check if certificates are available now that user signed into Xcode
    print_step "Checking available signing identities..."
    CERT_OUTPUT=$(security find-identity -v -p codesigning)
    
    if echo "$CERT_OUTPUT" | grep -q "0 valid identities found"; then
        print_warning "No code signing certificates found in Keychain."
        print_warning "Downloading certificates from EAS..."
        eas credentials:configure-build -p ios --profile production --non-interactive || {
            print_error "Could not download certificates from EAS."
            print_error "Please run: eas credentials -p ios manually"
            exit 1
        }
    else
        print_success "Found code signing certificates!"
        security find-identity -v -p codesigning | head -5
        
        # Check if we have distribution certificates
        if ! echo "$CERT_OUTPUT" | grep -q "Distribution\|iPhone Distribution"; then
            print_warning "Only development certificates found. You need distribution certificates for App Store builds."
            print_warning ""
            print_warning "To fix this:"
            print_warning "1. Open Xcode"
            print_warning "2. Go to Xcode > Settings > Accounts"
            print_warning "3. Make sure fletch@fzf.me is signed in"
            print_warning "4. Select your account and click 'Download Manual Profiles'"
            print_warning "5. Or run in terminal: eas credentials -p ios (choose production profile)"
            print_warning ""
            print_warning "Continuing with development certificates - this may work for internal testing..."
        fi
    fi
    
    # Use expo run:ios with Release configuration for production builds
    print_step "Building with expo run:ios --configuration Release..."
    
    # Handle iOS directory and prebuild
    if [ "$FORCE_CLEAN" = "true" ] && [ -d "ios" ]; then
        print_step "Force clean enabled. Removing existing ios directory..."
        rm -rf ios
    fi
    
    if [ ! -d "ios" ]; then
        print_step "iOS directory not found. Running expo prebuild..."
        npx expo prebuild --platform ios
    else
        print_success "iOS directory exists. Preserving existing project and signing settings."
        print_warning "If you experience signing issues, try: --force-clean flag"
        print_step "Skipping prebuild to preserve manual signing configuration"
    fi
    
    if [ $? -ne 0 ]; then
        print_error "Expo prebuild failed!"
        exit 1
    fi
    
    # Now build archive for App Store distribution
    print_step "Building archive for App Store distribution..."
    cd ios
    
    xcodebuild archive \
        -workspace HapsApp.xcworkspace \
        -scheme HapsApp \
        -configuration Release \
        -destination "generic/platform=iOS" \
        -archivePath "../$BUILD_DIR/HapsApp.xcarchive" \
        -allowProvisioningUpdates \
        DEVELOPMENT_TEAM=A483478F88
    
    if [ $? -ne 0 ]; then
        print_error "Archive build failed!"
        cd ..
        exit 1
    fi
    
    # Export IPA - try multiple methods since we only have development certificates
    print_step "Exporting IPA..."
    
    # Method 1: Try app-store-connect (updated method name)
    print_step "Trying app-store-connect export..."
    cat > "../$BUILD_DIR/ExportOptions.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store-connect</string>
    <key>teamID</key>
    <string>A483478F88</string>
    <key>uploadBitcode</key>
    <false/>
    <key>uploadSymbols</key>
    <true/>
    <key>signingStyle</key>
    <string>automatic</string>
</dict>
</plist>
EOF
    
    xcodebuild -exportArchive \
        -archivePath "../$BUILD_DIR/HapsApp.xcarchive" \
        -exportPath "../$BUILD_DIR" \
        -exportOptionsPlist "../$BUILD_DIR/ExportOptions.plist"
    
    EXPORT_SUCCESS=$?
    
    # Method 2: Try development export if app-store failed
    if [ $EXPORT_SUCCESS -ne 0 ]; then
        print_step "App Store export failed, trying development export..."
        cat > "../$BUILD_DIR/ExportOptions.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>development</string>
    <key>teamID</key>
    <string>A483478F88</string>
    <key>signingStyle</key>
    <string>automatic</string>
</dict>
</plist>
EOF
        
        xcodebuild -exportArchive \
            -archivePath "../$BUILD_DIR/HapsApp.xcarchive" \
            -exportPath "../$BUILD_DIR" \
            -exportOptionsPlist "../$BUILD_DIR/ExportOptions.plist"
        
        EXPORT_SUCCESS=$?
        
        if [ $EXPORT_SUCCESS -eq 0 ]; then
            print_warning "Used development export. You'll need distribution certificates for App Store submission."
        fi
    fi
    
    cd ..
    
    if [ $? -ne 0 ]; then
        print_error "Expo release build failed!"
        print_error ""
        print_error "Common solutions:"
        print_error "1. Make sure you're signed into your Apple Developer account in Xcode"
        print_error "2. Run: eas credentials -p ios to configure certificates"
        print_error "3. Try building in Xcode first to resolve any signing issues"
        exit 1
    fi
    
    # Find the generated IPA file
    print_step "Locating generated IPA file..."
    
    # expo run:ios typically creates the IPA in the ios directory or build directory
    IPA_LOCATIONS=(
        "ios/build/Build/Products/Release-iphoneos/*.ipa"
        "ios/build/*.ipa"
        "build/*.ipa"
        "*.ipa"
    )
    
    IPA_FILE=""
    for location in "${IPA_LOCATIONS[@]}"; do
        if ls $location 1> /dev/null 2>&1; then
            IPA_FILE=$(ls $location | head -n 1)
            break
        fi
    done
    
    if [ -n "$IPA_FILE" ]; then
        print_success "Found IPA file: $IPA_FILE"
        
        # Move IPA to build directory for consistency
        mkdir -p "$BUILD_DIR"
        if [ "$IPA_FILE" != "$BUILD_DIR/"* ]; then
            cp "$IPA_FILE" "$BUILD_DIR/"
            IPA_FILE="$BUILD_DIR/$(basename "$IPA_FILE")"
            print_step "Copied IPA to: $IPA_FILE"
        fi
    else
        print_warning "IPA file not found in expected locations."
        print_warning "The build may have succeeded but IPA generation might require manual export."
        print_warning "Check the ios/build directory or use Xcode to export manually."
        
        # Still consider it a success if the build completed without error
        print_success "Build completed - check for archive in Xcode Organizer"
    fi
    
elif [ "$PLATFORM" = "android" ]; then
    # Android Local Build
    print_step "Building Android app locally..."
    
    # Check for Android SDK
    if [ -z "$ANDROID_HOME" ]; then
        print_error "ANDROID_HOME not set. Please install Android SDK and set ANDROID_HOME."
        exit 1
    fi
    
    # Pre-build the app
    print_step "Running expo prebuild..."
    
    # Clean existing android directory first
    if [ -d "android" ]; then
        print_step "Cleaning existing android directory..."
        rm -rf android
    fi
    
    expo prebuild --platform android
    
    if [ $? -ne 0 ]; then
        print_error "Expo prebuild failed!"
        exit 1
    fi
    
    # Build with Gradle
    print_step "Building with Gradle..."
    cd android
    
    # Clean and build
    ./gradlew clean
    ./gradlew bundleRelease
    
    if [ $? -eq 0 ]; then
        print_success "Android build completed successfully!"
        
        # Copy AAB file to build directory
        cp app/build/outputs/bundle/release/app-release.aab "../$BUILD_DIR/"
        print_success "AAB file created: $BUILD_DIR/app-release.aab"
    else
        print_error "Android build failed!"
        cd ..
        exit 1
    fi
    
    cd ..
else
    print_error "Unsupported platform: $PLATFORM"
    exit 1
fi

# Submit to store if requested
if [ "$AUTO_SUBMIT" = "true" ]; then
    print_step "Submitting to store..."
    
    if [ "$PLATFORM" = "ios" ]; then
        # Submit iOS to TestFlight
        IPA_FILE=$(ls $BUILD_DIR/*.ipa | head -n 1)
        if [ -f "$IPA_FILE" ]; then
            print_step "Submitting to TestFlight using EAS..."
            eas submit --platform ios --path "$IPA_FILE" --non-interactive
            
            if [ $? -eq 0 ]; then
                print_success "Successfully submitted to TestFlight!"
                echo ""
                echo "Next steps:"
                echo "1. Check App Store Connect for processing status"
                echo "2. Add testers to your TestFlight group if needed"
                echo "3. Submit for App Store review when ready"
            else
                print_error "TestFlight submission failed!"
                exit 1
            fi
        else
            print_error "IPA file not found for submission!"
            exit 1
        fi
    elif [ "$PLATFORM" = "android" ]; then
        # Submit Android to Play Store
        AAB_FILE="$BUILD_DIR/app-release.aab"
        if [ -f "$AAB_FILE" ]; then
            print_step "Submitting to Google Play using EAS..."
            eas submit --platform android --path "$AAB_FILE" --non-interactive
            
            if [ $? -eq 0 ]; then
                print_success "Successfully submitted to Google Play!"
            else
                print_error "Google Play submission failed!"
                exit 1
            fi
        else
            print_error "AAB file not found for submission!"
            exit 1
        fi
    fi
else
    print_success "Build completed but not submitted to store."
    echo ""
    print_warning "To submit manually, run:"
    if [ "$PLATFORM" = "ios" ]; then
        IPA_FILE=$(ls $BUILD_DIR/*.ipa | head -n 1)
        echo "  eas submit --platform ios --path \"$IPA_FILE\""
    else
        echo "  eas submit --platform android --path \"$BUILD_DIR/app-release.aab\""
    fi
    echo ""
    echo "Or run this script with --auto-submit flag next time."
fi

print_success "Script completed successfully!"