import { DetailsHTMLAttributes, ReactNode, useEffect, useRef, useState } from "react";

interface AnimatedDetailsProps extends Omit<DetailsHTMLAttributes<HTMLDetailsElement>, "open" | "onToggle" | "children"> {
  summary: ReactNode;
  children: ReactNode;
  summaryClassName?: string;
  contentClassName?: string;
}

/** A native disclosure that retains its content long enough to animate in both directions. */
export default function AnimatedDetails({ summary, children, summaryClassName, contentClassName, ...props }: AnimatedDetailsProps) {
  const details = useRef<HTMLDetailsElement>(null);
  const heading = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const animations = useRef<Animation[]>([]);
  const targetOpen = useRef(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => () => animations.current.forEach((animation) => animation.cancel()), []);

  function toggle() {
    const element = details.current;
    const title = heading.current;
    const body = content.current;
    if (!element || !title || !body) return;
    const nextOpen = !targetOpen.current;
    targetOpen.current = nextOpen;
    setExpanded(nextOpen);
    if (!nextOpen && body.contains(document.activeElement)) title.focus();
    if (nextOpen) body.removeAttribute("inert");
    else body.setAttribute("inert", "");

    // Capture the current frame before cancelling: a quick second click reverses without a jump.
    const startHeight = element.getBoundingClientRect().height;
    const startOpacity = element.open ? getComputedStyle(body).opacity : "0";
    animations.current.forEach((animation) => animation.cancel());
    animations.current = [];

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !element.animate) {
      element.open = nextOpen;
      element.style.height = "";
      element.style.overflow = "";
      return;
    }

    element.open = true;
    element.style.height = "";
    element.style.overflow = "hidden";
    const styles = getComputedStyle(element);
    const verticalSpace = [styles.borderTopWidth, styles.borderBottomWidth, styles.paddingTop, styles.paddingBottom]
      .reduce((total, value) => total + (parseFloat(value) || 0), 0);
    const endHeight = nextOpen ? element.getBoundingClientRect().height : title.getBoundingClientRect().height + verticalSpace;
    element.style.height = `${startHeight}px`;
    const duration = nextOpen ? 280 : 180;
    const heightAnimation = element.animate(
      [{ height: `${startHeight}px` }, { height: `${endHeight}px` }],
      { duration, easing: "cubic-bezier(.22,1,.36,1)", fill: "forwards" },
    );
    const contentAnimation = body.animate(
      [{ opacity: startOpacity }, { opacity: nextOpen ? 1 : 0 }],
      { duration, easing: "ease-out", fill: "forwards" },
    );
    animations.current = [heightAnimation, contentAnimation];
    heightAnimation.onfinish = () => {
      if (animations.current[0] !== heightAnimation) return;
      element.open = nextOpen;
      element.style.height = "";
      element.style.overflow = "";
      animations.current.forEach((animation) => animation.cancel());
      animations.current = [];
    };
  }

  return (
    <details {...props} ref={details} data-expanded={expanded}>
      <summary
        ref={heading}
        className={summaryClassName}
        aria-expanded={expanded}
        onClick={(event) => { event.preventDefault(); toggle(); }}
      >
        {summary}
      </summary>
      <div ref={content} className={contentClassName} style={{ display: "flow-root" }}>{children}</div>
    </details>
  );
}
