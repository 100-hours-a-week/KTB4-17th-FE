import { useEffect, useState } from "react";
import { apiErrorMessage } from "../../shared/api/errorMessages.js";
import {
  EmptyState,
  PixelButton,
  ProfilePhoto,
  ScreenHeader,
} from "../../shared/ui/components.jsx";
import { AiAvatar, PixelIcon } from "../../shared/ui/pixel.jsx";
import { messages as chatMessages } from "../chat/api.js";
import { MessageBubble } from "../chat/Chat.jsx";
import { ChatModeMenu } from "../chat/ChatModeMenu.jsx";
import { getMyProfile, getUserProfile } from "../profile/api.js";
import { profileImageUrls } from "../profile/imageUrls.js";
import { positiveId } from "./model.js";
import { useSimulationAttempt } from "./useSimulationAttempt.js";
import { useSimulationResult } from "./useSimulationResult.js";

function useParticipantPhotos(partnerUserId, myUserId) {
  const [profiles, setProfiles] = useState(null);
  useEffect(() => {
    if (!partnerUserId || !myUserId) return undefined;
    let active = true;
    function updateProfile(key, profile) {
      if (!active) return;
      setProfiles((current) => ({
        partnerUserId,
        myUserId,
        partner: null,
        me: null,
        ...(current?.partnerUserId === partnerUserId &&
        current?.myUserId === myUserId
          ? current
          : {}),
        [key]: profile,
      }));
    }
    // Each participant can render as soon as their own profile is available.
    // These API helpers do not accept a signal, so cleanup ignores late results.
    getUserProfile(partnerUserId).then(
      (profile) => updateProfile("partner", profile),
      () => updateProfile("partner", null),
    );
    getMyProfile().then(
      (profile) => updateProfile("me", profile),
      () => updateProfile("me", null),
    );
    return () => {
      active = false;
    };
  }, [partnerUserId, myUserId]);
  return profiles?.partnerUserId === partnerUserId &&
    profiles?.myUserId === myUserId
    ? profiles
    : null;
}

function ParticipantAvatar({ participant, profile, mine = false }) {
  const photos = profileImageUrls(profile);
  return (
    <span
      className={`simulation-person-avatar${mine ? " is-mine" : ""}`}
      aria-hidden="true"
    >
      {photos.length ? (
        <ProfilePhoto
          person={{
            ...profile,
            id: mine ? "me" : participant.userId,
            userId: mine ? "me" : participant.userId,
            nickname: participant.nickname,
            photos,
          }}
          className="simulation-person-photo"
        />
      ) : (
        <span>
          {Array.from(participant.nickname || (mine ? "나" : "상대"))[0]}
        </span>
      )}
    </span>
  );
}

