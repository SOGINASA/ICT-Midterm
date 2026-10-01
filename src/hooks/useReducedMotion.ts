import { useEffect, useState } from "react";

const query = "(prefers-reduced-motion: reduce)";
export function useReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window.matchMedia === "function" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}
