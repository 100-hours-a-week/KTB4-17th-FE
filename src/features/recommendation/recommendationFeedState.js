export const initialRecommendationFeedState = {
  recommendations: [],
  currentIndex: 0,
  exhausted: false,
};

export function recommendationFeedReducer(state, action) {
  switch (action.type) {
    case "replace":
      return {
        recommendations: action.items,
        currentIndex: 0,
        exhausted: false,
      };
    case "append":
      if (action.items.length === 0) return state;
      return {
        ...state,
        recommendations: [...state.recommendations, ...action.items],
        exhausted: false,
      };
    case "revalidate": {
      const currentMemberId =
        state.recommendations[state.currentIndex]?.id ?? null;
      const matchingIndex = action.items.findIndex(
        (item) => item.id === currentMemberId,
      );
      const currentIndex =
        matchingIndex >= 0
          ? matchingIndex
          : Math.min(state.currentIndex, Math.max(action.items.length - 1, 0));
      return {
        recommendations: action.items,
        currentIndex,
        exhausted: action.items.length === 0,
      };
    }
    case "advance":
      return { ...state, currentIndex: state.currentIndex + 1 };
    case "retreat":
      return {
        ...state,
        currentIndex: Math.max(state.currentIndex - 1, 0),
      };
    case "dismiss": {
      if (
        state.currentIndex < 0 ||
        state.currentIndex >= state.recommendations.length
      )
        return state;

      const recommendations = state.recommendations.filter(
        (_, index) => index !== state.currentIndex,
      );
      if (recommendations.length === 0) {
        return { recommendations, currentIndex: 0, exhausted: true };
      }

      return {
        recommendations,
        currentIndex: Math.min(state.currentIndex, recommendations.length - 1),
        exhausted: false,
      };
    }
    default:
      return state;
  }
}
