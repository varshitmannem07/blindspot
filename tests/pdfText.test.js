import { describe, expect, it } from "vitest";
import { textItemsToLines } from "../src/lib/pdfText.js";

const item = (str, x, y) => ({ str, transform: [1, 0, 0, 1, x, y] });

describe("textItemsToLines", () => {
  it("orders lines top to bottom and fragments left to right", () => {
    const items = [item("Engineer", 64, 700), item("Jane", 64, 740), item("Doe", 100, 740), item("| Acme", 130, 700)];
    expect(textItemsToLines(items)).toEqual(["Jane Doe", "Engineer | Acme"]);
  });

  it("merges fragments whose baselines differ by under 3pt", () => {
    expect(textItemsToLines([item("GPA", 64, 500), item("3.9", 90, 501.5)])).toEqual(["GPA 3.9"]);
  });

  it("drops empty fragments", () => {
    expect(textItemsToLines([item(" ", 64, 500), item("Skills", 64, 480)])).toEqual(["Skills"]);
  });
});
