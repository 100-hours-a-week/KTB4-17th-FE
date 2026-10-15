import { useCallback, useEffect, useRef, useState } from "react";
import { preparePrimaryPhoto } from "../profile/photoUpload.js";
import * as api from "./api.js";
import { openCamera, previewCamera, recordClip, stopCamera } from "./camera.js";
import {
  CAMERA_DURATION_MS,
  sessionIssue,
  trustError,
  verificationIssue,
} from "./model.js";
import { abortable, verifySequentially } from "./verification.js";

export function useFaceVerification() {
  const [phase, setPhase] = useState("photo");
  const [previewUrl, setPreviewUrl] = useState("");
  const [issue, setIssue] = useState(null);
  const [active, setActive] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [hint, setHint] = useState("얼굴을 가운데 맞추고 정면을 바라봐주세요.");
  const [result, setResult] = useState(null);
  const videoRef = useRef(null);
  const photoTask = useRef(null);
  const sessionRef = useRef(null);
  const runRef = useRef(null);
  const mounted = useRef(false);
  const previewRef = useRef("");
  const selection = useRef(0);

  const stopRun = useCallback(() => {
    const run = runRef.current;
    runRef.current = null;
    if (!run) return;
    run.controller.abort();
    run.cameraController.abort();
    clearTimeout(run.timer);
    stopCamera(run.stream);
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      selection.current++;
      stopRun();
      photoTask.current?.controller.abort();
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, [stopRun]);

  function selectPhoto(file) {
    if (!file) return;
    stopRun();
    photoTask.current?.controller.abort();
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = "";
    setPreviewUrl("");
    sessionRef.current = null;
    setResult(null);
    setIssue(null);
    setActive(false);
    setCameraOn(false);
    setPhase("camera");
    const selected = ++selection.current;
    const controller = new AbortController();
    const promise = (async () => {
      const prepared = await preparePrimaryPhoto(file);
      controller.signal.throwIfAborted();
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      previewRef.current = URL.createObjectURL(prepared);
      setPreviewUrl(previewRef.current);
      const intent = await api.stagePrimaryPhoto(prepared, controller.signal);
      controller.signal.throwIfAborted();
      const checked = await api.checkPrimaryPhoto(
        intent.uploadIntentId,
        controller.signal,
      );
      controller.signal.throwIfAborted();
      if (
        !checked ||
        typeof checked.passed !== "boolean" ||
        !Array.isArray(checked.reasonCodes)
      )
        throw trustError("VERIFICATION_RESPONSE_INVALID");
      if (!checked.passed)
        throw trustError("PRIMARY_PHOTO_REJECTED", {
          reasonCodes: checked.reasonCodes,
        });
      return { file: prepared, uploadIntentId: intent.uploadIntentId };
    })();
    photoTask.current = { controller, promise, file };
    // Observe immediately; the user may not have started the camera yet.
    void promise.catch((error) => {
      if (
        !mounted.current ||
        selection.current !== selected ||
        controller.signal.aborted
      )
        return;
      stopRun();
      setActive(false);
      setCameraOn(false);
      setIssue(verificationIssue(error));
      setPhase("failure");
    });
  }

  async function start() {
    if (runRef.current || !photoTask.current) return;
    const run = {
      controller: new AbortController(),
      cameraController: new AbortController(),
      stream: null,
      timer: null,
    };
    runRef.current = run;
    const current = () => mounted.current && runRef.current === run;
    const signal = run.controller.signal;
    setActive(true);
    setIssue(null);
    setPhase("camera");
    setHint("얼굴을 가운데 맞추고 정면을 바라봐주세요.");
    let removeListeners = () => {};
    try {
      // If a previous POST succeeded but its response was lost, recover that
      // result before opening the camera or submitting another video.
      let session = sessionRef.current;
      if (session) {
        session = await api.getVerification(session.sessionId, signal);
        sessionRef.current = session;
      }
      const finish = async (photo) => {
        setHint("인증 결과를 확인하고 있어요.");
        run.cameraController.abort();
        stopCamera(run.stream);
        clearTimeout(run.timer);
        if (current()) setCameraOn(false);
        const metadata = await api.completePrimaryPhoto(
          photo.uploadIntentId,
          signal,
        );
        signal.throwIfAborted();
        if (!metadata?.fileId)
          throw trustError("VERIFICATION_RESPONSE_INVALID");
        if (current()) {
          setResult({ file: photo.file, fileId: metadata.fileId });
          setPhase("success");
        }
      };
      if (session?.status === "VERIFIED") {
        await finish(await abortable(photoTask.current.promise, signal));
        return;
      }
      if (document.visibilityState === "hidden")
        throw trustError("CAMERA_INTERRUPTED");
      run.stream = await openCamera(signal);
      if (!current()) {
        stopCamera(run.stream);
        return;
      }
      const deadline = Date.now() + CAMERA_DURATION_MS;
      run.timer = setTimeout(() => {
        run.cameraController.abort(trustError("CAMERA_TIME_LIMIT"));
        stopCamera(run.stream);
        if (current()) {
          setCameraOn(false);
          setHint("촬영을 마쳤어요. 인증 결과를 확인하고 있어요.");
        }
      }, CAMERA_DURATION_MS);
      const interrupt = () => {
        if (!run.cameraController.signal.aborted && current()) {
          run.controller.abort(trustError("CAMERA_INTERRUPTED"));
          run.cameraController.abort(trustError("CAMERA_INTERRUPTED"));
          stopCamera(run.stream);
        }
      };
      const visibility = () => {
        if (document.visibilityState === "hidden") interrupt();
      };
      const track = run.stream.getVideoTracks()[0];
      track?.addEventListener("ended", interrupt);
      track?.addEventListener("mute", interrupt);
      window.addEventListener("pagehide", interrupt);
      document.addEventListener("visibilitychange", visibility);
      removeListeners = () => {
        track?.removeEventListener("ended", interrupt);
        track?.removeEventListener("mute", interrupt);
        window.removeEventListener("pagehide", interrupt);
        document.removeEventListener("visibilitychange", visibility);
      };
      await previewCamera(videoRef.current, run.stream, signal);
      if (current()) setCameraOn(true);
      // The camera preview is already live while the independent photo checks
      // run. Only session creation / video submission waits for their approval.
      const photo = await abortable(
        photoTask.current.promise,
        run.cameraController.signal,
      );
      signal.throwIfAborted();
      if (
        !session ||
        ["EXPIRED", "EXHAUSTED", "NOT_VERIFIED"].includes(session.status)
      )
        session = await api.createVerification(photo.uploadIntentId, signal);
      sessionRef.current = session;
      const verified = await verifySequentially(session, {
        signal,
        getStatus: api.getVerification,
        submit: api.submitVideo,
        canRecord: () =>
          Date.now() < deadline && !run.cameraController.signal.aborted,
        record: () =>
          recordClip(run.stream, { signal: run.cameraController.signal }),
        onSession: (next) => {
          sessionRef.current = next;
        },
        onHint: (message) => {
          if (current()) setHint(message);
        },
      });
      signal.throwIfAborted();
      if (verified.status === "VERIFIED") await finish(photo);
      else if (current()) {
        setIssue(sessionIssue(verified));
        setPhase("failure");
      }
    } catch (error) {
      if (current()) {
        setIssue(
          verificationIssue(
            signal.aborted
              ? signal.reason || trustError("CAMERA_INTERRUPTED")
              : error,
          ),
        );
        setPhase("failure");
      }
    } finally {
      removeListeners();
      clearTimeout(run.timer);
      run.cameraController.abort();
      stopCamera(run.stream);
      if (current()) {
        runRef.current = null;
        setActive(false);
        setCameraOn(false);
        if (videoRef.current) videoRef.current.srcObject = null;
      }
    }
  }

  function reset() {
    selection.current++;
    stopRun();
    photoTask.current?.controller.abort();
    photoTask.current = null;
    sessionRef.current = null;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = "";
    setPreviewUrl("");
    setActive(false);
    setCameraOn(false);
    setIssue(null);
    setResult(null);
    setPhase("photo");
  }

  function retry() {
    const task = photoTask.current;
    if (!task) {
      reset();
      return;
    }
    if (issue?.kind === "photo") {
      reset();
      return;
    }
    if (!sessionRef.current && issue?.kind === "system") {
      // Failed photo checks release their server lock for an explicit retry.
      selectPhoto(task.file);
      return;
    }
    void start();
  }

  return {
    phase,
    previewUrl,
    issue,
    active,
    cameraOn,
    hint,
    result,
    videoRef,
    selectPhoto,
    start,
    reset,
    retry,
  };
}
