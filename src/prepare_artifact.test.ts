import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ZipArchive } from "archiver";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The tests for prepare.downloadArtifact() are separated from prepare.test.ts
// because they need to mock `@actions/artifact`.

const { getArtifact, downloadArtifactMock } = vi.hoisted(() => ({
  getArtifact: vi.fn(),
  downloadArtifactMock: vi.fn(),
}));

vi.mock("@actions/artifact", () => ({
  DefaultArtifactClient: class {
    getArtifact = getArtifact;
    downloadArtifact = downloadArtifactMock;
  },
}));

// prepare.ts is imported after the mock is registered.
const { downloadArtifact } = await import("./prepare");

const workflowRun = { owner: "example", repo: "client", runId: 123 };

let workDir = "";
let workspace = "";
const originalWorkspace = process.env.GITHUB_WORKSPACE;

beforeEach(() => {
  vi.clearAllMocks();
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "securefix-test-"));
  workspace = path.join(workDir, "workspace");
  fs.mkdirSync(workspace);
  process.env.GITHUB_WORKSPACE = workspace;
  getArtifact.mockResolvedValue({ artifact: { id: 42 } });
});

afterEach(() => {
  if (originalWorkspace === undefined) {
    delete process.env.GITHUB_WORKSPACE;
    return;
  }
  process.env.GITHUB_WORKSPACE = originalWorkspace;
});

const createZip = async (): Promise<string> => {
  const zipPath = path.join(workDir, "artifact.zip");
  const output = fs.createWriteStream(zipPath);
  const zip = new ZipArchive({});
  zip.pipe(output);
  zip.append("securefix-1_files.txt\n", {
    name: "securefix-1_files.txt",
    mode: 0o644,
  });
  zip.append("#!/bin/sh\n", { name: "run.sh", mode: 0o755 });
  await zip.finalize();
  await new Promise<void>((resolve) => output.on("close", () => resolve()));
  return zipPath;
};

// downloadArtifact() is expected to download an artifact as a zip file, so the
// mock copies a zip file into the download directory.
const mockDownload = (zipPath: string, fileNames = ["artifact.zip"]) => {
  downloadArtifactMock.mockImplementation(
    async (_id: number, opts: { path: string }) => {
      for (const fileName of fileNames) {
        fs.copyFileSync(zipPath, path.join(opts.path, fileName));
      }
      return { downloadPath: opts.path };
    },
  );
};

describe("downloadArtifact", () => {
  it("extracts an artifact into a new directory keeping the executable bit", async () => {
    mockDownload(await createZip());

    const artifactDir = await downloadArtifact(
      "token",
      workflowRun,
      "securefix-1",
    );

    // It's extracted into a new directory, not the workspace, so that files
    // of the server workflow aren't mixed with files from the client.
    expect(artifactDir.startsWith(workspace)).toBe(false);
    expect(fs.readdirSync(workspace)).toEqual([]);
    expect(
      fs.readFileSync(path.join(artifactDir, "securefix-1_files.txt"), "utf8"),
    ).toBe("securefix-1_files.txt\n");
    expect(fs.statSync(path.join(artifactDir, "run.sh")).mode & 0o777).toBe(
      0o755,
    );
    fs.rmSync(artifactDir, { recursive: true, force: true });
  });

  it("downloads an artifact without extracting it", async () => {
    mockDownload(await createZip());

    await downloadArtifact("token", workflowRun, "securefix-1");

    expect(downloadArtifactMock).toHaveBeenCalledTimes(1);
    const opts = downloadArtifactMock.mock.calls[0][1];
    expect(opts.skipDecompress).toBe(true);
    expect(opts.path).toBeTruthy();
    // The artifact is downloaded outside the workspace so that the zip file
    // isn't committed.
    expect(opts.path.startsWith(workspace)).toBe(false);
    // The download directory is removed.
    expect(fs.existsSync(opts.path)).toBe(false);
  });

  it("fails if the number of downloaded files isn't one", async () => {
    mockDownload(await createZip(), ["artifact.zip", "unexpected.zip"]);
    process.env.RUNNER_TEMP = fs.mkdtempSync(
      path.join(os.tmpdir(), "securefix-runner-temp-"),
    );

    await expect(
      downloadArtifact("token", workflowRun, "securefix-1"),
    ).rejects.toThrowError("One downloaded artifact file is expected");
    expect(fs.readdirSync(workspace)).toEqual([]);
    // The artifact directory is removed on failure
    expect(fs.readdirSync(process.env.RUNNER_TEMP)).toEqual([]);
    fs.rmSync(process.env.RUNNER_TEMP, { recursive: true, force: true });
    delete process.env.RUNNER_TEMP;
  });
});
