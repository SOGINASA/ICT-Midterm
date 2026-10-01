import { createContext, ReactNode, useContext, useState } from "react";

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
export function periodLabel(month: string) {
  return new Date(`${month}-01T12:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}
const PeriodContext = createContext({
  month: currentMonth(),
  setMonth: (_month: string) => {},
  label: "",
});
export function PeriodProvider({ children }: { children: ReactNode }) {
  const [month, setMonth] = useState(currentMonth);
  return (
    <PeriodContext.Provider
      value={{ month, setMonth, label: periodLabel(month) }}
    >
      {children}
    </PeriodContext.Provider>
  );
}
export function usePeriod() {
  return useContext(PeriodContext);
}
