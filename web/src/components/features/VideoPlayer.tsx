import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  SkipBack,
  SkipForward,
  Settings,
  Loader2,
} from 'lucide-react';
import { Button, Slider, Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { cn } from '@/utils';

export interface VideoSource {
  src: string;
  quality: '720p' | '1080p' | '4k';
  type?: string;
}

interface VideoPlayerProps {
  src?: string;
  sources?: VideoSource[];
  poster?: string;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
  className?: string;
}

export function VideoPlayer({
  src,
  sources,
  poster,
  autoPlay = false,
  loop = false,
  muted: initialMuted = false,
  onTimeUpdate,
  onEnded,
  className,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [quality, setQuality] = useState<'auto' | '720p' | '1080p' | '4k'>('auto');
  const [mediaError, setMediaError] = useState<string | null>(null);

  const availableQualities = useMemo(() => (sources ? sources.map(s => s.quality) : []), [sources]);
  const activeSrc = useMemo(() => {
    if (!sources || sources.length === 0) return src;
    if (quality === 'auto') {
      return (
        sources.find(s => s.quality === '1080p')?.src ?? sources[sources.length - 1]?.src ?? src
      );
    }
    return sources.find(s => s.quality === quality)?.src ?? src;
  }, [sources, quality, src]);
  const hasVideoSource = Boolean(activeSrc);
  const displayMediaError =
    mediaError ?? (!hasVideoSource ? 'No video source is available.' : null);

  const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getProgressPercent = (value: number) => {
    if (!Number.isFinite(value) || !Number.isFinite(duration) || duration <= 0) return 0;
    return Math.min(100, Math.max(0, (value / duration) * 100));
  };

  // Reset hide controls timeout
  const resetHideControlsTimeout = useCallback(() => {
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    setShowControls(true);
    if (isPlaying) {
      hideControlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [isPlaying]);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setIsLoading(false);
      setMediaError(null);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      onTimeUpdate?.(video.currentTime, video.duration);

      // Update buffered
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      onEnded?.();
    };

    const handleWaiting = () => setIsLoading(true);
    const handleCanPlay = () => {
      setIsLoading(false);
      setMediaError(null);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleError = () => {
      setIsLoading(false);
      setIsPlaying(false);
      setMediaError('This video could not be loaded.');
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('error', handleError);
    };
  }, [onTimeUpdate, onEnded]);

  // Fullscreen change handler
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Swap the video source while preserving currentTime/play state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!activeSrc) {
      video.removeAttribute('src');
      video.load();
      return;
    }
    if (video.src === activeSrc || video.getAttribute('src') === activeSrc) return;
    const currentTime = video.currentTime;
    const wasPlaying = !video.paused;
    video.src = activeSrc;
    video.load();
    video.currentTime = currentTime;
    if (wasPlaying) {
      void video.play().catch(() => {
        setIsPlaying(false);
        setMediaError('Video playback could not start.');
      });
    }
  }, [activeSrc]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
    };
  }, []);

  // Control functions
  const playVideo = () => {
    if (!videoRef.current) return;
    setMediaError(null);
    void videoRef.current.play().catch(() => {
      setIsPlaying(false);
      setMediaError('Video playback could not start.');
    });
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      playVideo();
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
  };

  const handleVolumeChange = (value: number) => {
    if (!videoRef.current) return;
    const newVolume = value;
    videoRef.current.volume = newVolume;
    setVolume(newVolume);
    if (newVolume === 0) {
      setIsMuted(true);
      videoRef.current.muted = true;
    } else if (isMuted) {
      setIsMuted(false);
      videoRef.current.muted = false;
    }
  };

  const seekToTime = (time: number) => {
    if (!videoRef.current || duration <= 0) return;
    const newTime = Math.max(0, Math.min(time, duration));
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    if (rect.width <= 0 || duration <= 0) return;
    const percent = (e.clientX - rect.left) / rect.width;
    seekToTime(percent * duration);
  };

  const handleSeekKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        seekToTime(currentTime - 5);
        break;
      case 'ArrowRight':
        e.preventDefault();
        seekToTime(currentTime + 5);
        break;
      case 'Home':
        e.preventDefault();
        seekToTime(0);
        break;
      case 'End':
        e.preventDefault();
        seekToTime(duration);
        break;
    }
  };

  const skip = (seconds: number) => {
    if (!videoRef.current) return;
    seekToTime(videoRef.current.currentTime + seconds);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (isFullscreen) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void containerRef.current.requestFullscreen().catch(() => undefined);
    }
  };

  const handleSpeedChange = (speed: number) => {
    if (!videoRef.current) return;
    videoRef.current.playbackRate = speed;
    setPlaybackSpeed(speed);
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative bg-black rounded-lg overflow-hidden group',
        isFullscreen && 'fixed inset-0 z-50 rounded-none',
        className
      )}
      onMouseMove={resetHideControlsTimeout}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onTouchStart={resetHideControlsTimeout}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        poster={poster}
        autoPlay={autoPlay}
        loop={loop}
        muted={isMuted}
        playsInline
        className="w-full h-full object-contain"
        onClick={togglePlay}
        aria-label="Video hotspot content"
      />

      {/* Loading Overlay */}
      {isLoading && hasVideoSource && !displayMediaError && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/50"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-12 w-12 animate-spin text-white" />
        </div>
      )}

      {displayMediaError && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/70 p-4 text-center"
          role="alert"
        >
          <p className="text-sm font-medium text-white">{displayMediaError}</p>
        </div>
      )}

      {/* Play Button Overlay (when paused) */}
      {!isPlaying && !isLoading && !displayMediaError && hasVideoSource && (
        <button
          className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
          onClick={togglePlay}
          aria-label="Play video"
        >
          <div className="w-20 h-20 rounded-full bg-white/90 flex items-center justify-center">
            <Play className="h-10 w-10 text-black ml-1" />
          </div>
        </button>
      )}

      {/* Controls Bar */}
      {hasVideoSource && !displayMediaError && (
        <div
          className={cn(
            'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 transition-opacity duration-300 motion-reduce:transition-none',
            showControls ? 'opacity-100' : 'pointer-events-none opacity-0'
          )}
        >
          {/* Progress Bar */}
          <div
            ref={progressRef}
            className="relative h-1 bg-white/30 rounded-full cursor-pointer mb-3 group/progress"
            onClick={handleSeek}
            onKeyDown={handleSeekKeyDown}
            role="slider"
            tabIndex={0}
            aria-label="Video progress"
            aria-valuemin={0}
            aria-valuemax={Math.max(0, Math.round(duration))}
            aria-valuenow={Math.round(currentTime)}
            aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
          >
            {/* Buffered */}
            <div
              className="absolute h-1 bg-white/50 rounded-full"
              style={{ width: `${getProgressPercent(buffered)}%` }}
            />
            {/* Progress */}
            <div
              className="absolute h-1 bg-[var(--color-primary-500)] rounded-full"
              style={{ width: `${getProgressPercent(currentTime)}%` }}
            />
            {/* Scrubber */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity"
              style={{ left: `${getProgressPercent(currentTime)}%` }}
            />
          </div>

          {/* Controls Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Play/Pause */}
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-white hover:bg-white/20"
                onClick={togglePlay}
                aria-label={isPlaying ? 'Pause video' : 'Play video'}
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </Button>

              {/* Skip Back */}
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-white hover:bg-white/20"
                onClick={() => skip(-10)}
                aria-label="Rewind 10 seconds"
              >
                <SkipBack className="h-4 w-4" />
              </Button>

              {/* Skip Forward */}
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-white hover:bg-white/20"
                onClick={() => skip(10)}
                aria-label="Forward 10 seconds"
              >
                <SkipForward className="h-4 w-4" />
              </Button>

              {/* Volume */}
              <div className="flex items-center gap-1 group/volume">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-white hover:bg-white/20"
                  onClick={toggleMute}
                  aria-label={isMuted || volume === 0 ? 'Unmute video' : 'Mute video'}
                  aria-pressed={isMuted || volume === 0}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="h-5 w-5" />
                  ) : (
                    <Volume2 className="h-5 w-5" />
                  )}
                </Button>
                <div className="w-0 overflow-hidden transition-all duration-200 group-hover/volume:w-20 group-focus-within/volume:w-20 motion-reduce:transition-none">
                  <Slider
                    value={isMuted ? 0 : volume}
                    onValueChange={handleVolumeChange}
                    max={1}
                    step={0.1}
                    className="w-20"
                    aria-label="Video volume"
                  />
                </div>
              </div>

              {/* Time Display */}
              <span className="text-white text-sm ml-2">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Settings */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-white hover:bg-white/20"
                    aria-label="Video settings"
                  >
                    <Settings className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48" align="end">
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-medium mb-2">Playback Speed</p>
                      <div className="grid grid-cols-4 gap-1">
                        {[0.5, 1, 1.5, 2].map(speed => (
                          <button
                            key={speed}
                            className={cn(
                              'px-2 py-1 text-xs rounded',
                              playbackSpeed === speed
                                ? 'bg-[var(--color-primary-500)] text-white'
                                : 'bg-[var(--color-surface)] hover:bg-[var(--color-surface-elevated)]'
                            )}
                            onClick={() => handleSpeedChange(speed)}
                            aria-pressed={playbackSpeed === speed}
                          >
                            {speed}x
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium mb-2">Quality</p>
                      <div className="grid grid-cols-2 gap-1">
                        {(['auto', '720p', '1080p', '4k'] as const).map(q => (
                          <button
                            key={q}
                            className={cn(
                              'px-2 py-1 text-xs rounded capitalize disabled:opacity-40 disabled:cursor-not-allowed',
                              quality === q
                                ? 'bg-[var(--color-primary-500)] text-white'
                                : 'bg-[var(--color-surface)] hover:bg-[var(--color-surface-elevated)]'
                            )}
                            onClick={() => setQuality(q)}
                            disabled={q !== 'auto' && !availableQualities.includes(q)}
                            aria-pressed={quality === q}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Fullscreen */}
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-white hover:bg-white/20"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              >
                {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
