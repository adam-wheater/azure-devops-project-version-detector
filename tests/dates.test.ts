import { addMonths, formatLocalIsoDate, isDatePast, parseIsoDate, startOfDay } from "@/utils/dates";

describe("dates", () => {
  describe("parseIsoDate", () => {
    it("parses a calendar date as local midnight", () => {
      const date = parseIsoDate("2026-11-10")!;
      expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([
        2026, 10, 10, 0,
      ]);
    });

    it("rejects empty, malformed and rolled-over dates", () => {
      expect(parseIsoDate("")).toBeNull();
      expect(parseIsoDate(undefined)).toBeNull();
      expect(parseIsoDate("Unknown")).toBeNull();
      expect(parseIsoDate("N/A (.NET Standard)")).toBeNull();
      expect(parseIsoDate("2026-02-31")).toBeNull();
    });
  });

  describe("addMonths", () => {
    it("clamps to the last day of a shorter month", () => {
      const result = addMonths(new Date(2026, 7, 31), 6);
      expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2027, 1, 28]);
    });

    it("keeps the day when it exists in the target month", () => {
      const result = addMonths(new Date(2026, 0, 15), 6);
      expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2026, 6, 15]);
    });
  });

  describe("isDatePast", () => {
    it("is false during the day itself and true from the next day", () => {
      expect(isDatePast("2026-11-10", new Date(2026, 10, 10, 23, 59))).toBe(false);
      expect(isDatePast("2026-11-10", new Date(2026, 10, 11, 0, 0))).toBe(true);
    });

    it("is false for values that are not dates", () => {
      expect(isDatePast("Unknown", new Date(2030, 0, 1))).toBe(false);
      expect(isDatePast(undefined)).toBe(false);
    });
  });

  it("startOfDay drops the time of day", () => {
    expect(startOfDay(new Date(2026, 4, 6, 17, 45)).getTime()).toBe(new Date(2026, 4, 6).getTime());
  });

  it("formatLocalIsoDate uses the local calendar day", () => {
    expect(formatLocalIsoDate(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });
});
