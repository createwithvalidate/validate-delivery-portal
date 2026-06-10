const seedData = {
  mode: "admin",
  session: null,
  clientAccount: null,
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
const supabaseUrl = "https://axvnifoamejuxxqhezwr.supabase.co";
const supabasePublishableKey = "sb_publishable_IFOVI5nvp8DdOeqAs4lNsg__Iewd4BN";
const firstAdminEmail = "henry@createwithvalidate.com";
const state = loadState();
state.session ??= null;
state.clientAccount ??= null;
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
const nameField = document.querySelector("#nameField");
const inviteCodeField = document.querySelector("#inviteCodeField");
const authModeToggle = document.querySelector("#authModeToggle");
const accessCodeField = document.querySelector("#accessCodeField");
const adminAccess = document.querySelector("#adminAccess");
const sessionLabel = document.querySelector("#sessionLabel");
const dialog = document.querySelector("#createDialog");
const dialogTitle = document.querySelector("#dialogTitle");
const dialogFields = document.querySelector("#dialogFields");
const createForm = document.querySelector("#createForm");
const createSubmit = document.querySelector("#createSubmit");
const toast = document.querySelector("#toast");

let route = "clients";
let currentView = "clients";
let createIntent = "client";
let loginRole = "client";
let authMode = "signin";
let reelKeepalive = null;
let backgroundRotation = null;
let dashboardBackgroundRotation = null;
let syncInterval = null;
let isSyncing = false;
let syncPaused = false;
let isSavingCreateForm = false;
const loginBackgroundCount = 9;
const dashboardBackgroundCount = 5;
const loginReelSources = [
  "https://createwithvalidate.com/videos/header-loop-2.mp4",
  "https://createwithvalidate.com/videos/fishing-loop.mp4",
];
let supabaseClient = null;

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

function getSupabase() {
  if (supabaseClient) return supabaseClient;
  if (!window.supabase?.createClient) return null;
  supabaseClient = window.supabase.createClient(supabaseUrl, supabasePublishableKey);
  return supabaseClient;
}

async function signInWithSupabase(email, password) {
  const client = getSupabase();
  if (!client) return null;
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const user = data?.user || null;
  if (!user) return null;
  return {
    user,
    profile: await getCurrentProfile(user),
  };
}

async function createInviteAccount({ email, password, fullName, inviteCode }) {
  const client = getSupabase();
  if (!client) throw new Error("Supabase is still loading. Try again in a moment.");
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        invite_code: inviteCode,
      },
    },
  });
  if (error) throw error;
  return data?.user || null;
}

async function getCurrentProfile(user) {
  const client = getSupabase();
  if (!client || !user) return null;
  const { data, error } = await client
    .from("profiles")
    .select("email, full_name, role")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  return (
    data || {
      email: user.email,
      full_name: user.user_metadata?.full_name || user.email,
      role: user.email?.toLowerCase() === firstAdminEmail ? "admin" : "client",
    }
  );
}

function applyAccountSession(user, profile) {
  const role = profile?.role === "admin" ? "admin" : "client";
  state.session = {
    role,
    email: user.email,
  };
  state.mode = role;
  state.clientAccount =
    role === "client"
      ? {
          id: `account-${user.id}`,
          name: profile?.full_name || user.user_metadata?.full_name || "Client Account",
          contact: profile?.full_name || user.email,
          email: user.email,
          summary: "Projects appear here after Validate sends a review.",
          archived: false,
        }
      : null;
  route = "clients";
}

async function restoreSupabaseSession() {
  const client = getSupabase();
  if (!client) return false;
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) return false;
  const profile = await getCurrentProfile(data.user);
  applyAccountSession(data.user, profile);
  await loadPortalDataFromSupabase();
  saveState();
  return true;
}

function mapClientRow(row) {
  return {
    id: row.id,
    name: row.name,
    contact: row.contact || "",
    email: row.email || "",
    summary: row.summary || "",
    archived: Boolean(row.archived),
  };
}

function mapProjectRow(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    description: row.description || "",
    status: row.status || "review",
    archived: Boolean(row.archived),
  };
}

function mapVideoRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    status: row.status || "draft",
    due: row.due || "Soon",
  };
}

function mapVersionRow(row) {
  return {
    id: row.id,
    videoId: row.video_id,
    label: row.label,
    provider: row.provider || "Bunny Stream",
    embedUrl: row.embed_url || "",
    bunnyVideoId: row.bunny_video_id || "",
    note: row.note || "",
    createdAt: row.created_at_label || "Just now",
    approved: Boolean(row.approved),
  };
}

