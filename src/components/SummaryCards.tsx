import * as React from "react";
import { LifecycleStatus, ScanSummary } from "../models/types";
import { Metric } from "./ui";

interface SummaryCardsProps {
  summary: ScanSummary;
  duration: number;
  activeStatusFilter?: LifecycleStatus | null;
  onStatusFilterClick?: (status: LifecycleStatus) => void;
}

type MetricTone = "neutral" | "accent" | "success" | "warn" | "danger";

interface Card {
  value: React.ReactNode;
  label: string;
  tone: MetricTone;
  status?: LifecycleStatus;
}

export function SummaryCards({
  summary,
  duration,
  activeStatusFilter,
  onStatusFilterClick,
}: SummaryCardsProps) {
  const cards: Card[] = [
    { value: summary.totalRepos, label: "Repositories", tone: "accent" },
    { value: summary.totalProjects, label: "Projects Found", tone: "accent" },
    {
      value: summary.supportedCount,
      label: "Supported",
      tone: "success",
      status: LifecycleStatus.Supported,
    },
    {
      value: summary.expiringSoonCount,
      label: "Expiring Soon",
      tone: "warn",
      status: LifecycleStatus.ExpiringSoon,
    },
    {
      value: summary.outdatedCount,
      label: "End of Life",
      tone: "danger",
      status: LifecycleStatus.EndOfLife,
    },
    { value: `${(duration / 1000).toFixed(1)}s`, label: "Scan Duration", tone: "neutral" },
  ];

  return (
    <div className="ax-metrics" data-testid="summary-cards">
      {cards.map((card) => {
        if (!card.status || !onStatusFilterClick) {
          return <Metric key={card.label} label={card.label} value={card.value} tone={card.tone} />;
        }
        const status = card.status;
        const isActive = status === activeStatusFilter;
        // The whole tile is the button; the hint text states the filter so the
        // pressed state is never conveyed by the ring colour alone.
        return (
          <button
            key={card.label}
            type="button"
            className={`ax-metric ax-metric--${card.tone} pvd-metric-button`}
            aria-pressed={isActive}
            title={isActive ? "Show all statuses" : `Filter by ${card.label}`}
            onClick={() => onStatusFilterClick(status)}
          >
            <span className="ax-metric__label">{card.label}</span>
            <span className="ax-metric__value">{card.value}</span>
            <span className="ax-metric__hint">
              {isActive ? "Filtering: click to clear" : "Click to filter"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
