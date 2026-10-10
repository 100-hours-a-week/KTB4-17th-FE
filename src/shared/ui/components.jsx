import { formatUnreadCount } from "../../features/chat/unreadCount.js";
import { useProfileImage } from "../../features/profile/useProfileImage.js";
import { asset } from "../assets.js";
import { profilePhotoUrls } from "../utils.js";
import { PixelIcon } from "./pixel.jsx";

export function Icon({ name, className = "" }) {
  return (
    <img
      className={`icon ${className}`}
      src={asset(name)}
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
          alt="*23#"
        />
      </button>
      {children ?? (
        <>
          <span className="brand-signal" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="brand-battery" aria-hidden="true" />
        </>
      )}
    </header>
  );
}

export function ScreenHeader({
  title,
  onBack,
  right,
  className = "",
  brandLogo = false,
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
        ‹
      </button>
      {brandLogo && (
        <img
          className="screen-header-logo"
          src={asset("logo-header.png?v=d41514e")}
          alt="*23#"
        />
      )}
      <strong>{title}</strong>
      <div className="header-right">{right}</div>
    </header>
  );
}

const tabItems = [
  ["HOME", "/home", "home"],
  ["LIKES", "/likes", "heart"],
  ["CHAT", "/chats", "chat"],
  ["MY", "/my", "user"],
];

export function BottomNav({ path, navigate, unreadMessageCount = null }) {
  return (
    <nav className="bottom-nav" aria-label="주요 메뉴">
      {tabItems.map(([label, href, icon]) => {
        const badge =
          href === "/chats" ? formatUnreadCount(unreadMessageCount) : "";
        return (
          <button
            type="button"
            key={href}
            className={path.startsWith(href) ? "active" : ""}
            onClick={() => navigate(href)}
            aria-current={path.startsWith(href) ? "page" : undefined}
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
          </button>
        );
      })}
    </nav>
  );
}

export function Field({ label, children, hint, error }) {
  return (
    <fieldset className="field">
      <legend className="field-label">{label}</legend>
      {children}
      {hint && <small className="hint">{hint}</small>}
      {error && <small className="field-error">{error}</small>}
    </fieldset>
  );
}

export function ChoiceGroup({ options, value, onChange, className = "" }) {
  return (
    <div className={`choice-group ${className}`}>
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          className={`choice ${value === key ? "selected" : ""}`}
          onClick={() => onChange(key)}
          aria-pressed={value === key}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon = "♡", title, description, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <strong>{title}</strong>
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
