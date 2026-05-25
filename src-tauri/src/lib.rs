// Musy Tauri Library Core
use std::path::{Path, PathBuf};
use lofty::read_from_path;
use lofty::file::AudioFile;
use lofty::file::TaggedFileExt;
use lofty::tag::Accessor;
use walkdir::WalkDir;
use base64::Engine;

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct Track {
  id: String,
  title: String,
  artist: String,
  album: String,
  duration: u64, // in seconds
  path: String,
  cover: Option<String>, // Base64 Data URL
}

#[tauri::command]
fn scan_music_directory(dir_path: Option<String>) -> Result<Vec<Track>, String> {
  let target_dir = if let Some(custom_path) = dir_path {
    PathBuf::from(custom_path)
  } else {
    // Default to user's Music folder
    let home = std::env::var("HOME").map_err(|_| "Could not find HOME environment variable".to_string())?;
    PathBuf::from(home).join("Music")
  };

  if !target_dir.exists() || !target_dir.is_dir() {
    return Err(format!("Directory does not exist: {:?}", target_dir));
  }

  let mut tracks = Vec::new();
  let audio_extensions = ["mp3", "m4a", "flac", "ogg", "wav", "aac"];

  for entry in WalkDir::new(target_dir).into_iter().filter_map(|e| e.ok()) {
    let path = entry.path();
    if path.is_file() {
      if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
        if audio_extensions.contains(&ext.to_lowercase().as_str()) {
          if let Some(track) = parse_audio_file(path) {
            tracks.push(track);
          }
        }
      }
    }
  }

  // Sort tracks alphabetically by title
  tracks.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));

  Ok(tracks)
}

fn parse_audio_file(file_path: &Path) -> Option<Track> {
  let absolute_path_str = file_path.to_str()?.to_string();
  
  // Use file name as fallback title
  let file_name = file_path.file_stem()?.to_str()?.to_string();
  let mut title = file_name;
  let mut artist = "Unknown Artist".to_string();
  let mut album = "Unknown Album".to_string();
  let mut duration = 0;
  let mut cover = None;

  if let Ok(tagged_file) = read_from_path(file_path) {
    let properties = tagged_file.properties();
    duration = properties.duration().as_secs();

    if let Some(tag) = tagged_file.primary_tag() {
      if let Some(t) = tag.title() {
        if !t.trim().is_empty() {
          title = t.to_string();
        }
      }
      if let Some(a) = tag.artist() {
        if !a.trim().is_empty() {
          artist = a.to_string();
        }
      }
      if let Some(al) = tag.album() {
        if !al.trim().is_empty() {
          album = al.to_string();
        }
      }

      // Read cover art
      if let Some(picture) = tag.pictures().first() {
        let mime = picture.mime_type().map_or("image/jpeg".to_string(), |m| m.to_string());
        let data = picture.data();
        let base64_data = base64::engine::general_purpose::STANDARD.encode(data);
        cover = Some(format!("data:{};base64,{}", mime, base64_data));
      }
    }
  }

  Some(Track {
    id: absolute_path_str.clone(),
    title,
    artist,
    album,
    duration,
    path: absolute_path_str,
    cover,
  })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![scan_music_directory])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
