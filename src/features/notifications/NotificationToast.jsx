import { useEffect, useRef, useState } from "react";
import { ProfilePhoto } from "../../shared/ui/components.jsx";
import { PixelIcon } from "../../shared/ui/pixel.jsx";
import { profileImageUrls } from "../profile/imageUrls.js";
import { notificationCopy, simulationCompletionCopy } from "./model.js";
import { NotificationIllustration } from "./NotificationControls.jsx";
import { useSimulationCompletionNotification } from "./useSimulationCompletionNotification.js";

export function NotificationToast({
  item,
  subject,
  onOpen,
  onOpenProfile,
  onDismiss,
  blocked,
}) {
  const details = useSimulationCompletionNotification(item, subject);
  const copy =
    item.type === "AI_SIMULATION_REPORT_COMPLETED"
      ? simulationCompletionCopy(item, details)
      : notificationCopy(item);
  const partnerCompletion =
    item.type === "AI_SIMULATION_REPORT_COMPLETED" &&
    details.role === "partner" &&
    Boolean(details.profile?.nickname);
  const images = partnerCompletion ? profileImageUrls(details.profile) : [];
  const person = partnerCompletion
    ? {
        id: details.requesterId,
        userId: details.requesterId,
        nickname: details.profile.nickname,
        photos: images,
      }
    : null;
  const [interacting, setInteracting] = useState(false);
  const [hidden, setHidden] = useState(document.visibilityState === "hidden");
  const root = useRef(null);
  const remaining = useRef(6000);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    const update = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (hidden || blocked || interacting) return undefined;
    const start = Date.now();
    const timer = window.setTimeout(() => dismiss.current(), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - start));
    };
  }, [hidden, blocked, interacting]);
  return (
    <section
      className="notification-toast"
      aria-label="새 알림"
      ref={root}
      style={{ visibility: hidden || blocked ? "hidden" : "visible" }}
      onPointerEnter={() => setInteracting(true)}
      onPointerLeave={() =>
        setInteracting(Boolean(root.current?.contains(document.activeElement)))
      }
      onFocus={() => setInteracting(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setInteracting(false);
      }}
    >
      <span className="sr-only" role="status">
        {copy.title ? `${copy.title}. ` : ""}
        {copy.body}
      </span>
      {partnerCompletion ? (
        <div className="notification-toast-open notification-toast-open-partner">
          <button
            type="button"
            className="notification-toast-avatar-button"
            aria-label="시뮬레이션 결과 열기"
            onClick={() => onOpen(item)}
          >
            {images.length ? (
              <ProfilePhoto
                person={person}
                className="notification-toast-avatar"
              />
            ) : (
              <NotificationIllustration kind="system" />
            )}
          </button>
          <span>
            <small>삐삐! 새로운 소식</small>
            <span className="notification-toast-result-body">
              <span className="notification-toast-result-first-line">
                <button
                  type="button"
                  className="notification-profile-link"
                  title="닉네임을 누르면 상세 프로필로 이동해요"
                  aria-label={`${details.profile.nickname}님 상세 프로필 보기`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenProfile(item, details.requesterId);
                  }}
                >
                  {details.profile.nickname}님
                </button>
                <span>이 그려본 두 사람의 대화,</span>
              </span>
              <button type="button" onClick={() => onOpen(item)}>
                지금 확인해보세요
              </button>
            </span>
          </span>
        </div>
      ) : (
        <button
          type="button"
          className="notification-toast-open"
          onClick={() => onOpen(item)}
        >
          <NotificationIllustration kind={copy.illustration} />
          <span>
            <small>삐삐! 새로운 소식</small>
            {copy.title && <strong>{copy.title}</strong>}
            <span>{copy.body}</span>
          </span>
        </button>
      )}
      <button
        type="button"
        className="notification-toast-close"
        onClick={onDismiss}
        aria-label="새 알림 닫기"
      >
        <PixelIcon name="x" scale={2} />
      </button>
    </section>
  );
}
