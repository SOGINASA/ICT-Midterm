import {
  BookOpen,
  Bus,
  Coffee,
  Shapes,
  Ticket,
  LucideIcon,
} from "lucide-react";

export const categoryStyles: Record<
  string,
  { icon: LucideIcon; color: string; background: string }
> = {
  food: { icon: Coffee, color: "#bd7841", background: "#fcf1e6" },
  transport: { icon: Bus, color: "#537da9", background: "#ecf2fb" },
  study: { icon: BookOpen, color: "#8672b6", background: "#f2eefb" },
  leisure: { icon: Ticket, color: "#b67588", background: "#fbeef2" },
  other: { icon: Shapes, color: "#637680", background: "#edf2f4" },
};

export const chartColors = [
  "#238764",
  "#77b59b",
  "#a3cbbb",
  "#c6ddcf",
  "#e5eade",
];

export default function CategoryIcon({
  categoryId,
  size = 20,
}: {
  categoryId: string;
  size?: number;
}) {
  const style =
    categoryStyles[categoryId.toLowerCase()] || categoryStyles.other;
  const Icon = style.icon;
  return (
    <span
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
      style={{ color: style.color, background: style.background }}
    >
      <Icon size={size} strokeWidth={1.7} aria-hidden="true" />
    </span>
  );
}
