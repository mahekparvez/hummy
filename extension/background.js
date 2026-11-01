const HUMMY_URL = "https://mahekparvez.github.io/hummy/";
let recording = false;
let recordingTabId = null;
let pendingRecording = null;

async function ensureOffscreenDocument() {
  const contexts = chrome.runtime.getContexts
    ? await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [chrome.runtime.getURL("offscreen.html")] })
    : [];
  if (contexts.length) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["USER_MEDIA"],
    justification: "Record the current tab into the Hummy inspiration library."
  });
}

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0];
}

async function startRecording() {
  if (recording) return;
  const tab = await activeTab();
  if (!tab?.id || tab.url?.startsWith("chrome://")) return;
  await ensureOffscreenDocument();
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  recording = true;
  recordingTabId = tab.id;
  await chrome.runtime.sendMessage({ type: "offscreen-start", streamId, sourceName: tab.title || "Captured website", sourceDomain: domainFromUrl(tab.url) });
}

async function stopRecording() {
  if (!recording) return;
  recording = false;
  recordingTabId = null;
  await chrome.runtime.sendMessage({ type: "offscreen-stop" });
}

function domainFromUrl(value = "") {
  try { return new URL(value).hostname.replace(/^www\./, ""); } catch (_) { return ""; }
}

async function deliverRecording(message) {
  pendingRecording = message;
  const hummyTabs = await chrome.tabs.query({ url: ["https://mahekparvez.github.io/hummy/*", "http://localhost:4173/*"] });
  const target = hummyTabs[0];
  if (target?.id) {
    await chrome.tabs.sendMessage(target.id, pendingRecording).catch(() => {});
    pendingRecording = null;
  } else {
    await chrome.tabs.create({ url: HUMMY_URL });
  }
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-recording") return;
  try {
    if (recording) await stopRecording();
    else await startRecording();
  } catch (error) {
    recording = false;
    recordingTabId = null;
    console.error("Hummy capture failed", error);
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === "recording-ready") deliverRecording(message);
  if (message.type === "hummy-ready" && sender.tab?.id && pendingRecording) {
    chrome.tabs.sendMessage(sender.tab.id, pendingRecording).catch(() => {});
    pendingRecording = null;
  }
});
