const seedData = {
  mode: "admin",
  session: null,
  clientAccount: null,
  selectedClientId: "",
  selectedProjectId: "",
  selectedVideoId: "",
  selectedVersionId: "",
  currentView: "clients",
  route: "clients",
  clients: [],
  projects: [],
  videos: [],
  versions: [],
  comments: [],
  activity: [],
  deliveredProjectIds: [],
  accountDirectory: [],
  portalMeta: null,
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
state.accountDirectory ??= [];
state.portalMeta ??= null;
state.selectedVersionId ??= "";
state.currentView ??= "clients";
state.route ??= "clients";
state.portalLoading ??= false;
const root = document.querySelector("#viewRoot");
const pageTitle = document.querySelector("#pageTitle");
const pageEyebrow = document.querySelector(".topbar .eyebrow");
const topbar = document.querySelector(".topbar");
const loginScreen = document.querySelector("#loginScreen");
const appShell = document.querySelector("#appShell");
const dashboardHero = document.querySelector("#dashboardHero");
const heroEyebrow = document.querySelector("#heroEyebrow");
const heroHeadline = document.querySelector("#heroHeadline");
const heroSubcopy = document.querySelector("#heroSubcopy");
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

let route = state.route || "clients";
let currentView = state.currentView || "clients";
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
let lastPortalFingerprint = "";
let authListenerReady = false;
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

function withTimeout(promise, message = "Request took too long", timeoutMs = 9000) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

function normalizeEmail(value = "") {
  return String(value).trim().toLowerCase();
}

function clientEmails(clientOrValue = "") {
  const value = typeof clientOrValue === "string" ? clientOrValue : clientOrValue?.email;
  return [
    ...new Set(
      String(value || "")
        .split(/[,;\n]+/)
        .map(normalizeEmail)
        .filter(Boolean),
    ),
  ];
}

function clientEmailLabel(client) {
  const emails = clientEmails(client);
  if (!emails.length) return "No accounts";
  if (emails.length === 1) return emails[0];
  return `${emails[0]} + ${emails.length - 1} more`;
}

function clientAccountCountLabel(client) {
  const count = clientEmails(client).length;
  return `${count} client account${count === 1 ? "" : "s"}`;
}

function clientMatchesSession(client) {
  const sessionEmail = normalizeEmail(state.session?.email);
  return Boolean(sessionEmail && clientEmails(client).includes(sessionEmail));
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function rememberView(view) {
  currentView = view;
  state.currentView = view;
  saveState();
}

function getSupabase() {
  if (supabaseClient) return supabaseClient;
  if (!window.supabase?.createClient) return null;
  supabaseClient = window.supabase.createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
      storage: window.localStorage,
      storageKey: "validate-supabase-auth",
    },
  });
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
    profile: fallbackProfileForUser(user),
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

function fallbackProfileForUser(user) {
  return {
    email: user.email,
    full_name: user.user_metadata?.full_name || user.email,
    role: user.email?.toLowerCase() === firstAdminEmail ? "admin" : "client",
  };
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
  state.route = "clients";
  rememberView(role === "client" ? "clientDashboard" : "clients");
}

function clearAccountSession() {
  state.session = null;
  state.mode = "admin";
  state.clientAccount = null;
  state.portalLoading = false;
  state.currentView = "clients";
  state.route = "clients";
  currentView = "clients";
  route = "clients";
  stopCrossDeviceSync();
  saveState();
}

function watchSupabaseAuth() {
  const client = getSupabase();
  if (!client || authListenerReady) return;
  authListenerReady = true;
  client.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      clearAccountSession();
      render();
    }
  });
}

async function restoreSupabaseSession() {
  const client = getSupabase();
  if (!client) return false;
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError || !sessionData?.session?.user) return false;

  const user = sessionData.session.user;
  const restoredView = state.currentView || "clients";
  const restoredRoute = state.route || "clients";
  applyAccountSession(user, fallbackProfileForUser(user));
  state.currentView = restoredView;
  state.route = restoredRoute;
  currentView = restoredView;
  route = restoredRoute;
  state.portalLoading = !state.clients.length && !state.projects.length && !state.videos.length;
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

function applyPortalRows({ clients = [], projects = [], videos = [], versions = [], comments = [], deliveredProjectIds = [], meta = null }) {
  state.clients = clients.map(mapClientRow);
  state.projects = projects.map(mapProjectRow);
  state.videos = videos.map(mapVideoRow);
  state.versions = versions.map(mapVersionRow);
  state.comments = comments.map(mapCommentRow);
  state.deliveredProjectIds = [...new Set(deliveredProjectIds)];
  state.portalMeta = {
    source: meta?.source || "server",
    email: meta?.email || state.session?.email || "",
    usingServiceRole: Boolean(meta?.usingServiceRole),
    accessCount: Number(meta?.accessCount ?? state.deliveredProjectIds.length),
    projectCount: Number(meta?.projectCount ?? projects.length),
    videoCount: Number(meta?.videoCount ?? videos.length),
    versionCount: Number(meta?.versionCount ?? versions.length),
    error: meta?.error || "",
  };
}

async function supabaseAccessToken() {
  const client = getSupabase();
  if (!client) return "";
  const { data } = await client.auth.getSession();
  return data?.session?.access_token || "";
}

