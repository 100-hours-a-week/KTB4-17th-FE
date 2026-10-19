import { useEffect, useRef, useState } from "react";
import { apiErrorMessage } from "../../shared/api/errorMessages.js";
import { PixelButton } from "../../shared/ui/components.jsx";
import { AiAvatar, PixelIcon } from "../../shared/ui/pixel.jsx";
import { kakaoExtract, kakaoInspect } from "../persona/api.js";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

function fileSizeLabel(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function KakaoConversationStep({ onContinue, toast }) {
  const [file, setFile] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [speakerName, setSpeakerName] = useState("");
  const [automaticSpeaker, setAutomaticSpeaker] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");
  const fileInput = useRef(null);
  const mounted = useRef(false);
  const requestVersion = useRef(0);
  const inspectController = useRef(null);
  const submissionInFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestVersion.current += 1;
      inspectController.current?.abort();
    };
  }, []);

  const isCurrentRequest = (version) =>
    mounted.current && requestVersion.current === version;
  const submitting = phase === "submitting";
  const canSubmit = phase === "ready" && file && speakerName;

  function removeFile() {
    if (submissionInFlight.current) return;
    requestVersion.current += 1;
    inspectController.current?.abort();
    inspectController.current = null;
    if (fileInput.current) fileInput.current.value = "";
    setFile(null);
    setParticipants([]);
    setSpeakerName("");
    setAutomaticSpeaker(false);
    setPhase("idle");
    setError("");
  }

  async function selectFile(event) {
    const selectedFile = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!selectedFile || submissionInFlight.current) return;
    removeFile();
    if (!/\.(txt|csv)$/i.test(selectedFile.name)) {
      setError(apiErrorMessage("KAKAO_FILE_TYPE_NOT_ALLOWED"));
      return;
    }
    if (selectedFile.size === 0) {
      setError("빈 파일은 올릴 수 없어요. 다른 대화 파일을 선택해 주세요.");
      return;
    }
    if (selectedFile.size > MAX_FILE_BYTES) {
      setError(apiErrorMessage("KAKAO_FILE_TOO_LARGE"));
      return;
    }

    const version = requestVersion.current;
    const controller = new AbortController();
    inspectController.current = controller;
    setFile(selectedFile);
    setPhase("inspecting");
    try {
      const result = await kakaoInspect(selectedFile, {
        signal: controller.signal,
      });
      if (!isCurrentRequest(version)) return;
      if (
        !Array.isArray(result?.participants) ||
        !result.participants.length ||
        !result.participants.every(
          (person) => typeof person?.name === "string",
        ) ||
        typeof result.speakerSelectionRequired !== "boolean" ||
        (!result.speakerSelectionRequired &&
          !result.participants.some(
            (person) => person.name === result.selectedSpeakerName,
          ))
      ) {
        throw new Error("Invalid speaker response");
      }
      setParticipants(
        [...result.participants].sort((left, right) =>
          left.name.localeCompare(right.name, "ko"),
        ),
      );
      setAutomaticSpeaker(!result.speakerSelectionRequired);
      setSpeakerName(
        result.speakerSelectionRequired ? "" : result.selectedSpeakerName,
      );
      setPhase("ready");
    } catch (requestError) {
      if (!isCurrentRequest(version)) return;
      setPhase("idle");
      setError(
        apiErrorMessage(
          requestError,
          "대화에 나온 이름을 확인하지 못했어요. 파일을 제거하고 다시 선택해 주세요.",
        ),
      );
    } finally {
      if (inspectController.current === controller)
        inspectController.current = null;
    }
  }

  function continueWithoutWaiting() {
    requestVersion.current += 1;
    inspectController.current?.abort();
    onContinue();
  }

  async function submit() {
    if (!canSubmit || submissionInFlight.current) return;
    submissionInFlight.current = true;
    const version = requestVersion.current;
    setPhase("submitting");
    setError("");
    try {
      const result = await kakaoExtract(file, speakerName);
      if (!isCurrentRequest(version)) return;
      if (
        typeof result?.jobId !== "string" ||
        !result.jobId ||
        result.status !== "pending"
      ) {
        const responseError = new Error("Invalid acceptance response");
        responseError.code = "AI_SUBMISSION_OUTCOME_UNKNOWN";
        throw responseError;
      }
      setPhase("accepted");
      toast?.("대화 분석을 요청했어요.");
      onContinue();
    } catch (requestError) {
      if (!isCurrentRequest(version)) return;
      const outcomeUnknown =
        requestError.code === "AI_SUBMISSION_OUTCOME_UNKNOWN" ||
        !requestError.status;
      const alreadyRunning = requestError.code === "AI_EXTRACTION_IN_PROGRESS";
      setPhase(outcomeUnknown || alreadyRunning ? "blocked" : "ready");
      setError(
        apiErrorMessage(
          outcomeUnknown ? "AI_SUBMISSION_OUTCOME_UNKNOWN" : requestError,
          "대화를 전달하지 못했어요. 다른 파일을 선택하거나 건너뛰어 주세요.",
        ),
      );
    } finally {
      submissionInFlight.current = false;
    }
  }

  return (
    <section
      className="kakao-conversation-step"
      aria-label="카카오톡 대화 추가"
    >
      <div className="kakao-conversation-content">
        <div className="onboarding-prompt">
          <AiAvatar size={42} />
          <div>
            <h1 className="onboarding-title">
              평소 말투도 알려 주세요 <small>선택사항</small>
            </h1>
            <p className="subcopy">
              카카오톡 대화를 참고해 AI가 내 말투와 표현 방식을 이해할 수
              있어요.
            </p>
          </div>
        </div>

        <section className="onboarding-note tint">
          <strong className="onboarding-note-label">
            <PixelIcon name="lock" />
            대화를 추가하기 전에
          </strong>
          <p>대화 추가는 선택사항이에요. 부담스럽다면 건너뛰어도 돼요.</p>
          <p className="kakao-data-notice">
            업로드한 파일은 AI 분석 서버로 전달돼요. 본인으로 지정된 이름의
            텍스트 대화는 대화 스타일 분석을 위해 저장·사용돼요.
          </p>
        </section>

        <input
          ref={fileInput}
          type="file"
          name="kakaoExport"
          accept=".txt,.csv"
          aria-label="카카오톡 내보내기 파일 선택"
          className="kakao-file-input"
          tabIndex={-1}
          disabled={submitting}
          onChange={selectFile}
        />
        {!file ? (
          <button
            type="button"
            className="kakao-file-picker"
            onClick={() => fileInput.current?.click()}
          >
            <span className="kakao-upload-icon" aria-hidden="true">
              <PixelIcon name="chat" scale={4} />
            </span>
            <strong>카카오톡 파일 선택</strong>
            <span>대화 내보내기로 받은 원본 파일을 선택해 주세요.</span>
            <small>TXT · CSV / 최대 5MB</small>
          </button>
        ) : (
          <section className="kakao-file-card" aria-label="선택한 파일">
            <div>
              <span className="kakao-section-label">선택한 파일</span>
              <strong className="kakao-file-name">{file.name}</strong>
              <small>{fileSizeLabel(file.size)}</small>
            </div>
            <button
              type="button"
              className="kakao-remove-file"
              aria-label="선택한 카카오톡 파일 제거"
              onClick={removeFile}
              disabled={submitting}
            >
              파일 제거
            </button>
          </section>
        )}

        {phase === "inspecting" && (
          <p role="status" className="kakao-request-status">
            파일을 확인하고 있어요…
          </p>
        )}
        {participants.length > 0 &&
          (automaticSpeaker ? (
            <section
              className="kakao-automatic-speaker"
              aria-label="대화에서 확인된 본인 이름"
            >
              <PixelIcon name="check" />
              <div>
                <span className="kakao-section-label">
                  대화에서 확인된 내 이름
                </span>
                <strong>{speakerName}</strong>
              </div>
            </section>
          ) : (
            <fieldset className="kakao-speakers">
              <legend>대화 참여자 중 본인은 누구인가요?</legend>
              <p>
                업로드한 대화에 등장하는 이름 중 본인의 이름을 선택해 주세요.
                본인의 메시지를 구분하는 데 사용돼요.
              </p>
              <div className="kakao-speaker-list">
                {participants.map(({ name }) => (
                  <label
                    key={name}
                    className={`choice kakao-speaker-option${speakerName === name ? " selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="kakao-speaker"
                      value={name}
                      checked={speakerName === name}
                      disabled={submitting || phase === "blocked"}
                      onChange={() => {
                        setSpeakerName(name);
                        setError("");
                      }}
                    />
                    <span>{name}</span>
                  </label>
                ))}
              </div>
              <p className="kakao-speaker-help">
                본인의 이름이 없다면 파일을 제거하고 다른 대화 파일을 올려
                주세요.
              </p>
            </fieldset>
          ))}

        {submitting && (
          <div role="status" className="kakao-request-status">
            <p>대화를 전달하고 있어요…</p>
            <small>
              요청을 보낸 뒤에는 화면을 나가도 분석이 진행될 수 있어요.
            </small>
          </div>
        )}
        {error && (
          <p role="alert" className="field-error kakao-error">
            <PixelIcon name="alert" />
            {error}
          </p>
        )}
      </div>

      <div className="onboarding-action kakao-conversation-actions">
        <PixelButton
          secondary
          className="onboarding-ghost"
          onClick={continueWithoutWaiting}
        >
          {submitting || phase === "blocked" ? "다음 단계로" : "건너뛰기"}
        </PixelButton>
        <PixelButton onClick={submit} disabled={!canSubmit}>
          {submitting ? "전달 중…" : "대화 추가하기"}
        </PixelButton>
      </div>
    </section>
  );
}
