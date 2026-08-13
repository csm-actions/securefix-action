import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import archiver from "archiver";
import { describe, it, expect, beforeEach } from "vitest";
import { extract, readFileModes } from "./unzip";

type Entry = {
  // name is the entry path in an archive.
  name: string;
  content?: string;
  mode?: number;
};

const centralDirectoryEntrySignature = 0x02014b50;
const centralDirectoryEntrySize = 46;
const eocdSize = 22;

let workDir = "";

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "securefix-test-"));
});

/**
 * createZip creates a zip archive in the same way as `@actions/artifact`, which
 * uploads artifacts with archiver.
 */
const createZip = async (entries: Entry[]): Promise<string> => {
  const zipPath = path.join(workDir, "artifact.zip");
  const output = fs.createWriteStream(zipPath);
  const zip = archiver.create("zip", {});
  zip.pipe(output);
  for (const entry of entries) {
    zip.append(entry.content ?? "", { name: entry.name, mode: entry.mode });
  }
  await zip.finalize();
  await new Promise<void>((resolve) => output.on("close", () => resolve()));
  return zipPath;
};

/**
 * eachCentralDirectoryEntry calls fn with the offset of each central directory
 * entry and its entry path.
 */
const eachCentralDirectoryEntry = (
  buf: Buffer,
  fn: (offset: number, name: string) => void,
) => {
  // archiver writes no zip file comment, so the EOCD is the last 22 bytes.
  const eocd = buf.length - eocdSize;
  let offset = buf.readUInt32LE(eocd + 16);
  const end = offset + buf.readUInt32LE(eocd + 12);
  while (offset < end) {
    expect(buf.readUInt32LE(offset)).toBe(centralDirectoryEntrySignature);
    const nameSize = buf.readUInt16LE(offset + 28);
    fn(
      offset,
      buf
        .subarray(
          offset + centralDirectoryEntrySize,
          offset + centralDirectoryEntrySize + nameSize,
        )
        .toString("utf8"),
    );
    offset +=
      centralDirectoryEntrySize +
      nameSize +
      buf.readUInt16LE(offset + 30) +
      buf.readUInt16LE(offset + 32);
  }
};

/**
 * patchPlatform rewrites the platform of an entry so that the entry looks like
 * an entry created on Windows, which has no Unix file mode. archiver always
 * records a Unix file mode, so it can't create such an archive.
 */
const patchPlatform = (zipPath: string, entryName: string) => {
  const buf = fs.readFileSync(zipPath);
  let patched = false;
  eachCentralDirectoryEntry(buf, (offset, name) => {
    if (name !== entryName) {
      return;
    }
    // The upper byte of `version made by` is the platform. 0 means MS-DOS.
    buf.writeUInt8(0, offset + 5);
    patched = true;
  });
  expect(patched).toBe(true);
  fs.writeFileSync(zipPath, buf);
};

/**
 * patchEntryName replaces an entry path with another one of the same length.
 * archiver sanitizes entry paths, so it can't create an archive whose entry path
 * escapes from the destination directory.
 */
const patchEntryName = (zipPath: string, from: string, to: string) => {
  expect(Buffer.byteLength(to)).toBe(Buffer.byteLength(from));
  const buf = fs.readFileSync(zipPath);
  // The entry path is stored both in the local file header and in the central
  // directory.
  let count = 0;
  let index = buf.indexOf(from);
  while (index !== -1) {
    buf.write(to, index);
    count++;
    index = buf.indexOf(from, index + 1);
  }
  expect(count).toBe(2);
  fs.writeFileSync(zipPath, buf);
};

const modeOf = (filePath: string): number => fs.statSync(filePath).mode & 0o777;

const newDestDir = (): string => {
  const destDir = path.join(workDir, "dest");
  fs.mkdirSync(destDir);
  return destDir;
};

