/**
 * @jest-environment jsdom
 */
import { downloadCsv } from "@/utils/csvExport";

describe("downloadCsv", () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    jest.useFakeTimers();
    URL.createObjectURL = jest.fn(() => "blob:report");
    URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });

  it("clicks a download link and revokes the URL only after the click has been handled", () => {
    const clicks: string[] = [];
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      clicks.push(this.download);
    });

    downloadCsv("a,b", "report.csv");

    expect(clicks).toEqual(["report.csv"]);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    jest.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:report");
    expect(document.querySelector("a[download]")).toBeNull();
    click.mockRestore();
  });
});
