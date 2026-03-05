import * as React from 'react';

interface VideoProps {
  srcObject: MediaProvider;
  talking: boolean;
}

function Video({ srcObject, talking }: VideoProps) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  const attachVideo = React.useCallback((ref: HTMLVideoElement | null) => {
    videoRef.current = ref;
    if (ref) {
      // eslint-disable-next-line no-param-reassign
      ref.srcObject = srcObject;
    }
  }, [srcObject]);

  // Monitor playback and auto-recover from browser-initiated pauses.
  // Background tab throttling can pause video elements even in PiP windows
  // because the Document PiP window shares the opener's event loop.
  React.useEffect(() => {
    const el = videoRef.current;
    if (!el) return undefined;

    const ensurePlaying = () => {
      if (el.paused && el.srcObject) {
        el.play().catch(() => {});
      }
    };

    el.addEventListener('pause', ensurePlaying);
    el.addEventListener('stalled', ensurePlaying);

    // Periodic fallback in case events are not fired
    const interval = setInterval(ensurePlaying, 2000);

    return () => {
      el.removeEventListener('pause', ensurePlaying);
      el.removeEventListener('stalled', ensurePlaying);
      clearInterval(interval);
      // Stop cloned tracks to prevent resource leaks
      if (el.srcObject instanceof MediaStream) {
        el.srcObject.getTracks().forEach((track) => track.stop());
      }
    };
  }, [srcObject]);

  const className = [];

  if (talking) {
    className.push('talking');
  }

  return (
    <video
      autoPlay
      playsInline
      muted
      ref={attachVideo}
      className={className.join(' ')}
    />
  );
}

export default Video;
