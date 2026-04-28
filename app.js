const defaultProfile = {
  name: "Amina Hassan",
  age: "22",
  communication: "Text only",
  contactName: "Layla Hassan",
  contactInfo: "layla@example.com",
  allergies: "Penicillin",
  medications: "Inhaler as needed",
  notes: "Hard-of-Hearing. Please communicate by text and keep messages short and clear."
};

const DEFAULT_EMERGENCY_TYPE = "Emergency Support";
const DEFAULT_EMERGENCY_MESSAGE =
  "I am Deaf or Hard-of-Hearing. I need emergency help. Please connect me to emergency video support.";

const state = {
  activeCallId: localStorage.getItem("dhhActiveCallId") || null,
  profile: JSON.parse(localStorage.getItem("dhhProfile") || JSON.stringify(defaultProfile)),
  selectedEmergencyType: localStorage.getItem("dhhSelectedEmergencyType") || DEFAULT_EMERGENCY_TYPE,
  lastMessageIndex: 0,
  peerConnections: {
    admin: null,
    backup: null
  },
  signalState: {
    admin: { remoteCandidateIndex: 0 },
    backup: { remoteCandidateIndex: 0 }
  },
  localStream: null,
  signalTimer: null,
  messageTimer: null
};

const screens = document.querySelectorAll(".screen");
const tabs = document.querySelectorAll(".tab");
const menu = document.querySelector("#main-menu");
const menuToggle = document.querySelector("#menu-toggle");
const statusList = document.querySelector("#status-list");
const progressSteps = document.querySelectorAll(".progress-step");
const locationBox = document.querySelector("#location-box");
const topbarLocation = document.querySelector("#topbar-location");
const chatLog = document.querySelector("#chat-log");
const chatForm = document.querySelector("#chat-form");
const chatMessage = document.querySelector("#chat-message");
const activeAlertLabel = document.querySelector("#active-alert-label");
const videoStatus = document.querySelector("#video-status");
const userVideo = document.querySelector("#user-video");
const userVideoLabel = document.querySelector("#user-video-label");
const officerVideo = document.querySelector("#officer-video");
const officerVideoLabel = document.querySelector("#officer-video-label");
const connectionStatus = document.querySelector("#connection-status");
const alertDetail = document.querySelector("#alert-detail");

function saveLocalState() {
  localStorage.setItem("dhhProfile", JSON.stringify(state.profile));
  localStorage.setItem("dhhSelectedEmergencyType", state.selectedEmergencyType);

  if (state.activeCallId) {
    localStorage.setItem("dhhActiveCallId", state.activeCallId);
  } else {
    localStorage.removeItem("dhhActiveCallId");
  }
}

function clearActiveCall() {
  state.activeCallId = null;
  state.lastMessageIndex = 0;
  state.signalState.admin.remoteCandidateIndex = 0;
  state.signalState.backup.remoteCandidateIndex = 0;
  state.peerConnections.admin = null;
  state.peerConnections.backup = null;
  setConnectionStatus("Waiting");
  setProgressStep(1);
  if (topbarLocation) {
    topbarLocation.textContent = "Location: Ready";
  }
  saveLocalState();
}

function setScreen(screenId) {
  screens.forEach((screen) => screen.classList.toggle("active", screen.id === screenId));
  tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.screen === screenId));

  if (menu && menuToggle) {
    menu.classList.add("is-collapsed");
    menuToggle.setAttribute("aria-expanded", "false");
  }
}

