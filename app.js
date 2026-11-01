const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const recordButton = $("#recordButton");
const recordButtonText = $("#recordButtonText");
const captureSection = $(".capture-section");
const statusPill = $("#statusPill");
const statusText = $("#statusText");
const idleState = $("#idleState");
const recordingState = $("#recordingState");
const previewState = $("#previewState");
const rawPreview = $("#rawPreview");
const recordingTimer = $("#recordingTimer");
const editorSection = $("#editorSection");
const resultSection = $("#resultSection");
const editorCanvas = $("#editorCanvas");
const canvasWrap = $("#canvasWrap");
const canvasHint = $("#canvasHint");
const timeline = $("#timeline");
const timeReadout = $("#timeReadout");
const detailsForm = $("#detailsForm");
const appNameInput = $("#appName");
const appDomainInput = $("#appDomain");
const domainError = $("#domainError");
const exportButton = $("#exportButton");
const croppedPreview = $("#croppedPreview");
const resultName = $("#resultName");
const resultDomain = $("#resultDomain");
const saveButton = $("#saveButton");
const saveNote = $("#saveNote");
const toast = $("#toast");
const galleryGrid = $("#galleryGrid");
const emptyGallery = $("#emptyGallery");
const galleryCount = $("#galleryCount");
const designQuery = $("#designQuery");
const aestheticFilter = $("#aestheticFilter");
const sourceFilter = $("#sourceFilter");

let captureStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let recordedBlob = null;
let recordedUrl = null;
let croppedBlob = null;
let croppedUrl = null;
let recordingStartedAt = 0;
let timerId = null;
let crop = { shape: "rect", x: 0.1, y: 0.1, w: 0.8, h: 0.8, points: [] };
let dragStart = null;
let drawingFreeform = false;
let toastTimer = null;
const galleryUrls = new Map();

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function setStatus(message, live = false) {
  statusText.textContent = message;
  statusPill.classList.toggle("live", live);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "00:00";
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function setVisible(element, visible) {
  element.classList.toggle("hidden", !visible);
}

function pickMimeType() {
  const types = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4"
  ];
  return types.find((type) => window.MediaRecorder && MediaRecorder.isTypeSupported(type)) || "";
}

function stopTimer() {
  clearInterval(timerId);
  timerId = null;
}

function updateTimer() {
  recordingTimer.textContent = formatTime((Date.now() - recordingStartedAt) / 1000);
}

async function startRecording() {
  if (!navigator.mediaDevices?.getDisplayMedia || !window.MediaRecorder) {
    showToast("This browser does not support screen recording.");
    return;
  }

  try {
    captureStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30, max: 60 } },
      audio: true
    });
    const mimeType = pickMimeType();
    mediaRecorder = new MediaRecorder(captureStream, mimeType ? { mimeType } : undefined);
    recordedChunks = [];
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordedChunks.push(event.data);
    };
    mediaRecorder.onstop = finishRecording;
    captureStream.getVideoTracks()[0].addEventListener("ended", () => {
      if (mediaRecorder?.state === "recording") stopRecording();
    }, { once: true });

    mediaRecorder.start(250);
    setVisible(captureSection, true);
    recordingStartedAt = Date.now();
    timerId = setInterval(updateTimer, 250);
    setVisible(idleState, false);
    setVisible(recordingState, true);
    setVisible(previewState, false);
    recordButton.classList.add("is-recording");
    recordButtonText.textContent = "Stop recording";
    setStatus("Recording", true);
  } catch (error) {
    if (error.name !== "NotAllowedError") showToast(`Could not start recording: ${error.message}`);
    setStatus("Ready");
  }
}

function stopRecording() {
  stopTimer();
  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
  captureStream?.getTracks().forEach((track) => track.stop());
  captureStream = null;
  recordButton.classList.remove("is-recording");
  recordButtonText.textContent = "Start recording";
  setStatus("Processing");
}

function loadRecordedCapture(blob, sourceName = "", sourceDomain = "") {
  recordedBlob = blob;
  if (recordedUrl) URL.revokeObjectURL(recordedUrl);
  recordedUrl = URL.createObjectURL(recordedBlob);
  rawPreview.src = recordedUrl;
  rawPreview.load();
  if (sourceName) appNameInput.value = sourceName.slice(0, 80);
  if (sourceDomain) appDomainInput.value = normalizeDomain(sourceDomain);
  setVisible(captureSection, true);
  setVisible(idleState, false);
  setVisible(recordingState, false);
  setVisible(previewState, true);
  setStatus("Capture ready");
  showToast("Capture ready to crop.");
  rawPreview.addEventListener("loadedmetadata", prepareEditor, { once: true });
}

