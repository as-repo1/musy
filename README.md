# Musy: Cross-Platform Local Music Player (Linux & Android)

Musy is a feature-rich, minimalist local music player built with a unified React + TypeScript frontend and native-quality platform backends (Tauri v2 + Rust on Linux, WebView + Jetpack Media3 on Android). It features a beautiful, glassmorphic UI with dynamic theme switching (Gruvbox, Nord, Tokyo Night, Dracula, and Material UI/Material You).

---

## 🛠️ The Pipeline Structure

Musy uses a decoupled pipeline structure to assemble build outputs for different targets from the single `frontend/` source:

```
                          +------------------------+
                          |   Unified Frontend     |
                          | (React + Vite + TS)    |
                          +-----------+------------+
                                      |
                                      | npm run build
                                      v
                          +-----------+------------+
                          |  Static Assets (dist/) |
                          |  HTML / CSS / JS       |
                          +-----+------------+-----+
                                |            |
         +----------------------+            +----------------------+
         |                                                          |
         | Tauri Pipeline (Linux)                                   | Gradle Pipeline (Android)
         v                                                          v
+--------+---------------+                                 +--------+---------------+
| Read dist/ files       |                                 | Copy dist/ to          |
| into Rust binary       |                                 | android/app/src/main/  |
| via cargo-tauri        |                                 | assets/www/            |
+--------+---------------+                                 +--------+---------------+
         |                                                          |
         | cargo build                                              | gradlew assembleDebug
         v                                                          v
+--------+---------------+                                 +--------+---------------+
| Linux Executable       |                                 | Android APK            |
| (musy) ~15MB           |                                 | (app-debug.apk)        |
+------------------------+                                 +------------------------+
```

### 1. Frontend Build Pipeline (`frontend/`)
- Vite bundles the React code, transpiles TypeScript, and processes CSS variables into static assets under `frontend/dist/`.
- Commands: `npm run build`

### 2. Linux Desktop Pipeline (`src-tauri/`)
- Tauri grabs the compiled frontend files inside `frontend/dist/`.
- During compilation, Tauri embeds these files directly into the Rust binary.
- On launch, Tauri loads them from memory into a native WebKitGTK webview, avoiding local port binding.
- Commands: `npm run tauri build`

### 3. Android App Pipeline (`android/`)
- Before the Gradle compilation, the frontend build assets (`frontend/dist/`) are copied to the Android assets directory (`android/app/src/main/assets/www/`).
- The Android project compile task packages these assets into the final APK.
- On launch, the Android app's WebView loads the HTML index via the internal asset file resolver (`file:///android_asset/www/index.html`).
- Commands: `./gradlew assembleDebug` (or `android run`)

---

## ⚙️ How It Works (In-depth)

### 1. The Unified Bridge Design
At the center of Musy's cross-platform ability is [MusicBridge.ts](frontend/src/bridge/MusicBridge.ts). This class acts as a hardware abstraction layer (HAL) for audio playback and metadata querying:
- It checks for the presence of `window.AndroidInterface` (Android WebView) or `window.__TAURI__` (Tauri).
- If on **Android**, it intercepts calls and routes them through JavaScript interfaces to native Java/Kotlin classes.
- If on **Linux (Tauri)**, it routes filesystem scans through Tauri Rust commands (`invoke`) and handles playback using the browser `<audio>` tag mapped to Tauri's local asset handler.
- If on a **Web Browser**, it falls back to Web Audio API playing mock, royalty-free audio tracks.

### 2. Native Playback Coordination (Android)
To support **background audio** and **lock-screen media controls**, Android cannot run audio inside the WebView. WebViews are paused when minimized, which would stop the music.
- **Playback Service**: Musy deploys a native Kotlin `PlaybackService` extending Media3's `MediaSessionService`. This service runs `ExoPlayer` in a foreground service type (`mediaPlayback`).
- **Control Loop**: When you click Play in the WebView, `MusicBridge` calls the native method `AndroidInterface.playSong(path, title, artist, id, cover)`.
- **System Synchronization**: ExoPlayer plays the track and registers a `MediaSession`. Android automatically generates a lock-screen/notification controller.
- **State Listener**: When you press pause on your lock screen or headphones, the Android system sends a signal to `PlaybackService`. The service pauses ExoPlayer, and passes the updated state back to the WebView via Javascript evaluation: `window.onPlaybackStateChanged(playing, positionMs, durationMs, trackId)`. React updates the UI state instantly!