export function Simulation({ simulationId, chatRoomId, navigate }) {
  const roomId = Number(chatRoomId);
  const chatPath =
    Number.isSafeInteger(roomId) && roomId > 0 ? `/chats/${roomId}` : "/chats";
  const backPath = chatPath === "/chats" ? "/home" : chatPath;
  const { simulation, status, error, refresh, targetUserId } =
    useSimulationResult(simulationId, chatRoomId);
  const attempt = useSimulationAttempt({ simulationId, chatRoomId, navigate });

  const partner = simulation?.partner || {};
  const me = simulation?.me || {};
  const participantPhotos = useParticipantPhotos(partner.userId, me.userId);
  const chatRoomQuery =
    Number.isSafeInteger(roomId) && roomId > 0 ? `?chatRoomId=${roomId}` : "";
  const partnerUserId = Number(partner.userId);
  const practicePath =
    Number.isSafeInteger(partnerUserId) && partnerUserId > 0
      ? `/ai/practice/${partnerUserId}${chatRoomQuery}`
      : null;
  const conversationHeader = (
    <ScreenHeader
      className="simulation-screen-header contextual-header"
      title="AI 시뮬레이션"
      onBack={() => navigate(backPath)}
      right={
        <ChatModeMenu
          currentMode="simulation"
          targetUserId={partnerUserId}
          onPractice={practicePath ? () => navigate(practicePath) : undefined}
        />
      }
    />
  );

  if (error || !simulation)
    return (
      <main
        className="ai-conversation-view simulation-view"
        aria-label="AI 시뮬레이션"
      >
        {conversationHeader}
        <div id="main-content" tabIndex={-1} className="ai-conversation-state">
          <SimulationState
            status={status}
            error={error}
            refresh={refresh}
            attempt={attempt}
            navigate={navigate}
            backPath={backPath}
            partner={partner}
            targetUserId={targetUserId}
            chatRoomId={chatRoomId}
          />
        </div>
      </main>
    );

  return (
    <main
      className="ai-conversation-view simulation-view"
      aria-label="AI 시뮬레이션"
    >
      {conversationHeader}
      <div className="ai-notice">
        <AiAvatar size={22} /> AI가 두 사람의 성향을 바탕으로 나눈 대화예요.
      </div>
      <div id="main-content" tabIndex={-1} className="simulation-body">
        <div className="simulation-participants">
          <div>
            <ParticipantAvatar
              participant={partner}
              profile={participantPhotos?.partner}
            />
            <span>
              {partner.nickname || "상대"} AI
              <small>{partner.headline || "상대의 성향을 반영했어요"}</small>
            </span>
          </div>
          <b>
            <PixelIcon name="swap" scale={2} />
          </b>
          <div>
            <ParticipantAvatar
              participant={me}
              profile={participantPhotos?.me}
              mine
            />
            <span>
              {me.nickname || "나"}의 AI
              <small>{me.headline || "내 성향을 반영했어요"}</small>
            </span>
          </div>
        </div>
        <div className="simulation-live">
          대화 {simulation.turns || simulation.transcript?.length || 0}턴
        </div>
        <div className="simulation-messages">
          {(simulation.transcript || []).map((message) => {
            const mine = message.speaker === simulation.mySpeaker;
            return (
              <div
                className={`simulation-message${mine ? " is-mine" : ""}`}
                key={message.index}
              >
                <ParticipantAvatar
                  participant={mine ? me : partner}
                  profile={
                    mine ? participantPhotos?.me : participantPhotos?.partner
                  }
                  mine={mine}
                />
                <MessageBubble
                  message={{ id: message.index, mine, text: message.text }}
                  showTime={false}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="simulation-footer">
        <div>
          AI 시뮬레이션이 완료됐어요.
          <span>두 사람의 대화 호흡을 확인해 보세요</span>
        </div>
        <PixelButton
          onClick={() =>
            navigate(`/ai/simulations/${simulationId}/report${chatRoomQuery}`)
          }
        >
          리포트 확인하기 <PixelIcon name="arrowUpRight" scale={1.5} />
        </PixelButton>
      </div>
    </main>
  );
}

const SCORE_BLOCKS = Array.from({ length: 10 }, (_, index) => index);
const AREA_ICONS = {
  DISTANCE: "target",
  COMMUNICATION: "chat",
  CONFLICT: "alert",
  IDEAL: "heart",
  DIRECTION: "send",
};
const hasGrade = (grade) => Boolean(grade) && grade.trim() !== "-";
const splitSentences = (text) =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

export function Report({ simulationId, chatRoomId, navigate }) {
  return (
    <ReportContent
      key={simulationId}
      simulationId={simulationId}
      chatRoomId={chatRoomId}
      navigate={navigate}
    />
  );
}

function ReportContent({ simulationId, chatRoomId, navigate }) {
  const [showMinimumLoading, setShowMinimumLoading] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setShowMinimumLoading(false), 15_000);
    return () => clearTimeout(timer);
  }, []);
  const { simulation, status, error, refresh, targetUserId } =
    useSimulationResult(simulationId, chatRoomId);
  const attempt = useSimulationAttempt({ simulationId, chatRoomId, navigate });
  const report = simulation?.report;
  const rawScore = Number(report?.overall?.score);
  const score =
    report?.overall?.score != null && Number.isFinite(rawScore)
      ? Math.max(0, Math.min(100, rawScore))
      : null;
  const roomId = Number(chatRoomId);
  const simulationPath =
    Number.isSafeInteger(roomId) && roomId > 0
      ? `/ai/simulations/${simulationId}?chatRoomId=${roomId}`
      : `/ai/simulations/${simulationId}`;
  if (error || !report || showMinimumLoading)
    return (
      <>
        <ScreenHeader
          className="simulation-screen-header contextual-header"
          title="궁합 리포트"
          onBack={() => navigate(simulationPath)}
        />
        <main
          id="main-content"
          tabIndex={-1}
          className="main-scroll ai-screen-state-main"
        >
          <SimulationState
            status={status}
            error={error}
            refresh={refresh}
            attempt={attempt}
            partner={simulation?.partner}
            targetUserId={targetUserId}
            chatRoomId={chatRoomId}
            navigate={navigate}
            backPath={
              Number.isSafeInteger(roomId) && roomId > 0
                ? `/chats/${roomId}`
                : "/home"
            }
          />
        </main>
      </>
    );
  return (
    <>
      <ScreenHeader
        className="simulation-screen-header contextual-header"
        title="궁합 리포트"
        onBack={() => navigate(simulationPath)}
      />
      <main id="main-content" tabIndex={-1} className="main-scroll report-main">
        <section className="report-intro">
          <span>AI SIMULATION REPORT</span>
          <h2>
            AI가 분석한
            <br />
            대화 호흡이에요
          </h2>
          <p>
            {report.overall?.headline ||
              "AI가 나눈 대화를 바탕으로 살펴봤어요."}
          </p>
        </section>
        <section className="score-card" aria-label="종합 점수">
          <div className="score-card-top">
            <p className="score-card-value">
              <strong>{score ?? "-"}</strong>
              <span>/ 100</span>
            </p>
            {hasGrade(report.overall?.gradeLabel) && (
              <b className="report-grade">{report.overall.gradeLabel}</b>
            )}
          </div>
          {score != null && (
            <div className="score-meter" aria-hidden="true">
              {SCORE_BLOCKS.map((index) => (
                <i
                  key={index}
                  className={index < Math.round(score / 10) ? "on" : ""}
                />
              ))}
            </div>
          )}
          <h2 className="report-section-label">종합 분석</h2>
          <div className="score-card-summary">
            {splitSentences(
              report.overall?.summary || "분석 결과를 준비하지 못했어요.",
            ).map((sentence) => (
              <p key={sentence}>{sentence}</p>
            ))}
          </div>
        </section>
        {(report.areas || []).length > 0 && (
          <section className="report-areas" aria-label="영역별 분석">
            <h2 className="report-section-label">영역별 분석</h2>
            {report.areas.map((area) => {
              const grade = area.gradeLabel || area.grade;
              return (
                <article className="report-area" key={area.area || area.label}>
                  <span className="report-area-icon" aria-hidden="true">
                    <PixelIcon name={AREA_ICONS[area.area] || "spark"} />
                  </span>
                  <div className="report-area-body">
                    <div className="report-area-heading">
                      <h3>{area.label || area.area}</h3>
                      {hasGrade(grade) && (
                        <b className="report-grade">{grade}</b>
                      )}
                    </div>
                    <p>{area.comment || "분석 결과를 확인해 주세요."}</p>
                  </div>
                </article>
              );
            })}
          </section>
        )}
        <p className="report-disclaimer">
          <PixelIcon name="alert" />
          AI가 대화 방식을 분석한 결과예요. 실제 관계의 성공을 보장하지 않아요.
        </p>
        <PixelButton onClick={() => navigate("/home")}>
          새로운 인연 보기
        </PixelButton>
      </main>
    </>
  );
}

function SimulationState({
  status,
  error,
  refresh,
  attempt,
  navigate,
  backPath,
  partner,
  targetUserId,
  chatRoomId,
}) {
  if (error) {
    const unavailable = [401, 403, 404].includes(error.status);
    return (
      <EmptyState
        icon="!"
        title={
          unavailable
            ? "시뮬레이션을 확인할 수 없어요"
            : "결과 확인이 잠시 중단됐어요"
        }
        description={apiErrorMessage(
          error,
          "연결 상태를 확인한 뒤 상태를 다시 확인해 주세요.",
        )}
        action={
          unavailable ? undefined : (
            <PixelButton onClick={refresh}>상태 다시 확인</PixelButton>
          )
        }
      />
    );
  }
  if (status === "FAILED" || status === "CANCELED") {
    return (
      <EmptyState
        icon="!"
        title={
          status === "FAILED"
            ? "시뮬레이션을 생성하지 못했어요"
            : "종료된 시뮬레이션이에요"
        }
        description={
          status === "FAILED"
            ? attempt.submissionRejected
              ? "요청이 몰려 생성을 시작하지 못했어요. 잠시 후 다시 시도해 주세요."
              : "다시 생성해서 두 사람의 대화를 확인해 보세요."
            : "이 시뮬레이션은 완료 결과를 제공할 수 없어요."
        }
        action={
          status === "FAILED" ? (
            <div className="simulation-retry">
              {attempt.attemptError && (
                <p className="simulation-retry-error" role="alert">
                  {apiErrorMessage(
                    attempt.attemptError,
                    "요청 결과를 확인하지 못했어요. 다시 시도해 주세요.",
                  )}
                </p>
              )}
              {![401, 403, 404].includes(attempt.attemptError?.status) && (
                <PixelButton
                  onClick={attempt.retry}
                  disabled={attempt.attempting}
                >
                  {attempt.attempting ? "요청 중…" : "다시 생성하기"}
                </PixelButton>
              )}
            </div>
          ) : undefined
        }
      />
    );
  }
  return (
    <SimulationProgress
      status={status}
      navigate={navigate}
      backPath={backPath}
      partner={partner}
      targetUserId={targetUserId}
      chatRoomId={chatRoomId}
    />
  );
}

function SimulationProgress({
  status,
  navigate,
  backPath,
  partner,
  targetUserId,
  chatRoomId,
}) {
  const step = status === "COMPLETED" ? 2 : status === "IN_PROGRESS" ? 1 : 0;
  const stages = [
    { label: "생성 요청 확인", detail: "요청을 확인하고 있어요" },
    {
      label: "AI 대화·궁합 분석",
      detail: "두 사람의 성향을 반영해 분석하고 있어요",
    },
    { label: "리포트 불러오기", detail: "분석 결과를 화면에 담고 있어요" },
  ];
  const titles = [
    "리포트 생성을\n준비하고 있어요",
    "두 사람의 궁합을\n분석하고 있어요",
    "분석을 마쳤어요\n리포트를 불러올게요",
  ];
  return (
    <section
      className="simulation-progress"
      aria-label="궁합 리포트 생성 진행 상황"
    >
      <div className="simulation-progress-art" aria-hidden="true">
        <div className="simulation-progress-paper">
          <PixelIcon name="heart" scale={3} />
          <span className="simulation-progress-paper-line" />
          <span className="simulation-progress-paper-line" />
          <div className="simulation-progress-paper-chart">
            <i className="simulation-progress-chart-bar" />
            <i className="simulation-progress-chart-bar" />
            <i className="simulation-progress-chart-bar" />
            <i className="simulation-progress-chart-bar" />
            <i className="simulation-progress-chart-bar" />
          </div>
        </div>
        <SimulationProgressAvatar
          partner={partner}
          targetUserId={targetUserId}
          chatRoomId={chatRoomId}
        />
        <span className="simulation-progress-dots">
          <i className="simulation-progress-dot" />
          <i className="simulation-progress-dot" />
          <i className="simulation-progress-dot" />
        </span>
      </div>
      <div
        className="simulation-progress-heading"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <h2>{titles[step]}</h2>
        <p>
          {step === 1
            ? "대화 속에서 두 사람의 호흡을 살펴보는 중이에요."
            : stages[step].detail}
        </p>
      </div>
      <div
        className="simulation-progress-track"
        role="progressbar"
        aria-label={stages[step].label}
        aria-valuetext="처리 중"
      >
        <span />
      </div>
      <ol className="simulation-progress-stages">
        {stages.map(({ label, detail }, index) => (
          <li
            key={label}
            data-state={
              index < step ? "done" : index === step ? "current" : "waiting"
            }
            aria-current={index === step ? "step" : undefined}
          >
            <span className="simulation-progress-step-icon" aria-hidden="true">
              {index < step ? (
                <PixelIcon name="check" scale={1.5} />
              ) : (
                <i className="simulation-progress-step-dot" />
              )}
            </span>
            <div>
              <strong>{label}</strong>
              {index === step && <p>{detail}</p>}
            </div>
            <small>
              {index < step ? "완료" : index === step ? "진행 중" : "대기"}
            </small>
          </li>
        ))}
      </ol>
      <p className="simulation-progress-note">
        완료되면 결과가 자동으로 열려요.
      </p>
      <div className="simulation-progress-leave">
        <PixelButton secondary onClick={() => navigate(backPath)}>
          {backPath === "/home" ? "홈으로 돌아가기" : "채팅으로 돌아가기"}
        </PixelButton>
        <small>다른 화면을 보고 와도 분석은 계속돼요.</small>
      </div>
    </section>
  );
}

function SimulationProgressAvatar({ partner, targetUserId, chatRoomId }) {
  const userId = positiveId(partner?.userId) || positiveId(targetUserId);
  const roomId = positiveId(chatRoomId);
  const key = `${userId}:${roomId}`;
  const [loaded, setLoaded] = useState(null);
  useEffect(() => {
    if (!userId && !roomId) return undefined;
    const controller = new AbortController();
    async function load() {
      let participant = { userId };
      if (!userId) {
        const page = await chatMessages(roomId, {
          size: 1,
          signal: controller.signal,
        });
        if (positiveId(page?.chatRoom?.chatRoomId) !== roomId) return;
        participant = page.chatRoom.otherParticipant;
      }
      const participantId = positiveId(participant?.userId);
      if (!participantId || controller.signal.aborted) return;
      const profile = await getUserProfile(participantId, {
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setLoaded({
          key,
          participant: {
            ...participant,
            userId: participantId,
            nickname: profile?.nickname || participant.nickname,
          },
          profile,
        });
      }
    }
    void load().catch(() => {
      // The report remains available when the participant's photo cannot be loaded.
    });
    return () => controller.abort();
  }, [key, userId, roomId]);
  const current = loaded?.key === key ? loaded : null;
  return (
    <span className="simulation-progress-avatar">
      <ParticipantAvatar
        participant={current?.participant || partner || { userId }}
        profile={current?.profile}
      />
    </span>
  );
}
