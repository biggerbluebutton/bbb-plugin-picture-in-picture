import * as React from 'react';

interface VideoProps {
  srcObject: MediaProvider;
  talking: boolean;
}

function Video({ srcObject, talking }: VideoProps) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const cloneRef = React.useRef<MediaStream | null>(null);
  const lastTimeRef = React.useRef<number>(-1);
  const frozenCountRef = React.useRef<number>(0);
  // Keep a live reference to the original stream so the frozen-video
  // recovery path can re-clone from it at any time.
  const originalRef = React.useRef<MediaProvider>(srcObject);
  originalRef.current = srcObject;

  const attachVideo = React.useCallback((ref: HTMLVideoElement | null) => {
    videoRef.current = ref;
  }, []);

  // Clone the original stream and assign it to the video element.
  // Cloned tracks have independent lifecycles, so background-tab
  // throttling of the source video element won't freeze the PiP copy.
  React.useEffect(() => {
    const el = videoRef.current;
    if (!el) return undefined;

    const assignClone = () => {
      if (cloneRef.current) {
        cloneRef.current.getTracks().forEach((t) => t.stop());
      }
      if (srcObject instanceof MediaStream) {
        cloneRef.current = srcObject.clone();
        // eslint-disable-next-line no-param-reassign
        el.srcObject = cloneRef.current;
      } else {
        // eslint-disable-next-line no-param-reassign
        el.srcObject = srcObject;
      }
    };

    assignClone();
    lastTimeRef.current = -1;
    frozenCountRef.current = 0;

    const ensurePlaying = () => {
      if (el.paused && el.srcObject) {
        el.play().catch(() => {});
      }

      // Detect frozen video: playing but currentTime not advancing.
      // If frozen for two consecutive checks (~4 s), re-clone from
      // the original stream to recover.
      if (!el.paused && el.srcObject) {
        const ct = el.currentTime;
        if (ct > 0 && ct === lastTimeRef.current) {
          frozenCountRef.current += 1;
          if (frozenCountRef.current >= 2) {
            frozenCountRef.current = 0;
            const orig = originalRef.current;
            if (orig instanceof MediaStream) {
              if (cloneRef.current) {
                cloneRef.current.getTracks().forEach((t) => t.stop());
              }
              cloneRef.current = orig.clone();
              // eslint-disable-next-line no-param-reassign
              el.srcObject = cloneRef.current;
              el.play().catch(() => {});
            }
          }
        } else {
          frozenCountRef.current = 0;
        }
        lastTimeRef.current = ct;
      }
    };

    el.addEventListener('pause', ensurePlaying);
    el.addEventListener('stalled', ensurePlaying);

    const interval = setInterval(ensurePlaying, 2000);

    return () => {
      el.removeEventListener('pause', ensurePlaying);
      el.removeEventListener('stalled', ensurePlaying);
      clearInterval(interval);
      if (cloneRef.current) {
        cloneRef.current.getTracks().forEach((t) => t.stop());
        cloneRef.current = null;
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
