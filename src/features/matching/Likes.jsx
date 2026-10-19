import { useCallback, useEffect, useRef, useState } from "react";
import { apiErrorMessage } from "../../shared/api/errorMessages.js";
import { asset } from "../../shared/assets.js";
import {
  BrandHeader,
  EmptyState,
  PersonAvatar,
  PixelButton,
} from "../../shared/ui/components.jsx";
import { PixelIcon } from "../../shared/ui/pixel.jsx";
import {
  jobCategoryLabel,
  normalizeJobCategory,
} from "../profile/jobCategories.js";
import * as matchingApi from "./api.js";

export function mapLikeItem(item, tab) {
  const user = tab === "received" ? item?.sender : item?.receiver;
  return {
    id: item?.likeId,
    userId: user?.userId,
    nickname: user?.nickname || "닉네임 정보 없음",
    age: user?.age,
    job: normalizeJobCategory(user?.job),
    region: user?.region || "",
    mbti: user?.mbti || "",
    photo: user?.profileImageUrl || "",
    status: item?.status || "",
  };
}

function responseTotalCount(response) {
  const value = response?.totalCount ?? response?.pageInfo?.totalCount;
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function Likes({
  toast,
  onFindMatch,
  navigate,
  initialTab = "received",
}) {
  const [tab, setTab] = useState(initialTab === "sent" ? "sent" : "received");
  const [rejectTarget, setRejectTarget] = useState(null);
  const rejectDialog = useRef(null);
  useEffect(() => {
    const dialog = rejectDialog.current;
    if (!dialog || !rejectTarget) return undefined;
    dialog.showModal();
    return () => dialog.close();
  }, [rejectTarget]);
  const [actionLikeId, setActionLikeId] = useState(null);
  const actionInFlight = useRef(false);
  const requestInFlight = useRef({ received: false, sent: false });
  const [pages, setPages] = useState({
    received: {
      items: [],
      loaded: false,
      loading: false,
      error: "",
      nextCursor: null,
      hasNext: false,
      totalCount: null,
    },
    sent: {
      items: [],
      loaded: false,
      loading: false,
      error: "",
      nextCursor: null,
      hasNext: false,
      totalCount: null,
    },
  });
  const load = useCallback(async (targetTab, cursor = null) => {
    if (requestInFlight.current[targetTab]) return;
    requestInFlight.current[targetTab] = true;
    setPages((current) => ({
      ...current,
      [targetTab]: { ...current[targetTab], loading: true, error: "" },
    }));
    try {
      const response =
        targetTab === "received"
          ? await matchingApi.receivedLikes(cursor)
          : await matchingApi.sentLikes(cursor);
      const items = (response?.items || []).map((item) =>
        mapLikeItem(item, targetTab),
      );
      setPages((current) => ({
        ...current,
        [targetTab]: {
          ...current[targetTab],
          items:
            cursor == null ? items : [...current[targetTab].items, ...items],
          loaded: true,
          loading: false,
          nextCursor: response?.pageInfo?.nextCursor || null,
          hasNext: Boolean(response?.pageInfo?.hasNext),
          totalCount:
            responseTotalCount(response) ?? current[targetTab].totalCount,
        },
      }));
    } catch (error) {
      setPages((current) => ({
        ...current,
        [targetTab]: {
          ...current[targetTab],
          loading: false,
          error: apiErrorMessage(
            error,
            "좋아요를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
          ),
        },
      }));
    } finally {
      requestInFlight.current[targetTab] = false;
    }
  }, []);
  useEffect(() => {
    if (!pages[tab].loaded && !pages[tab].loading && !pages[tab].error)
      void load(tab);
  }, [load, pages, tab]);
  useEffect(() => {
    setTab(initialTab === "sent" ? "sent" : "received");
  }, [initialTab]);
  const page = pages[tab];
  const removeReceivedLike = useCallback((likeId) => {
    setPages((current) => ({
      ...current,
      received: {
        ...current.received,
        items: current.received.items.filter((item) => item.id !== likeId),
        totalCount:
          current.received.totalCount == null
            ? null
            : Math.max(0, current.received.totalCount - 1),
      },
    }));
  }, []);
  async function acceptLike(person) {
    if (!person.userId || person.status === "MATCHED" || actionInFlight.current)
      return;
    actionInFlight.current = true;
    setActionLikeId(person.id);
    try {
      await matchingApi.sendLike(person.userId);
      removeReceivedLike(person.id);
      toast("매칭에 성공했어요");
    } catch (error) {
      toast(apiErrorMessage(error, "좋아요를 처리하지 못했어요."));
    } finally {
      actionInFlight.current = false;
      setActionLikeId(null);
    }
  }
  function openProfile(person) {
    if (!person.userId) return;
    const returnTo = `/likes?tab=${tab}`;
    navigate(
      `/profiles/${person.userId}?returnTo=${encodeURIComponent(returnTo)}`,
    );
  }

  function selectTab(nextTab) {
    if (nextTab === tab) return;
    setTab(nextTab);
    const params = new URLSearchParams(window.location.search);
    if (nextTab === "received") params.delete("tab");
    else params.set("tab", nextTab);
    const query = params.toString();
    navigate(`/likes${query ? `?${query}` : ""}`);
  }

  async function rejectLike() {
    if (!rejectTarget || actionInFlight.current) return;
    actionInFlight.current = true;
    setActionLikeId(rejectTarget.id);
    try {
      await matchingApi.rejectLike(rejectTarget.id);
      removeReceivedLike(rejectTarget.id);
      setRejectTarget(null);
      toast("좋아요를 거절했어요");
    } catch (error) {
      toast(apiErrorMessage(error, "좋아요를 거절하지 못했어요."));
    } finally {
      actionInFlight.current = false;
      setActionLikeId(null);
    }
  }
  return (
    <>
      <BrandHeader navigate={navigate} />
      <h1 className="likes-page-title">좋아요</h1>
      <fieldset className="segmented-tabs likes-seg">
        <legend className="sr-only">좋아요 목록 종류</legend>
        <button
          type="button"
          className={tab === "received" ? "active" : ""}
          aria-pressed={tab === "received"}
          onClick={() => selectTab("received")}
        >
          받은 좋아요
          {pages.received.totalCount != null && (
            <span className="likes-tab-count">
              ({pages.received.totalCount})
            </span>
          )}
        </button>
        <button
          type="button"
          className={tab === "sent" ? "active" : ""}
          aria-pressed={tab === "sent"}
          onClick={() => selectTab("sent")}
        >
          보낸 좋아요
          {pages.sent.totalCount != null && (
            <span className="likes-tab-count">({pages.sent.totalCount})</span>
          )}
        </button>
      </fieldset>
      <main id="main-content" tabIndex={-1} className="main-scroll likes-main">
        <h2 className="sr-only">좋아요 목록</h2>
        {page.loading && !page.loaded ? (
          <EmptyState
            icon="♡"
            title="좋아요를 불러오고 있어요…"
            description="잠시만 기다려 주세요…"
            role="status"
          />
        ) : page.error ? (
          <EmptyState
            icon="!"
            title="좋아요를 불러오지 못했어요"
            description={page.error}
            action={
              <PixelButton secondary onClick={() => load(tab)}>
                다시 시도
              </PixelButton>
            }
          />
        ) : page.items.length === 0 ? (
          <EmptyState
            icon={
              <img
                className={tab === "received" ? "empty-letter" : undefined}
                src={asset(
                  tab === "received" ? "illust/letter.png" : "illust/plane.svg",
                )}
                width={tab === "received" ? 324 : 190}
                height={tab === "received" ? 248 : 150}
                alt=""
              />
            }
            title={
              tab === "received"
                ? "아직 받은 좋아요가 없어요"
                : "아직 보낸 좋아요가 없어요"
            }
            action={
              tab === "sent" ? (
                <PixelButton
                  secondary
                  className="empty-action"
                  onClick={onFindMatch}
                >
                  인연 찾으러 가기
                </PixelButton>
              ) : undefined
            }
          />
        ) : (
          <div className="like-list">
            {page.items.map((person) => (
              <article
                className={`like-card ${person.status === "MATCHED" ? "is-matched" : ""}`}
                key={person.id}
              >
                <button
                  type="button"
                  className="like-profile-button"
                  aria-label={`${person.nickname} 프로필 보기`}
                  onClick={() => openProfile(person)}
                  disabled={!person.userId}
                >
                  <PersonAvatar person={person} size="large" />
                  <span className="like-person-copy">
                    <strong>
                      {person.nickname}
                      {person.age != null && ` ${person.age}`}
                    </strong>
                    <span className="like-person-facts">
                      {person.region && (
                        <span>
                          <PixelIcon name="pin" scale={1.35} />
                          {person.region}
                        </span>
                      )}
                      {person.job && (
                        <span>
                          <PixelIcon name="briefcase" scale={1.35} />
                          {jobCategoryLabel(person.job)}
                        </span>
                      )}
                      {person.mbti && (
                        <span>
                          <PixelIcon name="heart" scale={1.35} />
                          {person.mbti}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
                {person.status === "MATCHED" && (
                  <span className="like-match-badge" role="status">
                    <PixelIcon name="heart" scale={1.25} />
                    매칭됐어요!
                  </span>
                )}
                {tab === "received" && person.status !== "MATCHED" && (
                  <div className="like-actions">
                    <PixelButton
                      secondary
                      className="like-action-reject"
                      onClick={() => setRejectTarget(person)}
                      disabled={actionLikeId != null}
                    >
                      <PixelIcon name="x" scale={2} />
                      관심없음
                    </PixelButton>
                    <PixelButton
                      className="like-action-accept"
                      onClick={() => acceptLike(person)}
                      disabled={actionLikeId != null || !person.userId}
                    >
                      <PixelIcon name="heart" scale={1.7} />
                      {actionLikeId === person.id ? "처리 중…" : "좋아요"}
                    </PixelButton>
                  </div>
                )}
              </article>
            ))}
            {page.hasNext && (
              <PixelButton
                secondary
                disabled={page.loading}
                onClick={() => load(tab, page.nextCursor)}
              >
                {page.loading ? "불러오는 중…" : "더 보기"}
              </PixelButton>
            )}
          </div>
        )}
      </main>
      {rejectTarget && (
        <dialog
          ref={rejectDialog}
          className="like-confirm-dialog"
          onKeyDown={(event) => {
            if (event.key !== "Tab") return;
            const buttons = [
              ...event.currentTarget.querySelectorAll("button:not(:disabled)"),
            ];
            if (!buttons.length) return;
            event.preventDefault();
            const current = buttons.indexOf(document.activeElement);
            const next = event.shiftKey
              ? (current - 1 + buttons.length) % buttons.length
              : (current + 1) % buttons.length;
            buttons[next].focus();
          }}
          onCancel={(event) => {
            event.preventDefault();
            if (actionLikeId == null) setRejectTarget(null);
          }}
          aria-labelledby="like-reject-title"
        >
          <h2 id="like-reject-title">정말 관심없음으로 할까요?</h2>
          <p>거절한 좋아요는 다시 되돌릴 수 없어요.</p>
          <div>
            <button
              type="button"
              onClick={() => setRejectTarget(null)}
              disabled={actionLikeId != null}
            >
              취소
            </button>
            <button
              type="button"
              className="is-primary"
              onClick={() => void rejectLike()}
              disabled={actionLikeId != null}
            >
              {actionLikeId === rejectTarget.id ? "처리 중…" : "관심없음"}
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