function finishRecording() {
  if (!recordedChunks.length) {
    setStatus("Ready");
    showToast("No frames were recorded.");
    return;
  }
  loadRecordedCapture(new Blob(recordedChunks, { type: mediaRecorder?.mimeType || "video/webm" }));
}

function prepareEditor() {
  if (!recordedBlob) return;
  setVisible(editorSection, true);
  setVisible(resultSection, false);
  editorSection.scrollIntoView({ behavior: "smooth", block: "start" });
  const aspect = rawPreview.videoWidth / rawPreview.videoHeight || 16 / 9;
  const maxWidth = Math.min(canvasWrap.clientWidth || 900, 1200);
  editorCanvas.width = Math.max(2, Math.round(maxWidth));
  editorCanvas.height = Math.max(2, Math.round(maxWidth / aspect));
  crop = { shape: "rect", x: 0.1, y: 0.1, w: 0.8, h: 0.8, points: [] };
  timeline.max = rawPreview.duration || 1;
  timeline.value = 0;
  rawPreview.currentTime = 0;
  drawEditorFrame();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pointFromEvent(event) {
  const rect = editorCanvas.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1)
  };
}

function normalizeRect(start, end) {
  const x = clamp(Math.min(start.x, end.x), 0, 1);
  const y = clamp(Math.min(start.y, end.y), 0, 1);
  const right = clamp(Math.max(start.x, end.x), 0, 1);
  const bottom = clamp(Math.max(start.y, end.y), 0, 1);
  return { x, y, w: Math.max(right - x, 0.015), h: Math.max(bottom - y, 0.015) };
}

function selectionBounds() {
  if (crop.shape !== "freeform" || crop.points.length < 3) return { x: crop.x, y: crop.y, w: crop.w, h: crop.h };
  const xs = crop.points.map((point) => point.x);
  const ys = crop.points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(Math.max(...xs) - x, 0.015), h: Math.max(Math.max(...ys) - y, 0.015) };
}

function selectionPath(ctx, width, height, mapPoint = (point) => ({ x: point.x * width, y: point.y * height })) {
  const bounds = selectionBounds();
  const topLeft = mapPoint({ x: bounds.x, y: bounds.y });
  const bottomRight = mapPoint({ x: bounds.x + bounds.w, y: bounds.y + bounds.h });
  const x = topLeft.x;
  const y = topLeft.y;
  const w = bottomRight.x - x;
  const h = bottomRight.y - y;

  ctx.beginPath();
  if (crop.shape === "ellipse") {
    ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
  } else if (crop.shape === "rounded") {
    const radius = Math.min(Math.abs(w), Math.abs(h)) * 0.12;
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  } else if (crop.shape === "freeform" && crop.points.length >= 3) {
    const first = mapPoint(crop.points[0]);
    ctx.moveTo(first.x, first.y);
    crop.points.slice(1).forEach((point) => {
      const mapped = mapPoint(point);
      ctx.lineTo(mapped.x, mapped.y);
    });
    ctx.closePath();
  } else {
    ctx.rect(x, y, w, h);
  }
  return { x, y, w, h };
}

function drawEditorFrame() {
  if (!rawPreview.videoWidth || !rawPreview.videoHeight || !editorCanvas.width) return;
  const ctx = editorCanvas.getContext("2d");
  const width = editorCanvas.width;
  const height = editorCanvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(rawPreview, 0, 0, width, height);
  ctx.save();
  ctx.fillStyle = "rgba(12, 15, 12, .63)";
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  selectionPath(ctx, width, height);
  ctx.fill("evenodd");
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = "#d3f65a";
  ctx.lineWidth = Math.max(2, width / 480);
  selectionPath(ctx, width, height);
  ctx.stroke();
  ctx.restore();
}