function focusElement(selector) {
  const element = document.querySelector(selector);
  if (element) {
    element.focus();
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function addStatus(text) {
  console.log(text);
}

function setConnectionStatus(text) {
  if (connectionStatus) {
    connectionStatus.textContent = `Connection status: ${text}`;
  }
}

function setProgressStep(stepNumber) {
  progressSteps.forEach((step) => {
    const value = Number(step.dataset.step || "0");
    step.classList.toggle("active", value === stepNumber);
    step.classList.toggle("complete", value < stepNumber);
  });
}

function selectedEmergencyType() {
  const selected = document.querySelector("input[name='emergency-type']:checked");
  return selected ? selected.value : state.selectedEmergencyType || DEFAULT_EMERGENCY_TYPE;
}

function selectEmergencyType(type) {
  state.selectedEmergencyType = type;
  const selected = document.querySelector(`input[name='emergency-type'][value="${type}"]`);
  if (selected) {
    selected.checked = true;
  }
  addStatus(`Emergency type selected: ${type}.`);
  saveLocalState();
}

async function getLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({
        status: "unavailable",
        label: "GPS is not available in this browser.",
        latitude: "Not shared",
        longitude: "Not shared"
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude.toFixed(6);
        const longitude = position.coords.longitude.toFixed(6);
        resolve({
          status: "shared",
          label: `GPS location shared: ${latitude}, ${longitude}`,
          latitude,
          longitude
        });
      },
      () => {
        resolve({
          status: "demo-fallback",
          label: "GPS permission was not granted. Demo fallback location added.",
          latitude: "40.712800",
          longitude: "-74.006000"
        });
      },
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 0 }
    );
  });
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Request failed: ${response.status}`);
  }

  return response.json();
}

function renderAdminHint() {
  if (!alertDetail) {
    return;
  }

  alertDetail.innerHTML = `
    <div class="detail-grid">
      <p><strong>Admin console:</strong> open <a href="/admin" target="_blank" rel="noreferrer">/admin</a> to receive incoming calls and answer video requests.</p>
      <p><strong>Active call:</strong> ${state.activeCallId || "No call yet"}</p>
    </div>
  `;
}

async function createEmergencyCall() {
  const location = await getLocation();
  locationBox.textContent = location.label;
  if (topbarLocation) {
    topbarLocation.textContent = "Location: Shared";
  }

  const call = await requestJson("/api/calls", {
    method: "POST",
    body: JSON.stringify({
      type: selectedEmergencyType(),
      message: DEFAULT_EMERGENCY_MESSAGE,
      location,
      profile: state.profile
    })
  });

  state.activeCallId = call.id;
  state.lastMessageIndex = 0;
  state.signalState.admin.remoteCandidateIndex = 0;
  state.signalState.backup.remoteCandidateIndex = 0;
  saveLocalState();

  setProgressStep(2);

  if (activeAlertLabel) {
    activeAlertLabel.textContent = `${call.type} request active`;
  }
  renderAdminHint();
  await refreshMessages();
  startMessagePolling();

  return call;
}

async function ensureCallExists() {
  if (state.activeCallId) {
    try {
      return await requestJson(`/api/calls/${state.activeCallId}`);
    } catch {
      clearActiveCall();
    }
  }

  return createEmergencyCall();
}

function renderMessages(messages) {
  if (!chatLog) {
    return;
  }

  chatLog.innerHTML = "";

  if (!messages.length) {
    chatLog.innerHTML = "<p>No chat yet. Send an emergency alert to begin.</p>";
    return;
  }

  messages.forEach((message) => {
    const bubble = document.createElement("article");
    const sender = document.createElement("strong");
    const text = document.createElement("span");

    bubble.className = `message ${message.sender === "caller" ? "user" : "dispatcher"}`;
    sender.textContent = message.sender === "caller" ? "User" : "Emergency officer";
    text.textContent = message.text;
    bubble.append(sender, text);
    chatLog.append(bubble);
  });
}

async function refreshMessages() {
  if (!chatLog) {
    return;
  }

  if (!state.activeCallId) {
    renderMessages([]);
    return;
  }

  let payload;

  try {
    payload = await requestJson(`/api/calls/${state.activeCallId}/messages?since=${state.lastMessageIndex}`);
  } catch {
    clearActiveCall();
    renderMessages([]);
    if (activeAlertLabel) {
      activeAlertLabel.textContent = "No active alert";
    }
    return;
  }

  if (payload.messages.length) {
    state.lastMessageIndex = payload.nextIndex;
    const existing = Array.from(chatLog.querySelectorAll(".message")).map((node) => ({
      sender: node.classList.contains("user") ? "caller" : "admin",
      text: node.querySelector("span").textContent
    }));
    renderMessages([...existing, ...payload.messages]);
  } else if (!chatLog.children.length) {
    const fullPayload = await requestJson(`/api/calls/${state.activeCallId}/messages?since=0`);
    state.lastMessageIndex = fullPayload.nextIndex;
    renderMessages(fullPayload.messages);
  }
}

function startMessagePolling() {
  window.clearInterval(state.messageTimer);
  state.messageTimer = window.setInterval(() => {
    refreshMessages().catch(() => {});
  }, 1500);
}

function stopMessagePolling() {
  window.clearInterval(state.messageTimer);
  state.messageTimer = null;
}

async function sendChatMessage(text) {
  if (!state.activeCallId) {
    await ensureCallExists();
  }

  await requestJson(`/api/calls/${state.activeCallId}/messages`, {
    method: "POST",
    body: JSON.stringify({ sender: "caller", text })
  });

  await refreshMessages();
}

async function ensureLocalVideo() {
  if (state.localStream) {
    return state.localStream;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("Camera API unavailable");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: false
  });
  state.localStream = stream;
  userVideo.srcObject = stream;
  userVideoLabel.textContent = "";
  return stream;
}

async function startViewerConnection(call, role) {
  const peerConnection = await startCallerPeer(call.id, role);

  if (role === "admin") {
    videoStatus.textContent = "Emergency officer connecting...";
    if (officerVideoLabel) {
      officerVideoLabel.textContent = "Emergency officer connecting...";
    }
    setConnectionStatus("Emergency officer connecting...");
    setProgressStep(3);
  } else {
    console.log("Backup viewer invited for additional monitoring.");
  }

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  await requestJson(`/api/calls/${call.id}/offer`, {
    method: "POST",
    body: JSON.stringify({ offer, target: role })
  });

  startSignalPolling();
}

function attachPeerListeners(peerConnection, callId, role) {
  peerConnection.ontrack = (event) => {
    if (role !== "admin") {
      addStatus("Backup viewer connected to the caller video.");
      return;
    }

    const [remoteStream] = event.streams;
    if (officerVideo) {
      officerVideo.classList.add("connected");
      const remoteVideo = officerVideo.querySelector("video");
      if (remoteVideo) {
        remoteVideo.srcObject = remoteStream;
      } else {
        const video = document.createElement("video");
        video.autoplay = true;
        video.playsInline = true;
        video.srcObject = remoteStream;
        officerVideo.prepend(video);
      }
    }
    if (officerVideoLabel) {
      officerVideoLabel.textContent = "Connected";
    }
    setConnectionStatus("Connected");
    videoStatus.textContent = "Connected";
    setProgressStep(4);
  };

  peerConnection.onicecandidate = (event) => {
    if (!event.candidate) return;
    requestJson(`/api/calls/${callId}/candidates`, {
      method: "POST",
      body: JSON.stringify({ sender: "caller", target: role, candidate: event.candidate })
    }).catch(() => {});
  };

  peerConnection.onconnectionstatechange = () => {
    if (peerConnection.connectionState === "connected") {
      if (role === "admin") {
        setConnectionStatus("Connected");
        videoStatus.textContent = "Connected";
        setProgressStep(4);
      } else {
        console.log("Backup viewer is monitoring the caller video.");
      }
    }
  };
}

async function startCallerPeer(callId, role) {
  if (state.peerConnections[role]) {
    return state.peerConnections[role];
  }

  const stream = await ensureLocalVideo();
  const peerConnection = new RTCPeerConnection();
  stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));
  attachPeerListeners(peerConnection, callId, role);
  state.peerConnections[role] = peerConnection;
  return peerConnection;
}

async function pollSignals() {
  if (!state.activeCallId) {
    return;
  }

  for (const role of ["admin", "backup"]) {
    const peerConnection = state.peerConnections[role];
    if (!peerConnection) continue;

    const payload = await requestJson(
      `/api/calls/${state.activeCallId}/signals?receiver=caller&role=${role}&since=${state.signalState[role].remoteCandidateIndex}`
    );

    if (payload.answer && !peerConnection.currentRemoteDescription) {
      await peerConnection.setRemoteDescription(payload.answer);
      if (role === "admin") {
        setConnectionStatus("Connected");
        videoStatus.textContent = "Connected";
        setProgressStep(4);
      } else {
        console.log("Backup viewer can now see the caller video.");
      }
    }

    for (const candidate of payload.candidates) {
      await peerConnection.addIceCandidate(candidate);
    }

    state.signalState[role].remoteCandidateIndex = payload.nextIndex;
  }
}

function startSignalPolling() {
  window.clearInterval(state.signalTimer);
  state.signalTimer = window.setInterval(() => {
    pollSignals().catch(() => {});
  }, 1200);
}

async function requestVideoCall() {
  try {
    const call = await ensureCallExists();
    await ensureLocalVideo();
    await startViewerConnection(call, "admin");
    await startViewerConnection(call, "backup");
  } catch (error) {
    userVideoLabel.textContent = "Camera unavailable";
    addStatus(`Could not start video call: ${error.message}`);
  }
}

async function sendEmergencyAlert() {
  setScreen("emergency-screen");
  if (activeAlertLabel) {
    activeAlertLabel.textContent = `${selectedEmergencyType()} request starting`;
  }
  setProgressStep(1);

  try {
    await ensureLocalVideo();
    videoStatus.textContent = "Camera active";
    if (officerVideoLabel) {
      officerVideoLabel.textContent = "Waiting";
    }
    setConnectionStatus("Waiting");

    const call = await createEmergencyCall();
    await startViewerConnection(call, "admin");
    await startViewerConnection(call, "backup");
  } catch (error) {
    userVideoLabel.textContent = "Camera unavailable";
    addStatus(`Could not send emergency request: ${error.message}`);
  }
}

async function quickStartEmergencyCall() {
  setScreen("emergency-screen");
  await sendEmergencyAlert();
}

function loadProfileForm() {
  document.querySelector("#profile-name").value = state.profile.name;
  document.querySelector("#profile-age").value = state.profile.age;
  document.querySelector("#profile-communication").value = state.profile.communication;
  document.querySelector("#profile-contact-name").value = state.profile.contactName;
  document.querySelector("#profile-contact-info").value = state.profile.contactInfo;
  document.querySelector("#profile-allergies").value = state.profile.allergies;
  document.querySelector("#profile-medications").value = state.profile.medications;
  document.querySelector("#profile-notes").value = state.profile.notes;
}

function saveProfile(event) {
  event.preventDefault();
  state.profile = {
    name: document.querySelector("#profile-name").value.trim(),
    age: document.querySelector("#profile-age").value.trim(),
    communication: document.querySelector("#profile-communication").value,
    contactName: document.querySelector("#profile-contact-name").value.trim(),
    contactInfo: document.querySelector("#profile-contact-info").value.trim(),
    allergies: document.querySelector("#profile-allergies").value.trim(),
    medications: document.querySelector("#profile-medications").value.trim(),
    notes: document.querySelector("#profile-notes").value.trim()
  };

  saveLocalState();
  addStatus("Registration and medical profile saved.");
  setScreen("emergency-screen");
}

function render() {
  renderAdminHint();
  if (!state.activeCallId) {
    if (activeAlertLabel) {
      activeAlertLabel.textContent = "No active alert";
    }
    renderMessages([]);
  } else {
    if (activeAlertLabel) {
      activeAlertLabel.textContent = `${selectedEmergencyType()} request active`;
    }
    refreshMessages().catch(() => {});
    startMessagePolling();
  }
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => setScreen(tab.dataset.screen));
});

if (menu && menuToggle) {
  menuToggle.addEventListener("click", () => {
    const expanded = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!expanded));
    menu.classList.toggle("is-collapsed");
  });

  document.addEventListener("click", (event) => {
    const clickedInsideMenu = menu.contains(event.target);
    const clickedToggle = menuToggle.contains(event.target);

    if (!clickedInsideMenu && !clickedToggle) {
      menu.classList.remove("is-collapsed");
      menu.classList.add("is-collapsed");
      menuToggle.setAttribute("aria-expanded", "false");
    }
  });
}

document.querySelector("#send-alert").addEventListener("click", sendEmergencyAlert);
document.querySelector("#profile-form").addEventListener("submit", saveProfile);

const goProfileButton = document.querySelector("#go-profile");
if (goProfileButton) {
  goProfileButton.addEventListener("click", () => setScreen("profile-screen"));
}

const goEmergencyButton = document.querySelector("#go-emergency");
if (goEmergencyButton) {
  goEmergencyButton.addEventListener("click", quickStartEmergencyCall);
}

const quickStartButton = document.querySelector("#quick-start-call");
if (quickStartButton) {
  quickStartButton.addEventListener("click", quickStartEmergencyCall);
}

if (chatForm) {
  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = chatMessage.value.trim();
    if (!text) return;

    try {
      await sendChatMessage(text);
      chatMessage.value = "";
    } catch (error) {
      addStatus(`Could not send text: ${error.message}`);
    }
  });
}

document.querySelector("#clear-demo").addEventListener("click", async () => {
  if (state.activeCallId) {
    try {
      await requestJson(`/api/calls/${state.activeCallId}/resolve`, { method: "POST", body: "{}" });
    } catch {
      // ignore
    }
  }

  clearActiveCall();
  stopMessagePolling();
  window.clearInterval(state.signalTimer);
  state.signalTimer = null;
  locationBox.textContent = "GPS location has not been shared yet.";
  if (topbarLocation) {
    topbarLocation.textContent = "Location: Ready";
  }
  if (chatLog) {
    chatLog.innerHTML = "";
  }
  render();
});

window.addEventListener("beforeunload", () => {
  stopMessagePolling();
  window.clearInterval(state.signalTimer);
});

loadProfileForm();
render();
