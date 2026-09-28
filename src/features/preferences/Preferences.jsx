import { useAppState } from "../../shared/appState.jsx";
import {
  ChoiceGroup,
  Field,
  PixelButton,
  ScreenHeader,
} from "../../shared/ui/components.jsx";
import { drinkings, religions, smokings } from "../profile/data.js";

export function Preferences({ navigate, toast }) {
  const { data, setData } = useAppState();
  const p = data.preferences;
  const set = (key, value) =>
    setData((old) => ({
      ...old,
      preferences: { ...old.preferences, [key]: value },
    }));
  return (
    <>
      <ScreenHeader title="선호 설정" onBack={() => navigate("/home")} />
      <main className="main-scroll preferences-main">
        <h1>어떤 사람이 편한가요?</h1>
        <p className="subcopy">추천받고 싶은 상대의 조건을 설정해요.</p>
        <Field label={`나이 ${p.minAge}~${p.maxAge}세`}>
          <div className="range-row">
            <input
              type="number"
              min="19"
              max="39"
              value={p.minAge}
              onChange={(e) => set("minAge", e.target.value)}
            />
            <span>~</span>
            <input
              type="number"
              min="19"
              max="39"
              value={p.maxAge}
              onChange={(e) => set("maxAge", e.target.value)}
            />
          </div>
        </Field>
        <Field label={`키 ${p.minHeight}~${p.maxHeight}cm`}>
          <div className="range-row">
            <input
              type="number"
              min="130"
              max="220"
              value={p.minHeight}
              onChange={(e) => set("minHeight", e.target.value)}
            />
            <span>~</span>
            <input
              type="number"
              min="130"
              max="220"
              value={p.maxHeight}
              onChange={(e) => set("maxHeight", e.target.value)}
            />
          </div>
        </Field>
        <Field label="종교">
          <ChoiceGroup
            options={[["ANY", "상관없음"], ...religions]}
            value={p.religion || "ANY"}
            onChange={(v) => set("religion", v)}
          />
        </Field>
        <Field label="음주">
          <ChoiceGroup
            options={[["ANY", "상관없음"], ...drinkings]}
            value={p.drinking || "ANY"}
            onChange={(v) => set("drinking", v)}
          />
        </Field>
        <Field label="흡연">
          <ChoiceGroup
            options={[["ANY", "상관없음"], ...smokings]}
            value={p.smoking || "ANY"}
            onChange={(v) => set("smoking", v)}
          />
        </Field>
        <PixelButton
          onClick={() => {
            toast("선호 조건을 저장했어요.");
            navigate("/home");
          }}
        >
          저장하기
        </PixelButton>
      </main>
    </>
  );
}
