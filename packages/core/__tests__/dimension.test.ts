import { describe, expect, it } from "vitest";
import { parseDimension, formatDimension } from "../src/parser/dimension.js";

describe("parseDimension", () => {
  describe("imperial", () => {
    it("parses feet only", () => {
      expect(parseDimension("12ft", "imperial")).toBe(12);
      expect(parseDimension("12.5ft", "imperial")).toBe(12.5);
      expect(parseDimension("0ft", "imperial")).toBe(0);
    });

    it("parses feet with apostrophe notation", () => {
      expect(parseDimension("12'", "imperial")).toBe(12);
    });

    it("parses feet and inches", () => {
      expect(parseDimension("12ft 6in", "imperial")).toBe(12.5);
      expect(parseDimension("12ft 0in", "imperial")).toBe(12);
      expect(parseDimension("0ft 6in", "imperial")).toBe(0.5);
    });

    it("parses feet and fractional inches", () => {
      const result = parseDimension("4ft 3-1/2in", "imperial");
      expect(result).toBeCloseTo(4 + 3.5 / 12, 5);
    });

    it("parses inches only", () => {
      expect(parseDimension("33in", "imperial")).toBeCloseTo(2.75, 5);
      expect(parseDimension("6in", "imperial")).toBe(0.5);
      expect(parseDimension("12in", "imperial")).toBe(1);
    });

    it("parses bare numbers", () => {
      expect(parseDimension(12.5, "imperial")).toBe(12.5);
      expect(parseDimension(0, "imperial")).toBe(0);
    });

    it("parses bare number strings", () => {
      expect(parseDimension("12.5", "imperial")).toBe(12.5);
      expect(parseDimension("0", "imperial")).toBe(0);
    });

    it("handles whitespace in dimension strings", () => {
      expect(parseDimension("  12ft  ", "imperial")).toBe(12);
      expect(parseDimension("12ft  6in", "imperial")).toBe(12.5);
    });

    it("throws on invalid strings", () => {
      expect(() => parseDimension("", "imperial")).toThrow();
      expect(() => parseDimension("abc", "imperial")).toThrow();
      expect(() => parseDimension("12m", "imperial")).toThrow();
    });
  });

  describe("metric", () => {
    it("parses meters", () => {
      expect(parseDimension("3.5m", "metric")).toBe(3.5);
      expect(parseDimension("0.9m", "metric")).toBe(0.9);
      expect(parseDimension("10m", "metric")).toBe(10);
    });

    it("parses millimeters", () => {
      expect(parseDimension("900mm", "metric")).toBe(0.9);
      expect(parseDimension("1000mm", "metric")).toBe(1);
      expect(parseDimension("2500mm", "metric")).toBe(2.5);
    });

    it("parses bare numbers", () => {
      expect(parseDimension(3.5, "metric")).toBe(3.5);
      expect(parseDimension("3.5", "metric")).toBe(3.5);
    });

    it("throws on invalid strings", () => {
      expect(() => parseDimension("abc", "metric")).toThrow();
      expect(() => parseDimension("12ft", "metric")).toThrow();
    });
  });
});

describe("formatDimension", () => {
  describe("imperial", () => {
    it("formats whole feet", () => {
      expect(formatDimension(12, "imperial")).toBe("12'-0\"");
      expect(formatDimension(0, "imperial")).toBe("0'-0\"");
    });

    it("formats feet and inches", () => {
      expect(formatDimension(12.5, "imperial")).toBe("12'-6\"");
      expect(formatDimension(10.25, "imperial")).toBe("10'-3\"");
    });

    it("formats with rounding", () => {
      // 15ft should be clean
      expect(formatDimension(15, "imperial")).toBe("15'-0\"");
    });
  });

  describe("metric", () => {
    it("formats meters with two decimal places", () => {
      expect(formatDimension(3.5, "metric")).toBe("3.50m");
      expect(formatDimension(10, "metric")).toBe("10.00m");
      expect(formatDimension(0.9, "metric")).toBe("0.90m");
    });
  });
});
