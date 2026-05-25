import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, 
  Volume2, VolumeX, Music, BookOpen, User, Layers
} from 'lucide-react';
import { bridge } from './bridge/MusicBridge';
import type { Track, PlaybackState } from './bridge/MusicBridge';
import { TrackList } from './components/TrackList';
import { ThemeSelector } from './components/ThemeSelector';
import { Visualizer } from './components/Visualizer';

interface LyricLine {
  time: number;
  text: string;
}

export default function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    playing: false,
    position: 0,
    duration: 0,
    currentTrack: null,
  });
  
  // Metro Pivot active state
  // Pivots: 'now-playing' | 'collection' | 'folders' | 'settings'
  const [activePivot, setActivePivot] = useState<'collection' | 'now-playing' | 'settings'>('collection');
  
  // Collection tab: 'songs' | 'artists' | 'albums' | 'queue'
  const [activeTab, setActiveTab] = useState<'songs' | 'artists' | 'albums' | 'queue'>('songs');

  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [theme, setTheme] = useState('gruvbox-dark');
  const [isLoading, setIsLoading] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<'none' | 'one' | 'all'>('all');
  
  // Library folder picker details (Android only)
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  // Active play queue
  const [playQueue, setPlayQueue] = useState<Track[]>([]);
  
  // LRC Lyrics state
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [currentLyricIndex, setCurrentLyricIndex] = useState(-1);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);

  // Search/Filters
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);

  // Stable state reference to prevent closures in events & callbacks
  const stateRef = useRef({ tracks, shuffle, repeat, currentTrack: playbackState.currentTrack, playQueue });
  useEffect(() => {
    stateRef.current = { tracks, shuffle, repeat, currentTrack: playbackState.currentTrack, playQueue };
  }, [tracks, shuffle, repeat, playbackState.currentTrack, playQueue]);

  // Decoupled lifecycle effects:
  // 1. Mount-only listener subscription
  useEffect(() => {
    // Load local stored theme
    const savedTheme = localStorage.getItem('musy-theme') || 'gruvbox-dark';
    applyTheme(savedTheme);

    // Subscribe to native playback callbacks
    const unsubscribe = bridge.subscribe((state) => {
      setPlaybackState(state);
    });

    // Run initial scan
    scanLibrary();

    // Hook native callback events
    (window as any).onFolderSelected = (folderName: string) => {
      setSelectedFolder(folderName);
    };
    (window as any).scanLibrary = () => {
      scanLibrary();
    };

    // Auto-colors on Android
    applyAndroidDynamicColors();

    // Listen for track-ended event and advance playback
    const handleTrackEnded = () => {
      handleNextTrack(true);
    };
    window.addEventListener('musy-track-ended', handleTrackEnded);

    return () => {
      unsubscribe();
      window.removeEventListener('musy-track-ended', handleTrackEnded);
      delete (window as any).onFolderSelected;
      delete (window as any).scanLibrary;
    };
  }, []);

  // 2. Fetch lyrics and parse LRC file on song change
  useEffect(() => {
    const currentTrack = playbackState.currentTrack;
    if (currentTrack) {
      try {
        const rawLrc = bridge.getLyrics(currentTrack.path);
        if (rawLrc) {
          setLyrics(parseLRC(rawLrc));
        } else {
          setLyrics([]);
        }
      } catch (e) {
        setLyrics([]);
      }
    } else {
      setLyrics([]);
    }
    setCurrentLyricIndex(-1);
  }, [playbackState.currentTrack]);

  // 3. Track active lyrics highlighting & auto-scroll
  useEffect(() => {
    if (lyrics.length === 0) return;
    const currentPos = playbackState.position;
    
    // Find matching lyric line
    let index = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (currentPos >= lyrics[i].time) {
        index = i;
      } else {
        break;
      }
    }

    if (index !== currentLyricIndex) {
      setCurrentLyricIndex(index);
      
      // Auto scroll active lyric line into center of viewport
      if (lyricsContainerRef.current && index !== -1) {
        const container = lyricsContainerRef.current;
        const activeLineElement = container.children[index] as HTMLElement;
        if (activeLineElement) {
          const containerHeight = container.clientHeight;
          const lineOffsetTop = activeLineElement.offsetTop;
          const lineHeight = activeLineElement.clientHeight;
          container.scrollTo({
            top: lineOffsetTop - containerHeight / 2 + lineHeight / 2,
            behavior: 'smooth'
          });
        }
      }
    }
  }, [playbackState.position, lyrics, currentLyricIndex]);

  // LRC lyric parser
  const parseLRC = (lrcText: string): LyricLine[] => {
    const lines = lrcText.split('\n');
    const result: LyricLine[] = [];
    const timeRegex = /\[(\d+):(\d+)(?:\.(\d+))?\]/g;

    for (const line of lines) {
      const text = line.replace(/\[\d+:\d+(?:\.\d+)?\]/g, '').trim();
      if (!text) continue;

      timeRegex.lastIndex = 0;
      let match;
      while ((match = timeRegex.exec(line)) !== null) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const milliseconds = match[3] ? parseInt(match[3], 10) * (match[3].length === 2 ? 10 : 1) : 0;
        const timeInSeconds = minutes * 60 + seconds + milliseconds / 1000;
        result.push({ time: timeInSeconds, text });
      }
    }
    return result.sort((a, b) => a.time - b.time);
  };

  const applyTheme = (newTheme: string) => {
    setTheme(newTheme);
    localStorage.setItem('musy-theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    
    // Fallback overrides if switching back to preset themes
    if (newTheme !== 'material-dark' && newTheme !== 'material-light') {
      const root = document.documentElement;
      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent-hover');
      root.style.removeProperty('--bg');
      root.style.removeProperty('--bg-panel');
      root.style.removeProperty('--text');
      root.style.removeProperty('--border');
    } else {
      applyAndroidDynamicColors();
    }
  };

  const applyAndroidDynamicColors = () => {
    const jsonColors = bridge.getAndroidColors();
    if (jsonColors) {
      try {
        const colors = JSON.parse(jsonColors);
        const root = document.documentElement;
        if (colors.primary) root.style.setProperty('--accent', colors.primary);
        if (colors.primaryContainer) root.style.setProperty('--accent-hover', colors.primaryContainer);
        if (colors.background) root.style.setProperty('--bg', colors.background);
        if (colors.surface) root.style.setProperty('--bg-panel', colors.surface);
        if (colors.onSurface) root.style.setProperty('--text', colors.onSurface);
        if (colors.outline) root.style.setProperty('--border', colors.outline);
      } catch (e) {
        console.error('Failed parsing wallpaper colors:', e);
      }
    }
  };

  const scanLibrary = async () => {
    setIsLoading(true);
    try {
      const items = await bridge.scanTracks();
      setTracks(items);
      setPlayQueue(items); // initialize active queue with scanned tracks
    } catch (e) {
      console.error('Library scan error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  // Playback Operations
  const handlePlayPause = () => {
    const { playQueue: currentQueue } = stateRef.current;
    if (!playbackState.currentTrack && currentQueue.length > 0) {
      handleTrackSelect(currentQueue[0]);
    } else if (playbackState.playing) {
      bridge.pause();
    } else {
      bridge.resume();
    }
  };

  const handleTrackSelect = (track: Track) => {
    // Add to queue if not present, but usually we just set it as active
    bridge.play(track);
  };

  const handleNextTrack = (naturalEnd = false) => {
    const { playQueue: currentQueue, shuffle: currentShuffle, repeat: currentRepeat, currentTrack } = stateRef.current;
    if (currentQueue.length === 0) return;

    if (naturalEnd && currentRepeat === 'one' && currentTrack) {
      bridge.play(currentTrack);
      return;
    }

    let nextIndex = 0;
    if (currentShuffle) {
      nextIndex = Math.floor(Math.random() * currentQueue.length);
    } else if (currentTrack) {
      const currentIndex = currentQueue.findIndex(t => t.id === currentTrack.id);
      nextIndex = currentIndex + 1;
      if (nextIndex >= currentQueue.length) {
        nextIndex = currentRepeat === 'all' ? 0 : currentQueue.length - 1;
        if (currentRepeat === 'none' && naturalEnd) {
          bridge.pause();
          bridge.seek(0);
          return;
        }
      }
    }

    const nextTrack = currentQueue[nextIndex];
    if (nextTrack) {
      handleTrackSelect(nextTrack);
    }
  };

  const handlePrevTrack = () => {
    const { playQueue: currentQueue, shuffle: currentShuffle, repeat: currentRepeat, currentTrack } = stateRef.current;
    if (currentQueue.length === 0) return;

    if (playbackState.position > 3) {
      bridge.seek(0);
      return;
    }

    let prevIndex = 0;
    if (currentShuffle) {
      prevIndex = Math.floor(Math.random() * currentQueue.length);
    } else if (currentTrack) {
      const currentIndex = currentQueue.findIndex(t => t.id === currentTrack.id);
      prevIndex = currentIndex - 1;
      if (prevIndex < 0) {
        prevIndex = currentRepeat === 'all' ? currentQueue.length - 1 : 0;
      }
    }

    const prevTrack = currentQueue[prevIndex];
    if (prevTrack) {
      handleTrackSelect(prevTrack);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPosition = parseFloat(e.target.value);
    bridge.seek(newPosition);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    bridge.setVolume(val);
    if (isMuted && val > 0) setIsMuted(false);
  };

  const toggleMute = () => {
    if (isMuted) {
      bridge.setVolume(volume);
      setIsMuted(false);
    } else {
      bridge.setVolume(0);
      setIsMuted(true);
    }
  };

  const handleSelectFolder = () => {
    if (bridge.getPlatform() === 'android') {
      try {
        (window as any).AndroidInterface.selectFolder();
      } catch (e) {
        console.error('Launch folder picker error:', e);
      }
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds <= 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Calculated categories from flat track list
  const artistsList = useMemo(() => {
    const map = new Map<string, Track[]>();
    tracks.forEach(t => {
      const artist = t.artist || 'Unknown Artist';
      if (!map.has(artist)) map.set(artist, []);
      map.get(artist)!.push(t);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [tracks]);

  const albumsList = useMemo(() => {
    const map = new Map<string, Track[]>();
    tracks.forEach(t => {
      const album = t.album || 'Unknown Album';
      if (!map.has(album)) map.set(album, []);
      map.get(album)!.push(t);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [tracks]);

  // Display fields for currently playing track
  const currentTitle = playbackState.currentTrack?.title || 'Not Playing';
  const currentArtist = playbackState.currentTrack?.artist || 'Tap collection to choose a song';
  const currentCover = playbackState.currentTrack?.cover;

  return (
    <div className="metro-hub safe-padding-top safe-padding-bottom" style={styles.hubContainer}>
      
      {/* 1. TOP METRO HEADER SECTION */}
      <div style={styles.hubHeader}>
        <span style={styles.appTitle}>MUSY PLAYER //</span>
        <div style={styles.pivotMenu}>
          <h2 
            onClick={() => setActivePivot('collection')}
            style={{
              ...styles.pivotItem,
              color: activePivot === 'collection' ? 'var(--accent)' : 'var(--text-muted)',
              opacity: activePivot === 'collection' ? 1 : 0.6
            }}
          >
            collection
          </h2>
          <h2 
            onClick={() => setActivePivot('now-playing')}
            style={{
              ...styles.pivotItem,
              color: activePivot === 'now-playing' ? 'var(--accent)' : 'var(--text-muted)',
              opacity: activePivot === 'now-playing' ? 1 : 0.6
            }}
          >
            now playing
          </h2>
          <h2 
            onClick={() => setActivePivot('settings')}
            style={{
              ...styles.pivotItem,
              color: activePivot === 'settings' ? 'var(--accent)' : 'var(--text-muted)',
              opacity: activePivot === 'settings' ? 1 : 0.6
            }}
          >
            settings
          </h2>
        </div>
      </div>

      {/* 2. SLIDING VIEWPORT PORTAL */}
      <div style={styles.viewport}>

        {/* --- PIVOT 1: COLLECTION --- */}
        {activePivot === 'collection' && (
          <div className="metro-page-active" style={styles.pageContainer}>
            {/* Metro Tab Selector Sub-header */}
            <div style={styles.tabBar}>
              <button 
                onClick={() => { setActiveTab('songs'); setSelectedArtist(null); setSelectedAlbum(null); }}
                style={{ ...styles.tabItem, color: activeTab === 'songs' ? 'var(--accent)' : 'var(--text-muted)' }}
              >
                songs
              </button>
              <button 
                onClick={() => { setActiveTab('artists'); setSelectedArtist(null); }}
                style={{ ...styles.tabItem, color: activeTab === 'artists' ? 'var(--accent)' : 'var(--text-muted)' }}
              >
                artists
              </button>
              <button 
                onClick={() => { setActiveTab('albums'); setSelectedAlbum(null); }}
                style={{ ...styles.tabItem, color: activeTab === 'albums' ? 'var(--accent)' : 'var(--text-muted)' }}
              >
                albums
              </button>
              <button 
                onClick={() => setActiveTab('queue')}
                style={{ ...styles.tabItem, color: activeTab === 'queue' ? 'var(--accent)' : 'var(--text-muted)' }}
              >
                queue ({playQueue.length})
              </button>
            </div>

            <div style={styles.tabContent}>
              {/* SONGS SUB-TAB */}
              {activeTab === 'songs' && (
                <TrackList 
                  tracks={tracks}
                  currentTrack={playbackState.currentTrack}
                  isPlaying={playbackState.playing}
                  onTrackSelect={handleTrackSelect}
                  onRefresh={scanLibrary}
                  isLoading={isLoading}
                  selectedFolder={selectedFolder}
                  onSelectFolder={handleSelectFolder}
                  isAndroid={bridge.getPlatform() === 'android'}
                />
              )}

              {/* ARTISTS SUB-TAB */}
              {activeTab === 'artists' && (
                <div style={styles.categorizedListContainer} className="no-scrollbar">
                  {!selectedArtist ? (
                    artistsList.map(([artistName, artistTracks]) => (
                      <div 
                        key={artistName}
                        onClick={() => setSelectedArtist(artistName)}
                        style={styles.metroRowTile}
                        className="metro-tile-tilt"
                      >
                        <User size={20} style={{ color: 'var(--accent)', marginRight: '16px' }} />
                        <div style={styles.tileInfo}>
                          <span style={styles.tileTitle}>{artistName}</span>
                          <span style={styles.tileSubtitle}>{artistTracks.length} tracks</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div>
                      <div style={styles.subListHeader}>
                        <button onClick={() => setSelectedArtist(null)} style={styles.backButton}>&larr; BACK TO ARTISTS</button>
                        <h3 style={styles.subCategoryTitle}>{selectedArtist}</h3>
                      </div>
                      <TrackList 
                        tracks={artistsList.find(a => a[0] === selectedArtist)?.[1] || []}
                        currentTrack={playbackState.currentTrack}
                        isPlaying={playbackState.playing}
                        onTrackSelect={handleTrackSelect}
                        onRefresh={scanLibrary}
                        isLoading={isLoading}
                        selectedFolder={null}
                        onSelectFolder={() => {}}
                        isAndroid={false}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* ALBUMS SUB-TAB */}
              {activeTab === 'albums' && (
                <div style={styles.categorizedListContainer} className="no-scrollbar">
                  {!selectedAlbum ? (
                    albumsList.map(([albumName, albumTracks]) => (
                      <div 
                        key={albumName}
                        onClick={() => setSelectedAlbum(albumName)}
                        style={styles.metroRowTile}
                        className="metro-tile-tilt"
                      >
                        <Layers size={20} style={{ color: 'var(--accent)', marginRight: '16px' }} />
                        <div style={styles.tileInfo}>
                          <span style={styles.tileTitle}>{albumName}</span>
                          <span style={styles.tileSubtitle}>{albumTracks.length} tracks</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div>
                      <div style={styles.subListHeader}>
                        <button onClick={() => setSelectedAlbum(null)} style={styles.backButton}>&larr; BACK TO ALBUMS</button>
                        <h3 style={styles.subCategoryTitle}>{selectedAlbum}</h3>
                      </div>
                      <TrackList 
                        tracks={albumsList.find(a => a[0] === selectedAlbum)?.[1] || []}
                        currentTrack={playbackState.currentTrack}
                        isPlaying={playbackState.playing}
                        onTrackSelect={handleTrackSelect}
                        onRefresh={scanLibrary}
                        isLoading={isLoading}
                        selectedFolder={null}
                        onSelectFolder={() => {}}
                        isAndroid={false}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* ACTIVE QUEUE SUB-TAB */}
              {activeTab === 'queue' && (
                <div style={styles.queueContainer}>
                  <div style={styles.queueHeaderRow}>
                    <span style={styles.queueHeaderLabel}>Active play list</span>
                    <button 
                      onClick={() => setPlayQueue([])} 
                      style={styles.textClearButton}
                      className="metro-tile-tilt"
                    >
                      CLEAR ALL
                    </button>
                  </div>
                  <TrackList 
                    tracks={playQueue}
                    currentTrack={playbackState.currentTrack}
                    isPlaying={playbackState.playing}
                    onTrackSelect={handleTrackSelect}
                    onRefresh={scanLibrary}
                    isLoading={isLoading}
                    selectedFolder={null}
                    onSelectFolder={() => {}}
                    isAndroid={false}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- PIVOT 2: NOW PLAYING --- */}
        {activePivot === 'now-playing' && (
          <div className="metro-page-active" style={styles.pageContainerNP}>
            
            {/* Left side - Cover Art, Visualizer and Metadata */}
            <div style={styles.nowPlayingPanelLeft}>
              <div style={styles.metroArtFrame}>
                {currentCover ? (
                  <img src={currentCover} alt="Album Art" style={styles.metroCoverArt} />
                ) : (
                  <div style={styles.metroCoverArtFallback}>
                    <Music size={120} style={{ color: 'var(--text-muted)', opacity: 0.15 }} />
                  </div>
                )}
              </div>

              <div style={styles.metaBlock}>
                <h1 style={styles.metroSongTitle}>{currentTitle}</h1>
                <h3 style={styles.metroSongArtist}>{currentArtist}</h3>
              </div>

              <div style={styles.npVisualizerContainer}>
                <Visualizer isPlaying={playbackState.playing} theme={theme} />
              </div>

              {/* Seek Progress Bar */}
              <div style={styles.progressContainer}>
                <input 
                  type="range" 
                  min={0}
                  max={playbackState.duration || 100}
                  value={playbackState.position}
                  onChange={handleSeek}
                  style={styles.metroSlider}
                />
                <div style={styles.timeLabelContainer}>
                  <span>{formatTime(playbackState.position)}</span>
                  <span>{formatTime(playbackState.duration)}</span>
                </div>
              </div>

              {/* Classic controls */}
              <div style={styles.npControlRow}>
                <button 
                  onClick={() => setShuffle(!shuffle)}
                  style={{
                    ...styles.controlIconBtn,
                    color: shuffle ? 'var(--accent)' : 'var(--text-muted)'
                  }}
                  className="metro-tile-tilt"
                >
                  <Shuffle size={20} />
                </button>

                <button onClick={handlePrevTrack} style={styles.controlIconBtn} className="metro-tile-tilt">
                  <SkipBack size={26} fill="var(--text)" />
                </button>

                <button onClick={handlePlayPause} style={styles.metroBigPlayBtn} className="metro-tile-tilt">
                  {playbackState.playing ? (
                    <Pause size={28} fill="currentColor" />
                  ) : (
                    <Play size={28} fill="currentColor" style={{ marginLeft: '4px' }} />
                  )}
                </button>

                <button onClick={() => handleNextTrack()} style={styles.controlIconBtn} className="metro-tile-tilt">
                  <SkipForward size={26} fill="var(--text)" />
                </button>

                <button 
                  onClick={() => {
                    if (repeat === 'none') setRepeat('all');
                    else if (repeat === 'all') setRepeat('one');
                    else setRepeat('none');
                  }}
                  style={{
                    ...styles.controlIconBtn,
                    color: repeat !== 'none' ? 'var(--accent)' : 'var(--text-muted)'
                  }}
                  className="metro-tile-tilt"
                >
                  {repeat === 'one' ? (
                    <div style={{ position: 'relative' }}>
                      <Repeat size={20} />
                      <span style={styles.repeatBadge}>1</span>
                    </div>
                  ) : (
                    <Repeat size={20} />
                  )}
                </button>
              </div>

              {/* Volume Slider */}
              <div style={styles.npVolumeRow}>
                <button onClick={toggleMute} style={styles.volumeIconBtn}>
                  {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                <input 
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  style={styles.volumeSlider}
                />
              </div>
            </div>

            {/* Right side - Dynamic Synced Lyrics Panel */}
            <div style={styles.nowPlayingPanelRight}>
              <div style={styles.lyricsHeader}>
                <BookOpen size={16} style={{ color: 'var(--accent)', marginRight: '8px' }} />
                <span>SYNCED LYRICS</span>
              </div>

              {lyrics.length === 0 ? (
                <div style={styles.lyricsEmptyState}>
                  <p>No local synced lyrics found.</p>
                  <p style={{ fontSize: '12px', marginTop: '8px', opacity: 0.6 }}>
                    Place a matching ".lrc" file in the same folder as your audio track.
                  </p>
                </div>
              ) : (
                <div 
                  ref={lyricsContainerRef} 
                  style={styles.lyricsScroller}
                  className="no-scrollbar"
                >
                  {lyrics.map((line, idx) => {
                    const isActive = idx === currentLyricIndex;
                    return (
                      <div 
                        key={idx}
                        style={{
                          ...styles.lyricsLine,
                          color: isActive ? 'var(--accent)' : 'var(--text)',
                          opacity: isActive ? 1 : 0.35,
                          fontSize: isActive ? '20px' : '15px',
                          fontWeight: isActive ? 'bold' : 'normal',
                          transform: isActive ? 'scale(1.02)' : 'scale(1)',
                        }}
                      >
                        {line.text}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* --- PIVOT 3: SETTINGS --- */}
        {activePivot === 'settings' && (
          <div className="metro-page-active" style={styles.pageContainer}>
            
            <div style={styles.settingsGrid} className="no-scrollbar">
              <h3 style={styles.settingsSectionTitle}>THEME SELECTOR</h3>
              <p style={styles.settingsSectionDesc}>
                Customize the interface accent schemes. On Android, selecting Material theme pulls custom colors directly from your wallpaper dynamically.
              </p>
              
              <div style={styles.themesGridWrapper}>
                <ThemeSelector 
                  currentTheme={theme} 
                  onChangeTheme={applyTheme} 
                  onClose={() => {}}
                />
              </div>

              <div style={{ height: '32px' }} />

              <h3 style={styles.settingsSectionTitle}>DEVELOPER DIAGNOSTICS</h3>
              
              <div style={styles.diagTile}>
                <div style={styles.diagRow}>
                  <span style={styles.diagLabel}>Platform Hook:</span>
                  <span style={styles.diagVal}>{bridge.getPlatform().toUpperCase()}</span>
                </div>
                <div style={styles.diagRow}>
                  <span style={styles.diagLabel}>Indexed Tracks:</span>
                  <span style={styles.diagVal}>{tracks.length} songs</span>
                </div>
                <div style={styles.diagRow}>
                  <span style={styles.diagLabel}>WebView Local CORS:</span>
                  <span style={styles.diagVal} className="text-success">ALLOWED</span>
                </div>
                {selectedFolder && (
                  <div style={styles.diagRow}>
                    <span style={styles.diagLabel}>Active Library path:</span>
                    <span style={styles.diagVal}>{selectedFolder}</span>
                  </div>
                )}
                <div style={styles.diagRow}>
                  <span style={styles.diagLabel}>Android API Insets:</span>
                  <span style={styles.diagVal}>ACTIVE</span>
                </div>
              </div>
            </div>

          </div>
        )}

      </div>
      
      {/* 3. METRO BOTTOM QUICK STATE BAR */}
      {playbackState.currentTrack && activePivot !== 'now-playing' && (
        <div 
          onClick={() => setActivePivot('now-playing')}
          style={styles.bottomStateBar}
          className="metro-tile-tilt"
        >
          <div style={styles.bottomMeta}>
            <span style={styles.bottomSong}>{playbackState.currentTrack.title}</span>
            <span style={styles.bottomArtist}>{playbackState.currentTrack.artist}</span>
          </div>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              handlePlayPause();
            }}
            style={styles.bottomPlayBtn}
          >
            {playbackState.playing ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: '2px' }} />}
          </button>
        </div>
      )}

    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  hubContainer: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#000000', // pure Metro background
    color: '#ffffff',
    fontFamily: 'var(--font-family)',
    position: 'relative',
    overflow: 'hidden',
  },
  hubHeader: {
    padding: '24px 24px 10px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flexShrink: 0,
  },
  appTitle: {
    fontSize: '11px',
    fontWeight: 'bold',
    letterSpacing: '3px',
    opacity: 0.5,
    textTransform: 'uppercase',
  },
  pivotMenu: {
    display: 'flex',
    gap: '24px',
    alignItems: 'baseline',
    marginTop: '6px',
    overflowX: 'auto',
  },
  pivotItem: {
    fontSize: '42px',
    fontWeight: 300,
    letterSpacing: '-1.5px',
    cursor: 'pointer',
    textTransform: 'lowercase',
    margin: 0,
    transition: 'color 0.25s, opacity 0.25s',
  },
  viewport: {
    flex: 1,
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  pageContainer: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    padding: '0 24px',
  },
  pageContainerNP: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'row',
    padding: '0 24px 24px 24px',
    gap: '32px',
    overflow: 'hidden',
  },
  tabBar: {
    display: 'flex',
    gap: '18px',
    borderBottom: '1px solid var(--border)',
    paddingBottom: '8px',
    marginBottom: '16px',
    flexShrink: 0,
    overflowX: 'auto',
  },
  tabItem: {
    background: 'none',
    border: 'none',
    fontSize: '15px',
    fontWeight: 600,
    textTransform: 'lowercase',
    cursor: 'pointer',
    padding: '4px 0',
  },
  tabContent: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  categorizedListContainer: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    paddingBottom: '24px',
  },
  metroRowTile: {
    display: 'flex',
    alignItems: 'center',
    padding: '16px',
    backgroundColor: '#111111',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  tileInfo: {
    display: 'flex',
    flexDirection: 'column',
  },
  tileTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#ffffff',
  },
  tileSubtitle: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    marginTop: '4px',
  },
  subListHeader: {
    display: 'flex',
    flexDirection: 'column',
    marginBottom: '16px',
    gap: '8px',
  },
  backButton: {
    background: 'none',
    border: 'none',
    color: 'var(--accent)',
    fontSize: '11px',
    fontWeight: 'bold',
    cursor: 'pointer',
    textAlign: 'left',
    letterSpacing: '1px',
    padding: 0,
  },
  subCategoryTitle: {
    fontSize: '24px',
    fontWeight: 300,
    color: '#ffffff',
  },
  queueContainer: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
  },
  queueHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    flexShrink: 0,
  },
  queueHeaderLabel: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
  },
  textClearButton: {
    background: 'none',
    border: 'none',
    color: 'var(--accent)',
    fontSize: '11px',
    fontWeight: 'bold',
    cursor: 'pointer',
    letterSpacing: '1px',
  },
  
  // NOW PLAYING PANEL SPLIT
  nowPlayingPanelLeft: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: '12px 0',
  },
  nowPlayingPanelRight: {
    width: '320px',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    borderLeft: '1px solid var(--border)',
    paddingLeft: '24px',
    paddingTop: '20px',
    paddingBottom: '20px',
  },
  metroArtFrame: {
    width: '180px',
    height: '180px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    backgroundColor: '#0d0d0d',
    overflow: 'hidden',
    marginBottom: '16px',
  },
  metroCoverArt: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  metroCoverArtFallback: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaBlock: {
    textAlign: 'center',
    marginBottom: '12px',
    width: '100%',
  },
  metroSongTitle: {
    fontSize: '22px',
    fontWeight: 700,
    color: '#ffffff',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    padding: '0 8px',
  },
  metroSongArtist: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    marginTop: '4px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  npVisualizerContainer: {
    width: '100%',
    maxWidth: '240px',
    height: '32px',
    marginBottom: '16px',
  },
  progressContainer: {
    width: '100%',
    maxWidth: '300px',
    marginBottom: '16px',
  },
  metroSlider: {
    width: '100%',
  },
  npControlRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    marginBottom: '16px',
  },
  controlIconBtn: {
    background: 'none',
    border: 'none',
    color: '#ffffff',
    cursor: 'pointer',
    opacity: 0.8,
  },
  metroBigPlayBtn: {
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    backgroundColor: 'var(--accent)',
    color: '#000000',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 15px rgba(255, 255, 255, 0.05)',
  },
  repeatBadge: {
    position: 'absolute',
    top: '-4px',
    right: '-6px',
    fontSize: '9px',
    fontWeight: 'bold',
    backgroundColor: 'var(--accent)',
    color: '#000000',
    borderRadius: '50%',
    width: '12px',
    height: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  npVolumeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    maxWidth: '180px',
  },
  volumeIconBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
  },
  volumeSlider: {
    flex: 1,
  },

  // SYNCED LYRICS VIEW
  lyricsHeader: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '11px',
    fontWeight: 'bold',
    letterSpacing: '1px',
    color: 'var(--text-muted)',
    marginBottom: '16px',
    flexShrink: 0,
  },
  lyricsEmptyState: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-muted)',
    fontSize: '13px',
    textAlign: 'center',
    padding: '0 16px',
  },
  lyricsScroller: {
    flex: 1,
    overflowY: 'auto',
    scrollBehavior: 'smooth',
    paddingRight: '4px',
    maskImage: 'linear-gradient(to bottom, transparent 0%, white 15%, white 85%, transparent 100%)',
    WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, white 15%, white 85%, transparent 100%)',
  },
  lyricsLine: {
    padding: '12px 0',
    transition: 'color 0.3s, opacity 0.3s, font-size 0.3s, transform 0.3s',
    lineHeight: '1.4',
    textAlign: 'left',
  },

  // SETTINGS PANEL
  settingsGrid: {
    flex: 1,
    overflowY: 'auto',
    paddingBottom: '32px',
  },
  settingsSectionTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    letterSpacing: '2px',
    color: 'var(--accent)',
    marginBottom: '8px',
  },
  settingsSectionDesc: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    lineHeight: '1.5',
    marginBottom: '16px',
  },
  themesGridWrapper: {
    width: '100%',
  },
  diagTile: {
    backgroundColor: '#0d0d0d',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '12px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  diagRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '13px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.02)',
    paddingBottom: '8px',
  },
  diagLabel: {
    color: 'var(--text-muted)',
  },
  diagVal: {
    fontFamily: 'monospace',
    color: '#ffffff',
  },

  // BOTTOM STATE BAR
  bottomStateBar: {
    position: 'absolute',
    bottom: '0',
    left: '0',
    right: '0',
    height: '56px',
    backgroundColor: '#0a0a0a',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 24px',
    cursor: 'pointer',
    zIndex: 5,
  },
  bottomMeta: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    marginRight: '12px',
  },
  bottomSong: {
    fontSize: '13px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    color: 'var(--accent)',
  },
  bottomArtist: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginTop: '2px',
  },
  bottomPlayBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--accent)',
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
};
