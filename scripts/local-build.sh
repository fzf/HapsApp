#!/usr/bin/env bash
# =============================================================================
# HapsApp – Local iOS Build & TestFlight Submit
# Builds entirely on your Mac via xcodebuild. No EAS build server used.
# EAS CLI is only used at the end to upload the IPA (eas submit).
# =============================================================================
set -euo pipefail

# ---------- config -----------------------------------------------------------
TEAM_ID="A483478F88"
BUNDLE_ID="com.fzf.HapsApp"
SCHEME="HapsApp"
WORKSPACE="ios/HapsApp.xcworkspace"
BUILD_DIR="./build"
ARCHIVE_PATH="$BUILD_DIR/HapsApp.xcarchive"
EXPORT_PATH="$BUILD_DIR/export"
EXPORT_OPTIONS_PLIST="$BUILD_DIR/ExportOptions.plist"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}▶${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠${NC} $*"; }
die()     { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

# ---------- flags ------------------------------------------------------------
SUBMIT=false
SKIP_PREBUILD=false
CLEAN=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  --submit          Upload IPA to TestFlight after building (requires eas login)
  --skip-prebuild   Skip "expo prebuild" (use existing ios/ dir)
  --clean           Remove build/ dir before starting
  -h, --help        Show this help

Examples:
  $(basename "$0")               # Build IPA only
  $(basename "$0") --submit      # Build + upload to TestFlight
  $(basename "$0") --skip-prebuild --submit  # Archive existing ios/ and submit
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --submit)          SUBMIT=true; shift ;;
    --skip-prebuild)   SKIP_PREBUILD=true; shift ;;
    --clean)           CLEAN=true; shift ;;
    -h|--help)         usage ;;
    *) die "Unknown option: $1" ;;
  esac
done

# ---------- prerequisites ----------------------------------------------------
info "Checking prerequisites..."
command -v xcodebuild &>/dev/null || die "Xcode not found. Install Xcode from the App Store."
command -v node &>/dev/null       || die "Node.js not found."
command -v npx &>/dev/null        || die "npx not found."
[[ "$(uname)" == "Darwin" ]]      || die "iOS builds require macOS."

XCODE_VER=$(xcodebuild -version | head -1)
NODE_VER=$(node --version)
success "Prerequisites OK — $XCODE_VER, Node $NODE_VER"

# ---------- clean ------------------------------------------------------------
if $CLEAN; then
  info "Cleaning build directory..."
  rm -rf "$BUILD_DIR"
  success "Cleaned $BUILD_DIR"
fi

mkdir -p "$BUILD_DIR" "$EXPORT_PATH"

# ---------- prebuild ---------------------------------------------------------
if ! $SKIP_PREBUILD; then
  info "Running expo prebuild (generates ios/ native project)..."
  npx expo prebuild --platform ios --non-interactive
  success "Prebuild complete"
else
  warn "Skipping prebuild — using existing ios/ directory"
fi

[[ -d "$WORKSPACE" ]] || die "Workspace not found: $WORKSPACE. Run without --skip-prebuild first."

# ---------- write ExportOptions.plist ----------------------------------------
info "Writing ExportOptions.plist..."
cat > "$EXPORT_OPTIONS_PLIST" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store</string>
  <key>teamID</key>
  <string>${TEAM_ID}</string>
  <key>uploadBitcode</key>
  <false/>
  <key>uploadSymbols</key>
  <true/>
  <key>compileBitcode</key>
  <false/>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>destination</key>
  <string>export</string>
</dict>
</plist>
PLIST
success "ExportOptions.plist written"

# ---------- pod install ------------------------------------------------------
if [[ ! -d "ios/Pods" ]]; then
  info "Running pod install..."
  (cd ios && pod install)
  success "Pods installed"
else
  info "Pods already installed — skipping (run with --clean to force reinstall)"
fi

# ---------- archive ----------------------------------------------------------
info "Archiving with xcodebuild (this takes a few minutes)..."
xcodebuild archive \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -archivePath "$ARCHIVE_PATH" \
  -destination "generic/platform=iOS" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  CODE_SIGN_STYLE=Automatic \
  SKIP_INSTALL=NO \
  BUILD_LIBRARY_FOR_DISTRIBUTION=NO \
  | xcpretty --color 2>/dev/null || true

[[ -d "$ARCHIVE_PATH" ]] || die "Archive failed — no .xcarchive found at $ARCHIVE_PATH"
success "Archive created: $ARCHIVE_PATH"

# ---------- export IPA -------------------------------------------------------
info "Exporting IPA..."
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS_PLIST" \
  | xcpretty --color 2>/dev/null || true

IPA_PATH=$(find "$EXPORT_PATH" -name "*.ipa" | head -1)
[[ -n "$IPA_PATH" ]] || die "IPA export failed — no .ipa found in $EXPORT_PATH"
success "IPA ready: $IPA_PATH"

# ---------- submit -----------------------------------------------------------
if $SUBMIT; then
  info "Submitting to TestFlight via EAS..."

  # Make sure EAS CLI is available
  if ! command -v eas &>/dev/null; then
    warn "EAS CLI not found — installing globally..."
    npm install -g @expo/eas-cli
  fi

  # Check EAS auth
  if ! eas whoami &>/dev/null 2>&1; then
    warn "Not logged into EAS. Running 'eas login'..."
    eas login
  fi

  eas submit --platform ios \
    --path "$IPA_PATH" \
    --non-interactive \
    --profile production

  success "Submitted to TestFlight!"
  echo ""
  echo "  Check App Store Connect: https://appstoreconnect.apple.com/apps/595608/testflight"
else
  echo ""
  echo -e "${GREEN}🎉 Build complete!${NC}"
  echo ""
  echo "  IPA: $IPA_PATH"
  echo ""
  echo "  To submit to TestFlight:"
  echo "    $(basename "$0") --skip-prebuild --submit"
  echo "    — or manually:"
  echo "    eas submit --platform ios --path \"$IPA_PATH\" --profile production"
fi