function mapCommentRow(row) {
  return {
    id: row.id,
    versionId: row.version_id,
    author: row.author,
    role: row.role,
    body: row.body,
    createdAt: row.created_at_label || "Just now",
  };
}

async function loadPortalDataFromSupabase() {
  const client = getSupabase();
  if (!client) return false;
  const { data: userData } = await client.auth.getUser();
  if (!userData?.user) return false;

  const [
    clientsResult,
    projectsResult,
    videosResult,
    versionsResult,
    commentsResult,
    accessResult,
  ] = await Promise.all([
    client.from("clients").select("*").order("created_at", { ascending: false }),
    client.from("projects").select("*").order("created_at", { ascending: false }),
    client.from("videos").select("*").order("created_at", { ascending: false }),
    client.from("video_versions").select("*").order("created_at", { ascending: false }),
    client.from("comments").select("*").order("created_at", { ascending: false }),
    client.from("project_access").select("*"),
  ]);

  const error =
    clientsResult.error ||
    projectsResult.error ||
    videosResult.error ||
    versionsResult.error ||
    commentsResult.error ||
    accessResult.error;
  if (error) throw error;

  state.clients = (clientsResult.data || []).map(mapClientRow);
  state.projects = (projectsResult.data || []).map(mapProjectRow);
  state.videos = (videosResult.data || []).map(mapVideoRow);
  state.versions = (versionsResult.data || []).map(mapVersionRow);
  state.comments = (commentsResult.data || []).map(mapCommentRow);
  state.deliveredProjectIds = [...new Set((accessResult.data || []).map((row) => row.project_id))];
  saveState();
  return true;
}

async function persistPortalDataToSupabase() {
  const client = getSupabase();
  if (!client) throw new Error("Supabase is not available yet.");
  const { data: userData } = await client.auth.getUser();
  if (!userData?.user) throw new Error("Sign in again before saving.");
  if (state.session?.role !== "admin") {
    throw new Error("Only admins can save clients, projects, and video setup.");
  }

  const runSave = async (request, label) => {
    const { error } = await request;
    if (error) throw new Error(`${label} did not save: ${error.message}`);
  };

  if (state.clients.length) {
    await runSave(
      client.from("clients").upsert(
        state.clients.map((item) => ({
          id: item.id,
          name: item.name,
          contact: item.contact || null,
          email: item.email || null,
          summary: item.summary || null,
          archived: Boolean(item.archived),
        })),
      ),
      "Clients",
    );
  }
  if (state.projects.length) {
    await runSave(
      client.from("projects").upsert(
        state.projects.map((item) => ({
          id: item.id,
          client_id: item.clientId,
          name: item.name,
          description: item.description || null,
          status: item.status || "review",
          archived: Boolean(item.archived),
        })),
      ),
      "Projects",
    );
  }
  if (state.videos.length) {
    await runSave(
      client.from("videos").upsert(
        state.videos.map((item) => ({
          id: item.id,
          project_id: item.projectId,
          title: item.title,
          status: item.status || "draft",
          due: item.due || null,
        })),
      ),
      "Videos",
    );
  }
  if (state.versions.length) {
    await runSave(
      client.from("video_versions").upsert(
        state.versions.map((item) => ({
          id: item.id,
          video_id: item.videoId,
          label: item.label,
          provider: item.provider || "Bunny Stream",
          embed_url: item.embedUrl || null,
          bunny_video_id: item.bunnyVideoId || null,
          note: item.note || null,
          created_at_label: item.createdAt || "Just now",
          approved: Boolean(item.approved),
        })),
      ),
      "Versions",
    );
  }
  if (state.comments.length) {
    await runSave(
      client.from("comments").upsert(
        state.comments.map((item) => ({
          id: item.id,
          version_id: item.versionId,
          author: item.author,
          role: item.role,
          body: item.body,
          created_at_label: item.createdAt || "Just now",
        })),
      ),
      "Comments",
    );
  }
  if (state.deliveredProjectIds.length) {
    const accessRows = state.deliveredProjectIds
      .map((projectId) => {
        const project = state.projects.find((item) => item.id === projectId);
        const clientRecord = state.clients.find((item) => item.id === project?.clientId);
        if (!clientRecord?.email) return null;
        return { project_id: projectId, email: clientRecord.email };
      })
      .filter(Boolean);
    if (accessRows.length) {
      await runSave(client.from("project_access").upsert(accessRows), "Project access");
    }
  }

  return true;
}

