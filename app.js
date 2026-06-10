const seedData = {
  mode: "admin",
  session: null,
  selectedClientId: "",
  selectedProjectId: "",
  selectedVideoId: "",
  clients: [],
  projects: [],
  videos: [],
  versions: [],
  comments: [],
  activity: [],
  deliveredProjectIds: [],
};

const storeKey = "validate-delivery-portal-empty-v4";
const productionOrigin = "https://validate-delivery-portal.vercel.app";
const state = loadState();
state.session ??= null;
state.deliveredProjectIds ??= [];
const root = document.querySelector("#viewRoot");
const pageTitle = document.querySelector("#pageTitle");
const pageEyebrow = document.querySelector(".topbar .eyebrow");
const topbar = document.querySelector(".topbar");
const loginScreen = document.querySelector("#loginScreen");
const appShell = document.querySelector("#appShell");
const dashboardHero = document.querySelector("#dashboardHero");
const loginForm = document.querySelector("#loginForm");
const loginSubmit = document.querySelector("#loginSubmit");
const passwordField = document.querySelector("#passwordField");
const accessCodeField = document.querySelector("#accessCodeField");
const adminAccess = document.querySelector("#adminAccess");
const sessionLabel = document.querySelector("#sessionLabel");
const dialog = document.querySelector("#createDialog");
const dialogTitle = document.querySelector("#dialogTitle");
const dialogFields = document.querySelector("#dialogFields");
const createForm = document.querySelector("#createForm");
const toast = document.querySelector("#toast");

let route = "clients";
let createIntent = "client";
let loginRole = "client";
let reelKeepalive = null;
let backgroundRotation = null;
let dashboardBackgroundRotation = null;
const loginBackgroundCount = 9;
const dashboardBackgroundCount = 5;
const loginReelSources = [
  "https://createwithvalidate.com/videos/header-loop-2.mp4",
  "https://createwithvalidate.com/videos/fishing-loop.mp4",
];
const testClientAccounts = [
  {
    email: "client@example.com",
    password: "Client2026!",
    client: {
      id: "test-client-account",
      name: "Test Client Account",
      contact: "Jordan Lee",
      email: "client@example.com",
      summary: "Client review account. Projects appear here after admin sends a review link.",
      archived: false,
    },
  },
];

function apiUrl(path) {
  const isLocalPreview =
    location.protocol === "file:" ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1";
  return `${isLocalPreview ? productionOrigin : ""}${path}`;
}

function loadState() {
  try {
    if (new URLSearchParams(window.location.search).has("reset")) {
      localStorage.removeItem(storeKey);
      history.replaceState(null, "", location.pathname);
    }
    const saved = localStorage.getItem(storeKey);
    return saved ? JSON.parse(saved) : structuredClone(seedData);
  } catch {
    return structuredClone(seedData);
  }
}

function saveState() {
  try {
    localStorage.setItem(storeKey, JSON.stringify(state));
  } catch {
    showToast("Browser storage is unavailable");
  }
}

function setPageHeader(title, eyebrow = "Client delivery portal", style = "") {
  pageTitle.textContent = title;
  pageEyebrow.textContent = eyebrow;
  topbar.classList.toggle("client-title-card", style === "client");
}

function updateAuthView() {
  const isLoggedIn = Boolean(state.session);
  loginScreen.hidden = isLoggedIn;
  appShell.hidden = !isLoggedIn;
  if (!isLoggedIn) {
    startLoginReel();
    startLoginBackgroundRotation();
  }
  if (!isLoggedIn) return;
  startDashboardBackgroundRotation();

  sessionLabel.textContent = "";
  document.querySelector("#openCreate").hidden = state.session.role !== "admin" || state.mode === "client";
}

function startLoginBackgroundRotation() {
  if (!loginScreen) return;
  loginScreen.dataset.bgIndex ??= "0";
  if (backgroundRotation) return;

  const rotateBackground = () => {
    const currentIndex = Number(loginScreen.dataset.bgIndex || 0);
    loginScreen.dataset.bgIndex = String((currentIndex + 1) % loginBackgroundCount);
  };

  window.__rotateLoginBackground = rotateBackground;
  backgroundRotation = window.setInterval(() => {
    if (!state.session) rotateBackground();
  }, 4500);
}

function startDashboardBackgroundRotation() {
  if (!dashboardHero || dashboardBackgroundRotation) return;
  dashboardHero.dataset.bgIndex ??= "0";
  dashboardBackgroundRotation = window.setInterval(() => {
    if (!state.session) return;
    const currentIndex = Number(dashboardHero.dataset.bgIndex || 0);
    dashboardHero.dataset.bgIndex = String((currentIndex + 1) % dashboardBackgroundCount);
  }, 5200);
}

