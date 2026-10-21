// The video guide (made in a separate studio from this demo's own screens): a button in the masthead opens a modal
// dialog with the player and the chapters. The video is a static file next to the app (public/video/), same origin,
// so the demo still makes no requests to another origin; it loads only when the dialog is opened.
import { useEffect, useId, useRef, useState } from "react";
import type { MessageKey } from "../i18n/dict.ts";
import { useApp } from "../state.tsx";

const VIDEO = "video/medregnav-guide.mp4";
const POSTER = "video/medregnav-guide.jpg";
const CHAPTERS_VTT = "video/medregnav-guide.chapters.vtt";
const LENGTH_MIN = 11;

/** Where each chapter starts (s), as in the MP4's own chapter markers and the VTT track. */
export const VIDEO_CHAPTERS: readonly (readonly [number, MessageKey])[] = [
  [0, "video.ch1"],
  [53.42, "video.ch2"],
  [152.24, "video.ch3"],
  [225.96, "video.ch4"],
  [296.42, "video.ch5"],
  [362.83, "video.ch6"],
  [402.47, "video.ch7"],
  [476.31, "video.ch8"],
  [502.33, "video.ch9"],
  [563.6, "video.ch10"],
];

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function VideoGuide() {
  const { t } = useApp();
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(0);
  const titleId = useId();

  // Stop the video, close the modal and drop the player. Called directly by the Close button and on Esc ("cancel"),
  // not only from the dialog's "close" event: in Chromium that event did not reach the page, and the video kept playing
  // in a closed dialog.
  const close = () => {
    video.current?.pause();
    if (dialog.current?.open) dialog.current.close();
    setOpen(false);
    setNow(0);
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    const d = dialog.current;
    if (!open || !d) return;
    const done = (e: Event) => {
      e.preventDefault();
      closeRef.current();
    };
    d.addEventListener("cancel", done);
    d.addEventListener("close", done);
    if (!d.open) d.showModal?.();
    return () => {
      d.removeEventListener("cancel", done);
      d.removeEventListener("close", done);
    };
  }, [open]);

  const seek = (s: number) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = s;
    void v.play().catch(() => undefined);
  };
  const current = VIDEO_CHAPTERS.reduce((at, [s], i) => (now >= s ? i : at), 0);

  return (
    <>
      <button type="button" className="video-button" data-testid="video-open" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 1.8v8.4L10 6z" />
        </svg>
        {t("video.open")} <span className="video-length">{t("video.length", { min: LENGTH_MIN })}</span>
      </button>
      {open ? (
        <dialog ref={dialog} className="video-dialog" aria-labelledby={titleId} data-testid="video-dialog">
          <div className="video-head">
            <h2 id={titleId}>{t("video.title")}</h2>
            <button type="button" className="text-button" onClick={close}>
              {t("video.close")}
            </button>
          </div>
          <div className="video-body">
            {/* biome-ignore lint/a11y/useMediaCaption: the Ukrainian subtitles are burned into the picture */}
            <video
              ref={video}
              className="video-player"
              controls
              preload="metadata"
              poster={POSTER}
              src={VIDEO}
              onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
            >
              <track kind="chapters" src={CHAPTERS_VTT} srcLang="en" default />
              {t("video.unsupported")}
            </video>
            <nav className="video-chapters" aria-label={t("video.chapters")}>
              <h3>{t("video.chapters")}</h3>
              <ol>
                {VIDEO_CHAPTERS.map(([s, key], i) => (
                  <li key={key}>
                    <button type="button" aria-current={i === current ? "true" : undefined} onClick={() => seek(s)}>
                      <span className="video-time">{clock(s)}</span> {t(key)}
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
          <p className="video-note">{t("video.note")}</p>
        </dialog>
      ) : null}
    </>
  );
}
