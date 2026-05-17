/**
 * Ali's WerAR Studio — upload .glb, QR for iPhone AR
 */

const MAX_MB = 80;
const SHARED_MODEL = "/models/current.glb";

const $ = (id) => document.getElementById(id);
const modelViewer = $("product-model");
const fileInput = $("file-input");
const btnUpload = $("btn-upload");
const btnDownload = $("btn-download");
const btnQr = $("btn-qr");
const btnAr = $("btn-ar");
const statusEl = $("status");
const fileNameEl = $("file-name");
const qrSection = $("qr-section");
const qrCanvas = $("qr-canvas");
const qrUrlEl = $("qr-url");
const banner = $("file-protocol-banner");
const placeholder = $("viewer-placeholder");
const viewerCard = $("viewer-card");

let customBlob = null;
let customName = "";
let objectUrl = null;
let serverInfo = null;
let sharedModelUrl = null;

function isFileProtocol() {
  return location.protocol === "file:";
}

function isIPhone() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isGlb(file) {
  return file.name.toLowerCase().endsWith(".glb");
}

function setStatus(msg, type = "") {
  statusEl.textContent = msg;
  statusEl.className = "status" + (type ? ` ${type}` : "");
}

function revokeUrl() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

async function fetchServerInfo() {
  try {
    const res = await fetch("/api/info");
    if (!res.ok) return null;
    serverInfo = await res.json();
    return serverInfo;
  } catch {
    return null;
  }
}

/** URL iPhone can open on same Wi-Fi (never localhost). */
function getPhoneBaseUrl() {
  const port = location.port || "5500";
  if (serverInfo?.ip && serverInfo.ip !== "127.0.0.1") {
    return `http://${serverInfo.ip}:${serverInfo.port || port}`;
  }
  const host = location.hostname;
  if (host && host !== "localhost" && host !== "127.0.0.1") {
    return `http://${host}:${port}`;
  }
  return null;
}

function getArPageUrl() {
  const base = getPhoneBaseUrl();
  if (!base) return null;
  return `${base}/?ar=1&model=shared`;
}

async function waitForModel() {
  return new Promise((resolve, reject) => {
    const onLoad = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Model failed to load"));
    };
    const cleanup = () => {
      modelViewer.removeEventListener("load", onLoad);
      modelViewer.removeEventListener("error", onError);
    };
    modelViewer.addEventListener("load", onLoad, { once: true });
    modelViewer.addEventListener("error", onError, { once: true });
  });
}

function showInViewer(src, fileName) {
  modelViewer.src = src;
  modelViewer.alt = fileName;
  if (placeholder) placeholder.style.display = "none";
  if (btnAr) btnAr.hidden = false;
  viewerCard?.classList.add("has-model");
}

function clearViewer() {
  modelViewer.removeAttribute("src");
  if (placeholder) placeholder.style.display = "";
  if (btnAr) btnAr.hidden = true;
  viewerCard?.classList.remove("has-model");
}

async function uploadToServer(file) {
  const res = await fetch("/api/upload", {
    method: "POST",
    body: file,
    headers: { "Content-Type": "model/gltf-binary" },
  });
  if (!res.ok) throw new Error("Server upload failed");
  return res.json();
}

async function renderQr() {
  if (!qrSection || !qrCanvas) return;

  const arUrl = getArPageUrl();
  if (!arUrl) {
    qrSection.hidden = false;
    qrUrlEl.textContent =
      "Open this site using your PC's Wi-Fi IP (see the server window), not localhost.";
    return;
  }

  qrSection.hidden = false;
  qrUrlEl.textContent = arUrl;

  if (typeof QRCode !== "undefined") {
    await QRCode.toCanvas(qrCanvas, arUrl, {
      width: 200,
      margin: 2,
      color: { dark: "#111111", light: "#ffffff" },
    });
  }

  if (btnQr) btnQr.hidden = false;
}

