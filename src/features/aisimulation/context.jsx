import { createContext, useContext } from "react";

export const SimulationTrackingContext = createContext(null);

export function useSimulationTrackingContext() {
  const tracking = useContext(SimulationTrackingContext);
  if (!tracking) throw new Error("SimulationTrackingContext is required");
  return tracking;
}
