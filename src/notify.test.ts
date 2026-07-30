import { describe, it, expect, afterEach } from "vitest";
import { isIgnoredErrorMessage, readComment } from "./notify";

describe("isIgnoredErrorMessage", () => {
  it("returns true if the message contains an ignored error message", () => {
    expect(isIgnoredErrorMessage("Update is not a fast forward")).toBe(true);
  });

  it("returns true even if the ignored error message is a substring", () => {
    expect(
      isIgnoredErrorMessage(
        "PATCH https://api.github.com/repos/foo/bar/git/refs/heads/main: 422 Update is not a fast forward",
      ),
    ).toBe(true);
  });

  it("returns false if the message doesn't contain any ignored error message", () => {
    expect(
      isIgnoredErrorMessage("Resource not accessible by integration"),
    ).toBe(false);
  });

  it("returns false if the message is empty", () => {
    expect(isIgnoredErrorMessage("")).toBe(false);
  });
});

describe("readComment", () => {
  afterEach(() => {
    delete process.env.INPUT_PULL_REQUEST_COMMENT;
  });

  it("returns the pull_request_comment input", () => {
    process.env.INPUT_PULL_REQUEST_COMMENT = "## Custom comment";
    expect(readComment()).toBe("## Custom comment");
  });

  it("returns the default comment if the input is empty", () => {
    expect(readComment()).toBe("## :x: Securefix Action failed.");
  });
});