async function loadAccountDirectory({ force = false } = {}) {
  if (state.session?.role !== "admin") return [];
  if (!force && state.accountDirectory?.length) return state.accountDirectory;

  const token = await supabaseAccessToken();
  if (!token) throw new Error("Sign in again before loading client accounts.");

  const response = await withTimeout(
    fetch(apiUrl("/api/account-directory"), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    }),
    "Client account list took too long.",
    7500,
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Could not load client accounts.");

  state.accountDirectory = (result.accounts || [])
    .map((account) => ({
      id: account.id || account.email,
      email: normalizeEmail(account.email),
      fullName: account.fullName || account.full_name || account.email,
      role: account.role || "client",
    }))
    .filter((account) => account.email);
  saveState();
  return state.accountDirectory;
}

async function loadPortalDataFromSupabase() {
  const client = getSupabase();
  if (!client) return false;
  if (!state.session) return false;

  if (state.session.role !== "admin") {
    return loadClientPortalDataFromSupabase(client);
  }

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

  applyPortalRows({
    clients: clientsResult.data || [],
    projects: projectsResult.data || [],
    videos: videosResult.data || [],
    versions: versionsResult.data || [],
    comments: commentsResult.data || [],
    deliveredProjectIds: (accessResult.data || []).map((row) => row.project_id),
  });
  state.portalLoading = false;
  saveState();
  return true;
}

async function loadClientPortalDataFromApi() {
  const token = await supabaseAccessToken();
  if (!token) throw new Error("Sign in again before loading the dashboard.");

  const response = await withTimeout(
    fetch(apiUrl("/api/client-portal"), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    }),
    "Client dashboard service took too long. Retrying with browser loading.",
    9000,
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Client dashboard could not load.");

  applyPortalRows(result);
  if (!state.clients.length && state.projects.length) {
    const fallbackClientIds = [...new Set(state.projects.map((project) => project.clientId).filter(Boolean))];
    state.clients = fallbackClientIds.map((clientId) => ({
      id: clientId,
      name: state.clientAccount?.name || "Client workspace",
      contact: state.clientAccount?.contact || state.session?.email || "Client",
      email: state.session?.email || "",
      summary: "Projects sent to this account.",
      archived: false,
    }));
  }
  state.portalLoading = false;
  saveState();
  return true;
}

async function loadClientPortalDataFromSupabase(client) {
  let apiErrorMessage = "";
  try {
    return await loadClientPortalDataFromApi();
  } catch (error) {
    apiErrorMessage = error.message || "Client portal API load failed.";
    console.warn("Client portal API load failed, falling back to browser Supabase", error);
    state.portalMeta = {
      source: "browser",
      email: state.session?.email || "",
      usingServiceRole: false,
      accessCount: 0,
      projectCount: 0,
      videoCount: 0,
      versionCount: 0,
      error: apiErrorMessage,
    };
  }

  const accessResult = await withTimeout(
    client.from("project_access").select("project_id,email").order("granted_at", { ascending: false }),
    "Could not load project invites. Please retry.",
    7000,
  );
  if (accessResult.error) throw accessResult.error;

  const projectIds = [...new Set((accessResult.data || []).map((row) => row.project_id).filter(Boolean))];

  let clientsResult = { data: [], error: null };
  let projectsResult = { data: [], error: null };
  let videosResult = { data: [], error: null };
  let versionsResult = { data: [], error: null };
  let commentsResult = { data: [], error: null };

  if (projectIds.length) {
    projectsResult = await withTimeout(
      client.from("projects").select("*").in("id", projectIds).order("created_at", { ascending: false }),
      "Could not load invited projects. Please retry.",
      7000,
    );
    if (projectsResult.error) throw projectsResult.error;

    const clientIds = [...new Set((projectsResult.data || []).map((row) => row.client_id).filter(Boolean))];
    if (clientIds.length) {
      clientsResult = await withTimeout(
        client.from("clients").select("*").in("id", clientIds).order("created_at", { ascending: false }),
        "Client details are taking too long.",
        2500,
      ).catch((error) => {
        console.warn("Client detail load skipped", error);
        return { data: [], error: null };
      });
    }

    videosResult = await withTimeout(
      client.from("videos").select("*").in("project_id", projectIds).order("created_at", { ascending: false }),
      "Could not load project videos. Please retry.",
      7000,
    );
    if (videosResult.error) throw videosResult.error;

    const videoIds = [...new Set((videosResult.data || []).map((row) => row.id).filter(Boolean))];
    if (videoIds.length) {
      versionsResult = await withTimeout(
        client.from("video_versions").select("*").in("video_id", videoIds).order("created_at", { ascending: false }),
        "Could not load video versions. Please retry.",
        7000,
      );
      if (versionsResult.error) throw versionsResult.error;

      const versionIds = [...new Set((versionsResult.data || []).map((row) => row.id).filter(Boolean))];
      if (versionIds.length) {
        commentsResult = await withTimeout(
          client.from("comments").select("*").in("version_id", versionIds).order("created_at", { ascending: false }),
          "Could not load comments. Please retry.",
          7000,
        );
        if (commentsResult.error) throw commentsResult.error;
      }
    }
  }

  state.clients = (clientsResult.data || []).map(mapClientRow);
  state.projects = (projectsResult.data || []).map(mapProjectRow);
  if (!state.clients.length && state.projects.length) {
    const fallbackClientIds = [...new Set(state.projects.map((project) => project.clientId).filter(Boolean))];
    state.clients = fallbackClientIds.map((clientId) => ({
      id: clientId,
      name: state.clientAccount?.name || "Client workspace",
      contact: state.clientAccount?.contact || state.session?.email || "Client",
      email: state.session?.email || "",
      summary: "Projects sent to this account.",
      archived: false,
    }));
  }
  state.videos = (videosResult.data || []).map(mapVideoRow);
  state.versions = (versionsResult.data || []).map(mapVersionRow);
  state.comments = (commentsResult.data || []).map(mapCommentRow);
  state.deliveredProjectIds = projectIds;
  state.portalMeta = {
    source: "browser",
    email: state.session?.email || "",
    usingServiceRole: false,
    accessCount: projectIds.length,
    projectCount: state.projects.length,
    videoCount: state.videos.length,
    versionCount: state.versions.length,
    error: apiErrorMessage,
  };
  state.portalLoading = false;
  saveState();
  return true;
}

