import { CSSProperties, ReactNode, useEffect, useId, useLayoutEffect, useRef } from "react";
import { X } from "lucide-react";
import { useVisualViewport } from "../hooks/useVisualViewport";
import { usePresencePhase } from "./Presence";
import { useReducedMotion } from "../hooks/useReducedMotion";

export default function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  const viewport = useVisualViewport();
  const phase = usePresencePhase();
  const reducedMotion = useReducedMotion();
  const previousHeight = useRef(0);
  const resizeAnimation = useRef<Animation | null>(null);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    ref.current?.toggleAttribute("inert", phase === "closing");
  }, [phase]);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog?.open || phase === "closing") return;
    const from = resizeAnimation.current
      ? dialog.getBoundingClientRect().height : previousHeight.current;
    resizeAnimation.current?.cancel();
    resizeAnimation.current = null;
    const height = dialog.getBoundingClientRect().height;
    previousHeight.current = height;
    if (!reducedMotion && dialog.animate && from && Math.abs(height - from) > 1) {
      // Confirmation/validation changes should not snap a centred dialog to a new size.
      const animation = dialog.animate([{ height: `${from}px` }, { height: `${height}px` }], {
        duration: 220, easing: "cubic-bezier(.22,1,.36,1)",
      });
      resizeAnimation.current = animation;
      animation.onfinish = () => { resizeAnimation.current = null; };
    }
  }, [children, title, phase, reducedMotion]);

  const revealFocusedField = () => {
    const content = contentRef.current;
    const active = document.activeElement as HTMLElement | null;
    if (!content || !active || !content.contains(active)) return;
    const bounds = content.getBoundingClientRect();
    const field = active.getBoundingClientRect();
    const inset = 16;
    if (field.bottom > bounds.bottom - inset) {
      content.scrollTop += field.bottom - bounds.bottom + inset;
    } else if (field.top < bounds.top + inset) {
      content.scrollTop -= bounds.top - field.top + inset;
    }
  };

  useEffect(() => {
    const dialog = ref.current;
    const active = document.activeElement as HTMLElement | null;
    const scrollY = window.scrollY;
    const bodyStyle = document.body.style;
    const previousStyle = {
      overflow: bodyStyle.overflow,
      position: bodyStyle.position,
      top: bodyStyle.top,
      width: bodyStyle.width,
    };
    dialog?.showModal();
    // Focusing the heading announces context without opening the phone keyboard.
    headingRef.current?.focus({ preventScroll: true });
    previousHeight.current = dialog?.getBoundingClientRect().height ?? 0;
    bodyStyle.overflow = "hidden";
    bodyStyle.position = "fixed";
    bodyStyle.top = `-${scrollY}px`;
    bodyStyle.width = "100%";
    return () => {
      resizeAnimation.current?.cancel();
      dialog?.close();
      Object.assign(bodyStyle, previousStyle);
      window.scrollTo({ top: scrollY, behavior: "auto" });
      if (active?.isConnected) active.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(revealFocusedField);
    return () => cancelAnimationFrame(frame);
  }, [viewport.height, viewport.offsetTop]);

  return (
    <dialog
      ref={ref}
      data-presence={phase}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (phase !== "closing") closeRef.current();
      }}
      onClick={(e) => {
        if (phase === "closing" || e.target !== ref.current) return;
        const bounds = e.currentTarget.getBoundingClientRect();
        if (
          e.clientX < bounds.left ||
          e.clientX > bounds.right ||
          e.clientY < bounds.top ||
          e.clientY > bounds.bottom
        )
          closeRef.current();
      }}
      className={`app-modal bg-white shadow-2xl ${wide ? "app-modal-wide" : ""}`}
      style={
        {
          "--visual-viewport-height": `${viewport.height}px`,
          "--visual-viewport-top": `${viewport.offsetTop}px`,
        } as CSSProperties
      }
    >
      <div className="modal-header flex shrink-0 items-center justify-between gap-3 border-b border-slate-100">
        <h2
          ref={headingRef}
          id={titleId}
          tabIndex={-1}
          className="section-title outline-none"
        >
          {title}
        </h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <div
        ref={contentRef}
        className="modal-content"
        onFocusCapture={revealFocusedField}
      >
        {children}
      </div>
    </dialog>
  );
}
