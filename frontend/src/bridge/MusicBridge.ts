// Musy Music Bridge Abstraction Layer

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // in seconds
  path: string;
  cover?: string; // Data URL or file URL
}

export interface PlaybackState {
  playing: boolean;
  position: number; // in seconds
  duration: number; // in seconds
  currentTrack: Track | null;
}

type StateCallback = (state: PlaybackState) => void;

class MusicBridge {
  private listeners: Set<StateCallback> = new Set();
  private state: PlaybackState = {
    playing: false,
    position: 0,
    duration: 0,
    currentTrack: null,
  };

  private audio: HTMLAudioElement | null = null;
  private currentPlatform: 'android' | 'tauri' | 'web' = 'web';
  private tracksCache: Track[] = [];

  constructor() {
    this.detectPlatform();
    this.setupPlatformListeners();
  }

  private detectPlatform() {
    if ((window as any).AndroidInterface) {
      this.currentPlatform = 'android';
      console.log('Musy Bridge: Detected Android platform');
    } else if ((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__) {
      this.currentPlatform = 'tauri';
      console.log('Musy Bridge: Detected Tauri (Linux) platform');
      this.setupWebAudio();
    } else {
      this.currentPlatform = 'web';
      console.log('Musy Bridge: Detected Web Browser (Mock) platform');
      this.setupWebAudio();
    }
  }

  private setupWebAudio() {
    this.audio = new Audio();
    this.audio.addEventListener('play', () => {
      this.updateState({ playing: true });
    });
    this.audio.addEventListener('pause', () => {
      this.updateState({ playing: false });
    });
    this.audio.addEventListener('timeupdate', () => {
      if (this.audio) {
        this.updateState({ position: this.audio.currentTime });
      }
    });
    this.audio.addEventListener('durationchange', () => {
      if (this.audio) {
        this.updateState({ duration: this.audio.duration || 0 });
      }
    });
    this.audio.addEventListener('ended', () => {
      this.updateState({ playing: false, position: 0 });
      const event = new CustomEvent('musy-track-ended');
      window.dispatchEvent(event);
    });
  }

  private setupPlatformListeners() {
    if (this.currentPlatform === 'android') {
      (window as any).onPlaybackStateChanged = (
        playing: boolean,
        positionMs: number,
        durationMs: number,
        trackId: string
      ) => {
        const matchingTrack = this.tracksCache.find(t => t.id === trackId) || null;
        this.updateState({
          playing,
          position: positionMs / 1000,
          duration: durationMs / 1000,
          currentTrack: matchingTrack || this.state.currentTrack,
        });
      };

      (window as any).onTrackEnded = () => {
        const event = new CustomEvent('musy-track-ended');
        window.dispatchEvent(event);
      };
    }
  }

  private updateState(newState: Partial<PlaybackState>) {
    this.state = { ...this.state, ...newState };
    this.listeners.forEach(cb => cb(this.state));
  }

  public getPlatform(): 'android' | 'tauri' | 'web' {
    return this.currentPlatform;
  }

  public subscribe(callback: StateCallback): () => void {
    this.listeners.add(callback);
    callback(this.state);
    return () => {
      this.listeners.delete(callback);
    };
  }

  public async scanTracks(): Promise<Track[]> {
    if (this.currentPlatform === 'android') {
      try {
        const jsonStr = (window as any).AndroidInterface.scanSongs();
        const tracks = JSON.parse(jsonStr) as Track[];
        this.tracksCache = tracks;
        return tracks;
      } catch (e) {
        console.error('Error scanning Android MediaStore:', e);
        return [];
      }
    } else if (this.currentPlatform === 'tauri') {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const tracks = await invoke<Track[]>('scan_music_directory');
        this.tracksCache = tracks;
        return tracks;
      } catch (e) {
        console.error('Error scanning Tauri directory:', e);
        return this.getMockTracks();
      }
    } else {
      const mock = this.getMockTracks();
      this.tracksCache = mock;
      return mock;
    }
  }