async function refreshPortalData({ openHash = false, showMissingMessage = false } = {}) {
  try {
    await withTimeout(
      (async () => {
        await loadPortalDataFromSupabase();
      })(),
      "Workspace is taking too long to load. Please try again.",
      12000,
    );
    lastPortalFingerprint = portalFingerprint();
    saveState();
    render();
    if (openHash) {
      await openReviewFromHash({ showMissingMessage, reload: false });
    }
    return true;
  } catch (error) {
    state.portalLoading = false;
    if (state.session?.role !== "admin") {
      state.portalMeta = {
        ...(state.portalMeta || {}),
        email: state.session?.email || state.portalMeta?.email || "",
        error: error.message || "Could not load saved portal data",
      };
    }
    saveState();
    render();
    console.warn("Supabase data refresh failed", error);
    showToast(error.message || "Could not load saved portal data");
    return false;
  }
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
      .flatMap((projectId) => {
        const project = state.projects.find((item) => item.id === projectId);
        const clientRecord = state.clients.find((item) => item.id === project?.clientId);
        return clientEmails(clientRecord).map((email) => ({ project_id: projectId, email }));
      })
      .filter(Boolean);
    if (accessRows.length) {
      await runSave(client.from("project_access").upsert(accessRows), "Project access");
    }
  }

  return true;
}

