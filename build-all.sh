#!/bin/bash
set -e

echo "=== Musy Orchestrator Build Script ==="

# 1. Clean and recreate build-outputs folder
mkdir -p build-outputs
rm -rf build-outputs/*

# 2. Install workspace dependencies
echo "Installing project dependencies..."
npm install
npm install --prefix frontend

# 3. Compile React Frontend
echo "Building React frontend..."
npm run build:frontend

# 4. Compile Android APK
echo "Packaging and building Android application..."
npm run copy:android
cd android
./gradlew assembleDebug
cd ..
cp android/app/build/outputs/apk/debug/app-debug.apk build-outputs/musy-android.apk

# 5. Compile Linux Desktop (Tauri)
echo "Building Linux desktop application..."
npx tauri build --no-bundle
cp src-tauri/target/release/app build-outputs/musy-linux

echo "======================================="
echo "Build complete! Artifacts generated in build-outputs/ folder:"
echo " - Android: build-outputs/musy-android.apk"
echo " - Linux:   build-outputs/musy-linux"
echo "======================================="