function startLoginReel() {
  const reel = document.querySelector("#loginReel");
  if (!reel) return;
  reel.dataset.sourceIndex ??= "0";
  reel.muted = true;
  reel.playsInline = true;
  reel.controls = false;
  reel.loop = false;
  const playReel = () => {
    reel.muted = true;
    reel.play()?.catch?.(() => {});
  };

  const advanceReel = () => {
    const currentIndex = Number(reel.dataset.sourceIndex || 0);
    const nextIndex = (currentIndex + 1) % loginReelSources.length;
    reel.dataset.sourceIndex = String(nextIndex);
    reel.src = loginReelSources[nextIndex];
    reel.load();
    playReel();
  };
  window.__advanceLoginReel = advanceReel;

  playReel();

  if (!reel.dataset.autoplayBound) {
    reel.dataset.autoplayBound = "true";
    ["pointermove", "pointerdown", "keydown", "touchstart"].forEach((eventName) => {
      window.addEventListener(eventName, playReel, { passive: true });
    });
    reel.addEventListener("canplay", playReel);
    reel.addEventListener("ended", advanceReel);
    reel.addEventListener("pause", () => {
      if (!state.session) window.setTimeout(playReel, 250);
    });
  }

  if (reelKeepalive) window.clearInterval(reelKeepalive);
  reelKeepalive = window.setInterval(() => {
    if (state.session) return;
    playReel();
  }, 1500);
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function upsertById(collection, item) {
  const index = collection.findIndex((entry) => entry.id === item.id);
  if (index >= 0) collection[index] = { ...collection[index], ...item };
  else collection.unshift({ ...item });
}

function findTestClientAccount(email, password) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedPassword = String(password || "").trim();
  return testClientAccounts.find(
    (account) =>
      account.email.toLowerCase() === normalizedEmail &&
      account.password === normalizedPassword,
  );
}

function prepareClientAccount(account) {
  const matchingClient = state.clients.find(
    (client) => client.email?.toLowerCase() === account.email.toLowerCase(),
  );
  const client = matchingClient || account.client;
  if (!matchingClient) upsertById(state.clients, client);
  state.selectedClientId = client.id;
  state.selectedProjectId = "";
  state.selectedVideoId = "";
}

function setRoute(nextRoute) {
  route = nextRoute;
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.route === route);
  });
  render();
}

function setLoginRole(nextRole) {
  loginRole = nextRole;

  const isAdmin = loginRole === "admin";
  passwordField.hidden = false;
  passwordField.querySelector("input").required = false;
  if (accessCodeField) {
    accessCodeField.hidden = true;
    accessCodeField.querySelector("input").required = false;
  }
  loginSubmit.textContent = isAdmin ? "Sign in as admin" : "Sign in";
  adminAccess.textContent = isAdmin ? "Back to client review" : "Admin access";
  document.querySelector(".login-panel .eyebrow").textContent = isAdmin
    ? "Admin delivery portal"
    : "Client review portal";
  document.querySelector(".login-panel h1").textContent = isAdmin
    ? "Manage delivery."
    : "Review the latest cut.";
  document.querySelector(".login-copy").textContent = isAdmin
    ? "Manage clients, projects, video versions, notes, notifications, and approvals from one clean workspace."
    : "Sign in to your review dashboard to see projects, versions, notes, and approvals.";
}

function completeLogin() {
  const form = new FormData(loginForm);
  const role = loginRole === "client" ? "client" : "admin";

  if (role === "client") {
    const account = findTestClientAccount(form.get("email"), form.get("password"));
    if (!account) {
      showToast("Email or password did not match");
      return;
    }

    prepareClientAccount(account);
    state.session = {
      role,
      email: account.email,
    };
    state.mode = role;
    route = "clients";
    saveState();
    showToast(`Signed in as ${account.client.contact}`);
    render();
    return;
  }

  state.session = {
    role,
    email: form.get("email") || (role === "admin" ? "admin@createwithvalidate.com" : "client@example.com"),
  };
  state.mode = role;
  route = "clients";
  saveState();
  showToast(`Signed in as ${role}`);
  render();
}

window.validatePortalLogin = completeLogin;
window.validatePortalToggleAdmin = () => {
  setLoginRole(loginRole === "admin" ? "client" : "admin");
};

function activeClient() {
  return state.clients.find((client) => client.id === state.selectedClientId) || state.clients[0];
}