function drawExportFrame(ctx, video, canvas, bounds) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const mapPoint = (point) => ({
    x: point.x * video.videoWidth - bounds.x * video.videoWidth,
    y: point.y * video.videoHeight - bounds.y * video.videoHeight
  });
  ctx.save();
  selectionPath(ctx, canvas.width, canvas.height, mapPoint);
  ctx.clip();
  ctx.drawImage(video, bounds.x * video.videoWidth, bounds.y * video.videoHeight, bounds.w * video.videoWidth, bounds.h * video.videoHeight, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function resetCrop() {
  crop = { shape: "rect", x: 0.1, y: 0.1, w: 0.8, h: 0.8, points: [] };
  $$(".shape-button").forEach((button) => button.classList.toggle("active", button.dataset.shape === "rect"));
  canvasHint.classList.remove("gone");
  drawEditorFrame();
}

async function exportCroppedClip() {
  if (!recordedUrl || !rawPreview.videoWidth) return;
  exportButton.disabled = true;
  exportButton.firstChild.textContent = "Exporting… ";
  const video = document.createElement("video");
  video.src = recordedUrl;
  video.playsInline = true;
  video.preload = "auto";
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => reject(new Error("The recording could not be read."));
  });

  const bounds = selectionBounds();
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(bounds.w * video.videoWidth));
  canvas.height = Math.max(2, Math.round(bounds.h * video.videoHeight));
  const context = canvas.getContext("2d");
  const canvasStream = canvas.captureStream(30);
  let audioTracks = [];
  try { audioTracks = video.captureStream().getAudioTracks(); } catch (_) { /* Audio capture is not available in every browser. */ }
  const outputStream = new MediaStream([canvasStream.getVideoTracks()[0], ...audioTracks]);
  const mimeType = pickMimeType();
  const outputRecorder = new MediaRecorder(outputStream, mimeType ? { mimeType } : undefined);
  const chunks = [];

  const exported = new Promise((resolve, reject) => {
    outputRecorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    outputRecorder.onerror = () => reject(new Error("The cropped clip could not be exported."));
    outputRecorder.onstop = () => resolve(new Blob(chunks, { type: outputRecorder.mimeType || "video/webm" }));
  });

  try {
    const seekToStart = new Promise((resolve) => {
      if (video.currentTime === 0 && video.readyState >= 2) resolve();
      else video.addEventListener("seeked", resolve, { once: true });
    });
    video.currentTime = 0;
    await seekToStart;
    drawExportFrame(context, video, canvas, bounds);
    outputRecorder.start(250);
    const stopOutput = () => {
      if (outputRecorder.state !== "inactive") outputRecorder.stop();
    };
    video.addEventListener("ended", stopOutput, { once: true });
    await video.play();
    const drawLoop = () => {
      drawExportFrame(context, video, canvas, bounds);
      if (!video.ended) requestAnimationFrame(drawLoop);
    };
    requestAnimationFrame(drawLoop);
    croppedBlob = await exported;
  } finally {
    outputStream.getTracks().forEach((track) => track.stop());
    video.pause();
  }

  if (croppedUrl) URL.revokeObjectURL(croppedUrl);
  croppedUrl = URL.createObjectURL(croppedBlob);
  croppedPreview.src = croppedUrl;
  resultName.textContent = appNameInput.value.trim();
  const domain = normalizeDomain(appDomainInput.value);
  resultDomain.textContent = domain;
  resultDomain.href = `https://${domain}`;
  setVisible(editorSection, false);
  setVisible(resultSection, true);
  resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
  saveNote.textContent = "Saved clips are available in this browser’s gallery.";
  exportButton.disabled = false;
  exportButton.firstChild.textContent = "Crop and export ";
}

function normalizeDomain(value) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].split("?")[0].split("#")[0];
}

function isValidDomain(value) {
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFilename(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "hummy-clip";
}

const DB_NAME = "hummy-gallery";
const DB_VERSION = 1;
function openGalleryDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error("IndexedDB is not available."));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore("clips", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getGalleryItems() {
  const db = await openGalleryDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction("clips", "readonly").objectStore("clips").getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => b.createdAt - a.createdAt));
    request.onerror = () => reject(request.error);
  });
}

async function saveGalleryItem(item) {
  const db = await openGalleryDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction("clips", "readwrite").objectStore("clips").put(item);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
}

async function deleteGalleryItem(id) {
  const db = await openGalleryDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction("clips", "readwrite").objectStore("clips").delete(id);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
}