async function insertCommentInSupabase(comment) {
  const token = await supabaseAccessToken();
  if (!token) throw new Error("Sign in again before saving.");
  const response = await fetch(apiUrl("/api/save-comment"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(comment),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Comment did not save.");
  return result.comment;
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
  const previousFingerprint = lastPortalFingerprint || portalFingerprint();
  const previousSelection = {
    selectedClientId: state.selectedClientId,
    selectedProjectId: state.selectedProjectId,
    selectedVideoId: state.selectedVideoId,
    selectedVersionId: state.selectedVersionId,
  };
  const isWatchingReview = currentView === "adminReview" || currentView === "clientReview";

  try {
    await loadPortalDataFromSupabase();
    if (state.mode === "client") {
      const deliveredIds = new Set(state.deliveredProjectIds);
      const invitedProjects = state.projects.filter((project) => !project.archived && deliveredIds.has(project.id));
      state.selectedClientId = activeClientAccount()?.id || state.clients[0]?.id || state.clientAccount?.id || "";
      state.selectedProjectId = invitedProjects.some((project) => project.id === previousSelection.selectedProjectId)
        ? previousSelection.selectedProjectId
        : invitedProjects[0]?.id || "";
      state.selectedVideoId = state.videos.some(
        (video) => video.id === previousSelection.selectedVideoId && video.projectId === state.selectedProjectId,
      )
        ? previousSelection.selectedVideoId
        : state.videos.find((video) => video.projectId === state.selectedProjectId)?.id || "";
      state.selectedVersionId = state.versions.some(
        (version) => version.id === previousSelection.selectedVersionId && version.videoId === state.selectedVideoId,
      )
        ? previousSelection.selectedVersionId
        : state.selectedVersionId;
    } else {
      state.selectedClientId = state.clients.some((client) => client.id === previousSelection.selectedClientId)
        ? previousSelection.selectedClientId
        : state.clients[0]?.id || "";
      state.selectedProjectId = state.projects.some((project) => project.id === previousSelection.selectedProjectId)
        ? previousSelection.selectedProjectId
        : state.projects.find((project) => project.clientId === state.selectedClientId)?.id || "";
      state.selectedVideoId = state.videos.some((video) => video.id === previousSelection.selectedVideoId)
        ? previousSelection.selectedVideoId
        : state.videos.find((video) => video.projectId === state.selectedProjectId)?.id || "";
      state.selectedVersionId = state.versions.some(
        (version) => version.id === previousSelection.selectedVersionId && version.videoId === state.selectedVideoId,
      )
        ? previousSelection.selectedVersionId
        : state.selectedVersionId;
    }
    const nextFingerprint = portalFingerprint();
    const hasChanged = nextFingerprint !== previousFingerprint;
    lastPortalFingerprint = nextFingerprint;
    saveState();
    if (rerender && hasChanged && !isWatchingReview) renderCurrentView();
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
  const previousSelection = {
    selectedClientId: state.selectedClientId,
    selectedProjectId: state.selectedProjectId,
    selectedVideoId: state.selectedVideoId,
  };
  await savePortalData();
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
  lastPortalFingerprint = portalFingerprint();
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
    else if (currentView === "clientProject" && state.selectedProjectId) renderClientProject();
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
  window.setTimeout(() => toast.classList.remove("show"), 4200);
}

function upsertById(collection, item) {
  const index = collection.findIndex((entry) => entry.id === item.id);
  if (index >= 0) collection[index] = { ...collection[index], ...item };
  else collection.unshift({ ...item });
}

function portalFingerprint() {
  return JSON.stringify({
    clients: state.clients,
    projects: state.projects,
    videos: state.videos,
    versions: state.versions,
    comments: state.comments,
    deliveredProjectIds: state.deliveredProjectIds,
  });
}

function activeClientAccount() {
  if (state.mode !== "client") return activeClient();
  return state.clients.find((client) => clientMatchesSession(client)) || state.clientAccount;
}

function currentCommentAuthor(isAdmin) {
  if (isAdmin) return state.session?.email || "Validate";
  const account = activeClientAccount();
  return account?.contact || account?.name || state.clientAccount?.name || state.session?.email || "Client";
}

function setRoute(nextRoute) {
  route = nextRoute;
  state.route = nextRoute;
  rememberView(nextRoute === "activity" || nextRoute === "settings" ? nextRoute : "clients");
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
  if (loginSubmit.disabled) return;
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
  const originalSubmitText = loginSubmit.textContent;
  loginSubmit.disabled = true;
  loginSubmit.textContent = "Signing in...";

  try {
    const session = await signInWithSupabase(email, password);
    if (session?.user) {
      const { user, profile } = session;
      applyAccountSession(user, profile);
      state.portalLoading = true;
      saveState();
      showToast(`Signed in as ${state.session.role}`);
      render();
      startCrossDeviceSync();
      refreshPortalData({ openHash: true, showMissingMessage: true });
      return;
    }
  } catch (error) {
    state.portalLoading = false;
    saveState();
    render();
    showToast(error.message || "Email or password did not match");
    return;
  } finally {
    loginSubmit.disabled = false;
    loginSubmit.textContent = originalSubmitText;
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

async function openReviewFromHash({ showMissingMessage = false, reload = true } = {}) {
  const projectId = reviewProjectIdFromHash();
  if (!projectId || !state.session) return false;

  if (reload) {
    try {
      await loadPortalDataFromSupabase();
      lastPortalFingerprint = portalFingerprint();
    } catch (error) {
      console.warn("Supabase review link load failed", error);
    }
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

function setHeroMode(mode, projects = []) {
  if (!dashboardHero) return;
  const isClient = mode === "client";
  dashboardHero.hidden = false;
  dashboardHero.classList.toggle("client-hero", isClient);
  dashboardHero.classList.toggle("admin-hero", !isClient);
  heroEyebrow.textContent = isClient ? "Client review" : "Delivery control";
  heroHeadline.textContent = isClient ? "Projects ready for review." : "Everything in motion.";
  heroSubcopy.textContent = isClient
    ? "Open a project, review the latest version, and keep every comment in one place."
    : "Manage clients, project invites, video versions, and approvals without the noise.";
  document.querySelector("#heroClientCount").textContent = isClient
    ? `${projects.length} projects`
    : `${state.clients.length} clients`;
  document.querySelector("#heroProjectCount").textContent = isClient
    ? `${projects.reduce((total, project) => total + projectVersionCount(project.id), 0)} versions`
    : `${state.projects.filter((project) => !project.archived).length} active projects`;
  document.querySelector("#heroApprovalCount").textContent = isClient
    ? `${projects.reduce((total, project) => total + projectVideos(project.id).length, 0)} videos`
    : `${state.versions.filter((version) => version.approved).length} approved`;
}

function updateStats() {
  if (state.mode === "client") return;
  setHeroMode("admin");
}

async function emailProjectClient({ client, project, video, version, emailType = "version" }) {
  const emails = clientEmails(client);
  if (!emails.length) {
    throw new Error("Choose at least one client account before sending");
  }

  if (!project) {
    throw new Error("Open a project before sending");
  }

  const reviewUrl = `${location.origin}${location.pathname}#review/${project.id}`;
  const results = [];
  for (const email of emails) {
    const response = await fetch(apiUrl("/api/send-review-email"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        emailType,
        clientEmail: email,
        clientName: client.contact || client.name,
        projectName: project.name,
        videoTitle: video?.title || project.name,
        versionLabel: version?.label || "Project invite",
        versionNote:
          version?.note ||
          (emailType === "invite"
            ? "Sign in to your Validate review dashboard to see this project."
            : "A new review version is ready."),
        reviewUrl,
        senderEmail: state.session?.email,
        senderName: state.session?.email || "Validate",
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Email could not be sent to ${email}`);
    results.push({ email, id: result.id });
  }
  return { ok: true, sent: results.length, results };
}

async function verifyProjectInviteAccess({ project, client }) {
  const supabase = getSupabase();
  const emails = clientEmails(client);
  if (!supabase || !project?.id || !emails.length) {
    throw new Error("Could not verify the project invite.");
  }

  const { data, error } = await supabase
    .from("project_access")
    .select("project_id,email")
    .eq("project_id", project.id)
    .in("email", emails);

  if (error) throw new Error(`Invite access check failed: ${error.message}`);
  const savedEmails = new Set((data || []).map((row) => normalizeEmail(row.email)));
  const missing = emails.filter((email) => !savedEmails.has(email));
  if (missing.length) {
    throw new Error(`Invite access did not save for ${missing[0]}. Try inviting again.`);
  }
  return data;
}

async function inviteProjectClient(button) {
  const client = activeClient();
  const project = activeProject();
  const emails = clientEmails(client);

  if (!emails.length) {
    showToast("Choose at least one client account before inviting");
    return;
  }

  if (!project) {
    showToast("Open a project before inviting");
    return;
  }

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Saving invite...";

  try {
    if (!state.deliveredProjectIds.includes(project.id)) state.deliveredProjectIds.push(project.id);
    await savePortalData();
    await verifyProjectInviteAccess({ project, client });

    button.textContent = "Sending invite...";
    const video = projectVideos(project.id)[0];
    await emailProjectClient({
      client,
      project,
      video,
      version: video ? latestVersion(video.id) : null,
      emailType: "invite",
    });

    state.activity.unshift(`Invited ${emails.length} client account${emails.length === 1 ? "" : "s"} to ${project.name}`);
    await savePortalData();
    showToast(`Project invite sent to ${emails.length} account${emails.length === 1 ? "" : "s"}`);
    renderProjectDetail();
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function notifyClientOfNewVersion({ project, video, version }) {
  const client = state.clients.find((item) => item.id === project?.clientId);
  const emails = clientEmails(client);
  if (!emails.length || !project || !video || !version) return false;
  if (!state.deliveredProjectIds.includes(project.id)) return false;

  await emailProjectClient({ client, project, video, version, emailType: "version" });
  state.activity.unshift(`Notified ${emails.length} client account${emails.length === 1 ? "" : "s"} about ${version.label} for ${video.title}`);
  await savePortalData();
  return true;
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
  let credentials;
  try {
    credentials = await createBunnyUploadCredentials({ title });
  } catch (error) {
    throw new Error(`Could not create Bunny video: ${error.message}`);
  }
  credentials.title = title;
  button.textContent = "Uploading 0%";
  try {
    await uploadToBunny(file, credentials, (percent) => {
      button.textContent = `Uploading ${percent}%`;
    });
  } catch (error) {
    throw new Error(`Bunny upload failed: ${error.message}`);
  }
  return credentials;
}

function render() {
  updateAuthView();
  if (!state.session) return;

  updateStats();
  if (state.portalLoading) {
    dashboardHero.hidden = true;
    setPageHeader(state.mode === "admin" ? "Loading workspace" : "Loading review");
    document.querySelector("#openCreate").hidden = true;
    root.innerHTML = `
      <div class="empty">
        Loading saved workspace...
        <div class="modal-actions inline-retry">
          <button class="ghost-button" type="button" id="retryWorkspaceLoad">Retry</button>
        </div>
      </div>
    `;
    root.querySelector("#retryWorkspaceLoad")?.addEventListener("click", () => {
      refreshPortalData({ openHash: true, showMissingMessage: true });
    });
    return;
  }

  renderCurrentView();
}

function renderClients() {
  rememberView("clients");
  setHeroMode("admin");
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
                <span>${clientEmailLabel(client)}</span>
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
  rememberView("projects");
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
  rememberView("projectDetail");
  dashboardHero.hidden = true;
  const project = activeProject();
  if (!project) {
    renderClients();
    return;
  }

  const client = state.clients.find((item) => item.id === project.clientId);
  const videos = state.videos.filter((video) => video.projectId === project.id);
  const isInvited = state.deliveredProjectIds.includes(project.id);
  const canInvite = Boolean(clientEmails(client).length);
  const sendStatus = !canInvite
    ? "Choose at least one client account before inviting."
    : isInvited
      ? `${clientAccountCountLabel(client)} can see this project. New versions will email automatically.`
      : `Invite ${clientAccountCountLabel(client)} to add this project to their dashboard.`;
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
        <div class="action-status ${canInvite ? "ready" : ""}">
          <strong>${isInvited ? "Project invited" : canInvite ? "Ready to invite" : "Needs attention"}</strong>
          <span>${sendStatus}</span>
        </div>
        <button class="primary-button" id="sendClient" ${canInvite ? "" : "disabled"}>${isInvited ? "Resend project invite" : "Invite client to project"}</button>
        <button class="ghost-button" id="addVersion">Upload new version</button>
        <button class="ghost-button" id="backProjects">Back to client</button>
        <p class="muted">After a project is invited, new uploaded versions automatically email the client.</p>
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
    inviteProjectClient(event.currentTarget);
  });
  root.querySelector("#addVersion").addEventListener("click", () => openDialog("version"));
  root.querySelector("#backProjects").addEventListener("click", renderProjects);
}

function renderAdminReview() {
  rememberView("adminReview");
  renderReviewShell(true);
}

function renderClientDashboard() {
  rememberView("clientDashboard");
  const client = activeClientAccount();
  const accountEmail = state.session?.email || client?.email || "this account";
  if (!client) {
    setPageHeader("Client dashboard");
    document.querySelector("#openCreate").hidden = true;
    root.innerHTML = `<div class="empty">No client account is loaded.</div>`;
    return;
  }

  const deliveredProjectIds = new Set(state.deliveredProjectIds);
  const projects = state.projects.filter((project) => !project.archived && deliveredProjectIds.has(project.id));
  setHeroMode("client", projects);
  const meta = state.portalMeta || {};
  const loadDetails = [
    `Signed in as ${accountEmail}`,
    Number.isFinite(meta.accessCount) ? `${meta.accessCount} invite${meta.accessCount === 1 ? "" : "s"} found` : "",
    Number.isFinite(meta.projectCount) ? `${meta.projectCount} project${meta.projectCount === 1 ? "" : "s"} loaded` : "",
    meta.usingServiceRole ? "server verified" : meta.source ? "browser-policy check" : "",
  ].filter(Boolean);
  const accountName = state.clientAccount?.name || client.contact || accountEmail || client.name;
  const workspaceName =
    client.id !== state.clientAccount?.id && client.name !== accountName ? client.name : "Client dashboard";
  setPageHeader(accountName, workspaceName, "client");
  document.querySelector("#openCreate").hidden = true;
  createIntent = "client";

  root.innerHTML = `
    <section class="workspace-panel">
      <div class="${projects.length ? "grid" : "project-list"}">
        ${
          projects.length
            ? projects
                .map((project) => {
                  const videos = projectVideos(project.id);
                  const versions = videos.flatMap((video) => videoVersions(video.id));
                  const latest = versions[0];
                  const approvedCount = versions.filter((version) => version.approved).length;
                  const noteCount = versions.reduce(
                    (total, version) => total + state.comments.filter((comment) => comment.versionId === version.id).length,
                    0,
                  );
                  return `
                    <article class="card client-project-card">
                      <p class="eyebrow">${project.status}</p>
                      <h3>${project.name}</h3>
                      <p>${project.description || "Review files and notes for this project."}</p>
                      <div class="meta-strip">
                        <span>${videos.length} video${videos.length === 1 ? "" : "s"}</span>
                        <span>${versions.length} version${versions.length === 1 ? "" : "s"}</span>
                        <span>${noteCount} note${noteCount === 1 ? "" : "s"}</span>
                      </div>
                      <div class="card-footer">
                        <span class="metric">${latest?.approved ? "approved" : approvedCount ? `${approvedCount} approved` : "in review"}</span>
                        <button class="ghost-button" data-client-project="${project.id}" ${videos.length ? "" : "disabled"}>
                          ${videos.length ? "Open project" : "No videos yet"}
                        </button>
                      </div>
                    </article>
                  `;
                })
                .join("")
            : `
              <div class="empty compact-empty">
                No projects are available for ${accountEmail} yet.
                ${loadDetails.length ? `<p class="muted load-diagnostics">${loadDetails.join(" / ")}</p>` : ""}
                ${meta.error ? `<p class="muted load-diagnostics">Last load note: ${meta.error}</p>` : ""}
                <div class="modal-actions inline-retry">
                  <button class="ghost-button" type="button" id="refreshClientInvites">Refresh invites</button>
                </div>
              </div>
            `
        }
      </div>
    </section>
  `;

  root.querySelector("#refreshClientInvites")?.addEventListener("click", () => {
    state.portalLoading = true;
    saveState();
    render();
    refreshPortalData({ openHash: true, showMissingMessage: true });
  });

  root.querySelectorAll("[data-client-project]").forEach((button) => {
    button.addEventListener("click", () => {
      const projectId = button.dataset.clientProject;
      state.selectedProjectId = projectId;
      state.selectedVideoId = "";
      state.selectedVersionId = "";
      saveState();
      renderClientProject();
    });
  });
}

function renderClientProject() {
  rememberView("clientProject");
  dashboardHero.hidden = true;
  const deliveredProjectIds = new Set(state.deliveredProjectIds);
  const project = state.projects.find(
    (item) => item.id === state.selectedProjectId && !item.archived && deliveredProjectIds.has(item.id),
  );

  if (!project) {
    showToast("Project is not available for this account");
    renderClientDashboard();
    return;
  }

  const videos = projectVideos(project.id);
  const versionItems = videos.flatMap((video) =>
    videoVersions(video.id).map((version) => ({
      video,
      version,
    })),
  );
  setPageHeader(project.name, "Project review", "client");
  document.querySelector("#openCreate").hidden = true;

  root.innerHTML = `
    <section class="workspace-panel">
      <div class="workspace-head">
        <div>
          <p class="eyebrow">Versions</p>
          <h2>Choose a cut to review.</h2>
          <p class="muted">${project.description || "Open any version below to watch, comment, and approve."}</p>
        </div>
        <button class="ghost-button" type="button" id="backClientDashboard">Back to projects</button>
      </div>
      <div class="project-list">
        ${
          versionItems.length
            ? versionItems
                .map(
                  ({ video, version }) => `
                    <button class="version-row version-select" type="button" data-client-version="${version.id}" data-client-video="${video.id}">
                      <div>
                        <h3>${version.label}</h3>
                        <p class="muted">${version.note || "Open this version to review."}</p>
                        <div class="meta-strip">
                          <span>${version.createdAt}</span>
                          <span>${state.comments.filter((comment) => comment.versionId === version.id).length} comments</span>
                        </div>
                      </div>
                      <span class="status-pill ${version.approved ? "approved" : ""}">${version.approved ? "approved" : "open review"}</span>
                    </button>
                  `,
                )
                .join("")
            : `<div class="empty compact-empty">No versions are ready for this project yet.</div>`
        }
      </div>
    </section>
  `;

  root.querySelector("#backClientDashboard")?.addEventListener("click", renderClientDashboard);
  root.querySelectorAll("[data-client-version]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedProjectId = project.id;
      state.selectedVideoId = button.dataset.clientVideo;
      state.selectedVersionId = button.dataset.clientVersion;
      saveState();
      renderClientReview();
    });
  });
}

function renderClientReview() {
  rememberView("clientReview");
  renderReviewShell(false);
}

function renderReviewShell(isAdmin) {
  rememberView(isAdmin ? "adminReview" : "clientReview");
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
  const version = versions.find((item) => item.id === state.selectedVersionId) || versions[0];
  const comments = state.comments.filter((comment) => comment.versionId === version?.id);
  setPageHeader(isAdmin ? video.title : project.name);
  document.querySelector("#openCreate").textContent = isAdmin ? "Add version" : "Approve";
  document.querySelector("#openCreate").hidden = !isAdmin;
  createIntent = isAdmin ? "version" : "approve";

  root.innerHTML = `
    <div class="project-layout review-layout">
      <section class="panel review-main-panel">
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
      </section>
      <aside class="panel stack review-side-panel">
        <p class="eyebrow">Version history</p>
        ${
          versions.length
            ? versions
                .map(
                  (item) => `
                    <button class="version-row version-select ${item.id === version?.id ? "active" : ""}" type="button" data-review-version="${item.id}">
                      <div>
                        <h3>${item.label}</h3>
                        <p class="muted">${item.createdAt}</p>
                      </div>
                      <span class="status-pill ${item.approved ? "approved" : ""}">${item.approved ? "approved" : item.provider}</span>
                    </button>
                  `,
                )
                .join("")
            : `<div class="empty compact-empty">No versions uploaded yet.</div>`
        }
        <button class="primary-button" id="approveVersion" ${version ? "" : "disabled"}>${version?.approved ? "Approved" : "Mark approved"}</button>
        ${isAdmin ? `<button class="ghost-button" id="backProject">Back to project</button>` : `<button class="ghost-button" id="backClientProject">Back to project</button>`}
        <div class="comments-panel">
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
              : `<div class="empty compact-empty">No comments yet. Add the first review comment below.</div>`
          }
          <form class="comment-form" id="commentForm">
            <textarea name="body" placeholder="Add a comment for this version"></textarea>
            <button class="primary-button" ${version ? "" : "disabled"}>Add comment</button>
          </form>
        </div>
      </aside>
    </div>
  `;

  root.querySelectorAll("[data-review-version]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedVersionId = button.dataset.reviewVersion;
      saveState();
      renderReviewShell(isAdmin);
    });
  });

  root.querySelector("#commentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = new FormData(event.currentTarget).get("body").trim();
    if (!body || !version) return;
    const comment = {
      id: `comment-${Date.now()}`,
      versionId: version.id,
      author: currentCommentAuthor(isAdmin),
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
  const backClientProject = root.querySelector("#backClientProject");
  if (backClientProject) backClientProject.addEventListener("click", renderClientProject);
}

function renderActivity() {
  rememberView("activity");
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
  rememberView("settings");
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

function renderClientAccountOptions({ accounts, selectedEmails, query = "" }) {
  const options = dialogFields.querySelector("#accountOptions");
  const hidden = dialogFields.querySelector("#clientAccountEmails");
  const selectedCount = dialogFields.querySelector("#accountSelectedCount");
  if (!options || !hidden || !selectedCount) return;

  const selected = [...selectedEmails];
  hidden.value = selected.join(",");
  selectedCount.textContent = selected.length ? `${selected.length} selected` : "No accounts selected";

  const searchTerm = query.trim().toLowerCase();
  const filtered = accounts.filter((account) => {
    const haystack = `${account.fullName || ""} ${account.email || ""}`.toLowerCase();
    return !searchTerm || haystack.includes(searchTerm);
  });

  if (!accounts.length) {
    options.innerHTML = `
      <div class="account-empty">
        No client accounts found yet. Create a client login first, then come back here.
      </div>
    `;
    return;
  }

  if (!filtered.length) {
    options.innerHTML = `
      <div class="account-empty">
        No accounts match that search.
      </div>
    `;
    return;
  }

  options.innerHTML = filtered
    .map((account) => {
      const email = normalizeEmail(account.email);
      const checked = selectedEmails.has(email);
      return `
        <label class="account-option ${checked ? "is-selected" : ""}">
          <input
            type="checkbox"
            value="${escapeHtml(email)}"
            data-account-email="${escapeHtml(email)}"
            ${checked ? "checked" : ""}
          />
          <span class="account-option-main">
            <strong>${escapeHtml(account.fullName || account.email)}</strong>
            <span>${escapeHtml(email)}</span>
          </span>
        </label>
      `;
    })
    .join("");
}

function setupClientAccountPicker() {
  const selectedEmails = new Set();
  const search = dialogFields.querySelector("#accountSearch");
  const options = dialogFields.querySelector("#accountOptions");

  const renderOptions = () => {
    renderClientAccountOptions({
      accounts: state.accountDirectory || [],
      selectedEmails,
      query: search?.value || "",
    });
  };

  search?.addEventListener("input", renderOptions);
  options?.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-account-email]");
    if (!checkbox) return;
    const email = normalizeEmail(checkbox.dataset.accountEmail || checkbox.value);
    if (checkbox.checked) selectedEmails.add(email);
    else selectedEmails.delete(email);
    renderOptions();
  });

  if (state.accountDirectory?.length) renderOptions();

  loadAccountDirectory({ force: true })
    .then(renderOptions)
    .catch((error) => {
      if (options) {
        options.innerHTML = `
          <div class="account-empty">
            ${escapeHtml(error.message || "Client accounts could not load.")}
          </div>
        `;
      }
      showToast(error.message || "Client accounts could not load");
    });
}

function openDialog(intent = createIntent) {
  createIntent = intent;
  const fields = {
    client: [
      ["name", "Client name", "Silver Dollar City"],
      ["contact", "Contact", "Megan Carter"],
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
      ["label", "Version label", "Version 1"],
      ["provider", "Provider", "Bunny Stream"],
      ["file", "Video file", ""],
      ["embedUrl", "Embed URL", ""],
      ["note", "Version note", "First cut for review."],
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

  if (intent === "client" && state.session?.role !== "admin") {
    showToast("Only admins can create client workspaces");
    return;
  }

  if (intent === "project" && !activeClient()) {
    showToast("Create a client before adding a project");
    return;
  }

  if ((intent === "video" || intent === "version") && !activeProject()) {
    showToast("Open a project before uploading");
    return;
  }

  dialogTitle.textContent = {
    client: "New client",
    project: "New project",
    video: "Add video",
    version: "Upload new version",
  }[intent];
  if (createSubmit) {
    createSubmit.textContent = intent === "version" || intent === "video" ? "Upload" : "Save";
    createSubmit.disabled = false;
  }

  createForm.reset();

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

  if (intent === "client") {
    dialogFields.insertAdjacentHTML(
      "beforeend",
      `
        <div class="account-picker">
          <div class="account-picker-head">
            <label>
              Client accounts
              <input id="accountSearch" type="search" placeholder="Search by name or email" autocomplete="off" />
            </label>
            <span id="accountSelectedCount">No accounts selected</span>
          </div>
          <input id="clientAccountEmails" name="clientAccountEmails" type="hidden" />
          <div class="account-options" id="accountOptions">
            <div class="account-empty">Loading client accounts...</div>
          </div>
        </div>
      `,
    );
    setupClientAccountPicker();
  }

  dialog.showModal();
}

async function handleCreateFormSubmit(event) {
  event.preventDefault();
  event.stopPropagation();
  if (isSavingCreateForm) return;
  isSavingCreateForm = true;
  const form = new FormData(createForm);
  const nowId = Date.now();
  const saveButton = createSubmit;
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
  const uploadsVideo = createIntent === "version" || createIntent === "video";
  let pendingVersionNotice = null;
  saveButton.textContent = uploadsVideo ? "Starting upload..." : "Saving...";
  showToast(uploadsVideo ? "Starting upload..." : "Saving...");
  syncPaused = true;

  try {
    if (createIntent === "client") {
      const name = form.get("name") || "New Client";
      const selectedEmails = clientEmails(form.get("clientAccountEmails"));
      if (!selectedEmails.length) {
        throw new Error("Choose at least one client account for this workspace.");
      }
      state.clients.push({
        id: `${slug(name) || "client"}-${nowId}`,
        name,
        contact: form.get("contact") || "Primary contact",
        email: selectedEmails.join(","),
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
      const video = {
        id: videoId,
        projectId: activeProject().id,
        title,
        status: "draft",
        due: form.get("due") || "Soon",
      };
      state.videos.unshift(video);
      state.selectedVideoId = videoId;

      const file = form.get("file");
      const label = form.get("label") || "Version 1";
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

      if (embedUrl.trim() || bunnyVideoId) {
        const version = {
          id: `version-${nowId}`,
          videoId,
          label,
          provider,
          embedUrl,
          bunnyVideoId,
          note: form.get("note") || "New review version.",
          createdAt: "Just now",
          approved: false,
        };
        state.versions.unshift(version);
        pendingVersionNotice = {
          project: activeProject(),
          video,
          version,
        };
      }
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

      const version = {
        id: `version-${nowId}`,
        videoId: video.id,
        label,
        provider,
        embedUrl,
        bunnyVideoId,
        note: form.get("note") || "New review version.",
        createdAt: "Just now",
        approved: false,
      };
      state.versions.unshift(version);
      state.selectedVideoId = video.id;
      pendingVersionNotice = {
        project,
        video,
        version,
      };
    }

    saveButton.textContent = "Saving version...";
    await saveAndReloadPortalData();
    let notifiedClient = false;
    if (pendingVersionNotice) {
      saveButton.textContent = "Checking invite...";
      if (state.deliveredProjectIds.includes(pendingVersionNotice.project?.id)) {
        saveButton.textContent = "Emailing client...";
        notifiedClient = await notifyClientOfNewVersion(pendingVersionNotice);
      }
    }
    dialog.close();
    createForm.reset();
    showToast(notifiedClient ? "Video saved and client emailed" : uploadsVideo ? "Video saved" : "Saved");
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
}

createForm.addEventListener("submit", handleCreateFormSubmit);
createSubmit.addEventListener("click", handleCreateFormSubmit);

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
  clearAccountSession();
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
  watchSupabaseAuth();
  let restored = false;
  try {
    restored = await restoreSupabaseSession();
    if (!restored && state.session) {
      clearAccountSession();
    }
    if (restored) startCrossDeviceSync();
  } catch (error) {
    console.warn("Supabase startup load failed", error);
    showToast(error.message || "Could not load saved portal data");
  }
  render();
  if (restored) {
    refreshPortalData({ openHash: true, showMissingMessage: false });
  } else {
    openReviewFromHash({ showMissingMessage: false });
  }
}

bootPortal();
window.addEventListener("hashchange", () => {
  openReviewFromHash({ showMissingMessage: true });
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !state.session) startLoginReel();
  if (!document.hidden && state.session) {
    const isWatchingReview = currentView === "adminReview" || currentView === "clientReview";
    syncPortalData({ rerender: !isWatchingReview });
  }
});
window.addEventListener("focus", () => {
  const isWatchingReview = currentView === "adminReview" || currentView === "clientReview";
  syncPortalData({ rerender: !isWatchingReview });
});
