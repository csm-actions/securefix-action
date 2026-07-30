import * as fs from "fs";
import * as path from "path";
import * as core from "@actions/core";
import * as unzipStream from "unzip-stream";

// unzip-stream, which `@actions/artifact` uses to extract artifacts, creates
// files with `fs.createWriteStream()` and never restores the Unix file mode
// recorded in the zip archive, so extracted files lose their executable bit.
// This module extracts an artifact and then restores the executable bit from the
// archive.
//
// The mode is stored in the external file attributes of the central directory,
// which is located at the end of the archive. That's why the archive has to be
// downloaded as a file instead of being extracted from the response stream.
//
// https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT

const eocdSignature = 0x06054b50;
const eocdSize = 22;
const zip64EOCDLocatorSignature = 0x07064b50;
const zip64EOCDLocatorSize = 20;
const zip64EOCDSignature = 0x06064b50;
const zip64EOCDSize = 56;
const centralDirectoryEntrySignature = 0x02014b50;
const centralDirectoryEntrySize = 46;
// A zip file comment is at most 64 KiB, and it's stored after the EOCD.
const maxCommentSize = 0xffff;
// The general purpose bit flag 11 indicates that the file name is encoded in
// UTF-8.
const utf8Flag = 0x800;
// The upper byte of `version made by` is the platform. 3 means UNIX.
// The external file attributes contain a Unix file mode only on UNIX.
const unixPlatform = 3;
const zip64Marker16 = 0xffff;
const zip64Marker32 = 0xffffffff;
const executableBits = 0o111;
const executableFileMode = 0o755;

type CentralDirectory = {
  offset: number;
  size: number;
};

const readChunk = (fd: number, offset: number, size: number): Buffer => {
  const buf = Buffer.alloc(size);
  const read = fs.readSync(fd, buf, 0, size, offset);
  return buf.subarray(0, read);
};

/**
 * findCentralDirectory returns the offset and the size of the central
 * directory, which are stored in the End of Central Directory (EOCD) record.
 */
const findCentralDirectory = (
  fd: number,
  fileSize: number,
): CentralDirectory | undefined => {
  const tailSize = Math.min(fileSize, eocdSize + maxCommentSize);
  const tailOffset = fileSize - tailSize;
  const tail = readChunk(fd, tailOffset, tailSize);
  // The EOCD is at the end of the archive, but a comment can follow it, so the
  // signature is searched backwards.
  for (let i = tail.length - eocdSize; i >= 0; i--) {
    if (tail.readUInt32LE(i) !== eocdSignature) {
      continue;
    }
    const offset = tail.readUInt32LE(i + 16);
    if (
      offset === zip64Marker32 ||
      tail.readUInt16LE(i + 10) === zip64Marker16
    ) {
      return findZip64CentralDirectory(fd, tailOffset + i);
    }
    return { offset: offset, size: tail.readUInt32LE(i + 12) };
  }
  return undefined;
};

/**
 * findZip64CentralDirectory reads the Zip64 EOCD record, which is pointed to by
 * the Zip64 EOCD locator placed just before the EOCD record.
 */
const findZip64CentralDirectory = (
  fd: number,
  eocdOffset: number,
): CentralDirectory | undefined => {
  const locatorOffset = eocdOffset - zip64EOCDLocatorSize;
  if (locatorOffset < 0) {
    return undefined;
  }
  const locator = readChunk(fd, locatorOffset, zip64EOCDLocatorSize);
  if (
    locator.length < zip64EOCDLocatorSize ||
    locator.readUInt32LE(0) !== zip64EOCDLocatorSignature
  ) {
    return undefined;
  }
  const zip64EOCD = readChunk(
    fd,
    Number(locator.readBigUInt64LE(8)),
    zip64EOCDSize,
  );
  if (
    zip64EOCD.length < zip64EOCDSize ||
    zip64EOCD.readUInt32LE(0) !== zip64EOCDSignature
  ) {
    return undefined;
  }
  return {
    offset: Number(zip64EOCD.readBigUInt64LE(48)),
    size: Number(zip64EOCD.readBigUInt64LE(40)),
  };
};