function activeProject() {
  return (
    state.projects.find((project) => project.id === state.selectedProjectId) ||
    state.projects.find((project) => project.clientId === activeClient()?.id)
  );
}

function activeVideo() {
  return (
    state.videos.find((video) => video.id === state.selectedVideoId) ||
    state.videos.find((video) => video.projectId === activeProject()?.id)
  );
}

function latestVersion(videoId = activeVideo()?.id) {
  return state.versions.find((version) => version.videoId === videoId);
}

function projectVideos(projectId) {
  return state.videos.filter((video) => video.projectId === projectId);
}

function videoVersions(videoId) {
  return state.versions.filter((version) => version.videoId === videoId);
}

function projectVersionCount(projectId) {
  return projectVideos(projectId).reduce((total, video) => total + videoVersions(video.id).length, 0);
}

function deleteClient(clientId) {
  const client = state.clients.find((item) => item.id === clientId);
  if (!client) return;
  const confirmed = window.confirm(`Delete ${client.name} and all of its projects?`);
  if (!confirmed) return;

  const projectIds = state.projects.filter((project) => project.clientId === clientId).map((project) => project.id);
  const videoIds = state.videos.filter((video) => projectIds.includes(video.projectId)).map((video) => video.id);
  const versionIds = state.versions.filter((version) => videoIds.includes(version.videoId)).map((version) => version.id);

  state.clients = state.clients.filter((item) => item.id !== clientId);
  state.projects = state.projects.filter((project) => !projectIds.includes(project.id));
  state.videos = state.videos.filter((video) => !videoIds.includes(video.id));
  state.versions = state.versions.filter((version) => !versionIds.includes(version.id));
  state.comments = state.comments.filter((comment) => !versionIds.includes(comment.versionId));
  if (state.selectedClientId === clientId) state.selectedClientId = "";
  if (projectIds.includes(state.selectedProjectId)) state.selectedProjectId = "";
  if (videoIds.includes(state.selectedVideoId)) state.selectedVideoId = "";
  state.activity.unshift(`Deleted client ${client.name}`);
  saveState();
  showToast("Client deleted");
  renderClients();
}

function updateStats() {
  document.querySelector("#heroClientCount").textContent = `${state.clients.length} clients`;
  document.querySelector("#heroProjectCount").textContent =
    `${state.projects.filter((project) => !project.archived).length} active projects`;
  document.querySelector("#heroApprovalCount").textContent =
    `${state.versions.filter((version) => version.approved).length} approved`;
}

async function sendLatestToClient(button) {
  const client = activeClient();
  const project = activeProject();
  const video = activeVideo();
  const version = latestVersion(video?.id);

  if (!client?.email) {
    showToast("Add a client email before sending");
    return;
  }

  if (!project || !video || !version) {
    showToast("Add a video version before sending");
    return;
  }

  const reviewUrl = `${location.origin}${location.pathname}#review/${project.id}`;
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Sending...";

  try {
    const response = await fetch(apiUrl("/api/send-review-email"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientEmail: client.email,
        clientName: client.contact || client.name,
        projectName: project.name,
        videoTitle: video.title,
        versionLabel: version.label,
        versionNote: version.note,
        reviewUrl,
        senderEmail: state.session?.email,
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Email could not be sent");

    if (!state.deliveredProjectIds.includes(project.id)) state.deliveredProjectIds.push(project.id);
    state.activity.unshift(`Sent ${version.label} for ${video.title} to ${client.email}`);
    saveState();
    showToast("Client email sent");
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function createBunnyUploadCredentials({ title }) {
  const response = await fetch(apiUrl("/api/create-bunny-upload"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Bunny upload could not start");
  return result;
}

function loadTusClient() {
  if (window.tus?.Upload) return Promise.resolve(window.tus);
  if (window.tusClient?.Upload) return Promise.resolve(window.tusClient);

  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector("[data-tus-loader]");
    const script = existingScript || document.createElement("script");
    script.dataset.tusLoader = "true";
    script.src = "https://cdn.jsdelivr.net/npm/tus-js-client@4.3.1/dist/tus.min.js";
    script.onload = () => {
      const tusClient = window.tus || window.tusClient;
      if (tusClient?.Upload) resolve(tusClient);
      else reject(new Error("Video uploader could not load"));
    };
    script.onerror = () => reject(new Error("Video uploader could not load"));
    if (!existingScript) document.head.append(script);
  });
}

async function uploadToBunny(file, credentials, onProgress) {
  const tusClient = await loadTusClient();
  if (!tusClient?.Upload) {
    throw new Error("Video uploader is still loading. Try again in a moment.");
  }

  return new Promise((resolve, reject) => {
    const upload = new tusClient.Upload(file, {
      endpoint: credentials.endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        AuthorizationSignature: credentials.signature,
        AuthorizationExpire: String(credentials.expirationTime),
        VideoId: credentials.videoId,
        LibraryId: String(credentials.libraryId),
      },
      metadata: {
        filetype: file.type || "video/mp4",
        title: file.name,
      },
      onError: reject,
      onProgress: (bytesUploaded, bytesTotal) => {
        const percent = bytesTotal ? Math.round((bytesUploaded / bytesTotal) * 100) : 0;
        onProgress(percent);
      },
      onSuccess: () => resolve(credentials),
    });

    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length) upload.resumeFromPreviousUpload(previousUploads[0]);
      upload.start();
    });
  });
}

