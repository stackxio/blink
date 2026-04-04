import { useEffect, useState } from "react";
import { type BlinkLimits, currentLimits, statusListeners } from "./blinkLimits.js";

export function useBlinkLimits(): BlinkLimits {
  const [limits, setLimits] = useState<BlinkLimits>({ ...currentLimits });

  useEffect(() => {
    const listener = (newLimits: BlinkLimits) => {
      setLimits({ ...newLimits });
    };
    statusListeners.add(listener);

    return () => {
      statusListeners.delete(listener);
    };
  }, []);

  return limits;
}
