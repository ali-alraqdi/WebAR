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
const btnRefreshQr = $("btn-refresh-qr");
const btnAr = $("btn-ar");
const statusEl = $("status");
const fileNameEl = $("file-name");
const qrSection = $("qr-section");
const qrCanvas = $("qr-canvas");
const qrImg = $("qr-img");
const qrPlaceholder = $("qr-placeholder");
const qrUrlEl = $("qr-url");
const banner = $("file-protocol-banner");
const placeholder = $("viewer-placeholder");
const viewerCard = $("viewer-card");

let customBlob = null;
let customName = "";
let objectUrl = null;
let serverInfo = null;
let sharedModelUrl = null;
let lastQrDataUrl = null;
let modelUploaded = false;

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

function getPhoneBaseUrl() {
  const port = serverInfo?.port || location.port || "5500";
  if (serverInfo?.ip && serverInfo.ip !== "127.0.0.1") {
    return `http://${serverInfo.ip}:${port}`;
  }
  const host = location.hostname;
  if (host && host !== "localhost" && host !== "127.0.0.1") {
    return `http://${host}:${port}`;
  }
  return null;
}

function getArPageUrl() {
  const base = getPhoneBaseUrl();
  if (base) return `${base}/?ar=1&model=shared`;
  const port = location.port || "5500";
  if (!isFileProtocol()) {
    return `${location.protocol}//${location.hostname}:${port}/?ar=1&model=shared`;
  }
  return null;
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

function showQrImage(dataUrl) {
  lastQrDataUrl = dataUrl;
  if (qrPlaceholder) qrPlaceholder.hidden = true;
  if (qrCanvas) qrCanvas.hidden = true;
  if (qrImg) {
    qrImg.src = dataUrl;
    qrImg.hidden = false;
  }
  if (btnQr) btnQr.disabled = false;
}

async function drawQrOnCanvas(url) {
  if (typeof QRCode === "undefined" || !qrCanvas) {
    throw new Error("QRCode library not loaded");
  }
  await QRCode.toCanvas(qrCanvas, url, {
    width: 220,
    margin: 2,
    color: { dark: "#111111", light: "#ffffff" },
  });
  if (qrPlaceholder) qrPlaceholder.hidden = true;
  if (qrImg) qrImg.hidden = true;
  if (qrCanvas) qrCanvas.hidden = false;
  lastQrDataUrl = qrCanvas.toDataURL("image/png");
  if (btnQr) btnQr.disabled = false;
}

async function drawQrViaApi(url) {
  const apiUrl =
    "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" +
    encodeURIComponent(url);
  const res = await fetch(apiUrl);
  if (!res.ok) throw new Error("QR API failed");
  const blob = await res.blob();
  const dataUrl = await new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(blob);
  });
  showQrImage(dataUrl);
}

async function renderQr() {
  if (!qrSection) return;

  await fetchServerInfo();
  const arUrl = getArPageUrl();

  qrSection.hidden = false;

  if (!arUrl) {
    if (qrUrlEl) {
      qrUrlEl.textContent =
        "Run start-server.bat and open the Wi-Fi link shown in the terminal (not localhost).";
    }
    if (qrPlaceholder) {
      qrPlaceholder.hidden = false;
      qrPlaceholder.textContent = "Server IP required for iPhone QR";
    }
    return;
  }

  if (qrUrlEl) qrUrlEl.textContent = arUrl;

  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    if (qrUrlEl) {
      qrUrlEl.textContent =
        `iPhone cannot use localhost. On PC open: http://${serverInfo?.ip || "YOUR_PC_IP"}:5500 — then upload again.`;
    }
  }

  try {
    await drawQrOnCanvas(arUrl);
  } catch {
    try {
      await drawQrViaApi(arUrl);
    } catch (e) {
      console.error(e);
      if (qrPlaceholder) {
        qrPlaceholder.hidden = false;
        qrPlaceholder.textContent = "Could not generate QR. Check internet and refresh.";
      }
    }
  }
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
  modelUploaded = false;

  try {
    await uploadToServer(file);
    sharedModelUrl = SHARED_MODEL + "?t=" + Date.now();
    showInViewer(sharedModelUrl, file.name);
    await waitForModel();
    modelUploaded = true;

    objectUrl = URL.createObjectURL(file);
    btnDownload.disabled = false;
    setStatus("Ready — scan QR with iPhone (same Wi-Fi).", "ok");
    await renderQr();
  } catch {
    objectUrl = URL.createObjectURL(file);
    showInViewer(objectUrl, file.name);
    try {
      await waitForModel();
      modelUploaded = true;
      btnDownload.disabled = false;
      setStatus("Model loaded. Run start-server.bat for iPhone AR.", "err");
      await renderQr();
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
  if (lastQrDataUrl) {
    const a = document.createElement("a");
    a.href = lastQrDataUrl;
    a.download = "wearar-iphone-qr.png";
    a.click();
    return;
  }
  if (qrCanvas && !qrCanvas.hidden) {
    qrCanvas.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = "wearar-iphone-qr.png";
      a.click();
      URL.revokeObjectURL(a.href);
    }, "image/png");
    return;
  }
  if (qrImg?.src) {
    const a = document.createElement("a");
    a.href = qrImg.src;
    a.download = "wearar-iphone-qr.png";
    a.click();
  }
}

async function initFromUrl() {
  const params = new URLSearchParams(location.search);
  const wantAr = params.get("ar") === "1";
  const shared = params.get("model") === "shared";

  if (!shared && !wantAr) return;

  await fetchServerInfo();

  if (shared || wantAr) {
    if (serverInfo?.hasModel || shared) {
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
  btnRefreshQr?.addEventListener("click", () => {
    if (modelUploaded) renderQr();
    else setStatus("Upload a .glb first.", "err");
  });

  modelViewer.addEventListener("error", () => {
    if (modelViewer.src) {
      setStatus("Could not load model. Re-export as .glb and upload again.", "err");
    }
  });

  fetchServerInfo().then(() => {
    if (serverInfo?.hasModel) {
      modelUploaded = true;
      renderQr();
    }
  });

  initFromUrl();
}

if (customElements.get("model-viewer")) init();
else customElements.whenDefined("model-viewer").then(init);
