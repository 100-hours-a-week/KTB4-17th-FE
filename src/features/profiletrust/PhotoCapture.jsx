import { useEffect, useRef, useState } from "react";
import { PixelButton } from "../../shared/ui/components.jsx";
import { PixelIcon } from "../../shared/ui/pixel.jsx";
import {
  capturePhoto,
  openCamera,
  previewCamera,
  stopCamera,
} from "./camera.js";
import { cameraError, trustError, verificationIssue } from "./model.js";

export function PhotoCapture({ onCapture, onCancel, disabled }) {
  const video = useRef(null);
  const run = useRef(null);
  const capturing = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("starting");
  const [message, setMessage] = useState("");

  // biome-ignore lint/correctness/useExhaustiveDependencies: Explicit retries must reopen the camera.
  useEffect(() => {
    const controller = new AbortController();
    const current = { controller, stream: null };
    run.current = current;
    const preview = video.current;
    const stop = () => {
      controller.abort();
      stopCamera(current.stream);
      if (preview) preview.srcObject = null;
    };
    const fail = (error) => {
      if (controller.signal.aborted) return;
      setMessage(verificationIssue(cameraError(error)).message);
      setStatus("error");
      stop();
    };
    const interrupt = () => fail(trustError("CAMERA_INTERRUPTED"));
    const visibility = () => {
      if (document.visibilityState === "hidden") interrupt();
    };
    setStatus("starting");
    setMessage("");
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", interrupt);
    void (async () => {
      try {
        if (document.visibilityState === "hidden")
          throw trustError("CAMERA_INTERRUPTED");
        current.stream = await openCamera(controller.signal, {
          recordVideo: false,
        });
        controller.signal.throwIfAborted();
        current.stream
          .getVideoTracks()[0]
          ?.addEventListener("ended", interrupt, {
            once: true,
            signal: controller.signal,
          });
        await previewCamera(preview, current.stream, controller.signal);
        controller.signal.throwIfAborted();
        setStatus("ready");
      } catch (error) {
        if (controller.signal.aborted) stopCamera(current.stream);
        else fail(error);
      }
    })();
    return () => {
      if (run.current === current) run.current = null;
      stop();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", interrupt);
    };
  }, [attempt]);

  async function takePhoto() {
    const current = run.current;
    if (disabled || status !== "ready" || capturing.current || !current) return;
    capturing.current = true;
    setStatus("capturing");
    try {
      const file = await capturePhoto(video.current);
      if (run.current !== current || current.controller.signal.aborted) return;
      current.controller.abort();
      stopCamera(current.stream);
      onCapture(file);
    } catch (error) {
      if (run.current === current && !current.controller.signal.aborted) {
        setMessage(verificationIssue(cameraError(error)).message);
        setStatus("ready");
      }
    } finally {
      capturing.current = false;
    }
  }

  return (
    <>
      <h1>정면 사진을 촬영해 주세요</h1>
      <p className="trust-subcopy">
        밝은 곳에서 얼굴 전체가 보이도록 정면을 바라봐주세요.
      </p>
      <div className="trust-camera trust-photo-camera">
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          aria-label="정면 사진 촬영 미리보기"
        />
        {status === "starting" && (
          <div className="trust-camera-placeholder" role="status">
            <PixelIcon name="bust" scale={8} /> 카메라를 준비하고 있어요…
          </div>
        )}
      </div>
      {message && (
        <p className="field-error" role="alert">
          {message}
        </p>
      )}
      {status === "error" ? (
        <PixelButton
          disabled={disabled}
          onClick={() => setAttempt((value) => value + 1)}
        >
          카메라 다시 켜기
        </PixelButton>
      ) : (
        <PixelButton
          disabled={disabled || status !== "ready"}
          onClick={() => void takePhoto()}
        >
          {status === "capturing" ? "사진을 준비하고 있어요" : "사진 촬영하기"}
        </PixelButton>
      )}
      <button
        type="button"
        className="trust-text-button"
        disabled={disabled}
        onClick={onCancel}
      >
        촬영 취소 · 사진 선택으로 돌아가기
      </button>
      <p className="trust-subcopy trust-small">
        카메라가 열리지 않으면 사이트 설정에서 카메라 권한을 허용해 주세요. 앱
        안에서 접속했다면 Safari 또는 Chrome으로 열어 주세요.
      </p>
    </>
  );
}
