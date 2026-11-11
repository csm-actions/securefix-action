import { describe, it, expect } from "vitest";
import { listFilesToCommit } from "./commit";

const sha = "1111111111111111111111111111111111111111";

describe("listFilesToCommit", () => {
  it("excludes submodules and symlinks", () => {
    expect(
      listFilesToCommit(
        "a.txt\nsub\nlink\n\nb.txt",
        [{ path: "sub", sha }],
        [{ path: "link", target: "a.txt" }],
      ),
    ).toEqual(["a.txt", "b.txt"]);
  });
  it("returns an empty list if only submodules and symlinks are changed", () => {
    expect(
      listFilesToCommit(
        "sub\nlink",
        [{ path: "sub", sha }],
        [{ path: "link", target: "a" }],
      ),
    ).toEqual([]);
  });
});
