rebuild: # Rebuild the project
npx expo prebuild

run-device: # Run the project locally
npx expo run:ios --device

# Local build (no EAS build server)
build-local: ## Build IPA locally with xcodebuild
	./scripts/local-build.sh --skip-prebuild

build-local-clean: ## Clean prebuild then build IPA locally
	./scripts/local-build.sh --clean

testflight: ## Build and submit to TestFlight (no EAS build server)
	./scripts/local-build.sh --skip-prebuild --submit

testflight-fresh: ## Full clean prebuild + submit to TestFlight
	./scripts/local-build.sh --submit
