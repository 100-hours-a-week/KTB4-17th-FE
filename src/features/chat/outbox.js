import {
  chatSendErrorMessage,
  mapChatMessage,
  mergeChatMessages,
  serverMessageId,
} from "./model.js";
import { isSessionActive, updateRoomSession } from "./session.js";

function patchMessage(entry, task, patch) {
  updateRoomSession(entry, (state) => ({
    ...state,
    messages: state.messages.map((message) => {
      if (
        message.clientMessageId !== task.clientMessageId ||
        serverMessageId(message)
      )
        return message;
      return { ...message, ...patch };
    }),
  }));
}

export function enqueueMessages(entry, text, attachment, api) {
  if (!isSessionActive(entry)) return;
  const batch = { tasks: [], requested: true, complete: false };
  for (const type of [attachment ? "IMAGE" : null, text ? "TEXT" : null].filter(
    Boolean,
  )) {
    const clientMessageId = crypto.randomUUID();
    const task = {
      clientMessageId,
      type,
      text: type === "TEXT" ? text : "",
      file: type === "IMAGE" ? attachment.file : null,
      fileId: type === "IMAGE" ? attachment.fileId : null,
      complete: false,
    };
    entry.sequence += 1;
    task.message = {
      ...mapChatMessage({
        id: `local:${clientMessageId}`,
        clientMessageId,
        mine: true,
        messageType: type,
        textContent: task.text,
        imageFileId: task.fileId,
        previewUrl: type === "IMAGE" ? attachment.previewUrl : "",
        createdAt: new Date().toISOString(),
        status: "QUEUED",
      }),
      localSequence: entry.sequence,
    };
    batch.tasks.push(task);
  }
  if (!batch.tasks.length) return;
  entry.batches.push(batch);
  updateRoomSession(entry, (state) => ({
    ...state,
    draft: "",
    attachment: null,
    messages: mergeChatMessages(
      state.messages,
      batch.tasks.map((task) => task.message),
      state.otherReadCursor,
    ),
  }));
  void processOutbox(entry, api);
}

export function retryMessage(entry, clientMessageId, api) {
  const batch = entry.batches.find((item) =>
    item.tasks.some((task) => task.clientMessageId === clientMessageId),
  );
  if (!batch || batch.complete || batch.requested) return;
  batch.requested = true;
  for (const task of batch.tasks) {
    if (!task.complete)
      patchMessage(entry, task, { status: "QUEUED", error: "" });
  }
  void processOutbox(entry, api);
}

export async function processOutbox(entry, api) {
  if (entry.running || !isSessionActive(entry)) return;
  entry.running = true;
  try {
    while (isSessionActive(entry)) {
      const batch = entry.batches.find(
        (item) => item.requested && !item.complete,
      );
      if (!batch) break;
      batch.requested = false;
      for (const task of batch.tasks) {
        if (!isSessionActive(entry)) return;
        const confirmed = entry.snapshot.messages.find(
          (message) =>
            message.clientMessageId === task.clientMessageId &&
            serverMessageId(message),
        );
        if (task.complete || confirmed) {
          task.complete = true;
          task.file = null;
          continue;
        }
        try {
          if (task.type === "IMAGE" && !task.fileId) {
            patchMessage(entry, task, { status: "UPLOADING", error: "" });
            const uploaded = await api.uploadChatImage(task.file);
            task.fileId = uploaded.fileId;
          }
          if (!isSessionActive(entry)) return;
          patchMessage(entry, task, {
            status: "SENDING",
            imageFileId: task.fileId,
            error: "",
          });
          const result =
            task.type === "IMAGE"
              ? await api.sendImageMessage(
                  entry.roomId,
                  task.fileId,
                  task.clientMessageId,
                )
              : await api.sendMessage(
                  entry.roomId,
                  task.text,
                  task.clientMessageId,
                );
          if (!isSessionActive(entry)) return;
          const message = mapChatMessage({
            ...result,
            clientMessageId: task.clientMessageId,
            mine: true,
            messageType: task.type,
            textContent: task.text,
            imageFileId: result?.imageFileId || task.fileId,
            status: "SENT",
          });
          if (!serverMessageId(message))
            throw new Error("Missing message acknowledgement");
          updateRoomSession(entry, (state) => ({
            ...state,
            messages: mergeChatMessages(
              state.messages,
              [message],
              state.otherReadCursor,
            ),
          }));
          task.complete = true;
          task.file = null;
        } catch (error) {
          if (!isSessionActive(entry)) return;
          // A socket event may have confirmed a message whose HTTP response was lost.
          if (
            entry.snapshot.messages.some(
              (message) =>
                message.clientMessageId === task.clientMessageId &&
                serverMessageId(message),
            )
          ) {
            task.complete = true;
            task.file = null;
            continue;
          }
          patchMessage(entry, task, {
            status: "FAILED",
            error: chatSendErrorMessage(error),
          });
          for (const remaining of batch.tasks.slice(
            batch.tasks.indexOf(task) + 1,
          )) {
            if (!remaining.complete)
              patchMessage(entry, remaining, {
                status: "FAILED",
                error: "앞선 사진과 함께 다시 전송해주세요.",
              });
          }
          if (
            ["CHAT_ROOM_NOT_ACTIVE", "CHAT_ACCESS_DENIED"].includes(error?.code)
          ) {
            updateRoomSession(entry, (state) => ({
              ...state,
              room: { ...state.room, status: "ENDED" },
            }));
            for (const pending of entry.batches) {
              pending.requested = false;
              for (const waiting of pending.tasks) {
                if (!waiting.complete)
                  patchMessage(entry, waiting, {
                    status: "FAILED",
                    error: chatSendErrorMessage(error),
                  });
              }
            }
          }
          break;
        }
      }
      batch.complete = batch.tasks.every((task) => task.complete);
      // Completed payloads no longer retain File objects or retry metadata.
      entry.batches = entry.batches.filter((item) => !item.complete);
    }
  } finally {
    entry.running = false;
  }
}
