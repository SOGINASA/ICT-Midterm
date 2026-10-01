import {
  createContext, HTMLAttributes, ReactNode, useContext, useEffect,
  useLayoutEffect, useRef, useState,
} from "react";
import { useReducedMotion } from "../hooks/useReducedMotion";

type Phase = "entering" | "open" | "closing";
const PresenceContext = createContext<Phase>("open");
export const usePresencePhase = () => useContext(PresenceContext);
const EXIT_DURATION = 180;

/** Keep the last visible content mounted until its exit transition finishes. */
export default function Presence({
  present, children, variant = "collapse", className = "", onExitComplete, ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  present: boolean;
  children: ReactNode;
  variant?: "collapse" | "floating" | "modal" | "fade";
  onExitComplete?: () => void;
}) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(present);
  const [phase, setPhase] = useState<Phase>(present ? "entering" : "closing");
  const mountedRef = useRef(present);
  const phaseRef = useRef(phase);
  const lastChildren = useRef(children);
  const exitCallback = useRef(onExitComplete);
  const exited = useRef(false);
  const ref = useRef<HTMLDivElement>(null);
  phaseRef.current = phase;
  exitCallback.current = onExitComplete;
  if (present) lastChildren.current = children;

  useLayoutEffect(() => {
    let first = 0;
    let second = 0;
    let timer = 0;
    if (present) {
      const wasMounted = mountedRef.current;
      mountedRef.current = true;
      exited.current = false;
      setMounted(true);
      if (reduced || (wasMounted && phaseRef.current !== "entering")) {
        // Reversing an in-progress exit transitions from its current position.
        setPhase("open");
      } else {
        setPhase("entering");
        first = requestAnimationFrame(() => {
          second = requestAnimationFrame(() => setPhase("open"));
        });
      }
    } else if (mountedRef.current) {
      setPhase("closing");
      const finish = () => {
        mountedRef.current = false;
        exited.current = true;
        setMounted(false);
      };
      if (reduced) finish();
      else timer = window.setTimeout(finish, EXIT_DURATION);
    }
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      window.clearTimeout(timer);
    };
  }, [present, reduced]);

  useLayoutEffect(() => {
    // Closed controls cannot receive clicks or keyboard focus during their exit.
    ref.current?.toggleAttribute("inert", !present);
  }, [present, mounted]);
  useEffect(() => {
    if (!mounted && exited.current) {
      exited.current = false;
      exitCallback.current?.();
    }
  }, [mounted]);

  if (!mounted) return null;
  return (
    <PresenceContext.Provider value={phase}>
      <div {...props} ref={ref} data-presence={phase}
        className={`motion-presence motion-${variant} ${className}`}>
        <div className="motion-presence-content">{lastChildren.current}</div>
      </div>
    </PresenceContext.Provider>
  );
}
