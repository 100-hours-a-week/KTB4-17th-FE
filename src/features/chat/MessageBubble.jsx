import { Fragment } from "react";
import { asset } from "../../shared/assets.js";
import { Icon } from "../../shared/ui/components.jsx";
import { ChatImage } from "./ChatImage.jsx";

function MessageText({ text }) {
  let offset = 0;
  return String(text || "")
    .split(/(https?:\/\/[^\s<>]+)/g)
    .map((part) => {
      const key = String(offset);
      offset += part.length;
      if (!part) return null;
      if (!/^https?:\/\//.test(part))
        return <Fragment key={key}>{part}</Fragment>;
      const url = part.replace(/[.,!?;:)}\]]+$/, "");
      try {
        if (!["http:", "https:"].includes(new URL(url).protocol))
          throw new Error("Unsupported URL");
        return (
          <Fragment key={key}>
            <a href={url} target="_blank" rel="noopener noreferrer">
              {url}
            </a>
            {part.slice(url.length)}
          </Fragment>
        );
      } catch {
        return <Fragment key={key}>{part}</Fragment>;
      }
    });
}

export function MessageBubble({
  message,
  ai = false,
  avatar = "",
  senderName = "",
  chatRoom = false,
  onViewImage,
  onImageLoaded,
  onViewProfile,
  grouped = false,
  showTime = true,
  entry,
  onRetry,
  canRetry = true,
}) {
  const isImage = message.type === "IMAGE";
  const pending = ["QUEUED", "UPLOADING", "SENDING"].includes(message.status);
  const failed = message.status === "FAILED";
  const status = failed
    ? "전송 실패"
    : message.status === "UPLOADING"
      ? "사진 업로드 중"
      : pending
        ? "전송 중"
        : message.unreadCount === 0
          ? "읽음"
          : "전송 완료";
  const avatarElement = (
    <img
      className="bubble-avatar profile-bubble-avatar"
      src={avatar || asset("chat-avatar-heart-terminal.svg")}
      alt=""
      onError={(event) => {
        event.currentTarget.src = asset("chat-avatar-heart-terminal.svg");
      }}
    />
  );
  return (
    <div
      data-message-key={message.renderKey || String(message.id)}
      data-server-id={message.status === "SENT" ? message.id : undefined}
      className={`message-row ${message.mine ? "mine" : "theirs"} ${chatRoom ? "chat-message-row" : ""} ${grouped ? "is-grouped" : ""}`}
    >
      {ai && !message.mine && (
        <Icon name="ai-avatar.svg" className="bubble-avatar" />
      )}
      {!ai &&
        !message.mine &&
        (grouped ? (
          <span className="chat-avatar-spacer" aria-hidden="true" />
        ) : onViewProfile ? (
          <button
            type="button"
            className="profile-bubble-avatar-button"
            aria-label={`${senderName || "상대 회원"} 프로필 보기`}
            onClick={onViewProfile}
          >
            {avatarElement}
          </button>
        ) : (
          avatarElement
        ))}
      <div className={`bubble-group ${chatRoom ? "chat-bubble-group" : ""}`}>
        {chatRoom && !message.mine && !ai && senderName && !grouped && (
          <span className="message-sender-name">{senderName}</span>
        )}
        <div className={chatRoom ? "chat-bubble-content" : undefined}>
          <div className={`message-bubble ${isImage ? "is-image" : ""}`}>
            {!grouped && (
              <span className="message-bubble-tail" aria-hidden="true" />
            )}
            {isImage ? (
              <ChatImage
                message={message}
                entry={entry}
                onViewImage={onViewImage}
                onImageLoaded={onImageLoaded}
              />
            ) : (
              <span className="message-bubble-text">
                <MessageText text={message.text} />
              </span>
            )}
          </div>
          {(showTime || pending || failed) && (
            <small className="message-meta">
              {chatRoom && message.mine && (
                <span
                  className={
                    failed ? "message-status failed" : "message-status"
                  }
                >
                  {status}
                </span>
              )}
              {message.time && <span>{message.time}</span>}
            </small>
          )}
        </div>
        {failed && (
          <div className="message-send-error">
            <span>{message.error}</span>
            <button
              type="button"
              disabled={!canRetry}
              onClick={() => onRetry?.(message.clientMessageId)}
            >
              다시 전송
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
