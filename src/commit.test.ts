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
  it("excludes deleted files under a symlink", () => {
    expect(
      listFilesToCommit(
        "dir/a.txt\ndir/b/c.txt\ndir-2/x.txt",
        [],
        [{ path: "dir", target: "other" }],
      ),
    ).toEqual(["dir-2/x.txt"]);
  });
  it("excludes deleted files under a submodule", () => {
    expect(
      listFilesToCommit(
        "vendor/x/a.txt\nvendor/x/b/c.txt\nvendor/x\nvendor/xy.txt",
        [{ path: "vendor/x", sha }],
        [],
      ),
    ).toEqual(["vendor/xy.txt"]);
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
