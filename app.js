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
  projectRecipients: {},
  projectCollaborators: {},
  projectAccessRows: [],
  latestVersionByVideo: {},
  accountDirectory: [],
  portalMeta: null,
};

const storeKey = "validate-delivery-portal-empty-v4";
const productionOrigin = "https://validate-delivery-portal.vercel.app";
const supabaseUrl = "https://axvnifoamejuxxqhezwr.supabase.co";
const supabasePublishableKey = "sb_publishable_IFOVI5nvp8DdOeqAs4lNsg__Iewd4BN";
const firstAdminEmail = "henry@createwithvalidate.com";
const bunnyPullZoneHostname = "vz-72fc0187-fa1.b-cdn.net";
const state = loadState();
state.session ??= null;
state.clientAccount ??= null;
state.deliveredProjectIds ??= [];
state.projectRecipients ??= {};
state.projectCollaborators ??= {};
state.projectAccessRows ??= [];
state.latestVersionByVideo ??= {};
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
const dialogEyebrow = document.querySelector("#createDialog .modal-head .eyebrow");
const dialogSubtitle = document.querySelector("#dialogSubtitle");
const createForm = document.querySelector("#createForm");
const createSubmit = document.querySelector("#createSubmit");
const deleteClientAction = document.querySelector("#deleteClientAction");
const sessionName = document.querySelector("#sessionName");
const sessionEmail = document.querySelector("#sessionEmail");
const toast = document.querySelector("#toast");

let route = state.route || "clients";
let currentView = state.currentView || "clients";
let createIntent = "client";
let clientDialogStep = "details";
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
const reviewEventPrefix = "__validate_review_event__:";
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
  const value = Array.isArray(clientOrValue)
    ? clientOrValue.join(",")
    : typeof clientOrValue === "string"
      ? clientOrValue
      : clientOrValue?.email;
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

function clientMatchesSession(client) {
  const sessionEmail = normalizeEmail(state.session?.email);
  return Boolean(sessionEmail && clientEmails(client).includes(sessionEmail));
}

function mapAccountRow(account = {}) {
  return {
    id: account.id || account.email,
    email: normalizeEmail(account.email),
    fullName: account.fullName || account.full_name || account.email,
    role: account.role === "admin" ? "admin" : "client",
    createdAt: account.createdAt || account.created_at || "",
  };
}

function accountForEmail(email) {
  const normalized = normalizeEmail(email);
  return (state.accountDirectory || []).find((account) => normalizeEmail(account.email) === normalized);
}

function accountRoleForEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return "";
  const account = accountForEmail(normalized);
  if (account?.role) return account.role;
  if (normalized === normalizeEmail(state.session?.email)) return state.session?.role || "";
  return "";
}

function accountNameForEmail(email) {
  const normalized = normalizeEmail(email);
  const account = accountForEmail(normalized);
  return account?.fullName || normalized;
}

function projectRecipientEmails(projectId) {
  const explicit = clientEmails(state.projectRecipients?.[projectId]);
  if (explicit.length) return explicit;
  if (!state.deliveredProjectIds.includes(projectId)) return [];
  const project = state.projects.find((item) => item.id === projectId);
  const client = state.clients.find((item) => item.id === project?.clientId);
  return clientEmails(client);
}

function projectCollaboratorEmails(projectId) {
  return clientEmails(state.projectCollaborators?.[projectId]);
}

function accessRowsForProject(projectId) {
  const emails = [...new Set([...projectRecipientEmails(projectId), ...projectCollaboratorEmails(projectId)])];
  return emails.map((email) => ({ project_id: projectId, email }));
}

function projectAccessRowsForSave() {
  return state.projects.flatMap((project) => accessRowsForProject(project.id));
}

