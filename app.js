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
};

const storeKey = "validate-delivery-portal-empty-v2";
const state = loadState();
state.session ??= null;
const root = document.querySelector("#viewRoot");
const pageTitle = document.querySelector("#pageTitle");
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

function loadState() {
  if (new URLSearchParams(window.location.search).has("reset")) {
    localStorage.removeItem(storeKey);
    history.replaceState(null, "", location.pathname);
  }
  const saved = localStorage.getItem(storeKey);
  return saved ? JSON.parse(saved) : structuredClone(seedData);
}

function saveState() {
  localStorage.setItem(storeKey, JSON.stringify(state));
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

  const roleLabel = state.session.role === "admin" ? "Admin" : "Client";
  sessionLabel.textContent = `${roleLabel} view`;
  document.querySelector("#toggleMode").hidden = state.session.role !== "admin";
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
  passwordField.hidden = !isAdmin;
  passwordField.querySelector("input").required = false;
  accessCodeField.hidden = isAdmin;
  accessCodeField.querySelector("input").required = false;
  loginSubmit.textContent = isAdmin ? "Sign in as admin" : "Open review";
  adminAccess.textContent = isAdmin ? "Back to client review" : "Admin access";
  document.querySelector(".login-panel .eyebrow").textContent = isAdmin
    ? "Admin delivery portal"
    : "Client review portal";
  document.querySelector(".login-panel h1").textContent = isAdmin
    ? "Manage delivery."
    : "Review the latest cut.";
  document.querySelector(".login-copy").textContent = isAdmin
    ? "Manage clients, projects, video versions, notes, notifications, and approvals from one clean workspace."
    : "Open your project, watch the current version, leave notes, and approve the final film when it is ready.";
}

function completeLogin() {
  const form = new FormData(loginForm);
  const role = loginRole === "client" ? "client" : "admin";
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
    const response = await fetch("/api/send-review-email", {
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
  const response = await fetch("/api/create-bunny-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Bunny upload could not start");
  return result;
}

function uploadToBunny(file, credentials, onProgress) {
  const tusClient = window.tus;
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
    renderClientReview();
    return;
  }

  if (route === "activity") renderActivity();
  else if (route === "settings") renderSettings();
  else renderClients();
}

function renderClients() {
  pageTitle.textContent = "Clients";
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
          return `
            <article class="card">
              <p class="eyebrow">${client.contact}</p>
              <h3>${client.name}</h3>
              <p>${client.summary}</p>
              <div class="card-footer">
                <span class="metric">${projects.length} projects</span>
                <button class="ghost-button" data-client="${client.id}">Open</button>
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
}

function renderProjects() {
  const client = activeClient();
  if (!client) {
    renderClients();
    return;
  }

  pageTitle.textContent = client.name;
  document.querySelector("#openCreate").textContent = "New project";
  createIntent = "project";
  const projects = state.projects.filter((project) => project.clientId === client.id && !project.archived);

  root.innerHTML = `
    <div class="stack">
      <div class="panel">
        <p class="eyebrow">Client</p>
        <h3>${client.name}</h3>
        <p class="muted">${client.summary}</p>
      </div>
      ${
        projects.length
          ? projects
              .map(
                (project) => `
                  <div class="list-row">
                    <div>
                      <h3>${project.name}</h3>
                      <p class="muted">${project.description}</p>
                    </div>
                    <div class="inline-actions">
                      <span class="status-pill ${project.status === "approved" ? "approved" : ""}">${project.status}</span>
                      <button class="ghost-button" data-project="${project.id}">Open</button>
                      <button class="ghost-button" data-archive-project="${project.id}">Archive</button>
                    </div>
                  </div>
                `,
              )
              .join("")
          : `<div class="empty">No active projects yet.</div>`
      }
    </div>
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
  const project = activeProject();
  if (!project) {
    renderClients();
    return;
  }

  const client = state.clients.find((item) => item.id === project.clientId);
  const videos = state.videos.filter((video) => video.projectId === project.id);
  pageTitle.textContent = project.name;
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
                  </div>
                  <div class="inline-actions">
                    <span class="status-pill ${video.status === "approved" ? "approved" : ""}">${video.status}</span>
                    <button class="ghost-button" data-video="${video.id}">Review</button>
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      </section>
      <aside class="panel stack">
        <p class="eyebrow">Delivery actions</p>
        <button class="primary-button" id="sendClient">Send latest to client</button>
        <button class="ghost-button" id="addVersion">Upload new version</button>
        <button class="ghost-button" id="backProjects">Back to client</button>
        <p class="muted">Uploads can be routed to Bunny Stream or Vimeo. This prototype stores the review workflow locally until API keys are connected.</p>
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

function renderClientReview() {
  renderReviewShell(false);
}

function renderReviewShell(isAdmin) {
  const video = activeVideo();
  if (!video) {
    pageTitle.textContent = isAdmin ? "Review" : "Client review";
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
  pageTitle.textContent = isAdmin ? video.title : project.name;
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
              : `<div class="play-badge">PLAY</div>`
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
              : `<p class="muted">No comments yet.</p>`
          }
          <form class="comment-form" id="commentForm">
            <textarea name="body" placeholder="Add a note for this version"></textarea>
            <button class="primary-button">Add comment</button>
          </form>
        </div>
      </section>
      <aside class="panel stack">
        <p class="eyebrow">Version history</p>
        ${versions
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
          .join("")}
        <button class="primary-button" id="approveVersion">${version?.approved ? "Approved" : "Mark approved"}</button>
        ${isAdmin ? `<button class="ghost-button" id="backProject">Back to project</button>` : ""}
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
}

function renderActivity() {
  pageTitle.textContent = "Activity";
  document.querySelector("#openCreate").textContent = "New client";
  root.innerHTML = `
    <div class="panel stack">
      <p class="eyebrow">Recent</p>
      ${state.activity.map((item) => `<div class="list-row"><span>${item}</span><span class="muted">Now</span></div>`).join("")}
    </div>
  `;
}

function renderSettings() {
  pageTitle.textContent = "Settings";
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
      state.videos.unshift({
        id: slug(title) || `video-${nowId}`,
        projectId: activeProject().id,
        title,
        status: "draft",
        due: form.get("due") || "Soon",
      });
    }

    if (createIntent === "version") {
      const file = form.get("file");
      const label = form.get("label") || "New version";
      const provider = form.get("provider") || "Bunny Stream";
      let embedUrl = form.get("embedUrl") || "";
      let bunnyVideoId = "";

      if (file?.size) {
        const upload = await uploadVersionFileToBunny({
          file,
          title: `${activeVideo().title} - ${label}`,
          button: saveButton,
        });
        embedUrl = upload.embedUrl;
        bunnyVideoId = upload.videoId;
      }

      state.versions.unshift({
        id: `version-${nowId}`,
        videoId: activeVideo().id,
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
document.querySelector("#toggleMode").addEventListener("click", () => {
  state.mode = state.mode === "admin" ? "client" : "admin";
  document.querySelector("#toggleMode").textContent =
    state.mode === "admin" ? "Client preview" : "Admin view";
  saveState();
  render();
});
document.querySelector("#copyClientLink").addEventListener("click", async () => {
  const link = `${location.origin}${location.pathname}#review/${activeProject()?.id}`;
  await navigator.clipboard?.writeText(link);
  showToast("Review link copied");
});

setLoginRole("client");
render();
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !state.session) startLoginReel();
});
