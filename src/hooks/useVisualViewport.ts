import { useEffect, useState } from "react";

function readViewport() {
  const viewport = window.visualViewport;
  // Let browser zoom enlarge the sheet naturally instead of shrinking it again.
  const isZoomed = viewport && viewport.scale > 1.05;
  return {
    height: isZoomed
      ? window.innerHeight
      : (viewport?.height ?? window.innerHeight),
    offsetTop: isZoomed ? 0 : (viewport?.offsetTop ?? 0),
  };
}

/** The visible screen can shrink for the software keyboard without a window resize. */
export function useVisualViewport() {
  const [viewport, setViewport] = useState(readViewport);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = readViewport();
        setViewport((previous) =>
          previous.height === next.height &&
          previous.offsetTop === next.offsetTop
            ? previous
            : next,
        );
      });
    };
    const visualViewport = window.visualViewport;
    window.addEventListener("resize", update);
    visualViewport?.addEventListener("resize", update);
    visualViewport?.addEventListener("scroll", update);
    update();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      visualViewport?.removeEventListener("resize", update);
      visualViewport?.removeEventListener("scroll", update);
    };
  }, []);

  return viewport;
}
