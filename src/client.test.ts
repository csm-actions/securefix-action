import { describe, it, expect } from "vitest";
import { parseCustomInput } from "./client";

describe("parseCustomInput", () => {
  it("returns an empty object if the input is empty", () => {
    expect(parseCustomInput("")).toEqual({});
  });

  it("parses a JSON object", () => {
    expect(parseCustomInput('{"foo":"bar","baz":1}')).toEqual({
      foo: "bar",
      baz: 1,
    });
  });

  it("fails if the input isn't valid JSON", () => {
    expect(() => parseCustomInput("{foo}")).toThrowError(
      "The `custom` input must be valid JSON: {foo}",
    );
  });

  it("fails if the input is a JSON array", () => {
    expect(() => parseCustomInput("[]")).toThrowError(
      "The `custom` input must be a JSON object, got: []",
    );
  });

  it("fails if the input is a JSON scalar", () => {
    expect(() => parseCustomInput("1")).toThrowError(
      "The `custom` input must be a JSON object, got: 1",
    );
  });

  it("fails if the input is JSON null", () => {
    expect(() => parseCustomInput("null")).toThrowError(
      "The `custom` input must be a JSON object, got: null",
    );
  });
});