  private getMockTracks(): Track[] {
    return [
      {
        id: 'mock1',
        title: 'Retro Wave Breeze',
        artist: 'Lofi Generator',
        album: 'Acoustic Dreams',
        duration: 148,
        path: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        cover: 'https://picsum.photos/id/10/300/300',
      },
      {
        id: 'mock2',
        title: 'Chill Sunset Drive',
        artist: 'Synthwave Kid',
        album: 'Neon Horizons',
        duration: 182,
        path: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
        cover: 'https://picsum.photos/id/11/300/300',
      },
      {
        id: 'mock3',
        title: 'Midnight Coding session',
        artist: 'Coffee & Code',
        album: 'Cyber Cafe',
        duration: 218,
        path: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
        cover: 'https://picsum.photos/id/12/300/300',
      },
      {
        id: 'mock4',
        title: 'Morning Acoustic Mist',
        artist: 'Harpist Moon',
        album: 'Ethereal Forest',
        duration: 302,
        path: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
        cover: 'https://picsum.photos/id/13/300/300',
      }
    ];
  }

  public async play(track: Track) {
    this.updateState({ currentTrack: track });

    if (this.currentPlatform === 'android') {
      try {
        (window as any).AndroidInterface.playSong(
          track.path,
          track.title,
          track.artist,
          track.id,
          track.cover || ''
        );
      } catch (e) {
        console.error('Error playing on Android:', e);
      }
    } else {
      if (!this.audio) return;
      
      let src = track.path;
      if (this.currentPlatform === 'tauri') {
        try {
          const { convertFileSrc } = await import('@tauri-apps/api/core');
          src = convertFileSrc(track.path);
        } catch (e) {
          console.error('Error converting file src in Tauri:', e);
        }
      }

      this.audio.src = src;
      this.audio.load();
      try {
        await this.audio.play();
      } catch (e) {
        console.error('Playback failed:', e);
      }
    }
  }

  public pause() {
    if (this.currentPlatform === 'android') {
      try {
        (window as any).AndroidInterface.pauseSong();
      } catch (e) {
        console.error('Error pausing on Android:', e);
      }
    } else {
      if (this.audio) {
        this.audio.pause();
      }
    }
  }

  public resume() {
    if (this.currentPlatform === 'android') {
      try {
        (window as any).AndroidInterface.resumeSong();
      } catch (e) {
        console.error('Error resuming on Android:', e);
      }
    } else {
      if (this.audio && this.audio.src) {
        this.audio.play().catch(console.error);
      }
    }
  }

  public seek(seconds: number) {
    if (this.currentPlatform === 'android') {
      try {
        (window as any).AndroidInterface.seekTo(Math.floor(seconds * 1000));
      } catch (e) {
        console.error('Error seeking on Android:', e);
      }
    } else {
      if (this.audio) {
        this.audio.currentTime = seconds;
      }
    }
  }

  public setVolume(volume: number) {
    if (this.currentPlatform === 'android') {
      try {
        if ((window as any).AndroidInterface.setVolume) {
          (window as any).AndroidInterface.setVolume(volume);
        }
      } catch (e) {}
    } else {
      if (this.audio) {
        this.audio.volume = volume;
      }
    }
  }

  public getAudioContext(): { context: AudioContext; source: MediaElementAudioSourceNode } | null {
    if (this.currentPlatform === 'android' || !this.audio) {
      return null;
    }
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const context = new AudioContextClass();
      const source = context.createMediaElementSource(this.audio);
      return { context, source };
    } catch (e) {
      console.warn('AudioContext failed to initialize:', e);
      return null;
    }
  }

  public getAndroidColors(): string | null {
    if (this.currentPlatform === 'android') {
      try {
        if ((window as any).AndroidInterface.getWallpaperColors) {
          return (window as any).AndroidInterface.getWallpaperColors();
        }
      } catch (e) {}
    }
    return null;
  }
}

export const bridge = new MusicBridge();
export type { StateCallback };
