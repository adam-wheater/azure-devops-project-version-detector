import * as React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { VersionTable } from "@/components/VersionTable";
import { DotNetFlavor, LifecycleStatus } from "@/models/types";
import { makeProject } from "./fixtures";

function rowNames(): string[] {
  const table = screen.getByTestId("version-table");
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.querySelectorAll("td")[2]?.textContent ?? "");
}

describe("VersionTable", () => {
  const projects = [
    makeProject({ projectName: "Modern", repoId: "r1", targetFramework: "net8.0" }),
    makeProject({
      projectName: "Legacy",
      repoId: "r2",
      targetFramework: "net472",
      targetFrameworks: ["net472"],
      dotNetFlavor: DotNetFlavor.DotNetFramework,
      lifecycleStatus: LifecycleStatus.EndOfLife,
      eolDate: "2020-01-14",
    }),
    makeProject({ projectName: "Core", repoId: "r3", targetFramework: "netcoreapp3.1" }),
  ];

  it("renders a design-system table sorted by status, with aria-sort on the active column", () => {
    render(<VersionTable projects={projects} />);

    const table = screen.getByTestId("version-table");
    expect(table).toHaveClass("ax-table");
    expect(rowNames()[0]).toBe("Legacy");
    const statusHeader = screen.getByRole("button", { name: "Status" }).closest("th");
    expect(statusHeader).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByText("END OF LIFE")).toHaveClass("ax-pill", "ax-pill--danger");
  });

  it("sorts target frameworks by version, so net472 comes before netcoreapp3.1 and net8.0", () => {
    render(<VersionTable projects={projects} />);

    fireEvent.click(screen.getByRole("button", { name: "Target Framework" }));
    expect(rowNames()).toEqual(["Legacy", "Core", "Modern"]);

    fireEvent.click(screen.getByRole("button", { name: "Target Framework" }));
    expect(rowNames()).toEqual(["Modern", "Core", "Legacy"]);
    expect(screen.getByRole("button", { name: "Target Framework" }).closest("th")).toHaveAttribute(
      "aria-sort",
      "descending"
    );
  });

  it("marks a passed end-of-life date with text, not colour alone", () => {
    render(<VersionTable projects={projects} />);
    const cell = screen.getByText("2020-01-14").closest("td")!;
    expect(cell).toHaveClass("pvd-date-past");
    expect(within(cell).getByText("(passed)")).toHaveClass("ax-sr-only");
  });

  it("expands a row to show project details from its labelled toggle", () => {
    render(
      <VersionTable
        projects={[
          makeProject({
            keyNuGetPackages: [{ name: "Serilog", version: "4.0.0" }],
            sdkVersion: "8.0.100",
          }),
        ]}
      />
    );

    const toggle = screen.getByRole("button", { name: "Expand details for Contoso.Web" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);

    expect(
      screen.getByRole("button", { name: "Collapse details for Contoso.Web" })
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Key NuGet Packages")).toBeInTheDocument();
    expect(screen.getByText("8.0.100 (from global.json)")).toBeInTheDocument();
  });

  it("shows an empty state when no projects match", () => {
    render(<VersionTable projects={[]} />);
    expect(screen.getByText("No projects match the current filters.")).toBeInTheDocument();
  });
});
