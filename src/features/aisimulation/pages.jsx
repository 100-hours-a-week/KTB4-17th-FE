import { useEffect, useState } from "react";
import { apiErrorMessage } from "../../shared/api/errorMessages.js";
import {
  BrandHeader,
  EmptyState,
  Icon,
  PixelButton,
  ScreenHeader,
} from "../../shared/ui/components.jsx";
import { PixelIcon } from "../../shared/ui/pixel.jsx";
import { MessageBubble } from "../chat/Chat.jsx";
import { ChatModeMenu } from "../chat/ChatModeMenu.jsx";
import * as aiSimulationApi from "./api.js";

export function Simulation({ simulationId, chatRoomId, navigate }) {
  const roomId = Number(chatRoomId);
  const chatPath =
    Number.isSafeInteger(roomId) && roomId > 0 ? `/chats/${roomId}` : "/chats";
  const backPath = chatPath === "/chats" ? "/home" : chatPath;
  const [simulation, setSimulation] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setSimulation(null);
    setError("");
    if (!Number.isSafeInteger(simulationId) || simulationId <= 0) {
      setError(apiErrorMessage("SIMULATION_NOT_FOUND"));
      return () => {
        active = false;
      };
    }
    aiSimulationApi
      .aiSimulation(simulationId)
      .then((result) => active && setSimulation(result))
      .catch(
        (requestError) =>
          active &&
          setError(
            apiErrorMessage(
              requestError,
              "시뮬레이션을 불러오지 못했어요. 잠시 후 다시 시도해주세요.",
            ),
          ),
      );
    return () => {
      active = false;
    };
  }, [simulationId]);

  const partner = simulation?.partner || {};
  const me = simulation?.me || {};
  const chatRoomQuery =
    Number.isSafeInteger(roomId) && roomId > 0 ? `?chatRoomId=${roomId}` : "";
  const partnerMemberId = Number(partner.userId);
  const practicePath =
    Number.isSafeInteger(partnerMemberId) && partnerMemberId > 0
      ? `/ai/practice/${partnerMemberId}${chatRoomQuery}`
      : null;
  const conversationHeader = (
    <>
      <BrandHeader navigate={navigate}>
        <ChatModeMenu
          currentMode="simulation"
          targetMemberId={partnerMemberId}
          onPractice={practicePath ? () => navigate(practicePath) : undefined}
        />
      </BrandHeader>
      <ScreenHeader
        className="chat-room-header conversation-header"
        title="AI 시뮬레이션"
        onBack={() => navigate(backPath)}
      />
    </>
  );

  if (error || !simulation)
    return (
      <section className="ai-conversation-view" aria-label="AI 시뮬레이션">
        {conversationHeader}
        <main className="ai-conversation-state">
          {error ? (
            <EmptyState
              icon="!"
              title="시뮬레이션을 불러오지 못했어요"
              description={error}
              action={
                <PixelButton onClick={() => navigate("/home")}>
                  홈으로 가기
                </PixelButton>
              }
            />
          ) : (
            <EmptyState
              icon="✦"
              title="시뮬레이션 결과를 불러오고 있어요"
              description="잠시만 기다려주세요."
            />
          )}
        </main>
      </section>
    );

  return (
    <section className="ai-conversation-view" aria-label="AI 시뮬레이션">
      {conversationHeader}
      <div className="ai-notice">
        ⓘ　실제 상대가 아닌 AI예요. 대화 내용은 상대에게 전달되지 않아요.
      </div>
      <div className="simulation-body">
        <div className="simulation-participants">
          <div>
            <Icon name="ai-avatar.svg" />
            <span>
              {partner.nickname || "상대"} AI
              <small>{partner.headline || "상대의 성향을 반영했어요"}</small>
            </span>
          </div>
          <b>↔</b>
          <div>
            <Icon name="ai-avatar.svg" />
            <span>
              {me.nickname || "나"}의 AI
              <small>{me.headline || "내 성향을 반영했어요"}</small>
            </span>
          </div>
        </div>
        <div className="simulation-live">
          ●　대화 {simulation.turns || simulation.transcript?.length || 0}턴
        </div>
        <div className="simulation-messages">
          {(simulation.transcript || []).map((message) => (
            <MessageBubble
              key={message.index}
              message={{
                id: message.index,
                mine: message.speaker === "a",
                text: message.text,
              }}
            />
          ))}
        </div>
      </div>
      <div className="simulation-footer">
        <div>
          AI 시뮬레이션이 완료됐어요.
          <span>{simulation.report?.overall?.gradeLabel || "궁합 결과"}</span>
        </div>
        <div className="progress-track">
          <span style={{ width: "100%" }} />
        </div>
        <PixelButton
          onClick={() =>
            navigate(`/ai/simulations/${simulationId}/report${chatRoomQuery}`)
          }
        >
          리포트 확인하기 ↗
        </PixelButton>
      </div>
    </section>
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
// 긴 종합 분석을 문장 단위로 나눠 읽기 쉽게 보여준다 (내용은 그대로).
const splitSentences = (text) =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

export function Report({ simulationId, chatRoomId, navigate }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    aiSimulationApi
      .aiSimulationReport(simulationId)
      .then((result) => active && setReport(result))
      .catch(
        (requestError) =>
          active &&
          setError(
            apiErrorMessage(
              requestError,
              "리포트를 불러오지 못했어요. 잠시 후 다시 시도해주세요.",
            ),
          ),
      );
    return () => {
      active = false;
    };
  }, [simulationId]);
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
  if (error || !report)
    return (
      <>
        <BrandHeader navigate={navigate} />
        <ScreenHeader
          className="chat-room-header"
          title="궁합 리포트"
          onBack={() => navigate(simulationPath)}
        />
        <main className="main-scroll ai-screen-state-main">
          {error ? (
            <EmptyState
              icon="!"
              title="리포트를 불러오지 못했어요"
              description={error}
              action={
                <PixelButton onClick={() => navigate(simulationPath)}>
                  시뮬레이션으로 돌아가기
                </PixelButton>
              }
            />
          ) : (
            <EmptyState
              icon="✦"
              title="리포트를 불러오고 있어요"
              description="잠시만 기다려주세요."
            />
          )}
        </main>
      </>
    );
  return (
    <>
      <BrandHeader navigate={navigate} />
      <ScreenHeader
        className="chat-room-header"
        title="궁합 리포트"
        onBack={() => navigate(simulationPath)}
      />
      <main className="main-scroll report-main">
        <section className="report-intro">
          <span>AI SIMULATION REPORT</span>
          <h1>
            AI가 분석한
            <br />
            대화 호흡이에요
          </h1>
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
                    <p>{area.comment || "분석 결과를 확인해주세요."}</p>
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