async function insertCommentInSupabase(comment) {
  const client = getSupabase();
  if (!client) throw new Error("Supabase is not available yet.");
  const { data: userData } = await client.auth.getUser();
  if (!userData?.user) throw new Error("Sign in again before saving.");
  const { error } = await client.from("comments").insert({
    id: comment.id,
    version_id: comment.versionId,
    author: comment.author,
    role: comment.role,
    body: comment.body,
    created_at_label: comment.createdAt || "Just now",
  });
  if (error) throw new Error(`Comment did not save: ${error.message}`);
}

async function saveApprovalInSupabase(version) {
  const client = getSupabase();
  if (!client) throw new Error("Supabase is not available yet.");
  const { data: userData } = await client.auth.getUser();
  if (!userData?.user) throw new Error("Sign in again before saving.");
  const { error } = await client
    .from("video_versions")
    .update({ approved: Boolean(version.approved) })
    .eq("id", version.id);
  if (error) throw new Error(`Approval did not save: ${error.message}`);
}

async function savePortalData() {
  saveState();
  await persistPortalDataToSupabase();
}

async function syncPortalData({ announce = false, rerender = true } = {}) {
  if (!state.session || isSyncing || syncPaused) return false;
  isSyncing = true;
  const previousSelection = {
    selectedClientId: state.selectedClientId,
    selectedProjectId: state.selectedProjectId,
    selectedVideoId: state.selectedVideoId,
  };

  try {
    await loadPortalDataFromSupabase();
    state.selectedClientId = state.clients.some((client) => client.id === previousSelection.selectedClientId)
      ? previousSelection.selectedClientId
      : state.clients[0]?.id || "";
    state.selectedProjectId = state.projects.some((project) => project.id === previousSelection.selectedProjectId)
      ? previousSelection.selectedProjectId
      : state.projects.find((project) => project.clientId === state.selectedClientId)?.id || "";
    state.selectedVideoId = state.videos.some((video) => video.id === previousSelection.selectedVideoId)
      ? previousSelection.selectedVideoId
      : state.videos.find((video) => video.projectId === state.selectedProjectId)?.id || "";
    saveState();
    if (rerender) renderCurrentView();
    if (announce) showToast("Synced");
    return true;
  } catch (error) {
    console.warn("Supabase sync failed", error);
    if (announce) showToast(error.message || "Sync failed");
    return false;
  } finally {
    isSyncing = false;
  }
}

function startCrossDeviceSync() {
  window.clearInterval(syncInterval);
  if (!state.session) return;
  syncInterval = window.setInterval(() => {
    if (!document.hidden) syncPortalData({ rerender: true });
  }, 7000);
}

function stopCrossDeviceSync() {
  window.clearInterval(syncInterval);
  syncInterval = null;
}

