import { describe, it, expect, afterEach } from "vitest";
import { codeBlock, isIgnoredErrorMessage, readComment } from "./notify";

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

describe("codeBlock", () => {
  it("uses a fence longer than backticks in the text", () => {
    expect(codeBlock("a\n```\n# injected\n```")).toBe(
      "\n````\na\n```\n# injected\n```\n````\n",
    );
  });
  it("uses three backticks at least", () => {
    expect(codeBlock("error")).toBe("\n```\nerror\n```\n");
  });
});
