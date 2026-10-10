"use client";

import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISMISS_KEY = "shop-manager-install-dismissed";

/** "Add to home screen" card: one tap on Android, short steps on iPhone. */
export default function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {}
    if (standalone || dismissed) return;

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIos) {
      setIos(true);
      setHidden(false);
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };

  if (hidden) return null;

  return (
    <div className="mt-6 rounded-3xl border border-surface-strong bg-surface p-5">
      <p className="text-lg font-semibold text-ink-deep">Put this app on your home screen</p>
      {ios ? (
        <p className="mt-1 text-base leading-relaxed text-ink/80">
          Tap the <strong className="text-ink-deep">Share</strong> button at the bottom of Safari, then <strong className="text-ink-deep">Add to Home Screen</strong>.
        </p>
      ) : (
        <p className="mt-1 text-base text-ink/80">Open it with one tap, like any other app.</p>
      )}
      <div className="mt-4 flex gap-3">
        {event && (
          <button
            type="button"
            onClick={async () => {
              await event.prompt();
              await event.userChoice;
              setHidden(true);
            }}
            className="h-12 flex-1 rounded-full bg-primary text-base font-semibold text-canvas"
          >
            Install app
          </button>
        )}
        <button type="button" onClick={dismiss} className="h-12 rounded-full border border-surface-strong px-5 text-base text-ink-deep">
          Not now
        </button>
      </div>
    </div>
  );
}
