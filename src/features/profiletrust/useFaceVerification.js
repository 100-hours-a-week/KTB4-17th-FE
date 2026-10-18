import { useCallback, useEffect, useRef, useState } from "react";
import { preparePrimaryPhoto } from "../profile/photoUpload.js";
import * as api from "./api.js";
import { openCamera, previewCamera, recordClip, stopCamera } from "./camera.js";
import {
  latestAttempt,
  MAX_ATTEMPTS,
  sessionIssue,
  trustError,
  verificationIssue,
} from "./model.js";
import {
  abortable,
  assertSession,
  reconcileSession,
  verifySequentially,
} from "./verification.js";

const initialProgress = () => ({
  stage: "ready",
  attemptNo: 0,
  attemptsUsed: 0,
  completedAttempts: 0,
  maxAttempts: MAX_ATTEMPTS,
  clipProgress: 0,
});

export function useFaceVerification() {
  const [phase, setPhase] = useState("photo");
  const [previewUrl, setPreviewUrl] = useState("");
  const [issue, setIssue] = useState(null);
  const [active, setActive] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [progress, setProgress] = useState(initialProgress);
  const [hint, setHint] = useState("");
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
    run.closeCamera();
    run.removeListeners();
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
    selection.current++;
    stopRun();
    photoTask.current?.controller.abort();
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = "";
    setPreviewUrl("");
    sessionRef.current = null;
    setResult(null);
    setIssue(null);
    setActive(true);
    setCameraOn(false);
    setProgress(initialProgress());
    setPhase("checking");
    const selected = selection.current;
    const controller = new AbortController();
    const task = { controller, file, photo: null, promise: null };
    const current = () =>
      mounted.current &&
      selection.current === selected &&
      !controller.signal.aborted;
    photoTask.current = task;
    task.promise = (async () => {
      let prepared;
      try {
        prepared = await preparePrimaryPhoto(file);
      } catch (error) {
        throw typeof error?.code === "string"
          ? error
          : trustError("FILE_INVALID_CONTENT");
      }
      controller.signal.throwIfAborted();
      previewRef.current = URL.createObjectURL(prepared);
      setPreviewUrl(previewRef.current);
      const intent = await api.stagePrimaryPhoto(prepared, controller.signal);
      controller.signal.throwIfAborted();
      if (
        !Number.isSafeInteger(intent?.uploadIntentId) ||
        intent.uploadIntentId < 1
      )
        throw trustError("VERIFICATION_RESPONSE_INVALID");
      const checked = await api.checkPrimaryPhoto(
        intent.uploadIntentId,
        controller.signal,
      );
      controller.signal.throwIfAborted();
      if (
        !checked ||
        typeof checked.passed !== "boolean" ||
        !Array.isArray(checked.reasonCodes) ||
        checked.reasonCodes.some((code) => typeof code !== "string" || !code) ||
        (checked.passed
          ? checked.reasonCodes.length !== 0
          : checked.reasonCodes.length === 0)
      )
        throw trustError("VERIFICATION_RESPONSE_INVALID");
      if (!checked.passed)
        throw trustError("PRIMARY_PHOTO_REJECTED", {
          reasonCodes: checked.reasonCodes,
        });
      task.photo = { file: prepared, uploadIntentId: intent.uploadIntentId };
      return task.photo;
    })();
    void task.promise.then(
      () => {
        if (!current()) return;
        setActive(false);
        setPhase("camera");
        setHint(
          "사진 확인을 마쳤어요. 카메라를 켜고 본인 인증을 진행해 주세요.",
        );
      },
      (error) => {
        if (!current()) return;
        setActive(false);
        setIssue(verificationIssue(error));
        setPhase("failure");
      },
    );
  }

  async function start({ checkOnly = false } = {}) {
    const task = photoTask.current;
    if (runRef.current || !task?.photo) return;
    const run = {
      controller: new AbortController(),
      cameraController: new AbortController(),
      stream: null,
      closeCamera: () => {},
      removeListeners: () => {},
      stage: checkOnly ? "recovering" : "preparing",
    };
    runRef.current = run;
    const current = () => mounted.current && runRef.current === run;
    const signal = run.controller.signal;
    let removeCameraListeners = () => {};
    run.closeCamera = () => {
      removeCameraListeners();
      run.cameraController.abort();
      const stream = run.stream;
      stopCamera(stream);
      run.stream = null;
      if (stream && videoRef.current?.srcObject === stream)
        videoRef.current.srcObject = null;
      if (current()) setCameraOn(false);
    };
    const updateStage = (next) => {
      run.stage = next.stage;
      if (current()) setProgress((previous) => ({ ...previous, ...next }));
    };
    const updateSession = (session) => {
      if (!current()) return;
      sessionRef.current = session;
      setProgress((previous) => ({
        ...previous,
        attemptsUsed: session.attemptsUsed,
        completedAttempts:
          session.status === "PROCESSING"
            ? session.attemptsUsed - 1
            : session.attemptsUsed,
        maxAttempts: session.maxAttempts,
      }));
    };
    const showFailure = (nextIssue) => {
      if (!current()) return;
      setIssue(
        nextIssue.kind === "system" &&
          sessionRef.current &&
          nextIssue.action !== "restart"
          ? {
              ...nextIssue,
              action: "check",
              actionLabel: "인증 결과 다시 확인",
            }
          : nextIssue,
      );
      setPhase("failure");
    };
    const finish = async (photo) => {
      run.closeCamera();
      updateStage({ stage: "finalizing", clipProgress: 0 });
      const metadata = await api.completePrimaryPhoto(
        photo.uploadIntentId,
        signal,
      );
      signal.throwIfAborted();
      if (!Number.isSafeInteger(metadata?.fileId) || metadata.fileId < 1)
        throw trustError("VERIFICATION_RESPONSE_INVALID");
      if (current()) {
        setProgress((previous) => ({ ...previous, stage: "success" }));
        setResult({ file: photo.file, fileId: metadata.fileId });
        setPhase("success");
      }
    };
    setActive(true);
    setIssue(null);
    setPhase("camera");
    updateStage({ stage: run.stage, clipProgress: 0 });
    try {
      const photo = await abortable(task.promise, signal);
      let session = sessionRef.current;
      if (session) {
        updateStage({ stage: "recovering" });
        try {
          session = await reconcileSession(session, {
            getStatus: api.getVerification,
            signal,
            onSession: updateSession,
          });
        } catch (error) {
          if (
            checkOnly ||
            ![
              "VERIFICATION_SESSION_NOT_FOUND",
              "VERIFICATION_SESSION_EXPIRED",
              "VERIFICATION_CHALLENGE_INVALID",
            ].includes(error?.code)
          )
            throw error;
          sessionRef.current = null;
          session = null;
        }
      }
      if (session?.status === "VERIFIED") {
        await finish(photo);
        return;
      }
      if (checkOnly && session) {
        if (session.status === "READY") {
          updateStage({ stage: "ready", clipProgress: 0 });
          setHint("결과를 확인했어요. 카메라를 켜고 남은 인증을 이어가주세요.");
        } else showFailure(sessionIssue(session));
        return;
      }
      if (
        !session ||
        ["EXPIRED", "EXHAUSTED", "NOT_VERIFIED"].includes(session.status)
      ) {
        session = assertSession(
          await api.createVerification(photo.uploadIntentId, signal),
        );
        updateSession(session);
      }
      const verified = await verifySequentially(session, {
        signal,
        getStatus: api.getVerification,
        submit: api.submitVideo,
        record: async ({ attemptNo, maxAttempts }) => {
          if (document.visibilityState === "hidden")
            throw trustError("CAMERA_INTERRUPTED");
          if (!run.stream) {
            updateStage({ stage: "preparing", attemptNo, clipProgress: 0 });
            run.stream = await openCamera(run.cameraController.signal);
            signal.throwIfAborted();
            if (document.visibilityState === "hidden")
              throw trustError("CAMERA_INTERRUPTED");
            if (!current()) {
              stopCamera(run.stream);
              throw trustError("CAMERA_INTERRUPTED");
            }
            const interrupt = () => {
              if (!current()) return;
              run.controller.abort(trustError("CAMERA_INTERRUPTED"));
              run.closeCamera();
            };
            const visibility = () => {
              if (run.stream && document.visibilityState === "hidden")
                interrupt();
            };
            const track = run.stream.getVideoTracks()[0];
            track?.addEventListener("ended", interrupt);
            track?.addEventListener("mute", interrupt);
            document.addEventListener("visibilitychange", visibility);
            window.addEventListener("pagehide", interrupt);
            removeCameraListeners = () => {
              track?.removeEventListener("ended", interrupt);
              track?.removeEventListener("mute", interrupt);
            };
            run.removeListeners = () => {
              removeCameraListeners();
              document.removeEventListener("visibilitychange", visibility);
              window.removeEventListener("pagehide", interrupt);
            };
            if (!videoRef.current)
              await abortable(new Promise(requestAnimationFrame), signal);
            await previewCamera(videoRef.current, run.stream, signal);
            signal.throwIfAborted();
            if (current()) setCameraOn(true);
          }
          updateStage({
            stage: "recording",
            attemptNo,
            maxAttempts,
            clipProgress: 0,
          });
          return recordClip(run.stream, {
            signal: run.cameraController.signal,
            onProgress: (clipProgress) => {
              if (current())
                setProgress((previous) => ({ ...previous, clipProgress }));
            },
          });
        },
        onSession: updateSession,
        onStage: (next) => {
          updateStage({ ...next, clipProgress: 0 });
          if (next.stage === "analyzing" && next.attemptNo === next.maxAttempts)
            run.closeCamera();
        },
        onHint: (message) => {
          if (current()) setHint(message);
        },
      });
      signal.throwIfAborted();
      run.closeCamera();
      if (verified.status === "VERIFIED") await finish(photo);
      else showFailure(sessionIssue(verified));
    } catch (error) {
      if (current()) {
        const failure = signal.aborted
          ? signal.reason || trustError("CAMERA_INTERRUPTED")
          : error;
        const finalSession = sessionRef.current;
        const nextIssue =
          finalSession?.status === "EXHAUSTED" &&
          typeof failure?.code === "string" &&
          latestAttempt(finalSession)?.errorCode === failure?.code
            ? sessionIssue(finalSession)
            : verificationIssue(failure);
        if (run.stage === "finalizing" && nextIssue.kind === "system") {
          nextIssue.title = "인증한 사진을 저장하지 못했어요";
          nextIssue.message =
            "얼굴 인증은 완료됐어요. 결과를 다시 확인하면 사진 저장을 이어서 진행할게요.";
          nextIssue.notice =
            "얼굴 인증 결과를 다시 확인한 뒤 사진 저장을 이어가요.";
        }
        showFailure(nextIssue);
      }
    } finally {
      run.closeCamera();
      run.removeListeners();
      if (current()) {
        runRef.current = null;
        setActive(false);
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
    setProgress(initialProgress());
    setIssue(null);
    setResult(null);
    setPhase("photo");
  }

  function retry() {
    const task = photoTask.current;
    if (!task || issue?.action === "replace") {
      reset();
      return;
    }
    if (!task.photo) {
      selectPhoto(task.file);
      return;
    }
    void start({ checkOnly: issue?.action === "check" });
  }

  return {
    phase,
    previewUrl,
    issue,
    active,
    cameraOn,
    progress,
    hint,
    result,
    videoRef,
    selectPhoto,
    start,
    reset,
    retry,
  };
}
