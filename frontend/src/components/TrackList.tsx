import React, { useState, useRef, useEffect, useMemo } from 'react';
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

type SortField = 'title' | 'artist' | 'album';

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
  const [sortBy, setSortBy] = useState<SortField>('title');
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(500);

  const containerRef = useRef<HTMLDivElement>(null);

  // Monitor container height for virtualization calculations
  useEffect(() => {
    if (containerRef.current) {
      const resizeObserver = new ResizeObserver((entries) => {
        for (let entry of entries) {
          setContainerHeight(entry.contentRect.height || 500);
        }
      });
      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
    }
  }, []);

  // Filter and Sort Tracks
  const processedTracks = useMemo(() => {
    let result = tracks.filter(
      track =>
        track.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        track.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (track.album && track.album.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    result.sort((a, b) => {
      const valA = (a[sortBy] || '').toLowerCase();
      const valB = (b[sortBy] || '').toLowerCase();
      return valA.localeCompare(valB);
    });

    return result;
  }, [tracks, searchQuery, sortBy]);

  // Virtual Scroll Calculations
  const rowHeight = 56;
  const buffer = 5;
  const totalHeight = processedTracks.length * rowHeight;
  
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - buffer);
  const endIndex = Math.min(
    processedTracks.length,
    Math.ceil((scrollTop + containerHeight) / rowHeight) + buffer
  );

  const visibleTracks = processedTracks.slice(startIndex, endIndex);

  const formatDuration = (seconds: number) => {
    if (isNaN(seconds) || seconds <= 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div style={styles.container}>
      {/* 1. Metro Search and Refresh Header */}
      <div style={styles.searchBarWrapper}>
        <div style={styles.searchContainer}>
          <Search size={16} style={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search library..."
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              setScrollTop(0); // reset scroll when searching
              if (containerRef.current) containerRef.current.scrollTop = 0;
            }}
            style={styles.searchInput}
          />
        </div>
        
        {isAndroid && (
          <button 
            onClick={onSelectFolder} 
            style={styles.actionBtn}
            className="metro-tile-tilt"
            title="Choose folder"
          >
            <FolderOpen size={16} />
          </button>
        )}

        <button 
          onClick={onRefresh} 
          style={{
            ...styles.actionBtn,
            animation: isLoading ? 'spin 1.5s linear infinite' : 'none'
          }}
          className="metro-tile-tilt"
          disabled={isLoading}
          title="Rescan"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* 2. Sort Filters */}
      <div style={styles.filterBar}>
        <span style={styles.filterLabel}>Sort by //</span>
        <button 
          onClick={() => setSortBy('title')}
          style={{ ...styles.filterBtn, color: sortBy === 'title' ? 'var(--accent)' : 'var(--text-muted)' }}
        >
          title
        </button>
        <button 
          onClick={() => setSortBy('artist')}
          style={{ ...styles.filterBtn, color: sortBy === 'artist' ? 'var(--accent)' : 'var(--text-muted)' }}
        >
          artist
        </button>
        <button 
          onClick={() => setSortBy('album')}
          style={{ ...styles.filterBtn, color: sortBy === 'album' ? 'var(--accent)' : 'var(--text-muted)' }}
        >
          album
        </button>
      </div>

      {selectedFolder && (
        <div style={styles.selectedFolderLabel}>
          <FolderOpen size={12} style={{ marginRight: '6px', color: 'var(--accent)' }} />
          <span>Folder: <span style={{ color: '#ffffff' }}>{selectedFolder}</span></span>
        </div>
      )}

      {/* 3. High Performance Scroll Viewport */}
      <div 
        ref={containerRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        style={styles.scrollList}
        className="no-scrollbar"
      >
        {processedTracks.length === 0 ? (
          <div style={styles.emptyState}>
            <Music size={32} style={{ marginBottom: '8px', opacity: 0.2 }} />
            <p>{isLoading ? 'Scanning files...' : 'No songs found'}</p>
          </div>
        ) : (
          <div style={{ height: `${totalHeight}px`, position: 'relative', width: '100%' }}>
            {visibleTracks.map((track, i) => {
              const actualIndex = startIndex + i;
              const isCurrent = currentTrack?.id === track.id;
              
              return (
                <div
                  key={track.id}
                  onClick={() => onTrackSelect(track)}
                  style={{
                    ...styles.trackRow,
                    top: `${actualIndex * rowHeight}px`,
                    backgroundColor: isCurrent ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                    borderLeft: isCurrent ? '3px solid var(--accent)' : 'none',
                    paddingLeft: isCurrent ? '17px' : '20px',
                  }}
                  className="metro-tile-tilt"
                >
                  <div style={styles.artWrapper}>
                    {track.cover ? (
                      <img src={track.cover} alt="Cover" style={styles.albumArt} />
                    ) : (
                      <div style={styles.fallbackArt}>
                        <Music size={14} style={{ color: 'var(--text-muted)' }} />
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
                        color: isCurrent ? 'var(--accent)' : '#ffffff',
                        fontWeight: isCurrent ? 'bold' : 'normal',
                      }}
                    >
                      {track.title}
                    </span>
                    <span style={styles.trackArtist}>
                      {track.artist} {track.album ? `• ${track.album}` : ''}
                    </span>
                  </div>

                  <span style={styles.trackDuration}>{formatDuration(track.duration)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
  },
  searchBarWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 0',
  },
  searchContainer: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    background: '#111111',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    padding: '0 12px',
    borderRadius: '4px',
  },
  searchIcon: {
    color: 'var(--text-muted)',
    marginRight: '8px',
  },
  searchInput: {
    width: '100%',
    height: '38px',
    background: 'none',
    border: 'none',
    outline: 'none',
    color: '#ffffff',
    fontFamily: 'inherit',
    fontSize: '13px',
  },
  actionBtn: {
    background: '#111111',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    color: '#ffffff',
    borderRadius: '4px',
    width: '38px',
    height: '38px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  },
  filterBar: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    padding: '4px 0 10px 0',
  },
  filterLabel: {
    fontSize: '11px',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    letterSpacing: '1px',
  },
  filterBtn: {
    background: 'none',
    border: 'none',
    fontSize: '12px',
    cursor: 'pointer',
    padding: '2px 0',
    textTransform: 'lowercase',
    fontWeight: 600,
  },
  selectedFolderLabel: {
    display: 'flex',
    alignItems: 'center',
    paddingBottom: '8px',
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  scrollList: {
    flex: 1,
    overflowY: 'auto',
    position: 'relative',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 0',
    color: 'var(--text-muted)',
    fontSize: '13px',
  },
  trackRow: {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    position: 'absolute',
    left: 0,
    right: 0,
    height: '56px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.01)',
  },
  artWrapper: {
    position: 'relative',
    width: '36px',
    height: '36px',
    overflow: 'hidden',
    marginRight: '14px',
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
    backgroundColor: '#111111',
    border: '1px solid rgba(255, 255, 255, 0.03)',
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
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: '2px',
    paddingBottom: '8px',
  },
  playingBar1: {
    width: '2px',
    height: '12px',
    backgroundColor: 'var(--accent)',
    animation: 'bounce 1s infinite alternate ease-in-out',
  },
  playingBar2: {
    width: '2px',
    height: '12px',
    backgroundColor: 'var(--accent)',
    animation: 'bounce 0.8s infinite alternate ease-in-out 0.2s',
  },
  playingBar3: {
    width: '2px',
    height: '12px',
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
    fontSize: '13px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  trackArtist: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginTop: '2px',
  },
  trackDuration: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    marginLeft: '12px',
  },
};
