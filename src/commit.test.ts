import { describe, it, expect } from "vitest";
import { listFilesToCommit } from "./commit";

describe("listFilesToCommit", () => {
  it("excludes submodules and symlinks", () => {
    expect(
      listFilesToCommit(
        "a.txt\nsub\nlink\n\nb.txt",
        [{ path: "sub" }],
        [{ path: "link" }],
      ),
    ).toEqual(["a.txt", "b.txt"]);
  });
  it("returns an empty list if only submodules and symlinks are changed", () => {
    expect(
      listFilesToCommit("sub\nlink", [{ path: "sub" }], [{ path: "link" }]),
    ).toEqual([]);
  });
});