async function uploadVersionFileToBunny({ file, title, button }) {
  button.textContent = "Creating Bunny video...";
  const credentials = await createBunnyUploadCredentials({ title });
  button.textContent = "Uploading 0%";
  await uploadToBunny(file, credentials, (percent) => {
    button.textContent = `Uploading ${percent}%`;
  });
  return credentials;
}

function render() {
  updateAuthView();
  if (!state.session) return;

  updateStats();
  if (state.mode === "client") {
    renderClientDashboard();
    return;
  }

  if (route === "activity") renderActivity();
  else if (route === "settings") renderSettings();
  else renderClients();
}

function renderClients() {
  dashboardHero.hidden = false;
  setPageHeader("Clients");
  document.querySelector("#openCreate").textContent = "New client";
  document.querySelector("#openCreate").hidden = state.session?.role !== "admin";
  createIntent = "client";
  if (!state.clients.length) {
    root.innerHTML = `
      <div class="empty">
        No clients yet. Create your first client to start building a delivery workspace.
      </div>
    `;
    return;
  }

  root.innerHTML = `
    <div class="grid">
      ${state.clients
        .map((client) => {
          const projects = state.projects.filter((project) => project.clientId === client.id);
          const activeProjects = projects.filter((project) => !project.archived);
          const versions = activeProjects.reduce((total, project) => total + projectVersionCount(project.id), 0);
          return `
            <article class="card">
              <p class="eyebrow">${client.contact}</p>
              <h3>${client.name}</h3>
              <p>${client.summary}</p>
              <div class="meta-strip">
                <span>${client.email || "No email"}</span>
                <span>${versions} versions</span>
              </div>
              <div class="card-footer">
                <span class="metric">${activeProjects.length} projects</span>
                <div class="inline-actions">
                  <button class="ghost-button danger-button" data-delete-client="${client.id}">Delete</button>
                  <button class="ghost-button" data-client="${client.id}">Open workspace</button>
                </div>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;

  root.querySelectorAll("[data-client]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedClientId = button.dataset.client;
      saveState();
      renderProjects();
    });
  });

  root.querySelectorAll("[data-delete-client]").forEach((button) => {
    button.addEventListener("click", () => deleteClient(button.dataset.deleteClient));
  });
}

function renderProjects() {
  dashboardHero.hidden = true;
  const client = activeClient();
  if (!client) {
    renderClients();
    return;
  }

  setPageHeader(client.name, client.contact || "Projects", "client");
  document.querySelector("#openCreate").textContent = "New project";
  createIntent = "project";
  const projects = state.projects.filter(
    (project) =>
      project.clientId === client.id &&
      !project.archived &&
      state.deliveredProjectIds.includes(project.id),
  );

  root.innerHTML = `
    <section class="workspace-panel">
      <div class="workspace-head">
        <div>
          <h2>Projects</h2>
          <p class="muted">${client.summary}</p>
        </div>
        <div class="workspace-stats">
          <span>${projects.length} projects</span>
          <span>${projects.filter((project) => project.status === "approved").length} approved</span>
        </div>
      </div>
      <div class="project-list">
        ${
          projects.length
            ? projects
                .map(
                  (project) => {
                    const videos = projectVideos(project.id);
                    const versions = projectVersionCount(project.id);
                    return `
                      <div class="list-row project-row">
                        <div>
                          <h3>${project.name}</h3>
                          <p class="muted">${project.description}</p>
                          <div class="meta-strip">
                            <span>${videos.length} videos</span>
                            <span>${versions} versions</span>
                          </div>
                        </div>
                        <div class="inline-actions">
                          <span class="status-pill ${project.status === "approved" ? "approved" : ""}">${project.status}</span>
                          <button class="ghost-button" data-project="${project.id}">Open</button>
                          <button class="ghost-button" data-archive-project="${project.id}">Archive</button>
                        </div>
                      </div>
                    `;
                  },
                )
                .join("")
            : `<div class="empty project-empty">No active projects yet. Create a project when a new cut is ready for review.</div>`
        }
      </div>
    </section>
  `;

  root.querySelectorAll("[data-project]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedProjectId = button.dataset.project;
      const video = state.videos.find((item) => item.projectId === state.selectedProjectId);
      if (video) state.selectedVideoId = video.id;
      saveState();
      renderProjectDetail();
    });
  });

  root.querySelectorAll("[data-archive-project]").forEach((button) => {
    button.addEventListener("click", () => {
      const project = state.projects.find((item) => item.id === button.dataset.archiveProject);
      project.archived = true;
      saveState();
      showToast("Project archived");
      renderProjects();
    });
  });
}