async function saveAndReloadPortalData() {
  await savePortalData();
  await loadPortalDataFromSupabase();
  saveState();
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

function renderCurrentView() {
  if (!state.session) {
    render();
    return;
  }

  if (state.mode === "client") {
    if (currentView === "clientReview" && state.selectedVideoId) renderClientReview();
    else renderClientDashboard();
    return;
  }

  if (currentView === "adminReview" && state.selectedVideoId) renderAdminReview();
  else if (currentView === "projectDetail" && state.selectedProjectId) renderProjectDetail();
  else if (currentView === "projects" && state.selectedClientId) renderProjects();
  else if (currentView === "activity") renderActivity();
  else if (currentView === "settings") renderSettings();
  else renderClients();
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

function activeClientAccount() {
  if (state.mode !== "client") return activeClient();
  return (
    state.clients.find((client) => client.email?.toLowerCase() === state.session?.email?.toLowerCase()) ||
    state.clientAccount
  );
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
  authMode = "signin";
  setAuthMode(authMode);

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

function setAuthMode(nextMode) {
  authMode = nextMode;
  const isCreate = authMode === "signup";
  if (nameField) nameField.hidden = !isCreate;
  if (inviteCodeField) inviteCodeField.hidden = !isCreate;
  if (authModeToggle) authModeToggle.textContent = isCreate ? "Back to sign in" : "Create account from invite";
  loginSubmit.textContent =
    isCreate
      ? "Create account"
      : loginRole === "admin"
        ? "Sign in as admin"
        : "Sign in";
  document.querySelector(".login-panel .eyebrow").textContent = isCreate
    ? "Invite-only beta"
    : loginRole === "admin"
      ? "Admin delivery portal"
      : "Client review portal";
  document.querySelector(".login-panel h1").textContent = isCreate
    ? "Create review account."
    : loginRole === "admin"
      ? "Manage delivery."
      : "Review the latest cut.";
  document.querySelector(".login-copy").textContent = isCreate
    ? "Create your account from an invitation. Projects appear after Validate sends a review."
    : loginRole === "admin"
      ? "Manage clients, projects, video versions, notes, notifications, and approvals from one clean workspace."
      : "Sign in to your review dashboard to see projects, versions, notes, and approvals.";
}

async function completeSignup(form) {
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "").trim();
  const fullName = String(form.get("fullName") || "").trim();
  const inviteCode = String(form.get("inviteCode") || "").trim();
  if (!email || !password || !fullName || !inviteCode) {
    showToast("Name, email, password, and invite code are required");
    return;
  }

  await createInviteAccount({ email, password, fullName, inviteCode });
  showToast("Account created. Check email if confirmation is required.");
  setAuthMode("signin");
}

async function completeLogin() {
  const form = new FormData(loginForm);
  if (authMode === "signup") {
    try {
      await completeSignup(form);
    } catch (error) {
      showToast(error.message || "Account could not be created");
    }
    return;
  }

  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "").trim();

  try {
    const session = await signInWithSupabase(email, password);
    if (session?.user) {
      const { user, profile } = session;
      applyAccountSession(user, profile);
      await loadPortalDataFromSupabase();
      saveState();
      showToast(`Signed in as ${state.session.role}`);
      render();
      startCrossDeviceSync();
      await openReviewFromHash({ showMissingMessage: true });
      return;
    }
  } catch (error) {
    showToast(error.message || "Email or password did not match");
    return;
  }
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

function reviewProjectIdFromHash() {
  const match = location.hash.match(/^#review\/(.+)$/);
  return match ? decodeURIComponent(match[1]) : "";
}

async function openReviewFromHash({ showMissingMessage = false } = {}) {
  const projectId = reviewProjectIdFromHash();
  if (!projectId || !state.session) return false;

  try {
    await loadPortalDataFromSupabase();
  } catch (error) {
    console.warn("Supabase review link load failed", error);
  }

  const project = state.projects.find((item) => item.id === projectId && !item.archived);
  if (!project) {
    if (showMissingMessage) showToast("Review is not available for this account yet");
    render();
    return false;
  }

  const video = projectVideos(project.id)[0];
  state.selectedClientId = project.clientId;
  state.selectedProjectId = project.id;
  state.selectedVideoId = video?.id || "";
  saveState();

  if (state.mode === "client") {
    if (!state.deliveredProjectIds.includes(project.id)) {
      if (showMissingMessage) showToast("Review is not available for this account yet");
      renderClientDashboard();
      return false;
    }
    if (!video) {
      if (showMissingMessage) showToast("No video is ready for this project yet");
      renderClientDashboard();
      return false;
    }
    renderClientReview();
    return true;
  }

  renderProjectDetail();
  return true;
}

async function deleteClient(clientId) {
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
  try {
    const supabase = getSupabase();
    const { data: userData } = supabase ? await supabase.auth.getUser() : { data: {} };
    if (userData?.user) await supabase.from("clients").delete().eq("id", clientId);
  } catch (error) {
    console.warn("Supabase delete failed", error);
    showToast("Deleted locally. Supabase did not delete yet.");
  }
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
  button.textContent = "Saving access...";

  try {
    if (!state.deliveredProjectIds.includes(project.id)) state.deliveredProjectIds.push(project.id);
    await savePortalData();

    button.textContent = "Sending...";
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

    state.activity.unshift(`Sent ${version.label} for ${video.title} to ${client.email}`);
    await savePortalData();
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
    const formatUploadError = (error) => {
      const status = error?.originalResponse?.getStatus?.();
      const body = error?.originalResponse?.getBody?.();
      const detail = [status ? `status ${status}` : "", body].filter(Boolean).join(": ");
      return new Error(detail ? `Bunny upload failed (${detail})` : error?.message || "Bunny upload failed");
    };

    const upload = new tusClient.Upload(file, {
      endpoint: credentials.endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000, 60000, 60000],
      removeFingerprintOnSuccess: true,
      headers: {
        AuthorizationSignature: credentials.signature,
        AuthorizationExpire: String(credentials.expirationTime),
        VideoId: credentials.videoId,
        LibraryId: String(credentials.libraryId),
      },
      metadata: {
        filetype: file.type || "video/mp4",
        title: credentials.title || file.name,
      },
      onError: (error) => reject(formatUploadError(error)),
      onProgress: (bytesUploaded, bytesTotal) => {
        const percent = bytesTotal ? Math.round((bytesUploaded / bytesTotal) * 100) : 0;
        onProgress(percent);
      },
      onSuccess: () => resolve(credentials),
    });

    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length) upload.resumeFromPreviousUpload(previousUploads[0]);
      upload.start();
    }).catch((error) => reject(formatUploadError(error)));
  });
}

