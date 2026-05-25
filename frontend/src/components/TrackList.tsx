import React, { useState } from 'react';
import { Search, Music, RefreshCw, FolderOpen } from 'lucide-react';
import type { Track } from '../bridge/MusicBridge';

interface TrackListProps {
  tracks: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  onTrackSelect: (track: Track) => void;
  onRefresh: () => void;
  isLoading: boolean;
  selectedFolder: string | null;
  onSelectFolder: () => void;
  isAndroid: boolean;
}

export const TrackList: React.FC<TrackListProps> = ({
  tracks,
  currentTrack,
  isPlaying,
  onTrackSelect,
  onRefresh,
  isLoading,
  selectedFolder,
  onSelectFolder,
  isAndroid,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTracks = tracks.filter(
    track =>
      track.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      track.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (track.album && track.album.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const formatDuration = (seconds: number) => {
    if (isNaN(seconds) || seconds <= 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div style={styles.container}>
      <div style={styles.searchBarWrapper}>
        <div style={styles.searchContainer}>
          <Search size={18} style={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search tracks, artists, albums..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={styles.searchInput}
          />
        </div>
        
        {isAndroid && (
          <button 
            onClick={onSelectFolder} 
            style={styles.refreshBtn}
            title="Select library folder"
          >
            <FolderOpen size={18} />
          </button>
        )}

        <button 
          onClick={onRefresh} 
          style={{
            ...styles.refreshBtn,
            animation: isLoading ? 'spin 1.5s linear infinite' : 'none'
          }}
          disabled={isLoading}
          title="Rescan music library"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {selectedFolder && (
        <div style={styles.selectedFolderLabel}>
          <FolderOpen size={13} style={{ marginRight: '6px', color: 'var(--accent)' }} />
          <span>Library: <strong style={{ color: 'var(--text)' }}>{selectedFolder}</strong></span>
        </div>
      )}

      <div style={styles.listHeader}>
        <span style={styles.headerCol}>Title</span>
        <span style={{ ...styles.headerCol, marginLeft: 'auto', marginRight: '16px' }}>Duration</span>
      </div>

      <div style={styles.scrollList}>
        {filteredTracks.length === 0 ? (
          <div style={styles.emptyState}>
            <Music size={40} style={{ marginBottom: '12px', opacity: 0.3 }} />
            <p>{isLoading ? 'Scanning media...' : 'No tracks found'}</p>
          </div>
        ) : (
          filteredTracks.map(track => {
            const isCurrent = currentTrack?.id === track.id;
            return (
              <div
                key={track.id}
                onClick={() => onTrackSelect(track)}
                style={{
                  ...styles.trackRow,
                  backgroundColor: isCurrent ? 'var(--card-bg)' : 'transparent',
                }}
              >
                <div style={styles.artWrapper}>
                  {track.cover ? (
                    <img src={track.cover} alt="Cover" style={styles.albumArt} />
                  ) : (
                    <div style={styles.fallbackArt}>
                      <Music size={16} style={{ color: 'var(--text-muted)' }} />
                    </div>
                  )}
                  {isCurrent && isPlaying && (
                    <div style={styles.playingIndicatorOverlay}>
                      <div style={styles.playingBar1} />
                      <div style={styles.playingBar2} />
                      <div style={styles.playingBar3} />
                    </div>
                  )}
                </div>

                <div style={styles.infoWrapper}>
                  <span
                    style={{
                      ...styles.trackTitle,
                      color: isCurrent ? 'var(--accent)' : 'var(--text)',
                      fontWeight: isCurrent ? '600' : '400',
                    }}
                  >
                    {track.title}
                  </span>
                  <span style={styles.trackArtist}>{track.artist}</span>
                </div>

                <span style={styles.trackDuration}>{formatDuration(track.duration)}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Embedded CSS animation for spinner */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
    padding: '8px 0',
  },
  searchBarWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 16px 12px 16px',
  },
  searchContainer: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    background: 'var(--bg-panel)',
    borderRadius: '14px',
    border: '1px solid var(--border)',
    padding: '0 14px',
  },
  searchIcon: {
    color: 'var(--text-muted)',
    marginRight: '10px',
  },
  searchInput: {
    width: '100%',
    height: '42px',
    background: 'none',
    border: 'none',
    outline: 'none',
    color: 'var(--text)',
    fontFamily: 'inherit',
    fontSize: '14px',
  },
  refreshBtn: {
    background: 'var(--bg-panel)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    borderRadius: '14px',
    width: '42px',
    height: '42px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'background 0.2s ease, transform 0.1s ease',
    flexShrink: 0,
  },
  selectedFolderLabel: {
    display: 'flex',
    alignItems: 'center',
    padding: '0px 24px 10px 24px',
    fontSize: '13px',
    color: 'var(--text-muted)',
  },
  listHeader: {
    display: 'flex',
    padding: '8px 24px',
    borderBottom: '1px solid var(--border)',
    color: 'var(--text-muted)',
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '1px',
  },
  headerCol: {
    display: 'block',
  },
  scrollList: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 0',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 0',
    color: 'var(--text-muted)',
    fontSize: '14px',
  },
  trackRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 20px',
    cursor: 'pointer',
    borderRadius: '14px',
    margin: '4px 12px',
    transition: 'background-color 0.2s ease, transform 0.1s ease',
  },
  artWrapper: {
    position: 'relative',
    width: '42px',
    height: '42px',
    borderRadius: '8px',
    overflow: 'hidden',
    marginRight: '16px',
    flexShrink: 0,
  },
  albumArt: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  fallbackArt: {
    width: '100%',
    height: '100%',
    backgroundColor: 'var(--bg-panel)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playingIndicatorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: '3px',
    paddingBottom: '10px',
  },
  playingBar1: {
    width: '3px',
    height: '16px',
    backgroundColor: 'var(--accent)',
    animation: 'bounce 1s infinite alternate ease-in-out',
  },
  playingBar2: {
    width: '3px',
    height: '16px',
    backgroundColor: 'var(--accent)',
    animation: 'bounce 0.8s infinite alternate ease-in-out 0.2s',
  },
  playingBar3: {
    width: '3px',
    height: '16px',
    backgroundColor: 'var(--accent)',
    animation: 'bounce 1.2s infinite alternate ease-in-out 0.1s',
  },
  infoWrapper: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    overflow: 'hidden',
  },
  trackTitle: {
    fontSize: '14px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  trackArtist: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginTop: '2px',
  },
  trackDuration: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    marginLeft: 'auto',
  },
};
