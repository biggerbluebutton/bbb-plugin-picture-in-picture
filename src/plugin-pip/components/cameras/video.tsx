import * as React from 'react';
import { usePipWindow } from '../contexts/pip-window';

interface VideoProps {
  srcObject: MediaProvider;
  talking: boolean;
}

const TAG = '[PiP:cam]';

function Video({ srcObject, talking }: VideoProps) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const cloneRef = React.useRef<MediaStream | null>(null);
  const lastTimeRef = React.useRef<number>(-1);
  const frozenCountRef = React.useRef<number>(0);
  const recoveryAttemptRef = React.useRef<number>(0);
  const originalRef = React.useRef<MediaProvider>(srcObject);
  originalRef.current = srcObject;

  const pipWindow = usePipWindow();

  const attachVideo = React.useCallback((ref: HTMLVideoElement | null) => {
    videoRef.current = ref;
  }, []);

  React.useEffect(() => {
    const el = videoRef.current;
    if (!el) return undefined;

    const getTrackInfo = (stream: MediaStream) => {
      const tracks = stream.getTracks();
      return tracks.map((t) => `${t.kind}:${t.readyState}:enabled=${t.enabled}:muted=${t.muted}`).join(', ');
    };

    const assignClone = () => {
      if (cloneRef.current) {
        cloneRef.current.getTracks().forEach((t) => t.stop());
      }
      if (srcObject instanceof MediaStream) {
        cloneRef.current = srcObject.clone();
        // eslint-disable-next-line no-param-reassign
        el.srcObject = cloneRef.current;
        // eslint-disable-next-line no-console
        console.info(TAG, 'clone assigned', {
          originalTracks: getTrackInfo(srcObject),
          cloneTracks: getTrackInfo(cloneRef.current),
        });
      } else {
        // eslint-disable-next-line no-param-reassign
        el.srcObject = srcObject;
      }
    };

    const assignOriginalDirect = () => {
      if (cloneRef.current) {
        cloneRef.current.getTracks().forEach((t) => t.stop());
        cloneRef.current = null;
      }
      // eslint-disable-next-line no-param-reassign
      el.srcObject = srcObject;
      // eslint-disable-next-line no-console
      console.info(TAG, 'assigned original directly (no clone)');
    };

    const forceReinit = () => {
      // Detach and reattach to force Chrome to reinitialize the decode pipeline
      const src = cloneRef.current || srcObject;
      // eslint-disable-next-line no-param-reassign
      el.srcObject = null;
      // eslint-disable-next-line no-param-reassign
      el.srcObject = src;
      el.play().catch(() => {});
      // eslint-disable-next-line no-console
      console.info(TAG, 'force reinit (detach+reattach)');
    };

    assignClone();
    lastTimeRef.current = -1;
    frozenCountRef.current = 0;
    recoveryAttemptRef.current = 0;

    const ensurePlaying = () => {
      const { paused } = el;
      const ct = el.currentTime;
      const trackState = cloneRef.current ? getTrackInfo(cloneRef.current) : 'no-clone';
      const origState = originalRef.current instanceof MediaStream
        ? getTrackInfo(originalRef.current) : 'not-mediastream';

      // eslint-disable-next-line no-console
      console.debug(TAG, 'tick', {
        paused,
        currentTime: ct,
        lastTime: lastTimeRef.current,
        frozenCount: frozenCountRef.current,
        recoveryAttempt: recoveryAttemptRef.current,
        cloneTracks: trackState,
        originalTracks: origState,
        docHidden: document.hidden,
      });

      if (paused && el.srcObject) {
        // eslint-disable-next-line no-console
        console.info(TAG, 'video paused, calling play()');
        el.play().catch(() => {});
      }

      // Detect frozen video: playing but currentTime not advancing.
      // Also catches currentTime stuck at 0 (stream never started after re-clone).
      if (!paused && el.srcObject) {
        const isFrozen = ct === lastTimeRef.current;
        if (isFrozen && lastTimeRef.current !== -1) {
          frozenCountRef.current += 1;
          // eslint-disable-next-line no-console
          console.warn(TAG, 'frozen detected', {
            ct, frozenCount: frozenCountRef.current, recoveryAttempt: recoveryAttemptRef.current,
          });

          if (frozenCountRef.current >= 2) {
            frozenCountRef.current = 0;
            recoveryAttemptRef.current += 1;
            const attempt = recoveryAttemptRef.current;

            if (attempt <= 2) {
              // Strategy 1: Re-clone from original
              const orig = originalRef.current;
              if (orig instanceof MediaStream) {
                // eslint-disable-next-line no-console
                console.warn(TAG, `recovery #${attempt}: re-cloning`);
                if (cloneRef.current) {
                  cloneRef.current.getTracks().forEach((t) => t.stop());
                }
                cloneRef.current = orig.clone();
                // eslint-disable-next-line no-param-reassign
                el.srcObject = cloneRef.current;
                el.play().catch(() => {});
              }
            } else if (attempt <= 4) {
              // Strategy 2: Use original directly without cloning
              // eslint-disable-next-line no-console
              console.warn(TAG, `recovery #${attempt}: assigning original directly`);
              assignOriginalDirect();
              el.play().catch(() => {});
            } else {
              // Strategy 3: Force reinit (detach + reattach)
              // eslint-disable-next-line no-console
              console.warn(TAG, `recovery #${attempt}: force reinit`);
              forceReinit();
              // Reset counter to cycle through strategies again
              if (attempt >= 8) recoveryAttemptRef.current = 0;
            }
            // Give the new stream one tick to produce a frame
            // before the frozen detector re-triggers.
            lastTimeRef.current = -1;
          }
        } else {
          if (frozenCountRef.current > 0 || recoveryAttemptRef.current > 0) {
            // eslint-disable-next-line no-console
            console.info(TAG, 'video recovered', { ct, recoveryAttempt: recoveryAttemptRef.current });
          }
          frozenCountRef.current = 0;
          recoveryAttemptRef.current = 0;
        }
        lastTimeRef.current = ct;
      }
    };

    el.addEventListener('pause', () => {
      // eslint-disable-next-line no-console
      console.info(TAG, 'pause event fired');
      ensurePlaying();
    });
    el.addEventListener('stalled', () => {
      // eslint-disable-next-line no-console
      console.info(TAG, 'stalled event fired');
      ensurePlaying();
    });

    // eslint-disable-next-line no-console
    console.info(TAG, 'starting interval on pipWindow', { pipWindowExists: !!pipWindow });
    const interval = pipWindow.setInterval(ensurePlaying, 2000);

    return () => {
      // eslint-disable-next-line no-console
      console.info(TAG, 'cleanup: stopping clone and clearing interval');
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