function renderProjectDetail() {
  dashboardHero.hidden = true;
  const project = activeProject();
  if (!project) {
    renderClients();
    return;
  }

  const client = state.clients.find((item) => item.id === project.clientId);
  const videos = state.videos.filter((video) => video.projectId === project.id);
  const latestVideo = videos[0];
  const latest = latestVideo ? latestVersion(latestVideo.id) : null;
  const canSend = Boolean(client?.email && latestVideo && latest);
  const sendStatus = !client?.email
    ? "Add a client email before sending."
    : latest
      ? `${latest.label} is ready for ${client.email}`
      : "Upload a review version before emailing the client.";
  setPageHeader(project.name);
  document.querySelector("#openCreate").textContent = "Add video";
  createIntent = "video";

  root.innerHTML = `
    <div class="project-layout">
      <section class="panel">
        <p class="eyebrow">${client.name}</p>
        <div class="project-title">
          <h2>${project.name}</h2>
          <p class="muted">${project.description}</p>
        </div>
        <div class="stack">
          ${videos
            .map((video) => {
              const version = latestVersion(video.id);
              return `
                <div class="list-row">
                  <div>
                    <h3>${video.title}</h3>
                    <p class="muted">Due ${video.due}. Latest: ${version?.label || "No versions yet"}</p>
                    <div class="meta-strip">
                      <span>${videoVersions(video.id).length} versions</span>
                      <span>${state.comments.filter((comment) => comment.versionId === version?.id).length} notes</span>
                    </div>
                  </div>
                  <div class="inline-actions">
                    <span class="status-pill ${video.status === "approved" ? "approved" : ""}">${video.status}</span>
                    <button class="ghost-button" data-video="${video.id}">Review</button>
                  </div>
                </div>
              `;
            })
            .join("") || `<div class="empty compact-empty">No videos yet. Upload a version or add a video to start review.</div>`}
        </div>
      </section>
      <aside class="panel stack">
        <p class="eyebrow">Delivery actions</p>
        <div class="action-status ${canSend ? "ready" : ""}">
          <strong>${canSend ? "Ready to send" : "Needs attention"}</strong>
          <span>${sendStatus}</span>
        </div>
        <button class="primary-button" id="sendClient" ${canSend ? "" : "disabled"}>Send latest to client</button>
        <button class="ghost-button" id="addVersion">Upload new version</button>
        <button class="ghost-button" id="backProjects">Back to client</button>
        <p class="muted">Uploads route through Bunny Stream when you choose an MP4. Embed links still work for Vimeo or other hosted cuts.</p>
      </aside>
    </div>
  `;

  root.querySelectorAll("[data-video]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedVideoId = button.dataset.video;
      saveState();
      renderAdminReview();
    });
  });
  root.querySelector("#sendClient").addEventListener("click", (event) => {
    sendLatestToClient(event.currentTarget);
  });
  root.querySelector("#addVersion").addEventListener("click", () => openDialog("version"));
  root.querySelector("#backProjects").addEventListener("click", renderProjects);
}

function renderAdminReview() {
  renderReviewShell(true);
}

