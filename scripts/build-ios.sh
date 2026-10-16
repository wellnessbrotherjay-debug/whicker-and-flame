#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
BUILD_DIR="${WF_IOS_BUILD_DIR:-$HOME/.codex/builds/whisker-flame}"
mkdir -p "$BUILD_DIR/WhiskerFlame.app"
node --input-type=module -e 'import {recipes} from "./server/catalog.mjs"; import {writeFileSync} from "node:fs"; writeFileSync(process.argv[1], JSON.stringify({recipes,episodes:[]}));' "$BUILD_DIR/WhiskerFlame.app/catalog.json"
cp -X public/assets/* "$BUILD_DIR/WhiskerFlame.app/"
cp -X ios/Info.plist "$BUILD_DIR/WhiskerFlame.app/Info.plist"
SDK_PATH=$(xcrun --sdk iphonesimulator --show-sdk-path)
SDKROOT="$SDK_PATH" xcrun swiftc -parse-as-library -sdk "$SDK_PATH" -target arm64-apple-ios18.0-simulator -module-name WhiskerFlame -emit-executable ios/WhiskerFlame.swift -o "$BUILD_DIR/WhiskerFlame.app/WhiskerFlame"
xattr -cr "$BUILD_DIR/WhiskerFlame.app"
codesign --force --sign - "$BUILD_DIR/WhiskerFlame.app"
echo "Built $BUILD_DIR/WhiskerFlame.app"
