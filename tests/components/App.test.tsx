import * as React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ScanResult } from "@/models/types";
import { makeProject } from "./fixtures";

jest.mock("@/services/RepoService", () => ({
  getProjectName: jest.fn().mockResolvedValue("Contoso"),
  getProjectId: jest.fn().mockResolvedValue("project-1"),
  getGitClient: jest.fn().mockResolvedValue({}),
  listRepositories: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/services/ScanCacheService", () => ({
  loadCachedScanResult: jest.fn(),
  saveScanResultToCache: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/services/LifecycleConfigService", () => {
  const actual = jest.requireActual("@/services/LifecycleConfigService");
  return {
    ...actual,
    loadConfig: jest.fn().mockResolvedValue(null),
    saveConfig: jest.fn().mockResolvedValue(undefined),
    deleteConfig: jest.fn().mockResolvedValue(undefined),
  };
});

import { App } from "@/components/App";
import { loadCachedScanResult } from "@/services/ScanCacheService";

const cachedResult: ScanResult = {
  projects: [makeProject()],
  summary: {
    totalRepos: 1,
    totalProjects: 1,
    outdatedCount: 0,
    expiringSoonCount: 0,
    supportedCount: 1,
    frameworkBreakdown: {},
    projectTypeBreakdown: {},
    flavorBreakdown: {},
  },
  scanDate: "2026-01-01T00:00:00.000Z",
  duration: 1200,
};

describe("App", () => {
  beforeEach(() => {
    // A fresh cache, so no background scan starts on load.
    (loadCachedScanResult as jest.Mock).mockResolvedValue({
      scanResult: cachedResult,
      cachedAt: new Date().toISOString(),
    });
  });

  it("renders the shared shell, tabs and the cached results", async () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Project Version Detector" })).toBeInTheDocument();
    expect(await screen.findByRole("cell", { name: "contoso-web" })).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Main navigation tabs" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Projects/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("group", { name: "Theme" })).toBeInTheDocument();
    expect(screen.getByText(/Last scanned:/)).toBeInTheDocument();
  });

  it("shows saved lifecycle settings when the Configuration tab is opened again", async () => {
    render(<App />);
    await screen.findByRole("cell", { name: "contoso-web" });

    fireEvent.click(screen.getByRole("tab", { name: "Configuration" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit .NET 8" }));
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: ".NET 8 (edited)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    });
    await screen.findByText("Configuration saved.");

    fireEvent.click(screen.getByRole("tab", { name: ".NET Lifecycle Reference" }));
    fireEvent.click(screen.getByRole("tab", { name: "Configuration" }));

    // Before the fix the tab remounted from the document loaded at startup,
    // so the saved name was gone and a second save reverted it.
    await waitFor(() => expect(screen.getByText(".NET 8 (edited)")).toBeInTheDocument());
    const row = screen.getByText(".NET 8 (edited)").closest("tr")!;
    expect(within(row).getByText("Modified")).toBeInTheDocument();
  });
});