async function uploadVersionFileToBunny({ file, title, button }) {
  button.textContent = "Creating Bunny video...";
  const credentials = await createBunnyUploadCredentials({ title });
  credentials.title = title;
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
  currentView = "clients";
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
  currentView = "projects";
  dashboardHero.hidden = true;
  const client = activeClient();
  if (!client) {
    renderClients();
    return;
  }

  setPageHeader(client.name, client.contact || "Projects", "client");
  document.querySelector("#openCreate").textContent = "New project";
  createIntent = "project";
  const projects = state.projects.filter((project) => project.clientId === client.id && !project.archived);

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
    button.addEventListener("click", async () => {
      const project = state.projects.find((item) => item.id === button.dataset.archiveProject);
      if (!project) return;
      const wasArchived = project.archived;
      project.archived = true;
      try {
        await savePortalData();
        showToast("Project archived");
        renderProjects();
      } catch (error) {
        project.archived = wasArchived;
        saveState();
        showToast(error.message);
        renderProjects();
      }
    });
  });
}

function renderProjectDetail() {
  currentView = "projectDetail";
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
  currentView = "adminReview";
  renderReviewShell(true);
}

function renderClientDashboard() {
  currentView = "clientDashboard";
  dashboardHero.hidden = true;
  const client = activeClientAccount();
  if (!client) {
    setPageHeader("Client dashboard");
    document.querySelector("#openCreate").hidden = true;
    root.innerHTML = `<div class="empty">No client account is loaded.</div>`;
    return;
  }

  const projects = state.projects.filter(
    (project) =>
      project.clientId === client.id &&
      !project.archived &&
      state.deliveredProjectIds.includes(project.id),
  );
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
  currentView = "clientReview";
  renderReviewShell(false);
}

function renderReviewShell(isAdmin) {
  currentView = isAdmin ? "adminReview" : "clientReview";
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

  root.querySelector("#commentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = new FormData(event.currentTarget).get("body").trim();
    if (!body || !version) return;
    const comment = {
      id: `comment-${Date.now()}`,
      versionId: version.id,
      author: isAdmin ? "Validate" : "Client",
      role: isAdmin ? "admin" : "client",
      body,
      createdAt: "Just now",
    };
    state.comments.unshift(comment);
    try {
      if (isAdmin) await savePortalData();
      else {
        saveState();
        await insertCommentInSupabase(comment);
      }
      renderReviewShell(isAdmin);
    } catch (error) {
      state.comments = state.comments.filter((item) => item.id !== comment.id);
      saveState();
      showToast(error.message);
      renderReviewShell(isAdmin);
    }
  });

  root.querySelector("#approveVersion").addEventListener("click", async () => {
    if (!version) return;
    const wasApproved = version.approved;
    const previousStatus = video.status;
    version.approved = true;
    video.status = "approved";
    try {
      if (isAdmin) await savePortalData();
      else {
        saveState();
        await saveApprovalInSupabase(version);
      }
      showToast("Version marked approved");
      renderReviewShell(isAdmin);
    } catch (error) {
      version.approved = wasApproved;
      video.status = previousStatus;
      saveState();
      showToast(error.message);
      renderReviewShell(isAdmin);
    }
  });

  const back = root.querySelector("#backProject");
  if (back) back.addEventListener("click", renderProjectDetail);
  const backClientDashboard = root.querySelector("#backClientDashboard");
  if (backClientDashboard) backClientDashboard.addEventListener("click", renderClientDashboard);
}