describe("readFileModes", () => {
  it("reads the file mode of each entry", async () => {
    const zipPath = await createZip([
      { name: "foo.txt", mode: 0o644 },
      { name: "run.sh", mode: 0o755 },
      { name: "dir/nested.sh", mode: 0o700 },
    ]);
    expect(readFileModes(zipPath)).toEqual(
      new Map([
        // The regular file bits (0o100000) are included in the mode.
        ["foo.txt", 0o100644],
        ["run.sh", 0o100755],
        ["dir/nested.sh", 0o100700],
      ]),
    );
  });

  it("excludes entries which have no Unix file mode", async () => {
    const zipPath = await createZip([
      { name: "run.sh", mode: 0o755 },
      { name: "windows.txt", mode: 0o644 },
    ]);
    patchPlatform(zipPath, "windows.txt");
    expect([...readFileModes(zipPath).keys()]).toEqual(["run.sh"]);
  });

  it("reads a UTF-8 entry path", async () => {
    const zipPath = await createZip([{ name: "ファイル.sh", mode: 0o755 }]);
    expect([...readFileModes(zipPath).keys()]).toEqual(["ファイル.sh"]);
  });

  it("returns an empty map if the file isn't a zip archive", () => {
    const filePath = path.join(workDir, "not-a-zip");
    fs.writeFileSync(filePath, "hello");
    expect(readFileModes(filePath)).toEqual(new Map());
  });

  it("returns an empty map if the file is empty", () => {
    const filePath = path.join(workDir, "empty");
    fs.writeFileSync(filePath, "");
    expect(readFileModes(filePath)).toEqual(new Map());
  });
});

describe("extract", () => {
  it("extracts files and keeps the executable bit", async () => {
    const zipPath = await createZip([
      { name: "foo.txt", content: "foo", mode: 0o644 },
      { name: "run.sh", content: "#!/bin/sh\necho hi\n", mode: 0o755 },
      { name: "dir/nested.sh", content: "#!/bin/sh\n", mode: 0o755 },
    ]);
    const destDir = newDestDir();

    await extract(zipPath, destDir);

    expect(fs.readFileSync(path.join(destDir, "foo.txt"), "utf8")).toBe("foo");
    expect(fs.readFileSync(path.join(destDir, "run.sh"), "utf8")).toBe(
      "#!/bin/sh\necho hi\n",
    );
    expect(modeOf(path.join(destDir, "run.sh"))).toBe(0o755);
    expect(modeOf(path.join(destDir, "dir/nested.sh"))).toBe(0o755);
    // Files which aren't executable in the archive are left as they are.
    expect(modeOf(path.join(destDir, "foo.txt")) & 0o111).toBe(0);
  });

  it("restores the executable bit if only the group or other bit is set", async () => {
    const zipPath = await createZip([{ name: "run.sh", mode: 0o645 }]);
    const destDir = newDestDir();

    await extract(zipPath, destDir);

    expect(modeOf(path.join(destDir, "run.sh"))).toBe(0o755);
  });

  it("ignores bits other than the executable bit", async () => {
    // 0o4755 is setuid + rwxr-xr-x.
    const zipPath = await createZip([{ name: "run.sh", mode: 0o4755 }]);
    const destDir = newDestDir();

    await extract(zipPath, destDir);

    expect(modeOf(path.join(destDir, "run.sh"))).toBe(0o755);
  });

  it("extracts files even if the archive has no Unix file mode", async () => {
    const zipPath = await createZip([
      { name: "foo.txt", content: "foo", mode: 0o755 },
    ]);
    patchPlatform(zipPath, "foo.txt");
    const destDir = newDestDir();

    await extract(zipPath, destDir);

    expect(fs.readFileSync(path.join(destDir, "foo.txt"), "utf8")).toBe("foo");
  });

  it("fails without extracting anything if an entry path escapes from the destination", async () => {
    const zipPath = await createZip([
      { name: "foo.txt", content: "foo", mode: 0o644 },
      { name: "xx/escaped.sh", content: "#!/bin/sh\n", mode: 0o755 },
    ]);
    patchEntryName(zipPath, "xx/escaped.sh", "../escaped.sh");
    const destDir = newDestDir();

    await expect(extract(zipPath, destDir)).rejects.toThrowError(
      "../escaped.sh: the entry path escapes from the destination directory",
    );
    expect(fs.readdirSync(destDir)).toEqual([]);
    expect(fs.existsSync(path.join(workDir, "escaped.sh"))).toBe(false);
  });
});