### 3. Desktop Metadata Scanning (Linux)
- The Tauri Rust backend recursively scans `~/Music` using the `walkdir` crate.
- For each audio file, it uses the `lofty` crate to parse ID3 (v1/v2), MP4, and FLAC tags.
- It reads the binary cover art frame, converts it to a base64 Data URL, and returns a JSON list of tracks to the React frontend.
- Since it is running on a desktop container, background execution is not restricted like on Android. Therefore, Tauri stream-plays local files directly inside the WebView using the `<audio>` tag, referencing paths converted via Tauri's asset security handler: `convertFileSrc(trackPath)` (resolving to `asset://localhost/path/to/music.mp3`).

### 4. Dynamic Theme Switching & Wallpaper Matching
- **Themes**: Themes are defined as CSS variables under `data-theme` selectors in [themes.css](frontend/src/styles/themes.css). Choosing a theme updates the `<html>` attribute, changing the color system with smooth CSS transitions.
- **Android Material You Integration**: On Android, Musy requests the wallpaper color palette. The Kotlin backend reads system dynamic colors using the `DynamicColors` API on Android 12+ and exposes them as a JSON string via `AndroidInterface.getWallpaperColors()`.
- The frontend imports this JSON on startup and injects the colors as custom styles overrides for `--bg`, `--accent`, and `--surface` when the "Material" theme is active. The player visual interface matches the user's wallpaper!

---

## 💡 The Thesis & Design Decisions

### Thesis: "Decouple User Interface from Player Core"
A web application interface allows us to construct highly polished, modern, glassmorphic UI, with smooth Framer Motion animations, canvas visualizers, and custom themes (Nord, Tokyo Night, Dracula, Gruvbox) that render identically on both Android and Linux. 

However, playing local audio files is a system-sensitive operation:
1. **On Android**, background play is heavily restricted by battery-saving features. Operating systems aggressively sleep WebViews. Additionally, headphone hook signals, Bluetooth metadata broadcasts, and system volume controls require integration with native OS APIs (`MediaSession`, `ExoPlayer`).
2. **On Linux**, sandboxing prevents WebViews from reading files directly from the filesystem (like `/home/user/Music`) due to security restrictions.

By using a **Unified Bridge Pattern**, we decouple the visual renderer (React WebView) from the platform's audio engine:
- Android runs a high-fidelity native Media3 ExoPlayer.
- Linux Tauri runs a local asset streaming server to allow the browser `<audio>` context to read files securely.

This architecture results in a codebase that is **90% shared**, while delivering **100% platform-native behavior** (such as background play, notification control widgets, and system wallpaper matching).

---

## 📁 Repository Structure

```
musy/
├── README.md               # You are here
├── package.json            # Main workspace scripts
├── frontend/               # React + TypeScript UI
│   ├── src/
│   │   ├── bridge/         # MusicBridge abstraction layer
│   │   ├── components/     # Player, TrackList, Visualizer, ThemeSelector
│   │   ├── styles/         # Global styles and theme definitions
│   │   └── App.tsx         # Main container
│   └── package.json
├── src-tauri/              # Linux desktop host configuration
│   ├── src/
│   │   └── main.rs         # File scanner & metadata extraction
│   └── tauri.conf.json
└── android/                # Android native host project
    └── app/src/main/java/
        └── com/musy/
            ├── MainActivity.kt      # Main container & permission management
            ├── PlaybackService.kt   # Jetpack Media3 audio background service
            ├── MediaStoreScanner.kt # MediaStore database audio scanner
            └── WebAppInterface.kt   # JS-to-Native bridge definitions
```

---

## 🚀 How to Run & Build

### Prerequisites
1. **Node.js** (v18+ recommended)
2. **Rust & Cargo** (for Linux build)
3. **Android SDK** (for Android build)
4. System dependencies for Linux Webview (e.g. `webkit2gtk`, `glib`, `libsoup`).

### Development
1. Install root dependencies:
   ```bash
   npm install
   ```
2. Run Vite frontend dev server:
   ```bash
   cd frontend
   npm run dev
   ```
3. Run Tauri desktop app in dev mode (hot reload):
   ```bash
   npm run tauri dev
   ```

### Building Release Outputs
- **Build Linux Desktop Binary**:
  ```bash
  npm run tauri build
  ```
  The compiled executable will be located under `src-tauri/target/release/musy`.

- **Build Android Debug APK**:
  ```bash
  # Compile frontend first
  cd frontend && npm run build && cd ..
  # Copy static files to Android assets folder
  mkdir -p android/app/src/main/assets/www
  cp -r frontend/dist/* android/app/src/main/assets/www/
  # Compile APK
  cd android && ./gradlew assembleDebug
  ```
  The output APK will be located under `android/app/build/outputs/apk/debug/app-debug.apk`.