function clearRenderedGalleryUrls() {
  galleryUrls.forEach((url) => URL.revokeObjectURL(url));
  galleryUrls.clear();
}

async function renderGallery() {
  try {
    const items = await getGalleryItems();
    const query = designQuery.value.trim().toLowerCase();
    const aesthetic = aestheticFilter.value;
    const source = sourceFilter.value;
    const visibleItems = items.filter((item) => {
      const matchesQuery = !query || `${item.name} ${item.domain}`.toLowerCase().includes(query);
      const matchesAesthetic = aesthetic === "all" || !item.aesthetic || item.aesthetic === "all" || item.aesthetic === aesthetic;
      const matchesSource = source === "all" || !item.sourceType || item.sourceType === "all" || item.sourceType === source;
      return matchesQuery && matchesAesthetic && matchesSource;
    });
    clearRenderedGalleryUrls();
    galleryGrid.querySelectorAll(".gallery-card").forEach((card) => card.remove());
    emptyGallery.classList.toggle("hidden", visibleItems.length > 0);
    galleryCount.textContent = `${visibleItems.length} clip${visibleItems.length === 1 ? "" : "s"}`;
    visibleItems.forEach((item) => {
      const url = URL.createObjectURL(item.blob);
      galleryUrls.set(item.id, url);
      const card = document.createElement("article");
      card.className = "gallery-card";
      card.innerHTML = `<video controls loop muted playsinline src="${url}"></video><button class="delete-card" type="button" aria-label="Remove ${escapeHtml(item.name)}" data-id="${item.id}">×</button><div class="gallery-card-info"><h3>${escapeHtml(item.name)}</h3><a href="https://${encodeURIComponent(item.domain)}" target="_blank" rel="noreferrer">${escapeHtml(item.domain)} ↗</a></div>`;
      galleryGrid.appendChild(card);
    });
  } catch (_) {
    galleryCount.textContent = "local gallery";
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

recordButton.addEventListener("click", () => {
  if (mediaRecorder?.state === "recording") stopRecording();
  else startRecording();
});

document.addEventListener("keydown", (event) => {
  if (event.code !== "F9" || event.repeat) return;
  event.preventDefault();
  toggleRecordingFromShortcut();
});

$("#discardButton").addEventListener("click", () => {
  recordedBlob = null;
  if (recordedUrl) URL.revokeObjectURL(recordedUrl);
  recordedUrl = null;
  rawPreview.removeAttribute("src");
  rawPreview.load();
  setVisible(previewState, false);
  setVisible(idleState, true);
  setVisible(editorSection, false);
  setVisible(resultSection, false);
  setStatus("Ready");
});

$("#backToCaptureButton").addEventListener("click", () => {
  setVisible(editorSection, false);
  document.querySelector(".capture-section").scrollIntoView({ behavior: "smooth" });
});

$("#newCaptureButton").addEventListener("click", () => {
  $("#discardButton").click();
  document.querySelector(".capture-section").scrollIntoView({ behavior: "smooth" });
});

$("#resetCropButton").addEventListener("click", resetCrop);

$$(".shape-button").forEach((button) => button.addEventListener("click", () => {
  crop.shape = button.dataset.shape;
  crop.points = [];
  if (crop.shape === "freeform") canvasHint.textContent = "Click points to draw a shape; click the first point to close";
  else canvasHint.textContent = "Drag to select a crop";
  canvasHint.classList.remove("gone");
  $$(".shape-button").forEach((item) => item.classList.toggle("active", item === button));
  drawEditorFrame();
}));

editorCanvas.addEventListener("pointerdown", (event) => {
  if (!rawPreview.videoWidth) return;
  const point = pointFromEvent(event);
  editorCanvas.setPointerCapture(event.pointerId);
  if (crop.shape === "freeform") {
    if (crop.points.length >= 3) {
      const first = crop.points[0];
      const distance = Math.hypot(point.x - first.x, point.y - first.y);
      if (distance < 0.035) {
        drawingFreeform = false;
        crop = { ...selectionBounds(), shape: "freeform", points: [...crop.points] };
        canvasHint.classList.add("gone");
        drawEditorFrame();
        return;
      }
    }
    drawingFreeform = true;
    crop.points = [...crop.points, point];
    canvasHint.classList.remove("gone");
    drawEditorFrame();
    return;
  }
  dragStart = point;
  crop = { ...crop, x: point.x, y: point.y, w: 0.01, h: 0.01 };
  canvasHint.classList.add("gone");
});

editorCanvas.addEventListener("pointermove", (event) => {
  const point = pointFromEvent(event);
  if (crop.shape === "freeform" && drawingFreeform) {
    const last = crop.points[crop.points.length - 1];
    if (!last || Math.hypot(point.x - last.x, point.y - last.y) > 0.012) {
      crop.points = [...crop.points, point];
      drawEditorFrame();
    }
    return;
  }
  if (!dragStart) return;
  const rect = normalizeRect(dragStart, point);
  crop = { ...crop, ...rect };
  drawEditorFrame();
});

["pointerup", "pointercancel"].forEach((eventName) => editorCanvas.addEventListener(eventName, () => {
  dragStart = null;
  drawingFreeform = false;
}));

timeline.addEventListener("input", () => {
  rawPreview.currentTime = Number(timeline.value);
  timeReadout.textContent = formatTime(rawPreview.currentTime);
  drawEditorFrame();
});
rawPreview.addEventListener("timeupdate", () => {
  if (document.activeElement !== timeline) timeline.value = rawPreview.currentTime;
  timeReadout.textContent = formatTime(rawPreview.currentTime);
  if (!editorSection.classList.contains("hidden")) drawEditorFrame();
});

window.addEventListener("resize", () => {
  if (!editorSection.classList.contains("hidden") && rawPreview.videoWidth) prepareEditor();
});

detailsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const domain = normalizeDomain(appDomainInput.value);
  appDomainInput.value = domain;
  if (!appNameInput.value.trim() || !isValidDomain(domain)) {
    domainError.classList.toggle("hidden", isValidDomain(domain));
    if (!appNameInput.value.trim()) appNameInput.focus();
    else appDomainInput.focus();
    return;
  }
  domainError.classList.add("hidden");
  try {
    await exportCroppedClip();
  } catch (error) {
    exportButton.disabled = false;
    exportButton.firstChild.textContent = "Crop and export ";
    showToast(error.message || "Could not export this clip.");
  }
});