function renderActivity() {
  currentView = "activity";
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
  currentView = "settings";
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
  if (createSubmit) {
    createSubmit.textContent = intent === "version" ? "Upload version" : "Save";
  }

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
  event.stopPropagation();
  if (isSavingCreateForm) return;
  isSavingCreateForm = true;
  const form = new FormData(createForm);
  const nowId = Date.now();
  const saveButton = createForm.querySelector('button[type="submit"]');
  const originalSaveText = saveButton.textContent;
  const previousData = {
    clients: structuredClone(state.clients),
    projects: structuredClone(state.projects),
    videos: structuredClone(state.videos),
    versions: structuredClone(state.versions),
    comments: structuredClone(state.comments),
    deliveredProjectIds: structuredClone(state.deliveredProjectIds),
    selectedClientId: state.selectedClientId,
    selectedProjectId: state.selectedProjectId,
    selectedVideoId: state.selectedVideoId,
  };
  saveButton.disabled = true;
  saveButton.textContent = createIntent === "version" ? "Starting upload..." : "Saving...";
  syncPaused = true;

  try {
    if (createIntent === "client") {
      const name = form.get("name") || "New Client";
      state.clients.push({
        id: `${slug(name) || "client"}-${nowId}`,
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
        id: `${slug(name) || "project"}-${nowId}`,
        clientId: activeClient().id,
        name,
        status: form.get("status") || "review",
        description: form.get("description") || "Video delivery project.",
        archived: false,
      });
    }

    if (createIntent === "video") {
      const title = form.get("title") || "New Video";
      const videoId = `${slug(title) || "video"}-${nowId}`;
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
      let video =
        state.videos.find((item) => item.id === state.selectedVideoId && item.projectId === project?.id) ||
        state.videos.find((item) => item.projectId === project?.id);
      if (!video) {
        if (!project) throw new Error("Open a project before uploading");
        const title = project.name || "New Video";
        const videoId = `${slug(title) || "video"}-${nowId}`;
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

      if (!file?.size && !embedUrl.trim()) {
        throw new Error("Choose a video file or paste an embed URL before saving a version");
      }

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

    saveButton.textContent = "Saving version...";
    await saveAndReloadPortalData();
    dialog.close();
    createForm.reset();
    showToast(createIntent === "version" ? "Version uploaded" : "Saved");
    if (createIntent === "project") renderProjects();
    else if (createIntent === "video") renderProjectDetail();
    else if (createIntent === "version") renderReviewShell(state.mode === "admin");
    else renderClients();
  } catch (error) {
    state.clients = previousData.clients;
    state.projects = previousData.projects;
    state.videos = previousData.videos;
    state.versions = previousData.versions;
    state.comments = previousData.comments;
    state.deliveredProjectIds = previousData.deliveredProjectIds;
    state.selectedClientId = previousData.selectedClientId;
    state.selectedProjectId = previousData.selectedProjectId;
    state.selectedVideoId = previousData.selectedVideoId;
    saveState();
    showToast(error.message);
    render();
  } finally {
    syncPaused = false;
    isSavingCreateForm = false;
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
authModeToggle?.addEventListener("click", () => {
  setAuthMode(authMode === "signup" ? "signin" : "signup");
});

document.querySelector("#openCreate").addEventListener("click", () => openDialog());
document.querySelector("#closeDialog").addEventListener("click", () => dialog.close());
document.querySelector("#cancelDialog").addEventListener("click", () => dialog.close());
document.querySelector("#signOut").addEventListener("click", async () => {
  try {
    await getSupabase()?.auth.signOut();
  } catch (error) {
    console.warn("Supabase sign out failed", error);
  }
  state.session = null;
  state.mode = "admin";
  state.clientAccount = null;
  stopCrossDeviceSync();
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

async function bootPortal() {
  setLoginRole("client");
  try {
    const restored = await restoreSupabaseSession();
    if (!restored && state.session) {
      state.session = null;
      state.mode = "admin";
      state.clientAccount = null;
      stopCrossDeviceSync();
      saveState();
    }
    if (restored) startCrossDeviceSync();
  } catch (error) {
    console.warn("Supabase startup load failed", error);
    showToast(error.message || "Could not load saved portal data");
  }
  render();
  openReviewFromHash({ showMissingMessage: false });
}

bootPortal();
window.addEventListener("hashchange", () => {
  openReviewFromHash({ showMissingMessage: true });
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !state.session) startLoginReel();
  if (!document.hidden && state.session) syncPortalData({ rerender: true });
});
window.addEventListener("focus", () => {
  syncPortalData({ rerender: true });
});
