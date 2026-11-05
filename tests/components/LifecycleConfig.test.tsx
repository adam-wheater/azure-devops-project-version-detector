import * as React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";

jest.mock("@/services/LifecycleConfigService", () => {
  const actual = jest.requireActual("@/services/LifecycleConfigService");
  return {
    ...actual,
    saveConfig: jest.fn().mockResolvedValue(undefined),
    deleteConfig: jest.fn().mockResolvedValue(undefined),
  };
});

import { LifecycleConfig } from "@/components/LifecycleConfig";
import { deleteConfig, saveConfig } from "@/services/LifecycleConfigService";

function rowFor(name: string): HTMLElement {
  return screen.getByText(name).closest("tr") as HTMLElement;
}

describe("LifecycleConfig", () => {
  beforeEach(() => jest.clearAllMocks());

  it("saves an edited entry and hands the stored document back to the parent", async () => {
    const onSaved = jest.fn();
    render(<LifecycleConfig configDocument={null} onConfigSaved={onSaved} />);

    fireEvent.click(within(rowFor(".NET 8")).getByRole("button", { name: "Edit .NET 8" }));
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: ".NET 8 (extended)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(within(rowFor(".NET 8 (extended)")).getByText("Modified")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [, doc] = onSaved.mock.calls[0];
    expect(saveConfig).toHaveBeenCalledWith(doc);
    expect(doc.overrides[".NET|8.0"].displayName).toBe(".NET 8 (extended)");
    expect(await screen.findByText("Configuration saved.")).toBeInTheDocument();
  });

  it("asks for confirmation in a dialog before removing a built-in entry", () => {
    render(<LifecycleConfig configDocument={null} onConfigSaved={jest.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete .NET 7" }));
    const dialog = screen.getByRole("dialog", { name: "Remove built-in entry?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByText(".NET 7")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete .NET 7" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }));
    expect(screen.queryByText(".NET 7")).not.toBeInTheDocument();
  });

  it("only resets the shared configuration after confirmation", async () => {
    const onSaved = jest.fn();
    render(<LifecycleConfig configDocument={null} onConfigSaved={onSaved} />);

    fireEvent.click(screen.getByRole("button", { name: "Reset All to Defaults" }));
    expect(deleteConfig).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Reset" }));

    await waitFor(() => expect(deleteConfig).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalledWith(expect.any(Array), null);
  });

  it("explains why a duplicate version cannot be added", () => {
    render(<LifecycleConfig configDocument={null} onConfigSaved={jest.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Version" }));
    fireEvent.change(screen.getByPlaceholderText(".NET"), { target: { value: ".NET" } });
    fireEvent.change(screen.getByPlaceholderText("11.0"), { target: { value: "8.0" } });
    fireEvent.change(screen.getByPlaceholderText(".NET 11"), { target: { value: "Dup" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByRole("alert")).toHaveTextContent(".NET 8.0 is already in the list.");
  });
});