/**
 * readFileModes returns a map from a file path in an archive to its Unix file
 * mode. Entries which have no Unix file mode, such as entries created on
 * Windows, are excluded.
 */
export const readFileModes = (zipPath: string): Map<string, number> => {
  const modes = new Map<string, number>();
  const fd = fs.openSync(zipPath, "r");
  try {
    const fileSize = fs.fstatSync(fd).size;
    const cd = findCentralDirectory(fd, fileSize);
    if (cd === undefined || cd.offset >= fileSize) {
      core.warning(
        `${zipPath}: the central directory isn't found. File modes aren't restored`,
      );
      return modes;
    }
    // The size is bounded by the file size so that a broken archive doesn't
    // allocate a huge buffer.
    const buf = readChunk(
      fd,
      cd.offset,
      Math.min(cd.size, fileSize - cd.offset),
    );
    let offset = 0;
    while (offset + centralDirectoryEntrySize <= buf.length) {
      if (buf.readUInt32LE(offset) !== centralDirectoryEntrySignature) {
        break;
      }
      const platform = buf.readUInt16LE(offset + 4) >> 8;
      const flags = buf.readUInt16LE(offset + 8);
      const mode = buf.readUInt32LE(offset + 38) >>> 16;
      const nameSize = buf.readUInt16LE(offset + 28);
      const extraSize = buf.readUInt16LE(offset + 30);
      const commentSize = buf.readUInt16LE(offset + 32);
      const name = buf
        .subarray(
          offset + centralDirectoryEntrySize,
          offset + centralDirectoryEntrySize + nameSize,
        )
        .toString(flags & utf8Flag ? "utf8" : "latin1");
      if (platform === unixPlatform && mode !== 0) {
        modes.set(name, mode);
      }
      offset += centralDirectoryEntrySize + nameSize + extraSize + commentSize;
    }
  } finally {
    fs.closeSync(fd);
  }
  return modes;
};

/**
 * resolveEntryPaths returns a map from the path where each entry is extracted to
 * its Unix file mode.
 * It fails if an entry path escapes from destDir.
 */
const resolveEntryPaths = (
  destDir: string,
  modes: Map<string, number>,
): Map<string, number> => {
  const dir = path.resolve(destDir);
  const resolvedModes = new Map<string, number>();
  for (const [entryPath, mode] of modes) {
    const resolved = path.resolve(dir, entryPath);
    if (resolved !== dir && !resolved.startsWith(dir + path.sep)) {
      throw new Error(
        `${entryPath}: the entry path escapes from the destination directory`,
      );
    }
    resolvedModes.set(resolved, mode);
  }
  return resolvedModes;
};

/**
 * restoreFileModes adds the executable bit to extracted files whose entries in
 * an archive have it. Only the executable bit is restored. Other bits such as
 * setuid are ignored deliberately because archives are created by client
 * repositories.
 */
const restoreFileModes = (modes: Map<string, number>) => {
  for (const [filePath, mode] of modes) {
    if (!(mode & executableBits)) {
      continue;
    }
    // chmod() follows symbolic links, so the file type is checked with lstat()
    // to avoid changing the mode of a file outside the destination directory.
    let stats: fs.Stats;
    try {
      stats = fs.lstatSync(filePath);
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : JSON.stringify(error);
      core.warning(`${filePath}: the extracted file isn't found: ${msg}`);
      continue;
    }
    if (!stats.isFile()) {
      continue;
    }
    core.info(`Restoring the executable bit: ${filePath}`);
    fs.chmodSync(filePath, executableFileMode);
  }
};

/**
 * extract extracts a zip archive into destDir, restoring the executable bit of
 * files.
 */
export const extract = async (
  zipPath: string,
  destDir: string,
): Promise<void> => {
  // Entry paths are validated before the extraction so that no file is written
  // outside destDir.
  const modes = resolveEntryPaths(destDir, readFileModes(zipPath));
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(zipPath)
      .on("error", reject)
      .pipe(unzipStream.Extract({ path: destDir }))
      .on("close", resolve)
      .on("error", reject);
  });
  restoreFileModes(modes);
};