function renderClientDashboard() {
  dashboardHero.hidden = true;
  const client = activeClient();
  if (!client) {
    setPageHeader("Client dashboard");
    document.querySelector("#openCreate").hidden = true;
    root.innerHTML = `<div class="empty">No client account is loaded.</div>`;
    return;
  }

  const projects = state.projects.filter((project) => project.clientId === client.id && !project.archived);
  setPageHeader(client.name, client.contact || "Client dashboard", "client");
  document.querySelector("#openCreate").hidden = true;
  createIntent = "client";

  root.innerHTML = `
    <section class="workspace-panel">
      <div class="workspace-head">
        <div>
          <h2>Your review dashboard</h2>
          <p class="muted">Open a video to watch versions, leave notes, and approve the final cut when it is ready.</p>
        </div>
        <div class="workspace-stats">
          <span>${projects.length} projects</span>
          <span>${projects.reduce((total, project) => total + projectVersionCount(project.id), 0)} versions</span>
        </div>
      </div>
      <div class="project-list">
        ${
          projects.length
            ? projects
                .map((project) => {
                  const videos = projectVideos(project.id);
                  return `
                    <div class="client-project-block">
                      <div class="client-project-head">
                        <div>
                          <p class="eyebrow">${project.status}</p>
                          <h3>${project.name}</h3>
                          <p class="muted">${project.description}</p>
                        </div>
                        <span class="metric">${videos.length} videos</span>
                      </div>
                      <div class="project-list">
                        ${
                          videos.length
                            ? videos
                                .map((video) => {
                                  const version = latestVersion(video.id);
                                  return `
                                    <div class="list-row">
                                      <div>
                                        <h3>${video.title}</h3>
                                        <p class="muted">${version?.label || "No versions yet"}${version?.note ? ` - ${version.note}` : ""}</p>
                                        <div class="meta-strip">
                                          <span>${videoVersions(video.id).length} versions</span>
                                          <span>${version?.approved ? "approved" : "in review"}</span>
                                        </div>
                                      </div>
                                      <div class="inline-actions">
                                        <span class="status-pill ${version?.approved ? "approved" : ""}">${version?.approved ? "approved" : video.status}</span>
                                        <button class="ghost-button" data-client-review="${video.id}">Open review</button>
                                      </div>
                                    </div>
                                  `;
                                })
                                .join("")
                            : `<div class="empty compact-empty">No videos are ready yet.</div>`
                        }
                      </div>
                    </div>
                  `;
                })
                .join("")
            : `<div class="empty compact-empty">No projects have been sent to this account yet.</div>`
        }
      </div>
    </section>
  `;

  root.querySelectorAll("[data-client-review]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedVideoId = button.dataset.clientReview;
      const video = activeVideo();
      const project = state.projects.find((item) => item.id === video?.projectId);
      if (project) state.selectedProjectId = project.id;
      saveState();
      renderClientReview();
    });
  });
}

function renderClientReview() {
  renderReviewShell(false);
}

