import { useCallback, useEffect, useRef, useState } from "react";
import * as chatApi from "./api.js";
import { releasePreview, updateRoomSession } from "./session.js";

function accessImage(entry, fileId, force) {
  entry.imageUrls ||= new Map();
  if (force) entry.imageUrls.delete(fileId);
  const cached = entry.imageUrls.get(fileId);
  if (cached?.pending) return cached.pending;
  if (cached?.url && cached.expiresAt > Date.now() + 30_000)
    return Promise.resolve(cached.url);
  const record = {};
  record.pending = chatApi
    .chatImageAccessUrl(entry.roomId, fileId)
    .then((result) => {
      if (!result?.accessUrl) throw new Error("Missing image URL");
      record.url = result.accessUrl;
      const expiresAt = Date.parse(result.expiresAt || "");
      record.expiresAt = Number.isFinite(expiresAt)
        ? expiresAt
        : Date.now() + 4 * 60_000;
      record.pending = null;
      return record.url;
    })
    .catch((error) => {
      if (entry.imageUrls.get(fileId) === record)
        entry.imageUrls.delete(fileId);
      throw error;
    });
  entry.imageUrls.set(fileId, record);
  return record.pending;
}

export function ChatImage({
  message,
  entry,
  onViewImage,
  onImageLoaded,
  viewer = false,
}) {
  const [source, setSource] = useState(
    message.imageUrl || message.previewUrl || "",
  );
  const [status, setStatus] = useState(source ? "ready" : "loading");
  const [failure, setFailure] = useState({
    text: "사진을 불러오지 못했어요.",
    retryable: true,
  });
  const generation = useRef(0);
  const automaticRetry = useRef(false);
  const mounted = useRef(false);
  const load = useCallback(
    async (force = false) => {
      if (!entry || !message.imageFileId || message.status !== "SENT") return;
      const request = ++generation.current;
      setStatus("loading");
      try {
        const url = await accessImage(entry, message.imageFileId, force);
        if (!mounted.current || request !== generation.current) return;
        setSource(url);
        setStatus("ready");
      } catch (error) {
        if (mounted.current && request === generation.current) {
          const terminal = [
            "CHAT_ACCESS_DENIED",
            "CHAT_IMAGE_NOT_FOUND",
            "AUTH_REQUIRED",
          ].includes(error?.code);
          setFailure({
            text:
              error?.code === "CHAT_ACCESS_DENIED"
                ? "사진에 접근할 수 없어요."
                : error?.code === "CHAT_IMAGE_NOT_FOUND"
                  ? "사진을 찾을 수 없어요."
                  : error?.code === "AUTH_REQUIRED"
                    ? "다시 로그인한 뒤 사진을 확인해주세요."
                    : "사진을 불러오지 못했어요.",
            retryable: !terminal,
          });
          setStatus("failed");
        }
      }
    },
    [entry, message.imageFileId, message.status],
  );

  useEffect(() => {
    mounted.current = true;
    automaticRetry.current = false;
    void load();
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, [load]);

  const image =
    source && status !== "failed" ? (
      <img
        src={source}
        alt={viewer ? "채팅 첨부 사진 크게 보기" : "채팅 첨부 사진"}
        onLoad={(event) => {
          onImageLoaded?.(event);
          if (entry && message.previewUrl && source !== message.previewUrl) {
            releasePreview(entry, message.previewUrl);
            updateRoomSession(entry, (state) => ({
              ...state,
              messages: state.messages.map((item) =>
                item.renderKey === message.renderKey
                  ? { ...item, previewUrl: "", imageUrl: source }
                  : item,
              ),
            }));
          }
        }}
        onError={() => {
          if (entry && message.imageFileId && !automaticRetry.current) {
            automaticRetry.current = true;
            setSource("");
            void load(true);
          } else {
            setFailure({ text: "사진을 불러오지 못했어요.", retryable: true });
            setStatus("failed");
          }
        }}
      />
    ) : null;

  return (
    <div className={viewer ? "chat-viewer-image" : "chat-image-slot"}>
      {image &&
        (onViewImage ? (
          <button
            type="button"
            className="message-image-button"
            aria-label="사진 크게 보기"
            onClick={(event) => onViewImage(message, event.currentTarget)}
          >
            {image}
          </button>
        ) : (
          image
        ))}
      {status === "failed" ? (
        <span className="message-image-placeholder">
          {failure.text}
          {entry && message.imageFileId && failure.retryable && (
            <button
              type="button"
              onClick={() => {
                automaticRetry.current = false;
                void load(true);
              }}
            >
              다시 시도
            </button>
          )}
        </span>
      ) : !image ? (
        <span className="message-image-placeholder">사진을 불러오는 중…</span>
      ) : null}
    </div>
  );
}
