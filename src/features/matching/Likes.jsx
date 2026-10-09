import { useCallback, useEffect, useRef, useState } from "react";
import { apiErrorMessage } from "../../shared/api/errorMessages.js";
import { asset } from "../../shared/assets.js";
import {
  BrandHeader,
  EmptyState,
  PersonAvatar,
  PixelButton,
} from "../../shared/ui/components.jsx";
import * as matchingApi from "./api.js";

export function mapLikeItem(item, tab) {
  const member = tab === "received" ? item?.sender : item?.receiver;
  return {
    id: item?.likeId,
    memberId: member?.memberId,
    nickname: member?.nickname || "닉네임 정보 없음",
    age: member?.age,
    job: member?.job || "",
    region: member?.region || "",
    photo: member?.profileImageUrl || "",
    status: item?.status || "",
  };
}

export function Likes({
  toast,
  onFindMatch,
  navigate,
  initialTab = "received",
}) {
  const [tab, setTab] = useState(initialTab === "sent" ? "sent" : "received");
  const [rejectTarget, setRejectTarget] = useState(null);
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
    },
    sent: {
      items: [],
      loaded: false,
      loading: false,
      error: "",
      nextCursor: null,
      hasNext: false,
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
            "좋아요를 불러오지 못했어요. 잠시 후 다시 시도해주세요.",
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
  const page = pages[tab];
  const removeReceivedLike = useCallback((likeId) => {
    setPages((current) => ({
      ...current,
      received: {
        ...current.received,
        items: current.received.items.filter((item) => item.id !== likeId),
      },
    }));
  }, []);
  async function acceptLike(person) {
    if (
      !person.memberId ||
      person.status === "MATCHED" ||
      actionInFlight.current
    )
      return;
    actionInFlight.current = true;
    setActionLikeId(person.id);
    try {
      await matchingApi.sendLike(person.memberId);
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
    if (!person.memberId) return;
    const returnTo = `/likes?tab=${tab}`;
    navigate(
      `/profiles/${person.memberId}?returnTo=${encodeURIComponent(returnTo)}`,
    );
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
      <div className="segmented-tabs likes-seg">
        <button
          type="button"
          className={tab === "received" ? "active" : ""}
          aria-pressed={tab === "received"}
          onClick={() => setTab("received")}
        >
          받은 좋아요
        </button>
        <button
          type="button"
          className={tab === "sent" ? "active" : ""}
          aria-pressed={tab === "sent"}
          onClick={() => setTab("sent")}
        >
          보낸 좋아요
        </button>
      </div>
      <main className="main-scroll likes-main">
        {page.loading && !page.loaded ? (
          <EmptyState
            icon="♡"
            title="좋아요를 불러오고 있어요"
            description="잠시만 기다려주세요."
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
                alt=""
              />
            }
            title={
              tab === "received"
                ? "아직 도착한 마음이 없어요"
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
              <article className="like-card" key={person.id}>
                <div className="like-person">
                  <button
                    type="button"
                    className="like-avatar-button"
                    aria-label={`${person.nickname} 프로필 보기`}
                    onClick={() => openProfile(person)}
                    disabled={!person.memberId}
                  >
                    <PersonAvatar person={person} />
                  </button>
                  <span>
                    <strong>
                      {person.nickname}
                      {person.age != null && `, ${person.age}`}
                    </strong>
                    <small>
                      {[person.job, person.region].filter(Boolean).join(" · ")}
                    </small>
                  </span>
                </div>
                {tab === "received" && person.status === "MATCHED" && (
                  <p className="like-status">서로 좋아요</p>
                )}
                {tab === "received" && person.status !== "MATCHED" && (
                  <div className="like-actions">
                    <PixelButton
                      secondary
                      onClick={() => setRejectTarget(person)}
                      disabled={actionLikeId != null}
                    >
                      관심없음
                    </PixelButton>
                    <PixelButton
                      onClick={() => acceptLike(person)}
                      disabled={actionLikeId != null || !person.memberId}
                    >
                      {actionLikeId === person.id ? "처리 중..." : "좋아요"}
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
                {page.loading ? "불러오는 중..." : "더 보기"}
              </PixelButton>
            )}
          </div>
        )}
      </main>
      {rejectTarget && (
        <div className="like-confirm-backdrop">
          <section
            className="like-confirm-dialog"
            role="dialog"
            aria-modal="true"
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
                {actionLikeId === rejectTarget.id ? "처리 중..." : "관심없음"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
