import { describe, it, expect } from "vitest";
import { listFilesToCommit } from "./commit";

const sha = "1111111111111111111111111111111111111111";

describe("listFilesToCommit", () => {
  it("excludes submodules", () => {
    expect(
      listFilesToCommit("a.txt\nsub\n\nb.txt", [{ path: "sub", sha }]),
    ).toEqual(["a.txt", "b.txt"]);
  });
  it("excludes deleted files under a submodule", () => {
    expect(
      listFilesToCommit(
        "vendor/x/a.txt\nvendor/x/b/c.txt\nvendor/x\nvendor/xy.txt",
        [{ path: "vendor/x", sha }],
      ),
    ).toEqual(["vendor/xy.txt"]);
  });
  it("returns an empty list if only submodules are changed", () => {
    expect(listFilesToCommit("sub", [{ path: "sub", sha }])).toEqual([]);
  });
});
