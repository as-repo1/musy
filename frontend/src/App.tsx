import React, { useState, useEffect } from 'react';
import { 
  Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, 
  Volume2, VolumeX, Palette, ChevronDown, Music 
} from 'lucide-react';
import { bridge } from './bridge/MusicBridge';
import type { Track, PlaybackState } from './bridge/MusicBridge';
import { TrackList } from './components/TrackList';
import { ThemeSelector } from './components/ThemeSelector';
import { Visualizer } from './components/Visualizer';

export default function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    playing: false,
    position: 0,
    duration: 0,
    currentTrack: null,
  });
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [theme, setTheme] = useState('nord');
  const [showThemeSelector, setShowThemeSelector] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<'none' | 'one' | 'all'>('all');
  
  // Library selection state (Android only)
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  // Mobile UI States
  const [isMobileNowPlayingOpen, setIsMobileNowPlayingOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize and Subscribe
  useEffect(() => {
    // 1. Load Theme from LocalStorage or default
    const savedTheme = localStorage.getItem('musy-theme') || 'nord';
    applyTheme(savedTheme);

    // 2. Subscribe to bridge changes (Android/Tauri/Web state)
    const unsubscribe = bridge.subscribe((state) => {
      setPlaybackState(state);
    });

    // 3. Scan library initially
    scanLibrary();

    // 4. Listen for track ended event to handle auto-advance
    const handleTrackEnded = () => {
      handleNextTrack(true); // advance naturally
    };
    window.addEventListener('musy-track-ended', handleTrackEnded);

    // 5. Check if Android interface has dynamic wallpaper colors to inject
    applyAndroidDynamicColors();

    // 6. Hook folder selected callback (Android)
    (window as any).onFolderSelected = (folderName: string) => {
      setSelectedFolder(folderName);
    };
    (window as any).scanLibrary = () => {
      scanLibrary();
    };

    return () => {
      unsubscribe();
      window.removeEventListener('musy-track-ended', handleTrackEnded);
      delete (window as any).onFolderSelected;
      delete (window as any).scanLibrary;
    };
  }, [tracks, repeat, shuffle, playbackState.currentTrack]);

  const applyTheme = (newTheme: string) => {
    setTheme(newTheme);
    localStorage.setItem('musy-theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  const applyAndroidDynamicColors = () => {
    const jsonColors = bridge.getAndroidColors();
    if (jsonColors) {
      try {
        const colors = JSON.parse(jsonColors);
        const root = document.documentElement;
        if (colors.primary) {
          root.style.setProperty('--accent', colors.primary);
          root.style.setProperty('--visualizer-bar', colors.primary);
        }
        if (colors.primaryContainer) {
          root.style.setProperty('--accent-hover', colors.primaryContainer);
        }
        if (colors.background) {
          root.style.setProperty('--bg', colors.background);
        }
        if (colors.surface) {
          root.style.setProperty('--bg-panel', colors.surface);
        }
        if (colors.onSurface) {
          root.style.setProperty('--text', colors.onSurface);
        }
        if (colors.outline) {
          root.style.setProperty('--border', colors.outline);
        }
      } catch (e) {
        console.error('Failed to parse injected Android wallpaper colors:', e);
      }
    }
  };

  // Scan music
  const scanLibrary = async () => {
    setIsLoading(true);
    try {
      const items = await bridge.scanTracks();
      setTracks(items);
    } catch (e) {
      console.error('Error scanning library:', e);
    } finally {
      setIsLoading(false);
    }
  };

  // Playback Control Methods
  const handlePlayPause = () => {
    if (!playbackState.currentTrack && tracks.length > 0) {
      handleTrackSelect(tracks[0]);
    } else if (playbackState.playing) {
      bridge.pause();
    } else {
      bridge.resume();
    }
  };

  const handleTrackSelect = (track: Track) => {
    bridge.play(track);
    if (isMobile) {
      setIsMobileNowPlayingOpen(true);
    }
  };

  const handleNextTrack = (naturalEnd = false) => {
    if (tracks.length === 0) return;

    if (naturalEnd && repeat === 'one' && playbackState.currentTrack) {
      bridge.play(playbackState.currentTrack);
      return;
    }

    let nextIndex = 0;
    if (shuffle) {
      nextIndex = Math.floor(Math.random() * tracks.length);
    } else if (playbackState.currentTrack) {
      const currentIndex = tracks.findIndex(t => t.id === playbackState.currentTrack?.id);
      nextIndex = currentIndex + 1;
      if (nextIndex >= tracks.length) {
        nextIndex = repeat === 'all' ? 0 : tracks.length - 1;
        if (repeat === 'none' && naturalEnd) {
          bridge.pause();
          bridge.seek(0);
          return;
        }
      }
    }

    handleTrackSelect(tracks[nextIndex]);
  };

  const handlePrevTrack = () => {
    if (tracks.length === 0) return;

    if (playbackState.position > 3) {
      bridge.seek(0);
      return;
    }

    let prevIndex = 0;
    if (shuffle) {
      prevIndex = Math.floor(Math.random() * tracks.length);
    } else if (playbackState.currentTrack) {
      const currentIndex = tracks.findIndex(t => t.id === playbackState.currentTrack?.id);
      prevIndex = currentIndex - 1;
      if (prevIndex < 0) {
        prevIndex = repeat === 'all' ? tracks.length - 1 : 0;
      }
    }

    handleTrackSelect(tracks[prevIndex]);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPosition = parseFloat(e.target.value);
    bridge.seek(newPosition);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    bridge.setVolume(val);
    if (isMuted && val > 0) {
      setIsMuted(false);
    }
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

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds <= 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleSelectFolder = () => {
    if (bridge.getPlatform() === 'android') {
      try {
        (window as any).AndroidInterface.selectFolder();
      } catch (e) {
        console.error('Failed to launch folder picker on Android:', e);
      }
    }
  };

  const currentCover = playbackState.currentTrack?.cover;
  const currentTitle = playbackState.currentTrack?.title || 'Not Playing';
  const currentArtist = playbackState.currentTrack?.artist || 'Select a song from local library';

  return (
    <div className="glass-panel main-window" style={styles.mainWindow}>
      
      {/* Sidebar - Track list */}
      <div style={isMobile ? styles.mobileListWrapper : styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <div style={styles.appName}>
            <Music size={24} style={{ color: 'var(--accent)', marginRight: '10px' }} />
            <h1 style={styles.logoText}>Musy</h1>
          </div>
          <button 
            onClick={() => setShowThemeSelector(!showThemeSelector)}
            style={styles.actionIconButton}
          >
            <Palette size={20} />
          </button>
        </div>

        <div style={styles.trackListContainer}>
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
        </div>
      </div>

      {/* Main Panel - Audio Player controls (Desktop View) */}
      {!isMobile && (
        <div style={styles.playerContainer}>
          {showThemeSelector && (
            <div style={styles.themeSelectorPopup}>
              <ThemeSelector 
                currentTheme={theme} 
                onChangeTheme={applyTheme} 
                onClose={() => setShowThemeSelector(false)}
              />
            </div>
          )}

          {/* Album Art Section */}
          <div style={styles.artSection}>
            <div style={styles.artCardShadow}>
              {currentCover ? (
                <img src={currentCover} alt="Cover" style={styles.largeCoverArt} />
              ) : (
                <div style={styles.largeFallbackCoverArt}>
                  <Music size={80} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
                </div>
              )}
            </div>
          </div>

          {/* Song Info */}
          <div style={styles.songInfoBlock}>
            <h2 style={styles.songTitleText}>{currentTitle}</h2>
            <p style={styles.songArtistText}>{currentArtist}</p>
          </div>

          {/* Visualizer */}
          <div style={styles.visualizerBlock}>
            <Visualizer isPlaying={playbackState.playing} theme={theme} />
          </div>

          {/* Progress Slider */}
          <div style={styles.progressBlock}>
            <input 
              type="range" 
              min={0}
              max={playbackState.duration || 100}
              value={playbackState.position}
              onChange={handleSeek}
              style={{ width: '100%' }}
            />
            <div style={styles.timeLabelContainer}>
              <span>{formatTime(playbackState.position)}</span>
              <span>{formatTime(playbackState.duration)}</span>
            </div>
          </div>

          {/* Player controls */}
          <div style={styles.controlRow}>
            <button 
              onClick={() => setShuffle(!shuffle)}
              style={{
                ...styles.controlIconBtn,
                color: shuffle ? 'var(--accent)' : 'var(--text-muted)'
              }}
            >
              <Shuffle size={18} />
            </button>

            <button onClick={handlePrevTrack} style={styles.controlIconBtn}>
              <SkipBack size={22} fill="var(--text)" />
            </button>

            <button onClick={handlePlayPause} style={styles.bigPlayBtn}>
              {playbackState.playing ? (
                <Pause size={24} fill="currentColor" />
              ) : (
                <Play size={24} fill="currentColor" style={{ marginLeft: '4px' }} />
              )}
            </button>

            <button onClick={() => handleNextTrack()} style={styles.controlIconBtn}>
              <SkipForward size={22} fill="var(--text)" />
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
              title={`Repeat: ${repeat}`}
            >
              {repeat === 'one' ? (
                <div style={{ position: 'relative' }}>
                  <Repeat size={18} />
                  <span style={styles.repeatBadge}>1</span>
                </div>
              ) : (
                <Repeat size={18} />
              )}
            </button>
          </div>

          {/* Volume Control */}
          <div style={styles.volumeBlock}>
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
              style={{ width: '100px' }}
            />
          </div>
        </div>
      )}

      {/* MOBILE MINI PLAYER BAR */}
      {isMobile && playbackState.currentTrack && (
        <div 
          onClick={() => setIsMobileNowPlayingOpen(true)}
          style={styles.mobileMiniPlayer}
        >
          <img 
            src={currentCover || 'https://picsum.photos/id/10/50/50'} 
            alt="Art" 
            style={styles.miniArt} 
          />
          <div style={styles.miniInfo}>
            <span style={styles.miniTitle}>{playbackState.currentTrack.title}</span>
            <span style={styles.miniArtist}>{playbackState.currentTrack.artist}</span>
          </div>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              handlePlayPause();
            }}
            style={styles.miniPlayBtn}
          >
            {playbackState.playing ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: '2px' }} />}
          </button>
        </div>
      )}

      {/* MOBILE FULL SCREEN NOW PLAYING SHEET */}
      {isMobile && isMobileNowPlayingOpen && (
        <div style={styles.mobileSheetContainer}>
          <div style={styles.mobileSheetHeader}>
            <button 
              onClick={() => setIsMobileNowPlayingOpen(false)}
              style={styles.sheetCloseBtn}
            >
              <ChevronDown size={28} />
            </button>
            <span style={styles.sheetHeaderTitle}>Now Playing</span>
            <button 
              onClick={() => {
                setIsMobileNowPlayingOpen(false);
                setShowThemeSelector(true);
              }}
              style={styles.sheetThemeBtn}
            >
              <Palette size={20} />
            </button>
          </div>

          <div style={styles.mobileSheetBody}>
            <div style={styles.mobileSheetArtContainer}>
              {currentCover ? (
                <img src={currentCover} alt="Cover" style={styles.mobileSheetArt} />
              ) : (
                <div style={styles.mobileSheetFallbackArt}>
                  <Music size={90} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
                </div>
              )}
            </div>

            <div style={styles.mobileSheetInfo}>
              <h2 style={styles.mobileSheetTitle}>{currentTitle}</h2>
              <p style={styles.mobileSheetArtist}>{currentArtist}</p>
            </div>

            <div style={styles.mobileSheetVisualizer}>
              <Visualizer isPlaying={playbackState.playing} theme={theme} />
            </div>

            <div style={styles.mobileSheetProgress}>
              <input 
                type="range" 
                min={0}
                max={playbackState.duration || 100}
                value={playbackState.position}
                onChange={handleSeek}
                style={{ width: '100%' }}
              />
              <div style={styles.timeLabelContainer}>
                <span>{formatTime(playbackState.position)}</span>
                <span>{formatTime(playbackState.duration)}</span>
              </div>
            </div>

            <div style={styles.mobileSheetControls}>
              <button 
                onClick={() => setShuffle(!shuffle)}
                style={{
                  ...styles.controlIconBtn,
                  color: shuffle ? 'var(--accent)' : 'var(--text-muted)'
                }}
              >
                <Shuffle size={20} />
              </button>

              <button onClick={handlePrevTrack} style={styles.controlIconBtn}>
                <SkipBack size={26} fill="var(--text)" />
              </button>

              <button onClick={handlePlayPause} style={styles.mobileBigPlayBtn}>
                {playbackState.playing ? (
                  <Pause size={28} fill="currentColor" />
                ) : (
                  <Play size={28} fill="currentColor" style={{ marginLeft: '4px' }} />
                )}
              </button>

              <button onClick={() => handleNextTrack()} style={styles.controlIconBtn}>
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
          </div>
        </div>
      )}

      {isMobile && showThemeSelector && (
        <div 
          style={styles.mobileThemeOverlay}
          onClick={() => setShowThemeSelector(false)}
        >
          <div 
            style={styles.mobileThemeSelectorDrawer}
            onClick={(e) => e.stopPropagation()}
          >
            <ThemeSelector 
              currentTheme={theme} 
              onChangeTheme={applyTheme} 
              onClose={() => setShowThemeSelector(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Styling system
const styles: { [key: string]: React.CSSProperties } = {
  mainWindow: {
    width: '960px',
    maxWidth: '100%',
    height: '620px',
    display: 'flex',
    overflow: 'hidden',
    position: 'relative',
  },
  sidebar: {
    width: '380px',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  sidebarHeader: {
    padding: '24px 20px 12px 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  appName: {
    display: 'flex',
    alignItems: 'center',
  },
  logoText: {
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--text)',
    letterSpacing: '-0.5px',
  },
  actionIconButton: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s ease',
  },
  trackListContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  playerContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
    position: 'relative',
  },
  themeSelectorPopup: {
    position: 'absolute',
    top: '20px',
    right: '20px',
    zIndex: 10,
    boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
  },
  artSection: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '24px',
  },
  artCardShadow: {
    width: '220px',
    height: '220px',
    borderRadius: '24px',
    overflow: 'hidden',
    boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
    border: '1px solid var(--glass-border)',
  },
  largeCoverArt: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  largeFallbackCoverArt: {
    width: '100%',
    height: '100%',
    backgroundColor: 'var(--bg-panel)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  songInfoBlock: {
    textAlign: 'center',
    marginBottom: '16px',
    width: '100%',
    padding: '0 20px',
  },
  songTitleText: {
    fontSize: '20px',
    fontWeight: 600,
    color: 'var(--text)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  songArtistText: {
    fontSize: '14px',
    color: 'var(--text-muted)',
    marginTop: '6px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  visualizerBlock: {
    width: '100%',
    maxWidth: '300px',
    marginBottom: '16px',
  },
  progressBlock: {
    width: '100%',
    maxWidth: '350px',
    marginBottom: '20px',
  },
  timeLabelContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: 'var(--text-muted)',
    marginTop: '6px',
  },
  controlRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '24px',
    marginBottom: '24px',
  },
  controlIconBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text)',
    cursor: 'pointer',
    opacity: 0.8,
    transition: 'opacity 0.2s, transform 0.1s',
  },
  bigPlayBtn: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    backgroundColor: 'var(--accent)',
    color: 'var(--bg)',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 0.1s ease, background-color 0.2s ease',
  },
  repeatBadge: {
    position: 'absolute',
    top: '-4px',
    right: '-6px',
    fontSize: '9px',
    fontWeight: 'bold',
    backgroundColor: 'var(--accent)',
    color: 'var(--bg)',
    borderRadius: '50%',
    width: '12px',
    height: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  volumeBlock: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  volumeIconBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
  },

  // MOBILE STYLING
  mobileListWrapper: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
  },
  mobileMiniPlayer: {
    position: 'absolute',
    bottom: '0',
    left: '0',
    right: '0',
    height: '64px',
    backgroundColor: 'var(--bg-panel)',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    cursor: 'pointer',
    zIndex: 2,
  },
  miniArt: {
    width: '40px',
    height: '40px',
    borderRadius: '8px',
    objectFit: 'cover',
    marginRight: '12px',
  },
  miniInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  miniTitle: {
    fontSize: '14px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    color: 'var(--text)',
  },
  miniArtist: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  miniPlayBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--accent)',
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },

  // Mobile now playing sheet
  mobileSheetContainer: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'var(--bg)',
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column',
  },
  mobileSheetHeader: {
    height: '60px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    borderBottom: '1px solid var(--border)',
  },
  sheetCloseBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text)',
    cursor: 'pointer',
  },
  sheetHeaderTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--text)',
  },
  sheetThemeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text)',
    cursor: 'pointer',
  },
  mobileSheetBody: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  },
  mobileSheetArtContainer: {
    width: '280px',
    height: '280px',
    borderRadius: '32px',
    overflow: 'hidden',
    boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
    marginBottom: '32px',
    border: '1px solid var(--glass-border)',
  },
  mobileSheetArt: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  mobileSheetFallbackArt: {
    width: '100%',
    height: '100%',
    backgroundColor: 'var(--bg-panel)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileSheetInfo: {
    textAlign: 'center',
    marginBottom: '20px',
    width: '100%',
  },
  mobileSheetTitle: {
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--text)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  mobileSheetArtist: {
    fontSize: '15px',
    color: 'var(--text-muted)',
    marginTop: '6px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  mobileSheetVisualizer: {
    width: '100%',
    maxWidth: '280px',
    marginBottom: '20px',
  },
  mobileSheetProgress: {
    width: '100%',
    marginBottom: '32px',
  },
  mobileSheetControls: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '0 16px',
  },
  mobileBigPlayBtn: {
    width: '68px',
    height: '68px',
    borderRadius: '50%',
    backgroundColor: 'var(--accent)',
    color: 'var(--bg)',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 24px var(--accent)33',
  },

  // Mobile Theme Selector drawer
  mobileThemeOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 200,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  mobileThemeSelectorDrawer: {
    width: '100%',
    borderTopLeftRadius: '24px',
    borderTopRightRadius: '24px',
    overflow: 'hidden',
    animation: 'slideUp 0.3s ease-out',
    boxShadow: '0 -10px 40px rgba(0,0,0,0.4)',
  },
};
