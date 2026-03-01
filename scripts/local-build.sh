#!/usr/bin/env bash
# =============================================================================
# HapsApp – Local iOS Build & TestFlight Submit
# Builds entirely on your Mac via xcodebuild. No EAS build server used.
# EAS CLI is only used at the end for the TestFlight upload (eas submit).
# =============================================================================
set -euo pipefail

TEAM_ID="A483478F88"
SCHEME="HapsApp"
WORKSPACE="ios/HapsApp.xcworkspace"
PROFILE_UUID="5a94fc0b-ee90-4091-9183-a7dafe938a2f"
BUILD_DIR="./build"
ARCHIVE_PATH="$BUILD_DIR/HapsApp.xcarchive"
IPA_PATH="$BUILD_DIR/HapsApp.ipa"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}▶${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠${NC} $*"; }
die()     { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

SUBMIT=false
SKIP_PREBUILD=false
CLEAN=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  --submit          Upload IPA to TestFlight after building
  --skip-prebuild   Skip expo prebuild (use existing ios/ dir)
  --clean           Remove build/ and DerivedData cache before starting
  -h, --help        Show this help

Examples:
  $(basename "$0") --submit                        # Most common: build + submit
  $(basename "$0") --skip-prebuild --submit        # Skip prebuild, just archive + submit
  $(basename "$0") --clean --submit                # Full clean build + submit
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --submit)        SUBMIT=true; shift ;;
    --skip-prebuild) SKIP_PREBUILD=true; shift ;;
    --clean)         CLEAN=true; shift ;;
    -h|--help)       usage ;;
    *) die "Unknown option: $1" ;;
  esac
done

# ---------- prerequisites ----------------------------------------------------
command -v xcodebuild &>/dev/null || die "Xcode not found."
[[ "$(uname)" == "Darwin" ]] || die "iOS builds require macOS."
info "$(xcodebuild -version | head -1)"

# ---------- disk space check -------------------------------------------------
AVAIL_GB=$(df -g / | tail -1 | awk '{print $4}')
if (( AVAIL_GB < 3 )); then
  warn "Low disk space: ${AVAIL_GB}GB free. Clearing caches..."
  rm -rf ~/Library/Caches/Homebrew ~/Library/Caches/CocoaPods ~/Library/Caches/node-gyp
  rm -rf ~/Library/Developer/Xcode/DerivedData/ModuleCache.noindex
  find ~/Library/Developer/Xcode -name "*.xcresult" -delete 2>/dev/null || true
fi

# ---------- clean ------------------------------------------------------------
if $CLEAN; then
  info "Cleaning build directory and DerivedData..."
  rm -rf "$BUILD_DIR"
  rm -rf ~/Library/Developer/Xcode/DerivedData/HapsApp-*
  success "Cleaned"
fi
mkdir -p "$BUILD_DIR"

# ---------- prebuild ---------------------------------------------------------
if ! $SKIP_PREBUILD; then
  info "Running expo prebuild..."
  export ASDF_NODEJS_VERSION=21.3.0
  npx expo prebuild --platform ios --no-install
  success "Prebuild complete"
else
  warn "Skipping prebuild"
fi

[[ -d "$WORKSPACE" ]] || die "Workspace not found: $WORKSPACE"

# ---------- archive ----------------------------------------------------------
info "Archiving (iPhone Distribution)..."
export ASDF_NODEJS_VERSION=21.3.0

xcodebuild archive \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -archivePath "$ARCHIVE_PATH" \
  -destination "generic/platform=iOS" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY="iPhone Distribution" \
  PROVISIONING_PROFILE_SPECIFIER="$PROFILE_UUID" \
  SKIP_INSTALL=NO \
  2>&1 | grep -E "error:|ARCHIVE FAILED|Signing Identity:|PhaseScript.*FAILED|space left" || true

[[ -d "$ARCHIVE_PATH/Products/Applications/HapsApp.app" ]] || die "Archive failed — no .app found"

# Confirm signing identity
IDENTITY=$(codesign -dv "$ARCHIVE_PATH/Products/Applications/HapsApp.app" 2>&1 | grep "Authority" | head -1)
success "Archive complete — $IDENTITY"

# ---------- package IPA ------------------------------------------------------
info "Packaging IPA..."
rm -rf /tmp/Payload && mkdir /tmp/Payload
cp -r "$ARCHIVE_PATH/Products/Applications/HapsApp.app" /tmp/Payload/
(cd /tmp && zip -qr "$(pwd)/../$(dirname "$IPA_PATH")/$(basename "$IPA_PATH")" Payload/)
# handle relative path
cd "$(dirname "$0")/.."
rm -rf /tmp/Payload && mkdir /tmp/Payload
cp -r "$ARCHIVE_PATH/Products/Applications/HapsApp.app" /tmp/Payload/
(cd /tmp && zip -qr "$(cd "$(dirname "$IPA_PATH")" && pwd)/$(basename "$IPA_PATH")" Payload/)
success "IPA ready: $IPA_PATH ($(du -sh "$IPA_PATH" | cut -f1))"

# ---------- submit -----------------------------------------------------------
if $SUBMIT; then
  info "Submitting to TestFlight via EAS..."
  npx eas-cli submit --platform ios \
    --path "$IPA_PATH" \
    --profile production \
    --non-interactive
  success "Submitted to TestFlight!"
  echo ""
  echo "  Check: https://appstoreconnect.apple.com/apps/595608/testflight/ios"
else
  echo ""
  echo -e "${GREEN}🎉 Build complete!${NC} IPA: $IPA_PATH"
  echo ""
  echo "  To submit:  $(basename "$0") --skip-prebuild --submit"
  echo "  Or manual:  npx eas-cli submit --platform ios --path \"$IPA_PATH\" --profile production"
fi