async function loadSharedModelForAr(autoAr = false) {
  const src = sharedModelUrl || SHARED_MODEL;
  setStatus("Loading model for AR…", "");
  showInViewer(src, "AR model");

  try {
    await waitForModel();
    setStatus(isIPhone() ? "Tap View in AR below" : "Model ready", "ok");
    if (autoAr && isIPhone() && modelViewer.canActivateAR) {
      setTimeout(() => modelViewer.activateAR(), 600);
    }
  } catch {
    setStatus("Model not found. Upload a .glb on your PC first, then scan again.", "err");
    clearViewer();
  }
}

async function handleUpload(file) {
  if (!file) return;

  if (isFileProtocol()) {
    banner.hidden = false;
    setStatus("Run start-server.bat, then open the link it shows.", "err");
    return;
  }

  if (!isGlb(file)) {
    setStatus("Only .glb files are supported.", "err");
    fileNameEl.textContent = "No file selected";
    return;
  }

  if (file.size > MAX_MB * 1024 * 1024) {
    setStatus(`File too large (max ${MAX_MB} MB).`, "err");
    return;
  }

  setStatus("Uploading & loading…", "");
  fileNameEl.textContent = file.name;
  btnUpload.disabled = true;

  revokeUrl();
  customBlob = file;
  customName = file.name;

  try {
    await uploadToServer(file);
    sharedModelUrl = SHARED_MODEL + "?t=" + Date.now();
    showInViewer(sharedModelUrl, file.name);
    await waitForModel();

    objectUrl = URL.createObjectURL(file);
    btnDownload.disabled = false;
    setStatus(`Ready. Scan QR with iPhone (same Wi-Fi).`, "ok");

    await fetchServerInfo();
    await renderQr();
  } catch {
    objectUrl = URL.createObjectURL(file);
    showInViewer(objectUrl, file.name);
    try {
      await waitForModel();
      btnDownload.disabled = false;
      setStatus("Model shown on PC only. Run start-server.bat for iPhone QR.", "err");
    } catch {
      setStatus("Could not load this GLB file.", "err");
      clearViewer();
      revokeUrl();
      customBlob = null;
      fileNameEl.textContent = "No file selected";
    }
  } finally {
    btnUpload.disabled = false;
  }
}

function downloadModel() {
  if (!customBlob) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(customBlob);
  a.download = customName;
  a.click();
  URL.revokeObjectURL(a.href);
}

function downloadQr() {
  if (!qrCanvas) return;
  qrCanvas.toBlob((b) => {
    if (!b) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = "wearar-iphone-qr.png";
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

async function initFromUrl() {
  const params = new URLSearchParams(location.search);
  const wantAr = params.get("ar") === "1";
  const shared = params.get("model") === "shared";

  if (!shared && !wantAr) return;

  await fetchServerInfo();

  if (shared || wantAr) {
    const info = serverInfo;
    if (info?.hasModel || shared) {
      sharedModelUrl = SHARED_MODEL + "?t=" + Date.now();
      await loadSharedModelForAr(wantAr && isIPhone());
    } else if (isIPhone()) {
      setStatus("Upload a .glb on your PC first, then scan the QR again.", "err");
    }
  }
}

function init() {
  if (!modelViewer || !btnUpload || !fileInput) return;

  if (isFileProtocol()) banner.hidden = false;

  btnUpload.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    handleUpload(fileInput.files?.[0]);
    fileInput.value = "";
  });

  viewerCard?.addEventListener("dragover", (e) => {
    e.preventDefault();
    viewerCard.classList.add("dragover");
  });
  viewerCard?.addEventListener("dragleave", () => viewerCard.classList.remove("dragover"));
  viewerCard?.addEventListener("drop", (e) => {
    e.preventDefault();
    viewerCard.classList.remove("dragover");
    handleUpload(e.dataTransfer?.files?.[0]);
  });

  btnDownload.addEventListener("click", downloadModel);
  btnQr?.addEventListener("click", downloadQr);

  modelViewer.addEventListener("error", () => {
    if (modelViewer.src) {
      setStatus("Could not load model. Re-export as .glb and upload again.", "err");
    }
  });

  fetchServerInfo().then(() => {
    if (!isIPhone() && serverInfo?.hasModel) renderQr();
  });

  initFromUrl();
}

if (customElements.get("model-viewer")) init();
else customElements.whenDefined("model-viewer").then(init);
