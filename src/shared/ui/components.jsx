import { Children, cloneElement, Fragment, isValidElement, useId } from "react";
import { formatUnreadCount } from "../../features/chat/unreadCount.js";
import { NotificationButton } from "../../features/notifications/NotificationControls.jsx";
import { useProfileImage } from "../../features/profile/useProfileImage.js";
import { asset } from "../assets.js";
import { profilePhotoUrls } from "../utils.js";
import { PixelIcon } from "./pixel.jsx";

export function Icon({ name, className = "" }) {
  return (
    <img
      className={`icon ${className}`}
      src={asset(name)}
      width="24"
      height="24"
      alt=""
      aria-hidden="true"
    />
  );
}

export function PixelButton({
  children,
  onClick,
  disabled = false,
  secondary = false,
  quiet = false,
  className = "",
  type = "button",
}) {
  return (
    <button
      type={type}
      className={`pixel-button ${secondary ? "secondary" : ""} ${quiet ? "quiet" : ""} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function BrandHeader({ children, className = "", navigate }) {
  return (
    <header className={`brand-header ${className}`}>
      <button
        type="button"
        className="brand-header-home"
        onClick={() => navigate("/home")}
        aria-label="홈으로 이동"
      >
        <img
          className="brand-header-logo"
          src={asset("logo-header.png?v=d41514e")}
          width="120"
          height="45"
          alt="*23#"
        />
      </button>
      {children}
      <NotificationButton />
    </header>
  );
}

export function ScreenHeader({
  title,
  onBack,
  right,
  className = "",
  brandLogo = false,
  notificationAction = false,
}) {
  return (
    <header
      className={`screen-header ${brandLogo ? "screen-header-branded" : ""} ${className}`}
    >
      <button
        type="button"
        className="header-back"
        onClick={onBack}
        aria-label="뒤로가기"
      >
        <PixelIcon name="back" scale={2} />
      </button>
      {brandLogo && (
        <img
          className="screen-header-logo"
          src={asset("logo-header.png?v=d41514e")}
          width="66"
          height="30"
          alt="*23#"
        />
      )}
      <h1>{title}</h1>
      <div className="header-right">
        {right}
        {notificationAction && <NotificationButton />}
      </div>
    </header>
  );
}

const tabItems = [
  ["홈", "/home", "home"],
  ["좋아요", "/likes", "heart"],
  ["채팅", "/chats", "chat"],
  ["마이", "/my", "user"],
];

export function BottomNav({ path, navigate, unreadMessageCount = null }) {
  return (
    <nav className="bottom-nav" aria-label="주요 메뉴">
      {tabItems.map(([label, href, icon]) => {
        const badge =
          href === "/chats" ? formatUnreadCount(unreadMessageCount) : "";
        const active =
          href === "/home"
            ? path === "/" || path === "/home"
            : path === href || path.startsWith(`${href}/`);
        return (
          <a
            href={href}
            key={href}
            className={active ? "active" : ""}
            onClick={(event) => {
              if (
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              event.preventDefault();
              navigate(href);
            }}
            aria-current={active ? "page" : undefined}
            aria-label={
              badge ? `${label}, 안 읽은 메시지 ${unreadMessageCount}개` : label
            }
          >
            <span className="bottom-nav-icon">
              <PixelIcon name={icon} scale={3} />
              {badge && (
                <span className="bottom-nav-badge" aria-hidden="true">
                  {badge}
                </span>
              )}
            </span>
            <span>{label}</span>
          </a>
        );
      })}
    </nav>
  );
}

const FIELD_CONTROL_TAGS = new Set(["input", "select", "textarea"]);

function labelFieldControls(children, labelId, describedBy, invalid) {
  return Children.map(children, (child) => {
    if (!isValidElement(child)) return child;

    if (typeof child.type === "string" && FIELD_CONTROL_TAGS.has(child.type)) {
      const hasAccessibleName =
        child.props["aria-label"] || child.props["aria-labelledby"];
      const existingDescription = child.props["aria-describedby"];
      const nextDescription = [existingDescription, describedBy]
        .filter(Boolean)
        .join(" ");

      return cloneElement(child, {
        ...(!hasAccessibleName && { "aria-labelledby": labelId }),
        ...(nextDescription && { "aria-describedby": nextDescription }),
        ...(invalid && { "aria-invalid": true }),
      });
    }

    if (child.type === Fragment || typeof child.type === "string") {
      return cloneElement(
        child,
        {},
        labelFieldControls(child.props.children, labelId, describedBy, invalid),
      );
    }

    return child;
  });
}

export function Field({ label, children, hint, error }) {
  const fieldId = useId();
  const labelId = `${fieldId}-label`;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ");
  const controls = labelFieldControls(
    children,
    labelId,
    describedBy,
    Boolean(error),
  );

  return (
    <fieldset className="field">
      <legend id={labelId} className="field-label">
        {label}
      </legend>
      {controls}
      {hint && (
        <small id={hintId} className="hint">
          {hint}
        </small>
      )}
      {error && (
        <small id={errorId} className="field-error" role="alert">
          {error}
        </small>
      )}
    </fieldset>
  );
}

export function ChoiceGroup({
  options,
  value,
  onChange,
  className = "",
  disabled = false,
}) {
  return (
    <div className={`choice-group ${className}`}>
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          className={`choice ${value === key ? "selected" : ""}`}
          disabled={disabled}
          onClick={() => onChange(key)}
          aria-pressed={value === key}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon = "♡", title, description, action, role }) {
  return (
    <div className="empty-state" role={role}>
      <div className="empty-icon">{icon}</div>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function PersonAvatar({ person, size = "medium" }) {
  const { source, onError } = useProfileImage(
    person,
    person?.photo || person?.image || "",
  );
  return source ? (
    <img
      className={`person-avatar ${size}`}
      src={source}
      width={size === "large" ? 88 : 56}
      height={size === "large" ? 88 : 56}
      loading="lazy"
      alt=""
      onError={onError}
    />
  ) : (
    <span className={`person-avatar generated ${size}`} aria-hidden="true">
      ♥
    </span>
  );
}

export function ProfilePhoto({ person, index = 0, className = "" }) {
  const { source, onError } = useProfileImage(
    person,
    profilePhotoUrls(person)[index] || "",
    index,
  );

  if (!source) {
    return (
      <div
        className={`${className} recommendation-placeholder`}
        role="img"
        aria-label={`${person?.nickname || "프로필"}님의 사진이 없어요`}
      >
        <span aria-hidden="true">♥</span>
      </div>
    );
  }

  return (
    <img
      className={className}
      src={source}
      width="600"
      height="800"
      alt={`${person?.nickname || "프로필"}님의 프로필 사진`}
      onError={onError}
    />
  );
}

export function PhotoSegments({ person, index, onSelect, className = "" }) {
  const photos = profilePhotoUrls(person);
  if (!photos.length) return null;

  return (
    <nav className={`photo-steps ${className}`} aria-label="프로필 사진">
      {photos.map((photo, photoIndex) => (
        <button
          key={`${person.id}-${photo}`}
          type="button"
          className={
            photoIndex === index ? "active" : photoIndex < index ? "seen" : ""
          }
          aria-label={`사진 ${photoIndex + 1} 보기`}
          aria-pressed={photoIndex === index}
          onClick={() => onSelect(photoIndex)}
        />
      ))}
    </nav>
  );
}
