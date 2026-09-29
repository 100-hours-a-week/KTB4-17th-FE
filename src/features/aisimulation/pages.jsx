import { useEffect, useState } from "react";
import {
  EmptyState,
  Icon,
  PixelButton,
  ScreenHeader,
} from "../../shared/ui/components.jsx";
import { MessageBubble } from "../chat/Chat.jsx";
import * as aiSimulationApi from "./api.js";

export function Simulation({ simulationId, chatRoomId, navigate }) {
  const [simulation, setSimulation] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setSimulation(null);
    setError("");
    if (!Number.isSafeInteger(simulationId) || simulationId <= 0) {
      setError("SIMULATION_NOT_FOUND");
      return () => {
        active = false;
      };
    }
    aiSimulationApi
      .aiSimulation(simulationId)
      .then((result) => active && setSimulation(result))
      .catch(
        (requestError) =>
          active && setError(requestError?.code || "SIMULATION_UNAVAILABLE"),
      );
    return () => {
      active = false;
    };
  }, [simulationId]);

  if (error)
    return (
      <EmptyState
        icon="!"
        title="시뮬레이션을 불러오지 못했어요"
        description="잠시 후 다시 시도해주세요."
        action={
          <PixelButton onClick={() => navigate("/home")}>
            홈으로 가기
          </PixelButton>
        }
      />
    );
  if (!simulation)
    return (
      <EmptyState
        icon="✦"
        title="시뮬레이션 결과를 불러오고 있어요"
        description="잠시만 기다려주세요."
      />
    );

  const partner = simulation.partner || {};
  const me = simulation.me || {};
  const roomId = Number(chatRoomId);
  const chatPath =
    Number.isSafeInteger(roomId) && roomId > 0 ? `/chats/${roomId}` : "/chats";
  const chatRoomQuery =
    Number.isSafeInteger(roomId) && roomId > 0 ? `?chatRoomId=${roomId}` : "";
  return (
    <>
      <ScreenHeader
        title={partner.nickname || "시뮬레이션"}
        onBack={() => navigate("/home")}
        right={<Icon name="ai-avatar.svg" />}
      />
      <div className="mode-tabs">
        <button type="button" className="active">
          시뮬레이션
        </button>
        <button type="button" onClick={() => navigate("/home")}>
          연습 대화
        </button>
        <button type="button" onClick={() => navigate(chatPath)}>
          채팅
        </button>
      </div>
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
    </>
  );
}

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
          setError(requestError?.code || "SIMULATION_REPORT_UNAVAILABLE"),
      );
    return () => {
      active = false;
    };
  }, [simulationId]);
  const roomId = Number(chatRoomId);
  const simulationPath =
    Number.isSafeInteger(roomId) && roomId > 0
      ? `/ai/simulations/${simulationId}?chatRoomId=${roomId}`
      : `/ai/simulations/${simulationId}`;
  if (error)
    return (
      <EmptyState
        icon="!"
        title="리포트를 불러오지 못했어요"
        description="잠시 후 다시 시도해주세요."
        action={
          <PixelButton onClick={() => navigate(simulationPath)}>
            시뮬레이션으로 돌아가기
          </PixelButton>
        }
      />
    );
  if (!report)
    return (
      <EmptyState
        icon="✦"
        title="리포트를 불러오고 있어요"
        description="잠시만 기다려주세요."
      />
    );
  return (
    <>
      <ScreenHeader
        title="궁합 리포트"
        onBack={() => navigate(simulationPath)}
      />
      <main className="main-scroll report-main">
        <div className="report-intro">
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
        </div>
        <div className="score-card">
          <strong>{report.overall?.score ?? "-"}</strong>
          <span>/ 100</span>
          <p>{report.overall?.summary || "분석 결과를 준비하지 못했어요."}</p>
        </div>
        {(report.areas || []).map((area) => (
          <div className="report-metric" key={area.area || area.label}>
            <span>
              {area.label || area.area}
              <small>{area.comment || "분석 결과를 확인해주세요."}</small>
            </span>
            <b>{area.gradeLabel || area.grade || "-"}</b>
          </div>
        ))}
        <p className="report-disclaimer">
          AI가 대화 방식을 분석한 결과예요. 실제 관계의 성공을 보장하지 않아요.
        </p>
        <PixelButton onClick={() => navigate("/home")}>
          새로운 인연 보기
        </PixelButton>
      </main>
    </>
  );
}