function applyProjectAccessRows(rows = []) {
  const normalizedRows = rows
    .map((row) => ({
      projectId: row.project_id || row.projectId,
      email: normalizeEmail(row.email),
    }))
    .filter((row) => row.projectId && row.email);
  const recipients = {};
  const collaborators = {};

  normalizedRows.forEach((row) => {
    const bucket = accountRoleForEmail(row.email) === "admin" ? collaborators : recipients;
    bucket[row.projectId] ??= [];
    if (!bucket[row.projectId].includes(row.email)) bucket[row.projectId].push(row.email);
  });

  state.projectAccessRows = normalizedRows;
  state.projectRecipients = recipients;
  state.projectCollaborators = collaborators;
  state.deliveredProjectIds = Object.keys(recipients).filter((projectId) => recipients[projectId]?.length);
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
    name: profile?.full_name || user.user_metadata?.full_name || user.email,
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

function applyPortalRows({
  clients = [],
  projects = [],
  videos = [],
  versions = [],
  comments = [],
  deliveredProjectIds = [],
  projectAccessRows,
  accountDirectory = [],
  meta = null,
}) {
  state.clients = clients.map(mapClientRow);
  state.projects = projects.map(mapProjectRow);
  state.videos = videos.map(mapVideoRow);
  state.versions = versions.map(mapVersionRow);
  state.comments = comments.map(mapCommentRow);
  if (accountDirectory.length) {
    state.accountDirectory = accountDirectory.map(mapAccountRow).filter((account) => account.email);
  }
  if (Array.isArray(projectAccessRows)) {
    applyProjectAccessRows(projectAccessRows);
  } else {
    state.deliveredProjectIds = [...new Set(deliveredProjectIds)];
  }
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
  if (!token) throw new Error("Sign in again before loading accounts.");

  const response = await withTimeout(
    fetch(apiUrl("/api/account-directory"), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    }),
    "Account list took too long.",
    7500,
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Could not load accounts.");

  state.accountDirectory = (result.accounts || []).map(mapAccountRow).filter((account) => account.email);
  if (state.projectAccessRows?.length) applyProjectAccessRows(state.projectAccessRows);
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
    profilesResult,
  ] = await Promise.all([
    client.from("clients").select("*").order("created_at", { ascending: false }),
    client.from("projects").select("*").order("created_at", { ascending: false }),
    client.from("videos").select("*").order("created_at", { ascending: false }),
    client.from("video_versions").select("*").order("created_at", { ascending: false }),
    client.from("comments").select("*").order("created_at", { ascending: false }),
    client.from("project_access").select("*"),
    client.from("profiles").select("id,email,full_name,role,created_at").order("created_at", { ascending: false }),
  ]);

  const error =
    clientsResult.error ||
    projectsResult.error ||
    videosResult.error ||
    versionsResult.error ||
    commentsResult.error ||
    accessResult.error ||
    profilesResult.error;
  if (error) throw error;

  applyPortalRows({
    clients: clientsResult.data || [],
    projects: projectsResult.data || [],
    videos: videosResult.data || [],
    versions: versionsResult.data || [],
    comments: commentsResult.data || [],
    projectAccessRows: accessResult.data || [],
    accountDirectory: profilesResult.data || [],
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
  const accessRows = projectAccessRowsForSave();
  if (accessRows.length) {
    await runSave(client.from("project_access").upsert(accessRows), "Project access");
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

async function saveReviewStatusInSupabase({ versionId, type }) {
  const token = await supabaseAccessToken();
  if (!token) throw new Error("Sign in again before saving review status.");
  const response = await fetch(apiUrl("/api/save-review-status"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ versionId, type }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Review status did not save.");
  return result.comment;
}

async function saveClientReviewEvent({ version, type, silent = false }) {
  if (!version || state.mode !== "client") return null;
  const identity = currentReviewIdentity();
  if (!identity.email) return null;
  if (clientReviewEvent(version.id, type, identity.email)) return null;

  const previousApproved = version.approved;
  const optimisticComment = makeReviewEventComment({ versionId: version.id, type });
  upsertById(state.comments, optimisticComment);
  if (type === "approved") version.approved = true;
  saveState();
  refreshReviewStatusUi();

  try {
    const savedComment = await saveReviewStatusInSupabase({ versionId: version.id, type });
    if (savedComment) upsertById(state.comments, savedComment);
    if (type === "approved") version.approved = true;
    saveState();
    refreshReviewStatusUi();
    return savedComment || optimisticComment;
  } catch (error) {
    state.comments = state.comments.filter((comment) => comment.id !== optimisticComment.id);
    if (type === "approved") version.approved = previousApproved;
    saveState();
    refreshReviewStatusUi();
    if (!silent) showToast(error.message);
    return null;
  }
}

function markVersionSeen(version) {
  if (!version || state.mode !== "client") return;
  const identity = currentReviewIdentity();
  if (!identity.email || clientReviewEvent(version.id, "seen", identity.email)) return;
  window.setTimeout(() => {
    saveClientReviewEvent({ version, type: "seen", silent: true });
  }, 500);
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
      state.selectedVideoId = projectVideos(state.selectedProjectId).some(
        (video) => video.id === previousSelection.selectedVideoId,
      )
        ? previousSelection.selectedVideoId
        : projectVideos(state.selectedProjectId)[0]?.id || "";
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
      state.selectedVideoId = projectVideos(state.selectedProjectId).some(
        (video) => video.id === previousSelection.selectedVideoId,
      )
        ? previousSelection.selectedVideoId
        : projectVideos(state.selectedProjectId)[0]?.id || "";
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
    if (rerender && hasChanged && isWatchingReview) refreshReviewStatusUi();
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
  state.selectedVideoId = projectVideos(state.selectedProjectId).some((video) => video.id === previousSelection.selectedVideoId)
    ? previousSelection.selectedVideoId
    : projectVideos(state.selectedProjectId)[0]?.id || "";
  lastPortalFingerprint = portalFingerprint();
  saveState();
}

function setPageHeader(title, eyebrow = "Client delivery portal", style = "") {
  pageTitle.textContent = title;
  pageEyebrow.textContent = eyebrow;
  topbar.classList.toggle("client-title-card", style === "client");
  if (deleteClientAction) {
    deleteClientAction.hidden = true;
    deleteClientAction.dataset.action = "";
    deleteClientAction.dataset.clientId = "";
    deleteClientAction.dataset.projectId = "";
  }
}

function updateSessionFooter() {
  const name = state.clientAccount?.name || state.session?.name || state.session?.email || "Signed in";
  const email = state.session?.email || "";
  if (sessionLabel) sessionLabel.textContent = state.session?.role ? state.session.role : "";
  if (sessionName) sessionName.textContent = name;
  if (sessionEmail) sessionEmail.textContent = email;
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

  updateSessionFooter();
  document.querySelector("#openCreate").hidden = state.session.role !== "admin" || state.mode === "client";
  if (deleteClientAction) deleteClientAction.hidden = true;
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
    projectRecipients: state.projectRecipients,
    projectCollaborators: state.projectCollaborators,
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

function reviewEventId(type, versionId, email) {
  return `review-${type}-${slug(versionId).slice(0, 48)}-${slug(email).slice(0, 72)}`;
}

function parseReviewEvent(comment) {
  const body = String(comment?.body || "");
  if (!body.startsWith(reviewEventPrefix)) return null;
  try {
    const event = JSON.parse(body.slice(reviewEventPrefix.length));
    if (!event?.type || !event?.email) return null;
    return {
      type: event.type,
      email: normalizeEmail(event.email),
      name: event.name || accountNameForEmail(event.email),
      at: event.at || comment.createdAt || "Just now",
    };
  } catch {
    return null;
  }
}

function isReviewEvent(comment) {
  return Boolean(parseReviewEvent(comment));
}

function visibleCommentsForVersion(versionId) {
  return state.comments.filter((comment) => comment.versionId === versionId && !isReviewEvent(comment));
}

function reviewEventsForVersion(versionId) {
  return state.comments
    .filter((comment) => comment.versionId === versionId)
    .map((comment) => ({ comment, event: parseReviewEvent(comment) }))
    .filter((entry) => entry.event);
}

function currentReviewIdentity() {
  const email = normalizeEmail(state.session?.email || state.clientAccount?.email || "");
  return {
    email,
    name: currentCommentAuthor(false),
  };
}

function makeReviewEventComment({ versionId, type }) {
  const identity = currentReviewIdentity();
  const at = new Date().toISOString();
  return {
    id: reviewEventId(type, versionId, identity.email),
    versionId,
    author: identity.name,
    role: "client",
    body: `${reviewEventPrefix}${JSON.stringify({
      type,
      email: identity.email,
      name: identity.name,
      at,
    })}`,
    createdAt: "Just now",
  };
}

function clientReviewEvent(versionId, type, email = currentReviewIdentity().email) {
  const normalizedEmail = normalizeEmail(email);
  return reviewEventsForVersion(versionId).find(
    ({ event }) => event.type === type && event.email === normalizedEmail,
  )?.event;
}

function reviewStatusRows(version, project) {
  if (!version || !project) return [];
  const recipients = projectRecipientEmails(project.id);
  const seenEvents = reviewEventsForVersion(version.id).filter(({ event }) => event.type === "seen");
  const approvedEvents = reviewEventsForVersion(version.id).filter(({ event }) => event.type === "approved");
  const emails = [
    ...new Set([
      ...recipients,
      ...seenEvents.map(({ event }) => event.email),
      ...approvedEvents.map(({ event }) => event.email),
    ]),
  ].filter(Boolean);

  return emails.map((email) => {
    const seen = seenEvents.find(({ event }) => event.email === email)?.event;
    const approved = approvedEvents.find(({ event }) => event.email === email)?.event;
    return {
      email,
      name: approved?.name || seen?.name || accountNameForEmail(email),
      seenAt: seen?.at || "",
      approvedAt: approved?.at || "",
      seen: Boolean(seen),
      approved: Boolean(approved),
    };
  });
}

function reviewSummaryForVersion(version, project) {
  const rows = reviewStatusRows(version, project);
  const seenCount = rows.filter((row) => row.seen).length;
  const approvedCount = rows.filter((row) => row.approved).length;
  return {
    rows,
    total: rows.length,
    seenCount,
    approvedCount,
    hasApproval: Boolean(version?.approved || approvedCount),
  };
}

function versionReviewLabel(version, project) {
  const summary = reviewSummaryForVersion(version, project);
  if (!summary.total) return version?.approved ? "approved" : "review";
  if (summary.approvedCount) return `${summary.approvedCount}/${summary.total} approved`;
  if (summary.seenCount) return `${summary.seenCount}/${summary.total} seen`;
  return "not seen";
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
  const projectId = activeProject()?.id;
  return (
    projectVideos(projectId).find((video) => video.id === state.selectedVideoId) ||
    projectVideos(projectId)[0]
  );
}

function latestVersion(videoId = activeVideo()?.id) {
  return state.versions.find((version) => version.videoId === videoId);
}

function projectVideos(projectId) {
  if (!projectId) return [];
  return state.videos.filter((video) => video.projectId === projectId && video.status !== "image");
}

function projectImages(projectId) {
  if (!projectId) return [];
  return state.videos.filter((video) => video.projectId === projectId && video.status === "image");
}

function videoVersions(videoId) {
  return state.versions.filter((version) => version.videoId === videoId);
}

function bunnyVideoIdFromEmbedUrl(embedUrl = "") {
  const match = String(embedUrl).match(/\/(?:embed|play)\/[^/]+\/([^/?#]+)/);
  return match ? match[1] : "";
}

function vimeoVideoIdFromEmbedUrl(embedUrl = "") {
  const match = String(embedUrl).match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return match ? match[1] : "";
}

function videoThumbnailUrl(version) {
  if (version?.provider === "Vimeo") {
    const vimeoVideoId = version?.bunnyVideoId || vimeoVideoIdFromEmbedUrl(version?.embedUrl);
    return vimeoVideoId ? apiUrl(`/api/vimeo-thumbnail?videoId=${encodeURIComponent(vimeoVideoId)}`) : "";
  }

  const bunnyVideoId = version?.bunnyVideoId || bunnyVideoIdFromEmbedUrl(version?.embedUrl);
  if (!bunnyVideoId || !bunnyPullZoneHostname) return "";
  return `https://${bunnyPullZoneHostname}/${bunnyVideoId}/thumbnail.jpg`;
}

function renderVideoThumbnail({ version, title }) {
  const thumbnailUrl = videoThumbnailUrl(version);
  if (!thumbnailUrl) {
    return `
      <span class="video-thumb is-empty">
        <span>No thumbnail yet</span>
      </span>
    `;
  }

  return `
    <span class="video-thumb">
      <img
        src="${escapeHtml(thumbnailUrl)}"
        alt="${escapeHtml(`${title} thumbnail`)}"
        loading="lazy"
        onerror="this.closest('.video-thumb')?.classList.add('is-empty'); this.remove();"
      />
      <span>No thumbnail yet</span>
    </span>
  `;
}

function renderVideoCardGrid({
  videos,
  dataAttribute = "data-video",
  actionLabel = "Open",
  emptyText = "No videos yet.",
  requireVersion = false,
}) {
  if (!videos.length) return `<div class="empty compact-empty">${emptyText}</div>`;

  return `
    <div class="video-card-grid">
      ${videos
        .map((video) => {
          const versions = videoVersions(video.id);
          const version = versions[0];
          const noteCount = versions.reduce(
            (total, item) => total + visibleCommentsForVersion(item.id).length,
            0,
          );
          const isDisabled = requireVersion && !versions.length;
          return `
            <button class="video-card" type="button" ${dataAttribute}="${escapeHtml(video.id)}" ${isDisabled ? "disabled" : ""}>
              ${renderVideoThumbnail({ version, title: video.title })}
              <span class="video-card-body">
                <span>
                  <strong class="video-card-title">${escapeHtml(video.title)}</strong>
                  <span class="muted">${version ? `Latest: ${escapeHtml(version.label)}` : "Add first version."}</span>
                </span>
                <span class="meta-strip">
                  <span>${versionCountLabel(versions.length)}</span>
                  ${noteCount ? `<span>${noteCount} comments</span>` : ""}
                </span>
                <span class="video-card-action">${versions.length ? actionLabel : "Add first version"}</span>
              </span>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function projectVersionCount(projectId) {
  return projectVideos(projectId).reduce((total, video) => total + videoVersions(video.id).length, 0);
}

function latestProjectVersion(projectId) {
  const videoIds = new Set(projectVideos(projectId).map((video) => video.id));
  const version = state.versions.find((item) => videoIds.has(item.videoId));
  const video = version ? state.videos.find((item) => item.id === version.videoId) : null;
  return { video, version };
}

function renderProjectAccessList(emails = [], emptyText = "No clients have access yet.") {
  if (!emails.length) {
    return `<div class="access-empty">${emptyText}</div>`;
  }

  return `
    <div class="access-list">
      ${emails
        .map(
          (email) => `
            <div class="access-row">
              <div>
                <strong>${escapeHtml(accountNameForEmail(email))}</strong>
                <span>${escapeHtml(email)}</span>
              </div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderProjectImageGrid(images, { emptyText = "No project images yet." } = {}) {
  if (!images.length) {
    return `<div class="empty compact-empty">${emptyText}</div>`;
  }

  return `
    <div class="image-grid">
      ${images
        .map(
          (image) => `
            <a class="image-tile" href="${escapeHtml(image.due || "#")}" target="_blank" rel="noreferrer">
              <span class="image-preview">
                <img src="${escapeHtml(image.due || "")}" alt="${escapeHtml(image.title)}" loading="lazy" />
              </span>
              <span class="image-tile-copy">
                <strong>${escapeHtml(image.title)}</strong>
                <span>Project image</span>
              </span>
            </a>
          `,
        )
        .join("")}
    </div>
  `;
}

function versionCountLabel(count) {
  return `${count} version${count === 1 ? "" : "s"}`;
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
  const veryConfirmed = window.confirm(`Are you very sure? This permanently deletes ${client.name}, its projects, videos, versions, comments, and client access.`);
  if (!veryConfirmed) return;

  const projectIds = state.projects.filter((project) => project.clientId === clientId).map((project) => project.id);
  const videoIds = state.videos.filter((video) => projectIds.includes(video.projectId)).map((video) => video.id);
  const versionIds = state.versions.filter((version) => videoIds.includes(version.videoId)).map((version) => version.id);

  state.clients = state.clients.filter((item) => item.id !== clientId);
  state.projects = state.projects.filter((project) => !projectIds.includes(project.id));
  state.videos = state.videos.filter((video) => !videoIds.includes(video.id));
  state.versions = state.versions.filter((version) => !versionIds.includes(version.id));
  state.comments = state.comments.filter((comment) => !versionIds.includes(comment.versionId));
  projectIds.forEach((projectId) => {
    delete state.projectRecipients[projectId];
    delete state.projectCollaborators[projectId];
  });
  state.projectAccessRows = state.projectAccessRows.filter((row) => !projectIds.includes(row.projectId));
  state.deliveredProjectIds = state.deliveredProjectIds.filter((id) => !projectIds.includes(id));
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

async function deleteProject(projectId) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return;
  const confirmed = window.confirm(`Delete ${project.name}?`);
  if (!confirmed) return;
  const veryConfirmed = window.confirm(`Are you very sure? This permanently deletes ${project.name}, its videos, versions, comments, images, and client access.`);
  if (!veryConfirmed) return;

  const videoIds = state.videos.filter((video) => video.projectId === projectId).map((video) => video.id);
  const versionIds = state.versions.filter((version) => videoIds.includes(version.videoId)).map((version) => version.id);

  state.projects = state.projects.filter((item) => item.id !== projectId);
  state.videos = state.videos.filter((video) => !videoIds.includes(video.id));
  state.versions = state.versions.filter((version) => !versionIds.includes(version.id));
  state.comments = state.comments.filter((comment) => !versionIds.includes(comment.versionId));
  state.deliveredProjectIds = state.deliveredProjectIds.filter((id) => id !== projectId);
  delete state.projectRecipients[projectId];
  delete state.projectCollaborators[projectId];
  state.projectAccessRows = state.projectAccessRows.filter((row) => row.projectId !== projectId);
  if (state.selectedProjectId === projectId) state.selectedProjectId = "";
  if (videoIds.includes(state.selectedVideoId)) state.selectedVideoId = "";
  state.activity.unshift(`Deleted project ${project.name}`);
  saveState();
  try {
    const supabase = getSupabase();
    const { data: userData } = supabase ? await supabase.auth.getUser() : { data: {} };
    if (userData?.user) await supabase.from("projects").delete().eq("id", projectId);
  } catch (error) {
    console.warn("Supabase project delete failed", error);
    showToast("Deleted locally. Supabase did not delete yet.");
  }
  showToast("Project deleted");
  renderProjects();
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

async function emailProjectClient({ client, project, video, version, emails: explicitEmails = null, emailType = "version" }) {
  const emails = clientEmails(explicitEmails || client);
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
        clientName: client?.contact || client?.name || accountNameForEmail(email) || "there",
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

async function replaceProjectAccessInSupabase(projectId) {
  const supabase = getSupabase();
  if (!supabase || !projectId) throw new Error("Could not save project access.");
  const rows = accessRowsForProject(projectId);
  const { error: deleteError } = await supabase.from("project_access").delete().eq("project_id", projectId);
  if (deleteError) throw new Error(`Project access cleanup failed: ${deleteError.message}`);
  if (!rows.length) return [];
  const { data, error } = await supabase.from("project_access").upsert(rows).select("project_id,email");
  if (error) throw new Error(`Project access did not save: ${error.message}`);
  state.projectAccessRows = [
    ...state.projectAccessRows.filter((row) => row.projectId !== projectId),
    ...rows.map((row) => ({ projectId: row.project_id, email: row.email })),
  ];
  saveState();
  return data || rows;
}

async function verifyProjectInviteAccess({ project, client, emails: explicitEmails = null }) {
  const supabase = getSupabase();
  const emails = clientEmails(explicitEmails || client);
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

async function shareProjectFromForm(form, button) {
  const project = activeProject();
  const projectId = String(form.get("projectId") || project?.id || "");
  const emails = clientEmails(form.get("shareClientEmails"));
  const previousEmails = projectRecipientEmails(project?.id);

  if (!emails.length && !previousEmails.length) {
    throw new Error("Choose at least one client account before sharing");
  }

  if (!project || project.id !== projectId) {
    throw new Error("Open a project before sharing");
  }

  if (emails.length) {
    state.projectRecipients[project.id] = emails;
    if (!state.deliveredProjectIds.includes(project.id)) state.deliveredProjectIds.push(project.id);
  } else {
    delete state.projectRecipients[project.id];
    state.deliveredProjectIds = state.deliveredProjectIds.filter((id) => id !== project.id);
  }

  const previousSet = new Set(previousEmails);
  const newlyAddedEmails = emails.filter((email) => !previousSet.has(email));

  button.textContent = "Saving access...";
  await savePortalData();
  await replaceProjectAccessInSupabase(project.id);
  if (emails.length) await verifyProjectInviteAccess({ project, emails });

  if (newlyAddedEmails.length) {
    button.textContent = "Sending invite...";
    const video = projectVideos(project.id)[0];
    await emailProjectClient({
      client: {
        name:
          newlyAddedEmails.length === 1
            ? accountNameForEmail(newlyAddedEmails[0])
            : `${newlyAddedEmails.length} client accounts`,
        contact: newlyAddedEmails.length === 1 ? accountNameForEmail(newlyAddedEmails[0]) : "Client team",
        email: newlyAddedEmails.join(","),
      },
      project,
      video,
      version: video ? latestVersion(video.id) : null,
      emails: newlyAddedEmails,
      emailType: "invite",
    });
  }

  state.activity.unshift(`Updated client access for ${project.name}`);
  await savePortalData();
  return { selectedCount: emails.length, invitedCount: newlyAddedEmails.length };
}

async function saveProjectAdminsFromForm(form, button) {
  const project = activeProject();
  const projectId = String(form.get("projectId") || project?.id || "");
  if (!project || project.id !== projectId) {
    throw new Error("Open a project before changing admin access.");
  }

  const emails = clientEmails(form.get("adminCollaboratorEmails"));
  if (emails.length) state.projectCollaborators[project.id] = emails;
  else delete state.projectCollaborators[project.id];

  button.textContent = "Saving admins...";
  await savePortalData();
  await replaceProjectAccessInSupabase(project.id);
  state.activity.unshift(`Updated admin collaborators for ${project.name}`);
  await savePortalData();
  return emails.length;
}

async function notifyProjectRecipients(button) {
  const project = activeProject();
  const emails = projectRecipientEmails(project?.id);
  if (!project || !emails.length) {
    showToast("Share this project with clients first");
    return;
  }

  const { video, version } = latestProjectVersion(project.id);
  if (!video || !version) {
    showToast("Upload a version before notifying clients");
    return;
  }

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Notifying clients...";

  try {
    await emailProjectClient({
      client: {
        name: emails.length === 1 ? accountNameForEmail(emails[0]) : `${emails.length} client accounts`,
        contact: emails.length === 1 ? accountNameForEmail(emails[0]) : "Client team",
        email: emails.join(","),
      },
      project,
      video,
      version,
      emails,
      emailType: "version",
    });
    state.activity.unshift(`Notified ${emails.length} client account${emails.length === 1 ? "" : "s"} about ${version.label} for ${project.name}`);
    await savePortalData();
    showToast(`Update sent to ${emails.length} client account${emails.length === 1 ? "" : "s"}`);
  } catch (error) {
    showToast(error.message || "Clients could not be notified");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function createBunnyUploadCredentials({ title, projectTitle }) {
  const response = await fetch(apiUrl("/api/create-bunny-upload"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, projectTitle }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Bunny upload could not start");
  return result;
}

async function createVimeoUploadCredentials({ title, size, projectTitle }) {
  const response = await fetch(apiUrl("/api/create-vimeo-upload"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, size, projectTitle }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Vimeo upload could not start");
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

async function uploadToVimeo(file, credentials, onProgress) {
  const tusClient = await loadTusClient();
  if (!tusClient?.Upload) {
    throw new Error("Video uploader is still loading. Try again in a moment.");
  }

  return new Promise((resolve, reject) => {
    const formatUploadError = (error) => {
      const status = error?.originalResponse?.getStatus?.();
      const body = error?.originalResponse?.getBody?.();
      const detail = [status ? `status ${status}` : "", body].filter(Boolean).join(": ");
      return new Error(detail ? `Vimeo upload failed (${detail})` : error?.message || "Vimeo upload failed");
    };

    const upload = new tusClient.Upload(file, {
      uploadUrl: credentials.uploadLink,
      retryDelays: [0, 3000, 5000, 10000, 20000, 60000, 60000],
      removeFingerprintOnSuccess: true,
      headers: {
        Accept: "application/vnd.vimeo.*+json;version=3.4",
      },
      onError: (error) => reject(formatUploadError(error)),
      onProgress: (bytesUploaded, bytesTotal) => {
        const percent = bytesTotal ? Math.round((bytesUploaded / bytesTotal) * 100) : 0;
        onProgress(percent);
      },
      onSuccess: () => resolve(credentials),
    });

    upload.start();
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

async function uploadVersionFileToBunny({ file, title, projectTitle, button }) {
  button.textContent = "Creating Bunny video...";
  let credentials;
  try {
    credentials = await createBunnyUploadCredentials({ title, projectTitle });
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

async function uploadVersionFileToVimeo({ file, title, projectTitle, button }) {
  button.textContent = "Creating Vimeo video...";
  let credentials;
  try {
    credentials = await createVimeoUploadCredentials({ title, size: file.size, projectTitle });
  } catch (error) {
    throw new Error(`Could not create Vimeo video: ${error.message}`);
  }
  credentials.title = title;
  button.textContent = "Uploading 0%";
  try {
    await uploadToVimeo(file, credentials, (percent) => {
      button.textContent = `Uploading ${percent}%`;
    });
  } catch (error) {
    throw new Error(`Vimeo upload failed: ${error.message}`);
  }
  return credentials;
}

async function uploadVersionFile({ provider, file, title, projectTitle, button }) {
  return provider === "Vimeo"
    ? uploadVersionFileToVimeo({ file, title, projectTitle, button })
    : uploadVersionFileToBunny({ file, title, projectTitle, button });
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
          return `
            <article class="card">
              <p class="eyebrow">${client.contact}</p>
              <h3>${client.name}</h3>
              <p>${client.summary}</p>
              <div class="card-footer">
                <span class="metric">${activeProjects.length} projects</span>
                <div class="inline-actions">
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
  document.querySelector("#openCreate").hidden = state.session?.role !== "admin";
  if (deleteClientAction) {
    deleteClientAction.hidden = state.session?.role !== "admin";
    deleteClientAction.dataset.clientId = client.id;
    deleteClientAction.dataset.action = "client";
    deleteClientAction.textContent = "Delete client";
  }
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
      <div class="${projects.length ? "grid project-card-grid" : "project-list"}">
        ${
          projects.length
            ? projects
                .map(
                  (project) => {
                    const videos = projectVideos(project.id);
                    const images = projectImages(project.id);
                    const versions = projectVersionCount(project.id);
                    const recipients = projectRecipientEmails(project.id);
                    return `
                      <article class="card project-card">
                        <p class="eyebrow">${project.status}</p>
                        <h3>${project.name}</h3>
                        <p>${project.description}</p>
                        <div class="meta-strip">
                          <span>${videos.length} videos</span>
                          <span>${versions} versions</span>
                          <span>${images.length} images</span>
                        </div>
                        <div class="card-footer">
                          <span class="metric">${recipients.length ? `${recipients.length} shared` : "not shared"}</span>
                          <button class="ghost-button" data-project="${project.id}">Open</button>
                        </div>
                      </article>
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
      const video = projectVideos(state.selectedProjectId)[0];
      if (video) state.selectedVideoId = video.id;
      saveState();
      renderProjectDetail();
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

  const videos = projectVideos(project.id);
  const images = projectImages(project.id);
  const recipients = projectRecipientEmails(project.id);
  const isShared = recipients.length > 0;
  const sendStatus = isShared
    ? `${recipients.length} client account${recipients.length === 1 ? "" : "s"} will receive update notices.`
    : "No clients have access yet. Share this project when it is ready.";
  setPageHeader(project.name);
  document.querySelector("#openCreate").textContent = "Add video";
  document.querySelector("#openCreate").hidden = state.session?.role !== "admin";
  if (deleteClientAction) {
    deleteClientAction.hidden = state.session?.role !== "admin";
    deleteClientAction.dataset.projectId = project.id;
    deleteClientAction.dataset.action = "project";
    deleteClientAction.textContent = "Delete project";
  }
  createIntent = "video";

  root.innerHTML = `
    <div class="project-layout">
      <section class="project-media-panel">
        <div class="media-library-grid">
          <div class="media-section media-section-box">
            <div class="media-section-head">
              <div>
                <p class="eyebrow">Videos</p>
                <h3>Videos</h3>
              </div>
              <div class="media-head-actions">
                <button class="ghost-button small-action" id="addVideo">Add video</button>
              </div>
            </div>
            ${renderVideoCardGrid({ videos, dataAttribute: "data-video", actionLabel: "Open" })}
          </div>
          <div class="media-section media-section-box">
            <div class="media-section-head">
              <div>
                <p class="eyebrow">Images</p>
                <h3>Images</h3>
              </div>
              <div class="media-head-actions">
                <button class="ghost-button small-action" id="addImage">Add image</button>
              </div>
            </div>
            ${renderProjectImageGrid(images, { emptyText: "No images yet." })}
          </div>
        </div>
      </section>
      <aside class="panel stack action-panel">
        <p class="eyebrow">Delivery</p>
        <button class="primary-button" id="deliveryPrimary">${isShared ? "Notify clients of latest update" : "Share project"}</button>
        <p class="muted">${sendStatus}</p>
        <div class="access-block">
          <div class="access-block-head">
            <span>Clients in project</span>
            <button class="ghost-button small-action" id="manageClients">${isShared ? "Add / remove" : "Add clients"}</button>
          </div>
          ${renderProjectAccessList(recipients)}
        </div>
      </aside>
    </div>
  `;

  root.querySelectorAll("[data-video]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedVideoId = button.dataset.video;
      state.selectedVersionId = "";
      saveState();
      renderAdminReview();
    });
  });
  root.querySelector("#deliveryPrimary").addEventListener("click", (event) => {
    if (isShared) notifyProjectRecipients(event.currentTarget);
    else openProjectShareDialog();
  });
  root.querySelector("#manageClients").addEventListener("click", () => {
    openProjectShareDialog();
  });
  root.querySelector("#addVideo").addEventListener("click", () => openDialog("video"));
  root.querySelector("#addImage").addEventListener("click", () => openDialog("image"));
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
                  const images = projectImages(project.id);
                  const versions = videos.flatMap((video) => videoVersions(video.id));
                  const latest = versions[0];
                  const approvedCount = versions.filter((version) => version.approved).length;
                  const noteCount = versions.reduce(
                    (total, version) => total + visibleCommentsForVersion(version.id).length,
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
                        <span>${images.length} image${images.length === 1 ? "" : "s"}</span>
                        <span>${noteCount} note${noteCount === 1 ? "" : "s"}</span>
                      </div>
                      <div class="card-footer">
                        <span class="metric">${latest?.approved ? "approved" : approvedCount ? `${approvedCount} approved` : "in review"}</span>
                        <button class="ghost-button" data-client-project="${project.id}" ${videos.length || images.length ? "" : "disabled"}>
                          ${videos.length || images.length ? "Open project" : "No media yet"}
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
  const images = projectImages(project.id);
  setPageHeader(project.name, "Project review", "client");
  document.querySelector("#openCreate").hidden = true;

  root.innerHTML = `
    <section class="workspace-panel">
      <div class="workspace-head media-clean-head">
        <p class="muted">${project.description || "Review the latest project files."}</p>
        <button class="ghost-button" type="button" id="backClientDashboard">Back to projects</button>
      </div>
      <div class="media-library-grid">
        <div class="media-section media-section-box">
          <div class="media-section-head">
            <div>
              <p class="eyebrow">Videos</p>
              <h3>Videos</h3>
            </div>
          </div>
          ${renderVideoCardGrid({
            videos,
            dataAttribute: "data-client-video",
            actionLabel: "Review",
            emptyText: "No videos are ready for this project yet.",
            requireVersion: true,
          })}
        </div>
        <div class="media-section media-section-box">
          <div class="media-section-head">
            <div>
              <p class="eyebrow">Images</p>
              <h3>Images</h3>
            </div>
          </div>
          ${renderProjectImageGrid(images, { emptyText: "No images yet." })}
        </div>
      </div>
    </section>
  `;

  root.querySelector("#backClientDashboard")?.addEventListener("click", renderClientDashboard);
  root.querySelectorAll("[data-client-video]").forEach((button) => {
    button.addEventListener("click", () => {
      const videoId = button.dataset.clientVideo;
      const version = videoVersions(videoId)[0];
      if (!version) return;
      state.selectedProjectId = project.id;
      state.selectedVideoId = videoId;
      state.selectedVersionId = version.id;
      saveState();
      renderClientReview();
    });
  });
}

function renderClientReview() {
  rememberView("clientReview");
  renderReviewShell(false);
}

function formatReviewEventTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function renderReviewStatusContent(version, project) {
  const summary = reviewSummaryForVersion(version, project);
  if (!summary.rows.length) {
    return `
      <div class="empty compact-empty">
        Share this project with clients to track views and approvals.
      </div>
    `;
  }

  return `
    <div class="review-status-list">
      ${summary.rows
        .map(
          (row) => `
            <div class="review-status-row">
              <div class="review-status-main">
                <div>
                  <strong>${escapeHtml(row.name)}</strong>
                  <span>${escapeHtml(row.email)}</span>
                </div>
                <div class="review-status-approval ${row.approved ? "approved" : ""}" aria-label="${row.approved ? "Approved" : "Not approved"}"></div>
              </div>
              <div class="review-status-meta">
                <span class="${row.seen ? "status-dot ready" : "status-dot"}">${row.seen ? "Seen" : "Not seen"}</span>
                <small>
                ${
                  row.approvedAt
                    ? `Approved ${escapeHtml(formatReviewEventTime(row.approvedAt))}`
                    : row.seenAt
                      ? `Seen ${escapeHtml(formatReviewEventTime(row.seenAt))}`
                      : "Waiting for client"
                }
                </small>
              </div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderClientReviewStatus(version) {
  const approved = clientReviewEvent(version?.id, "approved");
  return `
    <div class="client-review-status">
      <span class="${approved ? "status-dot approved" : "status-dot"}">${approved ? "Approved" : "Awaiting approval"}</span>
    </div>
  `;
}

function refreshReviewStatusUi() {
  if (!(currentView === "adminReview" || currentView === "clientReview")) return;
  const video = activeVideo();
  const project = state.projects.find((item) => item.id === video?.projectId);
  const version = state.versions.find((item) => item.id === state.selectedVersionId) || latestVersion(video?.id);
  if (!version || !project) return;

  const summary = reviewSummaryForVersion(version, project);
  const statusMount = document.querySelector("#reviewStatusMount");
  if (statusMount) statusMount.innerHTML = renderReviewStatusContent(version, project);

  const statusCount = document.querySelector("#reviewStatusCount");
  if (statusCount) {
    statusCount.textContent = summary.total
      ? `${summary.approvedCount}/${summary.total} approved`
      : "No clients yet";
  }

  const clientStatus = document.querySelector("#clientReviewStatus");
  if (clientStatus) clientStatus.innerHTML = renderClientReviewStatus(version);

  const approveButton = document.querySelector("#approveVersion");
  const isApprovedByClient = Boolean(clientReviewEvent(version.id, "approved"));
  if (approveButton) {
    approveButton.textContent = isApprovedByClient ? "Approved" : "Approve this version";
    approveButton.disabled = isApprovedByClient;
  }
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
  if (state.selectedVideoId !== video.id) {
    state.selectedVideoId = video.id;
    saveState();
  }

  const project = state.projects.find((item) => item.id === video.projectId);
  const versions = state.versions.filter((version) => version.videoId === video.id);
  const newestVersion = versions[0];
  const knownLatestVersionId = state.latestVersionByVideo?.[video.id] || "";
  const selectedVersionStillExists = versions.some((item) => item.id === state.selectedVersionId);
  if (newestVersion && (!selectedVersionStillExists || knownLatestVersionId !== newestVersion.id)) {
    state.selectedVersionId = newestVersion.id;
    state.latestVersionByVideo[video.id] = newestVersion.id;
    saveState();
  }
  const version = versions.find((item) => item.id === state.selectedVersionId) || newestVersion;
  const comments = visibleCommentsForVersion(version?.id);
  const summary = reviewSummaryForVersion(version, project);
  const clientApproved = Boolean(clientReviewEvent(version?.id, "approved"));
  setPageHeader(isAdmin ? video.title : project.name, isAdmin ? project?.name || "Video review" : "Project review");
  document.querySelector("#openCreate").hidden = true;
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
            <p class="eyebrow">${version?.label || project?.name || "Video"}</p>
            <h2>${video.title}</h2>
            ${version?.note ? `<p class="muted">${version.note}</p>` : ""}
          </div>
          ${
            version
              ? `<div class="inline-actions">
                  <span class="provider-pill">${version.provider || "Video"}</span>
                  <span class="status-pill ${summary.hasApproval ? "approved" : ""}">${escapeHtml(versionReviewLabel(version, project))}</span>
                </div>`
              : ""
          }
        </div>
      </section>
      <aside class="panel stack review-side-panel">
        <p class="eyebrow">Versions</p>
        ${isAdmin ? `<button class="primary-button" id="addReviewVersion">${versions.length ? "Upload new version" : "Add first version"}</button>` : ""}
        ${
          versions.length
            ? `
              <div class="version-dropdown">
                <div class="version-row current-version-row">
                  <div>
                    <h3>${version?.label || "Current version"}</h3>
                    <p class="muted">${version?.createdAt || ""}</p>
                  </div>
                  ${
                    versions.length > 1
                      ? `<button class="version-menu-toggle" type="button" id="versionMenuToggle" aria-label="Choose version" aria-expanded="false">
                          <span class="chevron-down" aria-hidden="true"></span>
                        </button>`
                      : ""
                  }
                </div>
                ${
                  versions.length > 1
                    ? `<div class="version-menu" id="versionMenu" hidden>
                        ${versions
                          .map(
                            (item) => `
                              <button class="version-menu-item ${item.id === version?.id ? "active" : ""}" type="button" data-review-version="${item.id}">
                                <span>
                                  <strong>${item.label}</strong>
                                  <small>${item.createdAt}</small>
                                </span>
                                <span class="status-pill ${reviewSummaryForVersion(item, project).hasApproval ? "approved" : ""}">${escapeHtml(versionReviewLabel(item, project))}</span>
                              </button>
                            `,
                          )
                          .join("")}
                      </div>`
                    : ""
                }
              </div>
            `
            : `<div class="empty compact-empty">No versions yet.</div>`
        }
        ${
          version && isAdmin
            ? `<button class="ghost-button review-status-toggle" id="reviewStatusToggle" type="button" aria-expanded="false">
                <span>Review status</span>
                <span class="review-status-toggle-meta">
                  <span id="reviewStatusCount">${summary.total ? `${summary.approvedCount}/${summary.total} approved` : "No clients yet"}</span>
                  <span class="chevron-down" aria-hidden="true"></span>
                </span>
              </button>
              <div class="review-status-panel" id="reviewStatusPanel" hidden>
                <div id="reviewStatusMount">${renderReviewStatusContent(version, project)}</div>
              </div>`
            : ""
        }
        ${
          version && !isAdmin
            ? `<button class="primary-button" id="approveVersion" ${clientApproved ? "disabled" : ""}>${clientApproved ? "Approved" : "Approve this version"}</button>
              <div id="clientReviewStatus">${renderClientReviewStatus(version)}</div>`
            : ""
        }
        ${isAdmin ? `<button class="ghost-button" id="backProject">Back to project</button>` : `<button class="ghost-button" id="backClientProject">Back to project</button>`}
        ${
          version
            ? `<div class="comments-panel">
                <p class="eyebrow">Comments</p>
                ${
                  comments.length
                    ? comments
                        .map(
                          (comment) => `
                            <div class="comment-row">
                              <div class="avatar">${escapeHtml(comment.author.slice(0, 1))}</div>
                              <div>
                                <strong>${escapeHtml(comment.author)}</strong>
                                <span class="muted"> ${escapeHtml(comment.createdAt)}</span>
                                <p>${escapeHtml(comment.body)}</p>
                              </div>
                            </div>
                          `,
                        )
                        .join("")
                    : `<div class="empty compact-empty">No comments yet.</div>`
                }
                <form class="comment-form" id="commentForm">
                  <textarea name="body" placeholder="Add a comment"></textarea>
                  <button class="primary-button">Add comment</button>
                </form>
              </div>`
            : ""
        }
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

  root.querySelector("#versionMenuToggle")?.addEventListener("click", () => {
    const menu = root.querySelector("#versionMenu");
    const toggle = root.querySelector("#versionMenuToggle");
    if (!menu || !toggle) return;
    const shouldOpen = menu.hidden;
    menu.hidden = !shouldOpen;
    toggle.setAttribute("aria-expanded", String(shouldOpen));
  });

  root.querySelector("#addReviewVersion")?.addEventListener("click", () => openDialog("version"));

  root.querySelector("#reviewStatusToggle")?.addEventListener("click", () => {
    const panel = root.querySelector("#reviewStatusPanel");
    const toggle = root.querySelector("#reviewStatusToggle");
    if (!panel || !toggle) return;
    const shouldOpen = panel.hidden;
    panel.hidden = !shouldOpen;
    toggle.setAttribute("aria-expanded", String(shouldOpen));
    refreshReviewStatusUi();
  });

  root.querySelector("#commentForm")?.addEventListener("submit", async (event) => {
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

  root.querySelector("#approveVersion")?.addEventListener("click", async () => {
    if (!version || isAdmin || clientReviewEvent(version.id, "approved")) return;
    const saved = await saveClientReviewEvent({ version, type: "approved" });
    if (saved) {
      showToast("Version marked approved");
      renderReviewShell(false);
    }
  });

  const back = root.querySelector("#backProject");
  if (back) back.addEventListener("click", renderProjectDetail);
  const backClientProject = root.querySelector("#backClientProject");
  if (backClientProject) backClientProject.addEventListener("click", renderClientProject);
  if (!isAdmin && version) markVersionSeen(version);
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

function renderAccountOptions({
  accounts,
  selectedEmails,
  query = "",
  role = "client",
  hiddenId = "accountEmails",
  emptyText = "No accounts found yet.",
}) {
  const options = dialogFields.querySelector("#accountOptions");
  const hidden = dialogFields.querySelector(`#${hiddenId}`);
  const selectedCount = dialogFields.querySelector("#accountSelectedCount");
  if (!options || !hidden || !selectedCount) return;

  const selected = [...selectedEmails];
  hidden.value = selected.join(",");
  selectedCount.textContent = selected.length ? `${selected.length} selected` : "No accounts selected";

  const searchTerm = query.trim().toLowerCase();
  const currentEmail = normalizeEmail(state.session?.email);
  const roleAccounts = accounts.filter((account) => {
    if (account.role !== role) return false;
    if (role === "admin" && normalizeEmail(account.email) === currentEmail) return false;
    return true;
  });
  const filtered = roleAccounts.filter((account) => {
    const haystack = `${account.fullName || ""} ${account.email || ""}`.toLowerCase();
    return !searchTerm || haystack.includes(searchTerm);
  });

  if (!roleAccounts.length) {
    options.innerHTML = `
      <div class="account-empty">
        ${escapeHtml(emptyText)}
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

function setupAccountPicker({
  role = "client",
  hiddenId = "accountEmails",
  selected = [],
  emptyText = "No accounts found yet.",
} = {}) {
  const selectedEmails = new Set(clientEmails(selected));
  const search = dialogFields.querySelector("#accountSearch");
  const options = dialogFields.querySelector("#accountOptions");

  const renderOptions = () => {
    renderAccountOptions({
      accounts: state.accountDirectory || [],
      selectedEmails,
      query: search?.value || "",
      role,
      hiddenId,
      emptyText,
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

function renderClientDetailStep({ name = "", summary = "" } = {}) {
  clientDialogStep = "details";
  dialogEyebrow.hidden = false;
  dialogEyebrow.textContent = "Create";
  dialogSubtitle.hidden = true;
  dialogSubtitle.textContent = "";
  dialogTitle.textContent = "New client";
  createSubmit.textContent = "Save";
  document.querySelector("#cancelDialog").textContent = "Cancel";
  dialogFields.innerHTML = `
    <label>
      Client name
      <input name="name" placeholder="Silver Dollar City" value="${escapeHtml(name)}" />
    </label>
    <label>
      Summary
      <textarea name="summary" placeholder="Commercial campaign and brand films.">${escapeHtml(summary)}</textarea>
    </label>
  `;
}

function openProjectShareDialog() {
  const project = activeProject();
  if (!project) {
    showToast("Open a project before sharing");
    return;
  }

  const recipients = projectRecipientEmails(project.id);
  const isShared = recipients.length > 0;
  createIntent = "share";
  clientDialogStep = "";
  createForm.reset();
  dialogEyebrow.hidden = false;
  dialogEyebrow.textContent = "Client access";
  dialogTitle.textContent = isShared ? "Project clients" : "Share project";
  dialogSubtitle.hidden = false;
  dialogSubtitle.textContent = isShared
    ? "Add or remove client accounts for this project. Newly added clients will receive an invite email."
    : "Choose the client accounts that should see this project. They will receive an invite email.";
  createSubmit.textContent = isShared ? "Save clients" : "Send invite";
  createSubmit.disabled = false;
  document.querySelector("#cancelDialog").textContent = "Cancel";
  dialogFields.innerHTML = `
    <input name="projectId" type="hidden" value="${escapeHtml(project.id)}" />
    <div class="account-picker">
      <div class="account-picker-head">
        <span id="accountSelectedCount">No accounts selected</span>
      </div>
      <input id="shareClientEmails" name="shareClientEmails" type="hidden" />
      <div class="account-box">
        <input id="accountSearch" type="search" placeholder="Search client accounts" autocomplete="off" />
        <div class="account-options" id="accountOptions">
          <div class="account-empty">Loading client accounts...</div>
        </div>
      </div>
    </div>
  `;
  setupAccountPicker({
    role: "client",
    hiddenId: "shareClientEmails",
    selected: recipients,
    emptyText: "No client accounts found yet. Have the client create an account first.",
  });
  dialog.showModal();
}

function openProjectAdminsDialog() {
  const project = activeProject();
  if (!project) {
    showToast("Open a project before adding admins");
    return;
  }

  createIntent = "admins";
  clientDialogStep = "";
  createForm.reset();
  dialogEyebrow.hidden = false;
  dialogEyebrow.textContent = "Project access";
  dialogTitle.textContent = "Project admins";
  dialogSubtitle.hidden = false;
  dialogSubtitle.textContent = "Choose other admin accounts that should collaborate on this project.";
  createSubmit.textContent = "Save admins";
  createSubmit.disabled = false;
  document.querySelector("#cancelDialog").textContent = "Cancel";
  dialogFields.innerHTML = `
    <input name="projectId" type="hidden" value="${escapeHtml(project.id)}" />
    <div class="account-picker">
      <div class="account-picker-head">
        <span id="accountSelectedCount">No accounts selected</span>
      </div>
      <input id="adminCollaboratorEmails" name="adminCollaboratorEmails" type="hidden" />
      <div class="account-box">
        <input id="accountSearch" type="search" placeholder="Search admin accounts" autocomplete="off" />
        <div class="account-options" id="accountOptions">
          <div class="account-empty">Loading admin accounts...</div>
        </div>
      </div>
    </div>
  `;
  setupAccountPicker({
    role: "admin",
    hiddenId: "adminCollaboratorEmails",
    selected: projectCollaboratorEmails(project.id),
    emptyText: "No other admin accounts found yet.",
  });
  dialog.showModal();
}

function openDialog(intent = createIntent) {
  createIntent = intent;
  clientDialogStep = intent === "client" ? "details" : "";
  const fields = {
    client: [
      ["name", "Client name", "Silver Dollar City"],
      ["summary", "Summary", "Commercial campaign and brand films."],
    ],
    project: [
      ["name", "Project name", "Summer Campaign"],
      ["description", "Description", "Main spot, social cuts, and version review."],
      ["status", "Status", "review"],
    ],
    video: [
      ["title", "Video title", "Launch Film"],
      ["due", "Details", "Main spot, social cut, or edit name."],
    ],
    image: [
      ["title", "Image title", "Storyboard frame"],
      ["imageUrl", "Image URL", "https://example.com/frame.jpg"],
    ],
    version: [
      ["label", "Version label", "Version 4"],
      ["provider", "Provider", "Bunny Stream", "select"],
      ["file", "Video file", ""],
      ["note", "Version note", "Updated music and end card."],
    ],
  };

  if (intent === "approve") {
    showToast("Open a version to approve it.");
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

  if ((intent === "video" || intent === "version" || intent === "image") && !activeProject()) {
    showToast("Open a project before uploading");
    return;
  }

  const isFirstVersion = intent === "version" && !videoVersions(activeVideo()?.id).length;
  dialogTitle.textContent = {
    client: "New client",
    project: "New project",
    video: "Add video",
    image: "Add image",
    version: isFirstVersion ? "Add first version" : "Upload new version",
  }[intent];
  dialogEyebrow.hidden = false;
  dialogEyebrow.textContent = "Create";
  dialogSubtitle.hidden = true;
  dialogSubtitle.textContent = "";
  if (createSubmit) {
    createSubmit.textContent = intent === "version" ? "Upload" : "Save";
    createSubmit.disabled = false;
  }
  document.querySelector("#cancelDialog").textContent = "Cancel";

  createForm.reset();

  if (intent === "client") {
    renderClientDetailStep();
    dialog.showModal();
    return;
  }

  dialogFields.innerHTML = fields[intent]
    .map(
      ([name, label, placeholder, type]) => `
        <label>
          ${label}
          ${
            name === "note" || name === "summary" || name === "description"
              ? `<textarea name="${name}" placeholder="${placeholder}"></textarea>`
              : type === "select" && name === "provider"
                ? `<select name="${name}">
                    <option value="Bunny Stream">Bunny</option>
                    <option value="Vimeo">Vimeo</option>
                  </select>`
              : name === "file"
                ? `<input name="${name}" type="file" accept="video/*" />`
                : name === "imageUrl"
                  ? `<input name="${name}" type="url" placeholder="${placeholder}" />`
                : `<input name="${name}" placeholder="${placeholder}" />`
          }
        </label>
      `,
    )
    .join("");

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
    projectRecipients: structuredClone(state.projectRecipients),
    projectCollaborators: structuredClone(state.projectCollaborators),
    projectAccessRows: structuredClone(state.projectAccessRows),
    selectedClientId: state.selectedClientId,
    selectedProjectId: state.selectedProjectId,
    selectedVideoId: state.selectedVideoId,
  };
  saveButton.disabled = true;
  const uploadsVideo = createIntent === "version";
  saveButton.textContent = uploadsVideo ? "Starting upload..." : "Saving...";
  showToast(uploadsVideo ? "Starting upload..." : "Saving...");
  syncPaused = true;

  try {
    if (createIntent === "share") {
      const shareResult = await shareProjectFromForm(form, saveButton);
      dialog.close();
      createForm.reset();
      const shareMessage = shareResult.invitedCount
        ? `Invited ${shareResult.invitedCount} new client${shareResult.invitedCount === 1 ? "" : "s"}`
        : shareResult.selectedCount
          ? `Project access saved for ${shareResult.selectedCount} client${shareResult.selectedCount === 1 ? "" : "s"}`
          : "Project client access cleared";
      showToast(shareMessage);
      renderProjectDetail();
      return;
    }

    if (createIntent === "admins") {
      const adminCount = await saveProjectAdminsFromForm(form, saveButton);
      dialog.close();
      createForm.reset();
      showToast(adminCount ? `${adminCount} admin collaborator${adminCount === 1 ? "" : "s"} saved` : "Project admins cleared");
      renderProjectDetail();
      return;
    }

    if (createIntent === "client") {
      const name = form.get("name") || "New Client";
      state.clients.push({
        id: `${slug(name) || "client"}-${nowId}`,
        name,
        contact: "Client workspace",
        email: "",
        summary: form.get("summary") || "New client workspace.",
        archived: false,
      });
    }

    if (createIntent === "project") {
      const name = form.get("name") || "New Project";
      const projectId = `${slug(name) || "project"}-${nowId}`;
      state.projects.unshift({
        id: projectId,
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
      state.selectedVersionId = "";
    }

    if (createIntent === "image") {
      const title = form.get("title") || "Project image";
      const imageUrl = String(form.get("imageUrl") || "").trim();
      if (!imageUrl) throw new Error("Paste an image URL before saving.");
      state.videos.unshift({
        id: `${slug(title) || "image"}-${nowId}`,
        projectId: activeProject().id,
        title,
        status: "image",
        due: imageUrl,
      });
    }

    if (createIntent === "version") {
      const project = activeProject();
      const video = projectVideos(project?.id).find((item) => item.id === state.selectedVideoId);
      if (!video) {
        throw new Error("Open a video before uploading a version.");
      }

      const file = form.get("file");
      const label = form.get("label") || "New version";
      const provider = form.get("provider") || "Bunny Stream";
      let embedUrl = "";
      let bunnyVideoId = "";

      if (!file?.size) {
        throw new Error("Choose a video file before saving a version");
      }

      if (file?.size) {
        const upload = await uploadVersionFile({
          provider,
          file,
          title: `${video.title} - ${label}`,
          projectTitle: project.name,
          button: saveButton,
        });
        embedUrl = upload.embedUrl;
        bunnyVideoId = upload.videoId || "";
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
      state.selectedVersionId = version.id;
    }

    saveButton.textContent = uploadsVideo ? "Saving version..." : createIntent === "image" ? "Saving image..." : "Saving...";
    await saveAndReloadPortalData();
    dialog.close();
    createForm.reset();
    const successMessage = uploadsVideo
      ? "Version saved"
      : createIntent === "video"
        ? "Video added"
        : "Saved";
    showToast(successMessage);
    if (createIntent === "project") renderProjects();
    else if (createIntent === "video" || createIntent === "image") renderProjectDetail();
    else if (createIntent === "version") renderReviewShell(state.mode === "admin");
    else renderClients();
  } catch (error) {
    state.clients = previousData.clients;
    state.projects = previousData.projects;
    state.videos = previousData.videos;
    state.versions = previousData.versions;
    state.comments = previousData.comments;
    state.deliveredProjectIds = previousData.deliveredProjectIds;
    state.projectRecipients = previousData.projectRecipients;
    state.projectCollaborators = previousData.projectCollaborators;
    state.projectAccessRows = previousData.projectAccessRows;
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
document.querySelector("#cancelDialog").addEventListener("click", () => {
  dialog.close();
});
deleteClientAction?.addEventListener("click", () => {
  if (deleteClientAction.dataset.action === "project") {
    const projectId = deleteClientAction.dataset.projectId || activeProject()?.id;
    if (projectId) deleteProject(projectId);
    return;
  }
  const clientId = deleteClientAction.dataset.clientId || activeClient()?.id;
  if (clientId) deleteClient(clientId);
});
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
