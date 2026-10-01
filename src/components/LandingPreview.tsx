import { KeyboardEvent, useId, useRef, useState } from "react";
import { BookOpen, Bus, Coffee, Utensils } from "lucide-react";
import "./LandingPreview.css";

const tabs = ["Overview", "Budgets", "Expenses"] as const;

const categories = [
  { name: "Food", spent: 31800, limit: 45000, color: "#285b47" },
  { name: "Leisure", spent: 15500, limit: 25000, color: "#8b9e6c" },
  { name: "Transport", spent: 11100, limit: 20000, color: "#c7ad7f" },
  { name: "Study", spent: 10800, limit: 15000, color: "#9baaa1" },
  { name: "Other", spent: 8450, limit: 15000, color: "#e1d8c5" },
];

const expenses = [
  {
    title: "Lunch at the campus café",
    category: "Food",
    amount: "3,500",
    payment: "Card",
    Icon: Utensils,
  },
  {
    title: "Bus / taxi",
    category: "Transport",
    amount: "1,200",
    payment: "Card",
    Icon: Bus,
  },
  {
    title: "Printing",
    category: "Study",
    amount: "2,450",
    payment: "Cash",
    Icon: BookOpen,
  },
];

const money = (amount: number) => amount.toLocaleString("en-US");

export function LandingPreview() {
  const [activeTab, setActiveTab] = useState(0);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const instanceId = useId();

  function navigateTabs(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = (index + 1) % tabs.length;
        break;
      case "ArrowLeft":
        next = (index + tabs.length - 1) % tabs.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    setActiveTab(next);
    buttons.current[next]?.focus();
  }

  return (
    <div className="tf-preview">
      <div className="tf-preview-header">
        <span className="tf-preview-brand">
          <span className="tf-preview-mark" aria-hidden="true">
            ₸
          </span>
          TengeFlow
        </span>
        <span className="tf-preview-meta">Sample month</span>
      </div>

      <div
        className="tf-preview-tabs"
        role="tablist"
        aria-label="Explore TengeFlow"
      >
        {tabs.map((tab, index) => (
          <button
            key={tab}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            id={`${instanceId}-tab-${index}`}
            type="button"
            role="tab"
            aria-selected={activeTab === index}
            aria-controls={`${instanceId}-panel-${index}`}
            tabIndex={activeTab === index ? 0 : -1}
            className="tf-preview-tab"
            onClick={() => setActiveTab(index)}
            onKeyDown={(event) => navigateTabs(event, index)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`${instanceId}-panel-0`}
        aria-labelledby={`${instanceId}-tab-0`}
        hidden={activeTab !== 0}
        tabIndex={0}
        className="tf-preview-panel"
      >
        <div className="tf-preview-overview-heading">
          <div>
            <p className="tf-preview-label">This month’s spending</p>
            <p className="tf-preview-total">
              77,650 <span>₸</span>
            </p>
          </div>
          <span className="tf-preview-coffee" aria-hidden="true">
            <Coffee size={27} strokeWidth={1.5} />
          </span>
        </div>
        <div
          className="tf-preview-chart"
          role="img"
          aria-label="Spending by category: Food 31,800 tenge; Leisure 15,500; Transport 11,100; Study 10,800; Other 8,450."
        >
          {categories.map((category) => (
            <span
              key={category.name}
              style={{
                flexGrow: category.spent,
                backgroundColor: category.color,
              }}
            />
          ))}
        </div>
        <div className="tf-preview-legend">
          {categories.slice(0, 3).map((category) => (
            <span key={category.name}>
              <i
                style={{ backgroundColor: category.color }}
                aria-hidden="true"
              />
              {category.name}
            </span>
          ))}
          <span className="tf-preview-legend-other">+2 more</span>
        </div>
        <div className="tf-preview-remaining">
          <span className="tf-preview-remaining-label">
            A little room to breathe.
            <small>Left of your 120,000 ₸ budget</small>
          </span>
          <strong>
            42,350 <span>₸</span>
          </strong>
        </div>
      </div>

      <div
        role="tabpanel"
        id={`${instanceId}-panel-1`}
        aria-labelledby={`${instanceId}-tab-1`}
        hidden={activeTab !== 1}
        tabIndex={0}
        className="tf-preview-panel"
      >
        <div className="tf-preview-section-heading">
          <h3>A plan for your month</h3>
          <span>Spent / limit</span>
        </div>
        <div className="tf-preview-budgets">
          {categories.slice(0, 3).map((category) => (
            <div className="tf-preview-budget" key={category.name}>
              <div className="tf-preview-budget-heading">
                <span>{category.name}</span>
                <span>
                  <strong>{money(category.spent)}</strong> /{" "}
                  {money(category.limit)} ₸
                </span>
              </div>
              <div
                className="tf-preview-budget-track"
                role="meter"
                aria-label={`${category.name} budget used`}
                aria-valuemin={0}
                aria-valuemax={category.limit}
                aria-valuenow={category.spent}
                aria-valuetext={`${money(category.spent)} of ${money(category.limit)} tenge`}
              >
                <span
                  style={{
                    width: `${(category.spent / category.limit) * 100}%`,
                    backgroundColor: category.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="tf-preview-panel-note">
          Your monthly budget: <strong>120,000 ₸</strong>
        </p>
      </div>

      <div
        role="tabpanel"
        id={`${instanceId}-panel-2`}
        aria-labelledby={`${instanceId}-tab-2`}
        hidden={activeTab !== 2}
        tabIndex={0}
        className="tf-preview-panel"
      >
        <div className="tf-preview-section-heading">
          <h3>The everyday adds up</h3>
          <span>Recent entries</span>
        </div>
        <ul className="tf-preview-expenses" aria-label="Sample expenses">
          {expenses.map(({ title, category, amount, payment, Icon }) => (
            <li key={title} className="tf-preview-expense">
              <span className="tf-preview-expense-icon" aria-hidden="true">
                <Icon size={19} strokeWidth={1.6} />
              </span>
              <span className="tf-preview-expense-description">
                <strong>{title}</strong>
                <small>
                  {category} · {payment}
                </small>
              </span>
              <span className="tf-preview-expense-amount">−{amount} ₸</span>
            </li>
          ))}
        </ul>
        <p className="tf-preview-panel-note">
          Coffee, commutes, and everything in between.
        </p>
      </div>
      <div className="tf-preview-footer">
        <span className="tf-preview-status" aria-hidden="true" />A glimpse of
        your everyday finances<span className="tf-preview-currency">KZT</span>
      </div>
    </div>
  );
}

export default LandingPreview;
