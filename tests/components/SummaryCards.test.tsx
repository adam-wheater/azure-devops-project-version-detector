import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { SummaryCards } from "@/components/SummaryCards";
import { LifecycleStatus, ScanSummary } from "@/models/types";

const summary: ScanSummary = {
  totalRepos: 4,
  totalProjects: 9,
  outdatedCount: 2,
  expiringSoonCount: 3,
  supportedCount: 4,
  frameworkBreakdown: {},
  projectTypeBreakdown: {},
  flavorBreakdown: {},
};

describe("SummaryCards", () => {
  it("renders the status tiles as toggle buttons that state the active filter in text", () => {
    const onClick = jest.fn();
    render(
      <SummaryCards
        summary={summary}
        duration={1530}
        activeStatusFilter={LifecycleStatus.EndOfLife}
        onStatusFilterClick={onClick}
      />
    );

    const eol = screen.getByRole("button", { name: /End of Life/ });
    expect(eol).toHaveAttribute("aria-pressed", "true");
    expect(eol).toHaveTextContent("Filtering: click to clear");
    expect(screen.getByRole("button", { name: /Supported/ })).toHaveAttribute(
      "aria-pressed",
      "false"
    );

    fireEvent.click(screen.getByRole("button", { name: /Expiring Soon/ }));
    expect(onClick).toHaveBeenCalledWith(LifecycleStatus.ExpiringSoon);
  });

  it("shows plain tiles for counts that do not filter", () => {
    render(<SummaryCards summary={summary} duration={1530} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText("1.5s")).toBeInTheDocument();
    expect(screen.getByText("Repositories").closest(".ax-metric")).toBeInTheDocument();
  });
});