function renderReviewShell(isAdmin) {
  dashboardHero.hidden = true;
  const video = activeVideo();
  if (!video) {
    setPageHeader(isAdmin ? "Review" : "Client review");
    document.querySelector("#openCreate").textContent = "New client";
    createIntent = "client";
    root.innerHTML = `
      <div class="empty">
        No videos are ready for review yet. Add a client, project, and video to create the first review page.
      </div>
    `;
    return;
  }

  const project = state.projects.find((item) => item.id === video.projectId);
  const versions = state.versions.filter((version) => version.videoId === video.id);
  const version = versions[0];
  const comments = state.comments.filter((comment) => comment.versionId === version?.id);
  setPageHeader(isAdmin ? video.title : project.name);
  document.querySelector("#openCreate").textContent = isAdmin ? "Add version" : "Approve";
  document.querySelector("#openCreate").hidden = !isAdmin;
  createIntent = isAdmin ? "version" : "approve";

  root.innerHTML = `
    <div class="project-layout">
      <section class="panel">
        <div class="video-frame">
          ${
            version?.embedUrl
              ? `<iframe title="${video.title}" src="${version.embedUrl}" allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;" allowfullscreen></iframe>`
              : `<div class="review-placeholder"><span>Awaiting video</span></div>`
          }
        </div>
        <div class="review-head">
          <div>
            <p class="eyebrow">${version?.label || "No version"}</p>
            <h2>${video.title}</h2>
            <p class="muted">${version?.note || "Upload the first version to begin review."}</p>
          </div>
          <div class="inline-actions">
            <span class="provider-pill">${version?.provider || "No provider"}</span>
            <span class="status-pill ${version?.approved ? "approved" : ""}">${version?.approved ? "approved" : "in review"}</span>
          </div>
        </div>
        <div class="panel">
          <p class="eyebrow">Comments</p>
          ${
            comments.length
              ? comments
                  .map(
                    (comment) => `
                      <div class="comment-row">
                        <div class="avatar">${comment.author.slice(0, 1)}</div>
                        <div>
                          <strong>${comment.author}</strong>
                          <span class="muted"> ${comment.createdAt}</span>
                          <p>${comment.body}</p>
                        </div>
                      </div>
                    `,
                  )
                  .join("")
              : `<div class="empty compact-empty">No notes yet. Add the first review note below.</div>`
          }
          <form class="comment-form" id="commentForm">
            <textarea name="body" placeholder="Add a note for this version"></textarea>
            <button class="primary-button" ${version ? "" : "disabled"}>Add comment</button>
          </form>
        </div>
      </section>
      <aside class="panel stack">
        <p class="eyebrow">Version history</p>
        ${
          versions.length
            ? versions
                .map(
                  (item) => `
                    <div class="version-row">
                      <div>
                        <h3>${item.label}</h3>
                        <p class="muted">${item.createdAt}</p>
                      </div>
                      <span class="status-pill ${item.approved ? "approved" : ""}">${item.approved ? "approved" : item.provider}</span>
                    </div>
                  `,
                )
                .join("")
            : `<div class="empty compact-empty">No versions uploaded yet.</div>`
        }
        <button class="primary-button" id="approveVersion" ${version ? "" : "disabled"}>${version?.approved ? "Approved" : "Mark approved"}</button>
        ${isAdmin ? `<button class="ghost-button" id="backProject">Back to project</button>` : `<button class="ghost-button" id="backClientDashboard">Back to dashboard</button>`}
      </aside>
    </div>
  `;

  root.querySelector("#commentForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const body = new FormData(event.currentTarget).get("body").trim();
    if (!body || !version) return;
    state.comments.unshift({
      id: `comment-${Date.now()}`,
      versionId: version.id,
      author: isAdmin ? "Validate" : "Client",
      role: isAdmin ? "admin" : "client",
      body,
      createdAt: "Just now",
    });
    saveState();
    renderReviewShell(isAdmin);
  });

  root.querySelector("#approveVersion").addEventListener("click", () => {
    if (!version) return;
    version.approved = true;
    video.status = "approved";
    saveState();
    showToast("Version marked approved");
    renderReviewShell(isAdmin);
  });

  const back = root.querySelector("#backProject");
  if (back) back.addEventListener("click", renderProjectDetail);
  const backClientDashboard = root.querySelector("#backClientDashboard");
  if (backClientDashboard) backClientDashboard.addEventListener("click", renderClientDashboard);
}

function renderActivity() {
  dashboardHero.hidden = true;
  setPageHeader("Activity");
  document.querySelector("#openCreate").textContent = "New client";
  root.innerHTML = `
    <div class="panel stack">
      <p class="eyebrow">Recent</p>
      ${
        state.activity.length
          ? state.activity.map((item) => `<div class="list-row"><span>${item}</span><span class="muted">Now</span></div>`).join("")
          : `<div class="empty compact-empty">No activity yet. Sent emails and approvals will show up here.</div>`
      }
    </div>
  `;
}

function renderSettings() {
  dashboardHero.hidden = true;
  setPageHeader("Settings");
  document.querySelector("#openCreate").textContent = "New client";
  root.innerHTML = `
    <div class="grid">
      <article class="card">
        <p class="eyebrow">Bunny Stream</p>
        <h3>Connect video library</h3>
        <p>Store library ID and API key as Vercel environment variables.</p>
      </article>
      <article class="card">
        <p class="eyebrow">Vimeo</p>
        <h3>Enable uploads</h3>
        <p>Use an app token with upload and edit scopes for account-owned videos.</p>
      </article>
      <article class="card">
        <p class="eyebrow">Email</p>
        <h3>Client notifications</h3>
        <p>Send branded review links when a new version is ready.</p>
      </article>
    </div>
  `;
}

function openDialog(intent = createIntent) {
  createIntent = intent;
  const fields = {
    client: [
      ["name", "Client name", "Silver Dollar City"],
      ["contact", "Contact", "Megan Carter"],
      ["email", "Email", "client@example.com"],
      ["summary", "Summary", "Commercial campaign and brand films."],
    ],
    project: [
      ["name", "Project name", "Summer Campaign"],
      ["description", "Description", "Main spot, social cuts, and version review."],
      ["status", "Status", "review"],
    ],
    video: [
      ["title", "Video title", "Launch Film"],
      ["due", "Due", "June 21"],
    ],
    version: [
      ["label", "Version label", "Version 4"],
      ["provider", "Provider", "Bunny Stream"],
      ["file", "Video file", ""],
      ["embedUrl", "Embed URL", ""],
      ["note", "Version note", "Updated music and end card."],
    ],
  };

  if (intent === "approve") {
    const version = latestVersion();
    if (version) version.approved = true;
    saveState();
    showToast("Version marked approved");
    render();
    return;
  }

  dialogTitle.textContent = {
    client: "New client",
    project: "New project",
    video: "Add video",
    version: "Upload new version",
  }[intent];

  dialogFields.innerHTML = fields[intent]
    .map(
      ([name, label, placeholder]) => `
        <label>
          ${label}
          ${
            name === "note" || name === "summary" || name === "description"
              ? `<textarea name="${name}" placeholder="${placeholder}"></textarea>`
              : name === "file"
                ? `<input name="${name}" type="file" accept="video/*" />`
                : `<input name="${name}" placeholder="${placeholder}" />`
          }
        </label>
      `,
    )
    .join("");

  dialog.showModal();
}

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(createForm);
  const nowId = Date.now();
  const saveButton = createForm.querySelector('button[type="submit"]');
  const originalSaveText = saveButton.textContent;
  saveButton.disabled = true;

  try {
    if (createIntent === "client") {
      const name = form.get("name") || "New Client";
      state.clients.push({
        id: slug(name) || `client-${nowId}`,
        name,
        contact: form.get("contact") || "Primary contact",
        email: form.get("email") || "",
        summary: form.get("summary") || "New client workspace.",
        archived: false,
      });
    }

    if (createIntent === "project") {
      const name = form.get("name") || "New Project";
      state.projects.unshift({
        id: slug(name) || `project-${nowId}`,
        clientId: activeClient().id,
        name,
        status: form.get("status") || "review",
        description: form.get("description") || "Video delivery project.",
        archived: false,
      });
    }

    if (createIntent === "video") {
      const title = form.get("title") || "New Video";
      const videoId = slug(title) || `video-${nowId}`;
      state.videos.unshift({
        id: videoId,
        projectId: activeProject().id,
        title,
        status: "draft",
        due: form.get("due") || "Soon",
      });
      state.selectedVideoId = videoId;
    }

    if (createIntent === "version") {
      const project = activeProject();
      let video = activeVideo();
      if (!video) {
        if (!project) throw new Error("Open a project before uploading");
        const title = project.name || "New Video";
        const videoId = slug(title) || `video-${nowId}`;
        video = {
          id: videoId,
          projectId: project.id,
          title,
          status: "draft",
          due: "Soon",
        };
        state.videos.unshift(video);
        state.selectedVideoId = videoId;
      }

      const file = form.get("file");
      const label = form.get("label") || "New version";
      const provider = form.get("provider") || "Bunny Stream";
      let embedUrl = form.get("embedUrl") || "";
      let bunnyVideoId = "";

      if (file?.size) {
        const upload = await uploadVersionFileToBunny({
          file,
          title: `${video.title} - ${label}`,
          button: saveButton,
        });
        embedUrl = upload.embedUrl;
        bunnyVideoId = upload.videoId;
      }

      state.versions.unshift({
        id: `version-${nowId}`,
        videoId: video.id,
        label,
        provider,
        embedUrl,
        bunnyVideoId,
        note: form.get("note") || "New review version.",
        createdAt: "Just now",
        approved: false,
      });
    }

    saveState();
    dialog.close();
    createForm.reset();
    showToast(createIntent === "version" ? "Version uploaded" : "Saved");
    if (createIntent === "project") renderProjects();
    else if (createIntent === "video") renderProjectDetail();
    else if (createIntent === "version") renderReviewShell(state.mode === "admin");
    else renderClients();
  } catch (error) {
    showToast(error.message);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = originalSaveText;
  }
});

document.querySelectorAll("[data-route]").forEach((item) => {
  item.addEventListener("click", (event) => {
    event.preventDefault();
    setRoute(item.dataset.route);
  });
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  completeLogin();
});
loginSubmit.addEventListener("click", completeLogin);

document.querySelector("#openCreate").addEventListener("click", () => openDialog());
document.querySelector("#closeDialog").addEventListener("click", () => dialog.close());
document.querySelector("#cancelDialog").addEventListener("click", () => dialog.close());
document.querySelector("#signOut").addEventListener("click", () => {
  state.session = null;
  state.mode = "admin";
  saveState();
  loginForm.reset();
  render();
});
document.querySelector("#copyClientLink").addEventListener("click", async () => {
  const project = activeProject();
  if (!project) {
    showToast("Open a project before copying a review link");
    return;
  }
  const link = `${location.origin}${location.pathname}#review/${project.id}`;
  await navigator.clipboard?.writeText(link);
  showToast("Review link copied");
});

setLoginRole("client");
render();
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !state.session) startLoginReel();
});
