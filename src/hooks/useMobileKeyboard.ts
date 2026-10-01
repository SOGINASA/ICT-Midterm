import { useEffect, useState } from "react";

/** Keep fixed mobile controls from competing with the software keyboard. */
export function useMobileKeyboard() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let restingHeight = window.innerHeight;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const field = document.activeElement;
        const typing =
          field instanceof HTMLInputElement ||
          field instanceof HTMLTextAreaElement;
        if (!typing) restingHeight = window.innerHeight;
        const height = window.visualViewport?.height || window.innerHeight;
        setOpen(
          typing && window.innerWidth < 1024 && restingHeight - height > 120,
        );
      });
    };
    const orientation = () => {
      restingHeight = window.innerHeight;
      update();
    };
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    window.visualViewport?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", orientation);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", orientation);
    };
  }, []);
  return open;
}
