import { useRef } from "react";
import { DefaultTooltipContent, TooltipProps } from "recharts";

/** Retain the last values while Recharts fades and hides the tooltip wrapper. */
export default function ChartTooltipContent(props: TooltipProps<number, string>) {
  const last = useRef(props);
  if (props.active && props.payload?.length) last.current = props;
  return <DefaultTooltipContent {...last.current} />;
}