$("#downloadButton").addEventListener("click", () => {
  if (croppedBlob) downloadBlob(croppedBlob, `${safeFilename(appNameInput.value)}.webm`);
});

$("#metadataButton").addEventListener("click", () => {
  const metadata = {
    name: appNameInput.value.trim(),
    domain: normalizeDomain(appDomainInput.value),
    aesthetic: aestheticFilter.value,
    sourceType: sourceFilter.value
  };
  downloadBlob(new Blob([JSON.stringify(metadata, null, 2)], { type: "application/json" }), `${safeFilename(appNameInput.value)}.json`);
});

saveButton.addEventListener("click", async () => {
  if (!croppedBlob) return;
  saveButton.disabled = true;
  try {
    await saveGalleryItem({
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      blob: croppedBlob,
      name: appNameInput.value.trim(),
      domain: normalizeDomain(appDomainInput.value),
      aesthetic: aestheticFilter.value,
      sourceType: sourceFilter.value,
      createdAt: Date.now()
    });
    await renderGallery();
    saveNote.textContent = "Added to your local gallery.";
    saveButton.textContent = "Added to gallery ✓";
    showToast("Added to your gallery.");
  } catch (_) {
    showToast("This browser could not save the gallery item.");
  } finally {
    saveButton.disabled = false;
  }
});

galleryGrid.addEventListener("click", async (event) => {
  const button = event.target.closest(".delete-card");
  if (!button) return;
  await deleteGalleryItem(button.dataset.id);
  await renderGallery();
  showToast("Removed from your gallery.");
});

function toggleRecordingFromShortcut() {
  recordButton.click();
}

window.addEventListener("message", (event) => {
  if (event.data?.source !== "hummy-extension") return;
  if (event.data.type === "toggle-recording") toggleRecordingFromShortcut();
  if (event.data.type === "recording-ready" && event.data.buffer) {
    loadRecordedCapture(new Blob([event.data.buffer], { type: event.data.mimeType || "video/webm" }), event.data.sourceName, event.data.sourceDomain);
  }
});

designQuery.addEventListener("input", renderGallery);
aestheticFilter.addEventListener("change", renderGallery);
sourceFilter.addEventListener("change", renderGallery);

renderGallery();
