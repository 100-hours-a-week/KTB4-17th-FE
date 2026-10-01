import { useEffect, useState } from "react";
import { Field } from "../../shared/ui/components.jsx";
import { regions } from "./api.js";

export function ActivityRegionPicker({
  selectedId,
  selectedName,
  onSelect,
  disabled = false,
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    let active = true;
    const search = query.trim();
    setItems([]);
    if (!search || disabled) {
      setStatus("idle");
      return undefined;
    }
    setStatus("loading");
    const timer = window.setTimeout(async () => {
      try {
        const result = await regions(search);
        if (!active) return;
        const next = Array.isArray(result?.items) ? result.items : [];
        setItems(next);
        setStatus(next.length ? "success" : "empty");
      } catch {
        if (active) setStatus("error");
      }
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, disabled]);

  return (
    <Field
      label="활동 지역"
      hint="시·군·구 이름으로 검색한 뒤 결과를 선택해주세요."
    >
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="시·군·구 검색 (예: 수원시, 강남구)"
        aria-label="활동 지역 검색"
        disabled={disabled}
      />
      {selectedName && (
        <p className="selected-region">
          선택한 지역 <strong>{selectedName}</strong>
        </p>
      )}
      {status === "loading" && (
        <p className="region-search-state" role="status">
          활동 지역을 검색하고 있어요.
        </p>
      )}
      {status === "empty" && (
        <p className="region-search-state" role="status">
          검색 결과가 없어요. 시·군·구 이름을 확인해주세요.
        </p>
      )}
      {status === "error" && (
        <p className="field-error" role="alert">
          활동 지역을 불러오지 못했어요. 검색어를 다시 입력해주세요.
        </p>
      )}
      <section className="region-list" aria-label="활동 지역 검색 결과">
        {items.map((item) => {
          const name = `${item.provinceName} ${item.regionName}`;
          return (
            <button
              type="button"
              key={item.activityRegionId}
              className={selectedId === item.activityRegionId ? "selected" : ""}
              aria-pressed={selectedId === item.activityRegionId}
              disabled={disabled}
              onClick={() => {
                onSelect({
                  activityRegionId: item.activityRegionId,
                  regionName: name,
                });
                setQuery("");
              }}
            >
              {name}
              <span aria-hidden="true">
                {selectedId === item.activityRegionId ? "●" : "○"}
              </span>
            </button>
          );
        })}
      </section>
    </Field>
  );
}
