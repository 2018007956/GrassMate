const SITE_CONFIG = {
  appName: "GrassMate",
  repoOwner: "2018007956",
  repoName: "GrassMate",
  fallbackReleaseUrl: "https://github.com/2018007956/GrassMate/releases",
  fallbackDownloadUrl: "https://github.com/2018007956/GrassMate/releases/latest",
};

const $ = (id) => document.getElementById(id);

const nodes = {
  downloadButton: $("download-button"),
  releaseLink: $("release-link"),
  status: $("status"),
  version: $("version"),
  publishedAt: $("published-at"),
  assetSize: $("asset-size"),
  assetName: $("asset-name"),
  releaseNotes: $("release-notes"),
  shaCommand: $("sha-command"),
  copyCommand: $("copy-command"),
  checksumLink: $("checksum-link"),
};

function formatDate(isoString) {
  if (!isoString) return "-";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  const level = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** level;
  return `${value.toFixed(level === 0 ? 0 : 1)} ${units[level]}`;
}

function pickDmgAsset(assets) {
  return assets.find((asset) => asset.name.toLowerCase().endsWith(".dmg"));
}

function pickChecksumAsset(assets) {
  return assets.find((asset) => {
    const name = asset.name.toLowerCase();
    return name.includes("sha256") || name.includes("checksum");
  });
}

function cleanReleaseNotes(body) {
  if (!body || body.trim().length === 0) return "릴리즈 노트가 비어 있습니다.";
  const lines = body
    .split("\n")
    .map((line) => line.replace(/\r/g, "").trimEnd())
    .filter((line, idx, arr) => !(line === "" && arr[idx - 1] === ""));

  const maxLines = 16;
  if (lines.length <= maxLines) return lines.join("\n");
  return `${lines.slice(0, maxLines).join("\n")}\n...\n(전체 내용은 릴리즈 노트를 확인하세요)`;
}

function setFallbackUI(message) {
  nodes.status.classList.remove("hidden");
  nodes.status.textContent = message;
  nodes.version.textContent = "latest";
  nodes.publishedAt.textContent = "-";
  nodes.assetSize.textContent = "-";
  nodes.assetName.textContent = "릴리즈 페이지에서 확인";
  nodes.releaseNotes.textContent =
    "GitHub API에서 최신 릴리즈를 확인하지 못했습니다.\n릴리즈 페이지에서 DMG 파일을 직접 선택해 다운로드하세요.";
  nodes.downloadButton.href = SITE_CONFIG.fallbackDownloadUrl;
  nodes.releaseLink.href = SITE_CONFIG.fallbackReleaseUrl;
}

async function loadLatestRelease() {
  const endpoint = `https://api.github.com/repos/${SITE_CONFIG.repoOwner}/${SITE_CONFIG.repoName}/releases/latest`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/vnd.github+json",
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API request failed (${response.status})`);
    }

    const release = await response.json();
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const dmgAsset = pickDmgAsset(assets);
    const checksumAsset = pickChecksumAsset(assets);
    const releaseUrl = release.html_url || SITE_CONFIG.fallbackReleaseUrl;
    const releaseTag = release.tag_name || "latest";

    nodes.releaseLink.href = releaseUrl;
    nodes.version.textContent = releaseTag;
    nodes.publishedAt.textContent = formatDate(release.published_at);
    nodes.releaseNotes.textContent = cleanReleaseNotes(release.body);

    if (!dmgAsset) {
      nodes.status.classList.remove("hidden");
      nodes.status.textContent =
        "최신 릴리즈를 찾았지만 .dmg 파일이 없습니다. 릴리즈 페이지에서 파일을 확인하세요.";
      nodes.assetSize.textContent = "-";
      nodes.assetName.textContent = "DMG 없음";
      nodes.downloadButton.href = releaseUrl;
      return;
    }

    nodes.status.textContent = "";
    nodes.status.classList.add("hidden");
    nodes.downloadButton.href = dmgAsset.browser_download_url;
    nodes.assetName.textContent = dmgAsset.name;
    nodes.assetSize.textContent = formatBytes(dmgAsset.size);
    nodes.shaCommand.textContent = `shasum -a 256 "${dmgAsset.name}"`;

    if (checksumAsset) {
      nodes.checksumLink.href = checksumAsset.browser_download_url;
      nodes.checksumLink.classList.remove("hidden");
    } else {
      nodes.checksumLink.classList.add("hidden");
    }
  } catch (error) {
    console.error(error);
    setFallbackUI(
      "최신 릴리즈를 자동 조회하지 못했습니다. 아래 버튼으로 릴리즈 페이지에서 다운로드해 주세요."
    );
  }
}

function setupCopyButton() {
  nodes.copyCommand.addEventListener("click", async () => {
    const textToCopy = nodes.shaCommand.textContent.trim();
    if (!textToCopy) return;

    try {
      await navigator.clipboard.writeText(textToCopy);
      nodes.copyCommand.textContent = "복사 완료";
      window.setTimeout(() => {
        nodes.copyCommand.textContent = "명령어 복사";
      }, 1400);
    } catch (error) {
      console.error(error);
      nodes.copyCommand.textContent = "복사 실패";
      window.setTimeout(() => {
        nodes.copyCommand.textContent = "명령어 복사";
      }, 1400);
    }
  });
}

function init() {
  document.title = `${SITE_CONFIG.appName} Desktop Download`;
  setupCopyButton();
  loadLatestRelease();
}

init();
