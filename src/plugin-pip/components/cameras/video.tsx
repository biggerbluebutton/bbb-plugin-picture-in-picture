import * as React from 'react';
import { usePipWindow } from '../contexts/pip-window';

interface VideoProps {
  srcObject: MediaProvider;
  talking: boolean;
}

function Video({ srcObject, talking }: VideoProps) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const cloneRef = React.useRef<MediaStream | null>(null);
  const lastTimeRef = React.useRef<number>(-1);
  const frozenCountRef = React.useRef<number>(0);
  const originalRef = React.useRef<MediaProvider>(srcObject);
  originalRef.current = srcObject;

  // Use the PiP window's timers so they keep firing at full speed
  // even when the opener tab is throttled (e.g. minimized on Windows).
  const pipWindow = usePipWindow();

  const attachVideo = React.useCallback((ref: HTMLVideoElement | null) => {
    videoRef.current = ref;
  }, []);

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

    // Use pipWindow.setInterval — the PiP window is a visible OS window,
    // so its timers run at full speed even when the opener tab is minimized.
    const interval = pipWindow.setInterval(ensurePlaying, 2000);

    return () => {
      el.removeEventListener('pause', ensurePlaying);
      el.removeEventListener('stalled', ensurePlaying);
      pipWindow.clearInterval(interval);
      if (cloneRef.current) {
        cloneRef.current.getTracks().forEach((t) => t.stop());
        cloneRef.current = null;
      }
    };
  }, [srcObject, pipWindow]);

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
