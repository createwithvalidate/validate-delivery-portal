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
  projectSmsRecipients: {},
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
state.projectSmsRecipients ??= {};
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
const phoneField = document.querySelector("#phoneField");
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

function timestampValue(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatTimestamp(value, fallback = "") {
  const parsed = timestampValue(value);
  if (!parsed) return fallback || String(value || "");
  return new Intl.DateTimeFormat([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(parsed));
}

function freshTimestampLabel() {
  return formatTimestamp(new Date().toISOString());
}

function normalizePhone(value = "") {
  return String(value).trim().replace(/[^\d+]/g, "");
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
    avatarUrl: account.avatarUrl || account.avatar_url || "",
    phoneNumber: normalizePhone(account.phoneNumber || account.phone_number || ""),
    smsOptIn: Boolean(account.smsOptIn ?? account.sms_opt_in),
    smsOptedOut: Boolean(account.smsOptedOut ?? account.sms_opted_out),
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

function canSendSmsToAccount(account = {}) {
  return Boolean(account.phoneNumber && account.smsOptIn && !account.smsOptedOut);
}

function projectRecipientEmails(projectId) {
  const explicit = clientEmails(state.projectRecipients?.[projectId]);
  if (explicit.length) return explicit;
  if (!state.deliveredProjectIds.includes(projectId)) return [];
  const project = state.projects.find((item) => item.id === projectId);
  const client = state.clients.find((item) => item.id === project?.clientId);
  return clientEmails(client);
}

function projectSmsRecipientEmails(projectId) {
  return clientEmails(state.projectSmsRecipients?.[projectId]);
}

function projectCollaboratorEmails(projectId) {
  return clientEmails(state.projectCollaborators?.[projectId]);
}

function accessRowsForProject(projectId) {
  const emails = [...new Set([...projectRecipientEmails(projectId), ...projectCollaboratorEmails(projectId)])];
  const smsEmails = new Set(projectSmsRecipientEmails(projectId));
  return emails.map((email) => ({ project_id: projectId, email, sms_enabled: smsEmails.has(email) }));
}

function projectAccessRowsForSave() {
  return state.projects.flatMap((project) => accessRowsForProject(project.id));
}

function applyProjectAccessRows(rows = []) {
  const normalizedRows = rows
    .map((row) => ({
      projectId: row.project_id || row.projectId,
      email: normalizeEmail(row.email),
      smsEnabled: Boolean(row.sms_enabled ?? row.smsEnabled),
    }))
    .filter((row) => row.projectId && row.email);
  const recipients = {};
  const smsRecipients = {};
  const collaborators = {};

  normalizedRows.forEach((row) => {
    const bucket = accountRoleForEmail(row.email) === "admin" ? collaborators : recipients;
    bucket[row.projectId] ??= [];
    if (!bucket[row.projectId].includes(row.email)) bucket[row.projectId].push(row.email);
    if (accountRoleForEmail(row.email) !== "admin" && row.smsEnabled) {
      smsRecipients[row.projectId] ??= [];
      if (!smsRecipients[row.projectId].includes(row.email)) smsRecipients[row.projectId].push(row.email);
    }
  });

  state.projectAccessRows = normalizedRows;
  state.projectRecipients = recipients;
  state.projectSmsRecipients = smsRecipients;
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
  const profile = await getCurrentProfile(user).catch((profileError) => {
    console.warn("Profile load after sign in failed", profileError);
    return fallbackProfileForUser(user);
  });
  return {
    user,
    profile,
  };
}

async function createInviteAccount({ email, password, fullName, inviteCode, phoneNumber = "", smsOptIn = false }) {
  const client = getSupabase();
  if (!client) throw new Error("Supabase is still loading. Try again in a moment.");
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        invite_code: inviteCode,
        phone_number: normalizePhone(phoneNumber),
        sms_opt_in: Boolean(smsOptIn),
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
    .select("email, full_name, role, avatar_url, phone_number, sms_opt_in, sms_opted_out")
    .eq("id", user.id)
    .maybeSingle();
  const profileSelectError = error?.message?.toLowerCase?.() || "";
  if (["avatar_url", "phone_number", "sms_opt_in", "sms_opted_out"].some((field) => profileSelectError.includes(field))) {
    const fallback = await client
      .from("profiles")
      .select("email, full_name, role")
      .eq("id", user.id)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    return {
      ...(fallback.data || fallbackProfileForUser(user)),
      avatar_url: user.user_metadata?.avatar_url || "",
    };
  }
  if (error) throw error;
  return (
    data || {
      email: user.email,
      full_name: user.user_metadata?.full_name || user.email,
      role: user.email?.toLowerCase() === firstAdminEmail ? "admin" : "client",
      avatar_url: user.user_metadata?.avatar_url || "",
      phone_number: user.user_metadata?.phone_number || "",
      sms_opt_in: Boolean(user.user_metadata?.sms_opt_in),
      sms_opted_out: false,
    }
  );
}

function fallbackProfileForUser(user) {
  return {
    email: user.email,
    full_name: user.user_metadata?.full_name || user.email,
    role: user.email?.toLowerCase() === firstAdminEmail ? "admin" : "client",
    avatar_url: user.user_metadata?.avatar_url || "",
    phone_number: user.user_metadata?.phone_number || "",
    sms_opt_in: Boolean(user.user_metadata?.sms_opt_in),
    sms_opted_out: false,
  };
}

function applyAccountSession(user, profile) {
  const role = profile?.role === "admin" ? "admin" : "client";
  const avatarUrl = profile?.avatar_url || user.user_metadata?.avatar_url || "";
  const phoneNumber = normalizePhone(profile?.phone_number || user.user_metadata?.phone_number || "");
  const smsOptIn = Boolean(profile?.sms_opt_in ?? user.user_metadata?.sms_opt_in);
  const smsOptedOut = Boolean(profile?.sms_opted_out);
  state.session = {
    role,
    email: user.email,
    name: profile?.full_name || user.user_metadata?.full_name || user.email,
    avatarUrl,
    phoneNumber,
    smsOptIn,
    smsOptedOut,
  };
  state.mode = role;
  state.clientAccount =
    role === "client"
      ? {
          id: `account-${user.id}`,
          name: profile?.full_name || user.user_metadata?.full_name || "Client Account",
          contact: profile?.full_name || user.email,
          email: user.email,
          avatarUrl,
          phoneNumber,
          smsOptIn,
          smsOptedOut,
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
  const profile = await getCurrentProfile(user).catch((profileError) => {
    console.warn("Profile restore failed", profileError);
    return fallbackProfileForUser(user);
  });
  applyAccountSession(user, profile);
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
    createdAt: row.created_at || row.createdAt || "",
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
    createdAt: row.created_at || row.createdAt || "",
  };
}

function mapVideoRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    status: row.status || "draft",
    due: row.due || "Soon",
    createdAt: row.created_at || row.createdAt || "",
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
    createdAt: formatTimestamp(row.created_at || row.createdAt || row.created_at_label, "Just now"),
    createdAtRaw: row.created_at || row.createdAt || "",
    approved: Boolean(row.approved),
  };
}

function mapCommentRow(row) {
  return {
    id: row.id,
    versionId: row.version_id || row.versionId,
    author: row.author,
    role: row.role,
    body: row.body,
    createdAt: formatTimestamp(row.created_at || row.createdAt || row.created_at_label, "Just now"),
    createdAtRaw: row.created_at || row.createdAt || "",
    avatarUrl: row.avatarUrl || row.avatar_url || "",
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
    client.from("profiles").select("*").order("created_at", { ascending: false }),
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
    const { error } = await client.from("project_access").upsert(accessRows);
    if (error?.message?.toLowerCase?.().includes("sms_enabled")) {
      await runSave(
        client.from("project_access").upsert(
          accessRows.map(({ project_id, email }) => ({ project_id, email })),
        ),
        "Project access",
      );
    } else if (error) {
      throw new Error(`Project access did not save: ${error.message}`);
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
  }, 6200);
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
    projectSmsRecipients: state.projectSmsRecipients,
    projectCollaborators: state.projectCollaborators,
  });
}

function activeClientAccount() {
  if (state.mode !== "client") return activeClient();
  return state.clients.find((client) => clientMatchesSession(client)) || state.clientAccount;
}

function currentCommentAuthor(isAdmin) {
  if (isAdmin) return state.session?.name || state.session?.email || "Validate";
  const account = activeClientAccount();
  return account?.contact || account?.name || state.clientAccount?.name || state.session?.email || "Client";
}

function currentAvatarUrl() {
  return state.session?.avatarUrl || state.clientAccount?.avatarUrl || "";
}

function avatarForComment(comment = {}) {
  if (comment.avatarUrl) return comment.avatarUrl;
  const normalizedAuthor = normalizeEmail(comment.author);
  const sessionEmail = normalizeEmail(state.session?.email);
  const sessionName = String(state.session?.name || "").trim().toLowerCase();
  const authorName = String(comment.author || "").trim().toLowerCase();
  if (
    currentAvatarUrl() &&
    (normalizedAuthor === sessionEmail || (sessionName && authorName === sessionName))
  ) {
    return currentAvatarUrl();
  }
  const account = (state.accountDirectory || []).find((item) => {
    return normalizeEmail(item.email) === normalizedAuthor || String(item.fullName || "").trim().toLowerCase() === authorName;
  });
  return account?.avatarUrl || "";
}

function avatarInitials(name = "") {
  const parts = String(name || "V")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function renderAvatar(name, imageUrl = "") {
  const initials = avatarInitials(name);
  return `
    <div class="avatar ${imageUrl ? "has-image" : ""}">
      ${
        imageUrl
          ? `<img src="${escapeHtml(imageUrl)}" alt="" onerror="this.remove(); this.closest('.avatar')?.classList.remove('has-image');" /><span>${escapeHtml(initials)}</span>`
          : `<span>${escapeHtml(initials)}</span>`
      }
    </div>
  `;
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
    createdAt: freshTimestampLabel(),
    createdAtRaw: at,
    avatarUrl: currentAvatarUrl(),
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
  const unopenedCount = rows.filter((row) => !row.seen).length;
  return {
    rows,
    total: rows.length,
    seenCount,
    approvedCount,
    unopenedCount,
    hasApproval: Boolean(version?.approved || approvedCount),
  };
}

function reviewStatusSummaryLabel(summary) {
  if (!summary.total) return "No clients yet";
  if (summary.unopenedCount) {
    return `${summary.unopenedCount} not opened / ${summary.approvedCount}/${summary.total} approved`;
  }
  return `All opened / ${summary.approvedCount}/${summary.total} approved`;
}

function versionReviewLabel(version, project) {
  const summary = reviewSummaryForVersion(version, project);
  if (!summary.total) return version?.approved ? "approved" : "review";
  if (summary.approvedCount) return `${summary.approvedCount}/${summary.total} approved`;
  if (summary.seenCount) return `${summary.seenCount}/${summary.total} seen`;
  return "not seen";
}

function latestProjectReviewStatus(project) {
  const { video, version } = latestProjectVersion(project?.id);
  const summary = reviewSummaryForVersion(version, project);
  const unopened = summary.rows.filter((row) => !row.seen);
  return {
    video,
    version,
    summary,
    unopened,
    unopenedEmails: unopened.map((row) => row.email),
  };
}

function renderUnopenedNotice(status) {
  if (!status?.version || !status.unopened.length) return "";
  const names = status.unopened.map((row) => row.name || row.email);
  const visibleNames = names.slice(0, 3).join(", ");
  const extraCount = names.length > 3 ? ` +${names.length - 3} more` : "";
  return `
    <div class="delivery-notice">
      <strong>${status.unopened.length} client${status.unopened.length === 1 ? "" : "s"} not opened</strong>
      <span>${escapeHtml(visibleNames)}${extraCount} ${status.unopened.length === 1 ? "has" : "have"} not opened ${escapeHtml(status.version.label)} yet.</span>
    </div>
  `;
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
  if (phoneField) phoneField.hidden = !isCreate;
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
  const phoneNumber = normalizePhone(form.get("phoneNumber"));
  const smsOptIn = form.get("smsOptIn") === "yes";
  if (!email || !password || !fullName || !inviteCode) {
    showToast("Name, email, password, and invite code are required");
    return;
  }
  if (smsOptIn && !phoneNumber) {
    showToast("Add a phone number or turn off SMS notifications");
    return;
  }

  await createInviteAccount({ email, password, fullName, inviteCode, phoneNumber, smsOptIn });
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
    delete state.projectSmsRecipients[projectId];
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
  delete state.projectSmsRecipients[projectId];
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
  heroEyebrow.textContent = isClient ? "Client review" : "Delivery workspace";
  heroHeadline.textContent = isClient ? "Ready for review." : "Review work, delivered clearly.";
  heroSubcopy.textContent = isClient
    ? "Open a project, review the latest version, leave notes, and approve final cuts."
    : "Manage clients, files, review links, comments, and approvals from one focused workspace.";
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

async function smsProjectClient({ project, video, version, emails: explicitEmails = null, smsType = "version" }) {
  const emails = clientEmails(explicitEmails);
  if (!emails.length) return { ok: true, sent: 0, results: [] };
  if (!project) throw new Error("Open a project before sending SMS");

  const token = await supabaseAccessToken();
  if (!token) throw new Error("Sign in again before sending SMS.");

  const reviewUrl = `${location.origin}${location.pathname}#review/${project.id}`;
  const results = [];
  for (const email of emails) {
    const response = await fetch(apiUrl("/api/send-sms"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        smsType,
        clientEmail: email,
        projectName: project.name,
        videoTitle: video?.title || project.name,
        versionLabel: version?.label || "Project invite",
        versionNote:
          version?.note ||
          (smsType === "invite"
            ? "A project was added to your Validate dashboard."
            : "A new review version is ready."),
        reviewUrl,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `SMS could not be sent to ${email}`);
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
  let { data, error } = await supabase.from("project_access").upsert(rows).select("project_id,email,sms_enabled");
  if (error?.message?.toLowerCase?.().includes("sms_enabled")) {
    const fallback = await supabase
      .from("project_access")
      .upsert(rows.map(({ project_id, email }) => ({ project_id, email })))
      .select("project_id,email");
    data = fallback.data;
    error = fallback.error;
  }
  if (error) throw new Error(`Project access did not save: ${error.message}`);
  state.projectAccessRows = [
    ...state.projectAccessRows.filter((row) => row.projectId !== projectId),
    ...rows.map((row) => ({ projectId: row.project_id, email: row.email, smsEnabled: Boolean(row.sms_enabled) })),
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
  const smsEmails = clientEmails(form.get("shareSmsEmails")).filter((email) => {
    const account = accountForEmail(email);
    return emails.includes(email) && canSendSmsToAccount(account);
  });
  const previousEmails = projectRecipientEmails(project?.id);
  const previousSmsEmails = projectSmsRecipientEmails(project?.id);

  if (!emails.length && !previousEmails.length) {
    throw new Error("Choose at least one client account before sharing");
  }

  if (!project || project.id !== projectId) {
    throw new Error("Open a project before sharing");
  }

  if (emails.length) {
    state.projectRecipients[project.id] = emails;
    state.projectSmsRecipients[project.id] = smsEmails;
    if (!state.deliveredProjectIds.includes(project.id)) state.deliveredProjectIds.push(project.id);
  } else {
    delete state.projectRecipients[project.id];
    delete state.projectSmsRecipients[project.id];
    state.deliveredProjectIds = state.deliveredProjectIds.filter((id) => id !== project.id);
  }

  const previousSet = new Set(previousEmails);
  const newlyAddedEmails = emails.filter((email) => !previousSet.has(email));
  const previousSmsSet = new Set(previousSmsEmails);
  const newlySmsEnabledEmails = smsEmails.filter((email) => !previousSmsSet.has(email));

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

  let smsError = "";
  if (newlySmsEnabledEmails.length) {
    button.textContent = "Sending SMS...";
    const video = projectVideos(project.id)[0];
    try {
      await smsProjectClient({
        project,
        video,
        version: video ? latestVersion(video.id) : null,
        emails: newlySmsEnabledEmails,
        smsType: "invite",
      });
    } catch (error) {
      smsError = error.message || "SMS could not be sent yet";
    }
  }

  state.activity.unshift(`Updated client access for ${project.name}`);
  await savePortalData();
  return {
    selectedCount: emails.length,
    invitedCount: newlyAddedEmails.length,
    smsCount: smsError ? 0 : newlySmsEnabledEmails.length,
    smsError,
  };
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

async function notifyProjectRecipients(button, targetEmails = null) {
  const project = activeProject();
  const emails = clientEmails(targetEmails || projectRecipientEmails(project?.id));
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
  button.textContent = emails.length === projectRecipientEmails(project.id).length ? "Notifying clients..." : "Sending reminder...";

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
    const smsEmails = projectSmsRecipientEmails(project.id).filter((email) => {
      const account = accountForEmail(email);
      return emails.includes(email) && canSendSmsToAccount(account);
    });
    let smsSent = 0;
    let smsError = "";
    if (smsEmails.length) {
      button.textContent = "Sending SMS...";
      try {
        const smsResult = await smsProjectClient({
          project,
          video,
          version,
          emails: smsEmails,
          smsType: "version",
        });
        smsSent = smsResult.sent || smsEmails.length;
      } catch (error) {
        smsError = error.message || "SMS could not be sent yet";
      }
    }
    state.activity.unshift(
      `Notified ${emails.length} client account${emails.length === 1 ? "" : "s"} about ${version.label} for ${project.name}${
        smsSent ? ` and sent ${smsSent} SMS` : ""
      }`,
    );
    await savePortalData();
    showToast(
      smsError
        ? `Email sent. SMS needs setup: ${smsError}`
        : `Sent to ${emails.length} client account${emails.length === 1 ? "" : "s"}${smsSent ? ` / ${smsSent} SMS` : ""}`,
    );
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

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchVideoProcessingStatus({ provider, videoId }) {
  if (!videoId) return { ready: false, message: "Video ID is not available yet." };
  const params = new URLSearchParams({ provider, videoId });
  const response = await fetch(apiUrl(`/api/video-processing-status?${params.toString()}`));
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Video processing status could not be checked.");
  return result;
}

async function offerProcessingWait({ provider, videoId, button }) {
  if (!videoId) return;
  let status;
  try {
    button.textContent = "Checking processing...";
    status = await fetchVideoProcessingStatus({ provider, videoId });
  } catch (error) {
    const proceed = window.confirm(
      `${provider} has the file, but processing status could not be checked. The video may need a few minutes before it plays. Press OK to save it now, or Cancel to stop here.`,
    );
    if (!proceed) throw error;
    return;
  }

  if (status.ready) return;
  if (status.error) {
    throw new Error(status.message || `${provider} reported a processing problem.`);
  }

  const shouldWait = window.confirm(
    `${provider} has the upload, but it may still be processing. Videos might not play or show thumbnails until that finishes.\n\nPress OK to wait here for it to finish, or Cancel to save the version now.`,
  );
  if (!shouldWait) return;

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    button.textContent = `Processing check ${attempt}/30`;
    await delay(4000);
    status = await fetchVideoProcessingStatus({ provider, videoId });
    if (status.error) throw new Error(status.message || `${provider} reported a processing problem.`);
    if (status.ready) {
      window.alert("Video processing is done. Click OK to save this version.");
      return;
    }
  }

  window.alert(
    "The video is still processing. Click OK to save the version now. If it does not play right away, give Bunny or Vimeo a few more minutes and refresh.",
  );
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
        Loading workspace...
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
        No clients yet. Create a client workspace to start.
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
                  <button class="ghost-button" data-client="${client.id}">Open</button>
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
            : `<div class="empty project-empty">No projects yet. Create a project when a cut is ready for review.</div>`
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
  const latestStatus = latestProjectReviewStatus(project);
  const unopenedEmails = latestStatus.unopenedEmails;
  const sendStatus = !isShared
    ? "Share this project when the first review is ready."
    : !latestStatus.version
      ? `${recipients.length} client account${recipients.length === 1 ? "" : "s"} ${recipients.length === 1 ? "has" : "have"} access.`
      : unopenedEmails.length
        ? `${unopenedEmails.length} client${unopenedEmails.length === 1 ? "" : "s"} still ${unopenedEmails.length === 1 ? "has" : "have"} not opened the latest version.`
        : "All shared clients have opened the latest version.";
  const deliveryButtonLabel = !isShared ? "Share project" : unopenedEmails.length ? "Send reminder" : "Notify clients";
  setPageHeader(project.name);
  document.querySelector("#openCreate").textContent = "Add video";
  document.querySelector("#openCreate").hidden = true;
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
                <button class="primary-button small-action" id="addVideo">Add video</button>
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
                <button class="primary-button small-action" id="addImage">Add image</button>
              </div>
            </div>
            ${renderProjectImageGrid(images, { emptyText: "No images yet." })}
          </div>
        </div>
      </section>
      <aside class="panel stack action-panel">
        <p class="eyebrow">Delivery</p>
        <button class="primary-button" id="deliveryPrimary">${deliveryButtonLabel}</button>
        <p class="muted">${sendStatus}</p>
        ${isShared ? renderUnopenedNotice(latestStatus) : ""}
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
    if (isShared) notifyProjectRecipients(event.currentTarget, unopenedEmails.length ? unopenedEmails : null);
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
                No projects are available yet.
                <p class="muted load-diagnostics">Shared reviews will appear here.</p>
                <div class="modal-actions inline-retry">
                  <button class="ghost-button" type="button" id="refreshClientInvites">Refresh</button>
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
        <p class="muted">${project.description || "Review videos, images, and notes."}</p>
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
        .map((row) => {
          const statusText = row.approvedAt
            ? `Approved ${escapeHtml(formatReviewEventTime(row.approvedAt))}`
            : row.seenAt
              ? `Opened ${escapeHtml(formatReviewEventTime(row.seenAt))}`
              : "Not opened yet";
          return `
            <div class="review-status-row">
              <div class="review-status-main">
                <div>
                  <strong>${escapeHtml(row.name)}</strong>
                  <span>${statusText}</span>
                </div>
                <div class="review-status-approval ${row.approved ? "approved" : ""}" aria-label="${row.approved ? "Approved" : "Not approved"}"></div>
              </div>
            </div>
          `;
        })
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
    statusCount.textContent = reviewStatusSummaryLabel(summary);
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
        No review videos yet. Add a video and upload the first version.
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
                  <span id="reviewStatusCount">${reviewStatusSummaryLabel(summary)}</span>
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
                <p class="eyebrow">Notes</p>
                ${
                  comments.length
                    ? comments
                        .map(
                          (comment) => `
                            <div class="comment-row">
                              ${renderAvatar(comment.author, avatarForComment(comment))}
                              <div>
                                <strong>${escapeHtml(comment.author)}</strong>
                                <span class="muted"> ${escapeHtml(comment.createdAt)}</span>
                                <p>${escapeHtml(comment.body)}</p>
                              </div>
                            </div>
                          `,
                        )
                        .join("")
                    : `<div class="empty compact-empty">No notes yet.</div>`
                }
                <form class="comment-form" id="commentForm">
                  <textarea name="body" placeholder="Add a note"></textarea>
                  <button class="primary-button">Post note</button>
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
      createdAt: freshTimestampLabel(),
      createdAtRaw: new Date().toISOString(),
      avatarUrl: currentAvatarUrl(),
    };
    state.comments.unshift(comment);
    try {
      if (isAdmin) await savePortalData();
      else {
        saveState();
        const savedComment = await insertCommentInSupabase(comment);
        if (savedComment) upsertById(state.comments, mapCommentRow(savedComment));
        saveState();
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

  const rows = state.session?.role === "admin" ? adminActivityRows() : clientActivityRows();
  const emptyText =
    state.session?.role === "admin"
      ? "New admin and client accounts will appear here."
      : "Project updates will appear here when Validate shares or updates a review.";

  root.innerHTML = `
    <div class="activity-layout">
      <section class="panel stack activity-panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">${state.session?.role === "admin" ? "Accounts" : "Project updates"}</p>
            <h3>${state.session?.role === "admin" ? "Recent accounts" : "Latest in your projects"}</h3>
          </div>
          <span class="metric">${rows.length} item${rows.length === 1 ? "" : "s"}</span>
        </div>
        ${
          rows.length
            ? rows.map(renderActivityRow).join("")
            : `<div class="empty compact-empty">${emptyText}</div>`
        }
      </section>
    </div>
  `;
}

function adminActivityRows() {
  return [...(state.accountDirectory || [])]
    .sort((a, b) => timestampValue(b.createdAt) - timestampValue(a.createdAt))
    .map((account) => ({
      title: account.fullName || account.email,
      detail: account.email,
      meta: account.role === "admin" ? "Admin account" : "Client account",
      at: account.createdAt,
      avatarUrl: account.avatarUrl,
    }));
}

function clientActivityRows() {
  const delivered = new Set(state.deliveredProjectIds || []);
  const projects = state.projects.filter((project) => delivered.has(project.id));
  const projectRows = projects.map((project) => ({
    title: project.name,
    detail: project.description || "Project shared with your dashboard.",
    meta: "Project shared",
    at: project.createdAt,
  }));
  const videoIds = new Set(projects.flatMap((project) => projectVideos(project.id).map((video) => video.id)));
  const versionRows = state.versions
    .filter((version) => videoIds.has(version.videoId))
    .map((version) => {
      const video = state.videos.find((item) => item.id === version.videoId);
      const project = projects.find((item) => item.id === video?.projectId);
      return {
        title: version.label,
        detail: [project?.name, video?.title].filter(Boolean).join(" / ") || "New review version",
        meta: "New version",
        at: version.createdAtRaw || version.createdAt,
      };
    });
  return [...versionRows, ...projectRows]
    .filter((row) => row.title)
    .sort((a, b) => timestampValue(b.at) - timestampValue(a.at));
}

function renderActivityRow(row) {
  return `
    <div class="activity-row">
      ${renderAvatar(row.title, row.avatarUrl)}
      <div>
        <strong>${escapeHtml(row.title)}</strong>
        <span>${escapeHtml(row.detail || row.meta || "")}</span>
      </div>
      <div class="activity-time">
        <span>${escapeHtml(row.meta || "")}</span>
        <small>${escapeHtml(formatTimestamp(row.at, "Recently"))}</small>
      </div>
    </div>
  `;
}

function renderSettings() {
  rememberView("settings");
  dashboardHero.hidden = true;
  setPageHeader("Settings");
  document.querySelector("#openCreate").textContent = "New client";
  const isAdmin = state.session?.role === "admin";
  const avatarUrl = currentAvatarUrl();
  const phoneNumber = state.session?.phoneNumber || "";
  const smsEnabled = Boolean(phoneNumber && state.session?.smsOptIn && !state.session?.smsOptedOut);
  root.innerHTML = `
    <div class="settings-layout">
      <section class="panel settings-card profile-settings-card">
        <div class="settings-card-head">
          <div>
            <p class="eyebrow">Profile</p>
            <h3>Your account</h3>
          </div>
          ${renderAvatar(state.session?.name || state.session?.email, avatarUrl)}
        </div>
        <p class="muted">This name and photo show beside notes you leave on review pages.</p>
        <label class="profile-upload">
          Profile picture
          <input id="avatarUpload" type="file" accept="image/*" />
        </label>
      </section>

      <section class="panel settings-card">
        <div class="settings-card-head">
          <div>
            <p class="eyebrow">Security</p>
            <h3>Password</h3>
          </div>
        </div>
        <form class="settings-form" id="passwordForm">
          <label>
            New password
            <input name="newPassword" type="password" minlength="8" placeholder="At least 8 characters" />
          </label>
          <button class="primary-button" type="submit">Update password</button>
          <button class="ghost-button" type="button" id="sendPasswordReset">Email reset link</button>
        </form>
      </section>

      <section class="panel settings-card">
        <div class="settings-card-head">
          <div>
            <p class="eyebrow">Messaging</p>
            <h3>SMS notifications</h3>
          </div>
          <span class="status-pill ${smsEnabled ? "approved" : ""}">${smsEnabled ? "Enabled" : "Optional"}</span>
        </div>
        <p class="muted">Add a phone number if you want project invites or update reminders by text.</p>
        <form class="settings-form" id="smsSettingsForm">
          <label>
            Phone number
            <input name="phoneNumber" type="tel" placeholder="+1 417 555 0199" value="${escapeHtml(phoneNumber)}" />
          </label>
          <label class="toggle-row">
            <input name="smsOptIn" type="checkbox" value="yes" ${state.session?.smsOptIn ? "checked" : ""} />
            <span>Allow SMS review notifications</span>
          </label>
          <button class="primary-button" type="submit">Save SMS settings</button>
        </form>
      </section>

      ${
        isAdmin
          ? `<section class="panel settings-card invite-generator-card">
              <div class="settings-card-head">
                <div>
                  <p class="eyebrow">Invite generator</p>
                  <h3>Create signup code</h3>
                </div>
              </div>
              <form class="settings-form" id="inviteGeneratorForm">
                <label>
                  Account type
                  <select name="role">
                    <option value="client">Client</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                <label>
                  Email
                  <input name="email" type="email" placeholder="person@example.com" />
                </label>
                <button class="primary-button" type="submit">Generate code</button>
              </form>
              <div class="invite-result" id="inviteResult" hidden></div>
            </section>`
          : ""
      }

      <section class="panel settings-card integration-settings">
        <p class="eyebrow">Connections</p>
        <div class="integration-list">
          <div>
            <strong>Bunny Stream</strong>
            <span>Uploads, project collections, streaming embeds.</span>
          </div>
          <div>
            <strong>Vimeo</strong>
            <span>Uploads, private videos, project folders.</span>
          </div>
          <div>
            <strong>Resend</strong>
            <span>Clean client invite and update emails.</span>
          </div>
        </div>
      </section>
    </div>
  `;

  setupSettingsHandlers();
}

function readAvatarFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve("");
      return;
    }
    if (!file.type.startsWith("image/")) {
      reject(new Error("Choose an image file for your profile picture."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Profile picture could not be read."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Profile picture could not be opened."));
      image.onload = () => {
        const size = 256;
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        const shortestSide = Math.min(image.width, image.height);
        const sourceX = (image.width - shortestSide) / 2;
        const sourceY = (image.height - shortestSide) / 2;
        canvas.width = size;
        canvas.height = size;
        context.drawImage(image, sourceX, sourceY, shortestSide, shortestSide, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

async function saveProfileAvatar(avatarUrl) {
  const client = getSupabase();
  if (!client || !state.session) throw new Error("Sign in again before updating your profile.");

  const { error: updateError } = await client.auth.updateUser({
    data: { avatar_url: avatarUrl },
  });
  if (updateError) throw updateError;

  state.session.avatarUrl = avatarUrl;
  if (state.clientAccount) state.clientAccount.avatarUrl = avatarUrl;
  const ownAccount = accountForEmail(state.session.email);
  if (ownAccount) ownAccount.avatarUrl = avatarUrl;
  saveState();

  const { data: userData } = await client.auth.getUser();
  if (userData?.user?.id) {
    const { error: profileError } = await client
      .from("profiles")
      .update({ avatar_url: avatarUrl })
      .eq("id", userData.user.id);
    if (profileError && !profileError.message?.toLowerCase?.().includes("avatar_url")) {
      throw profileError;
    }
  }
}

async function saveProfileMessaging({ phoneNumber, smsOptIn }) {
  const client = getSupabase();
  if (!client || !state.session) throw new Error("Sign in again before updating SMS settings.");
  const normalizedPhone = normalizePhone(phoneNumber);
  const enabled = Boolean(smsOptIn && normalizedPhone);

  const { error: updateError } = await client.auth.updateUser({
    data: {
      phone_number: normalizedPhone,
      sms_opt_in: enabled,
    },
  });
  if (updateError) throw updateError;

  state.session.phoneNumber = normalizedPhone;
  state.session.smsOptIn = enabled;
  state.session.smsOptedOut = false;
  if (state.clientAccount) {
    state.clientAccount.phoneNumber = normalizedPhone;
    state.clientAccount.smsOptIn = enabled;
    state.clientAccount.smsOptedOut = false;
  }
  const ownAccount = accountForEmail(state.session.email);
  if (ownAccount) {
    ownAccount.phoneNumber = normalizedPhone;
    ownAccount.smsOptIn = enabled;
    ownAccount.smsOptedOut = false;
  }
  saveState();

  const { data: userData } = await client.auth.getUser();
  if (userData?.user?.id) {
    const { error: profileError } = await client
      .from("profiles")
      .update({
        phone_number: normalizedPhone || null,
        sms_opt_in: enabled,
        sms_opted_out: false,
      })
      .eq("id", userData.user.id);
    const message = profileError?.message?.toLowerCase?.() || "";
    if (profileError && !["phone_number", "sms_opt_in", "sms_opted_out"].some((field) => message.includes(field))) {
      throw profileError;
    }
  }
}

async function generateInviteCode({ role, email }) {
  const token = await supabaseAccessToken();
  if (!token) throw new Error("Sign in again before generating an invite.");
  const response = await fetch(apiUrl("/api/create-invite"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ role, email }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Invite code could not be created.");
  return result;
}

function setupSettingsHandlers() {
  root.querySelector("#avatarUpload")?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      showToast("Saving profile picture...");
      const avatarUrl = await readAvatarFile(file);
      await saveProfileAvatar(avatarUrl);
      showToast("Profile picture saved");
      renderSettings();
    } catch (error) {
      showToast(error.message || "Profile picture did not save");
    }
  });

  root.querySelector("#passwordForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type='submit']");
    const password = String(new FormData(event.currentTarget).get("newPassword") || "").trim();
    if (password.length < 8) {
      showToast("Use at least 8 characters for the new password");
      return;
    }
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Saving...";
    try {
      const client = getSupabase();
      if (!client) throw new Error("Supabase is still loading.");
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      event.currentTarget.reset();
      showToast("Password updated");
    } catch (error) {
      showToast(error.message || "Password did not update");
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  });

  root.querySelector("#smsSettingsForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type='submit']");
    const formData = new FormData(form);
    const phoneNumber = normalizePhone(formData.get("phoneNumber"));
    const smsOptIn = formData.get("smsOptIn") === "yes";
    if (smsOptIn && !phoneNumber) {
      showToast("Add a phone number or turn off SMS notifications");
      return;
    }
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Saving...";
    try {
      await saveProfileMessaging({ phoneNumber, smsOptIn });
      showToast(smsOptIn && phoneNumber ? "SMS notifications enabled" : "SMS notifications saved");
      renderSettings();
    } catch (error) {
      showToast(error.message || "SMS settings did not save");
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  });

  root.querySelector("#sendPasswordReset")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Sending...";
    try {
      const client = getSupabase();
      if (!client || !state.session?.email) throw new Error("Sign in again before sending a reset email.");
      const { error } = await client.auth.resetPasswordForEmail(state.session.email, {
        redirectTo: `${location.origin}${location.pathname}`,
      });
      if (error) throw error;
      showToast("Password reset email sent");
    } catch (error) {
      showToast(error.message || "Reset email did not send");
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  });

  root.querySelector("#inviteGeneratorForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type='submit']");
    const resultBox = root.querySelector("#inviteResult");
    const formData = new FormData(form);
    const role = String(formData.get("role") || "client");
    const email = normalizeEmail(formData.get("email"));
    if (!email) {
      showToast("Add the email for this invite code");
      return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Generating...";
    try {
      const invite = await generateInviteCode({ role, email });
      resultBox.hidden = false;
      resultBox.innerHTML = `
        <p class="eyebrow">${escapeHtml(invite.role)} invite</p>
        <div class="copy-row">
          <code>${escapeHtml(invite.code)}</code>
          <button class="ghost-button small-action" type="button" id="copyInviteCode">Copy</button>
        </div>
        <p class="muted">Send this to ${escapeHtml(invite.email)}. It can only create a ${escapeHtml(invite.role)} account for that email.</p>
      `;
      root.querySelector("#copyInviteCode")?.addEventListener("click", async () => {
        await navigator.clipboard?.writeText(invite.code);
        showToast("Invite code copied");
      });
      showToast("Invite code generated");
    } catch (error) {
      showToast(error.message || "Invite code could not be generated");
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  });
}

function renderAccountOptions({
  accounts,
  selectedEmails,
  selectedSmsEmails = new Set(),
  query = "",
  role = "client",
  hiddenId = "accountEmails",
  smsHiddenId = "",
  enableSms = false,
  emptyText = "No accounts found yet.",
}) {
  const options = dialogFields.querySelector("#accountOptions");
  const hidden = dialogFields.querySelector(`#${hiddenId}`);
  const selectedCount = dialogFields.querySelector("#accountSelectedCount");
  const smsHidden = smsHiddenId ? dialogFields.querySelector(`#${smsHiddenId}`) : null;
  if (!options || !hidden || !selectedCount) return;

  const selected = [...selectedEmails];
  hidden.value = selected.join(",");
  if (smsHidden) smsHidden.value = [...selectedSmsEmails].join(",");
  const smsCount = selectedSmsEmails.size;
  selectedCount.textContent = selected.length
    ? `${selected.length} selected${enableSms ? ` / ${smsCount} SMS` : ""}`
    : `No accounts selected${enableSms && smsCount ? ` / ${smsCount} SMS` : ""}`;

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
      const smsChecked = selectedSmsEmails.has(email);
      const smsEnabled = enableSms && canSendSmsToAccount(account);
      const smsStatus = account.phoneNumber ? "SMS not enabled" : "Add phone to enable SMS";
      return `
        <div class="account-option ${checked ? "is-selected" : ""}">
          <label class="account-option-main">
            <input
              type="checkbox"
              value="${escapeHtml(email)}"
              data-account-email="${escapeHtml(email)}"
              ${checked ? "checked" : ""}
            />
            <span>
              <strong>${escapeHtml(account.fullName || account.email)}</strong>
              <span>${escapeHtml(email)}</span>
              ${
                enableSms
                  ? `<small>${smsEnabled ? `SMS ready / ${escapeHtml(account.phoneNumber)}` : smsStatus}</small>`
                  : ""
              }
            </span>
          </label>
          ${
            enableSms
              ? `<label class="sms-option ${smsEnabled ? "" : "is-disabled"}">
                  <input
                    type="checkbox"
                    value="${escapeHtml(email)}"
                    data-sms-email="${escapeHtml(email)}"
                    ${smsChecked ? "checked" : ""}
                    ${smsEnabled ? "" : "disabled"}
                  />
                  <span>SMS</span>
                </label>`
              : ""
          }
        </div>
      `;
    })
    .join("");
}

function setupAccountPicker({
  role = "client",
  hiddenId = "accountEmails",
  smsHiddenId = "",
  enableSms = false,
  selected = [],
  selectedSms = [],
  emptyText = "No accounts found yet.",
} = {}) {
  const selectedEmails = new Set(clientEmails(selected));
  const selectedSmsEmails = new Set(clientEmails(selectedSms));
  const search = dialogFields.querySelector("#accountSearch");
  const options = dialogFields.querySelector("#accountOptions");

  const renderOptions = () => {
    renderAccountOptions({
      accounts: state.accountDirectory || [],
      selectedEmails,
      selectedSmsEmails,
      query: search?.value || "",
      role,
      hiddenId,
      smsHiddenId,
      enableSms,
      emptyText,
    });
  };

  search?.addEventListener("input", renderOptions);
  options?.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-account-email]");
    const smsCheckbox = event.target.closest("[data-sms-email]");
    if (checkbox) {
      const email = normalizeEmail(checkbox.dataset.accountEmail || checkbox.value);
      if (checkbox.checked) selectedEmails.add(email);
      else {
        selectedEmails.delete(email);
        selectedSmsEmails.delete(email);
      }
    }
    if (smsCheckbox) {
      const email = normalizeEmail(smsCheckbox.dataset.smsEmail || smsCheckbox.value);
      if (smsCheckbox.checked) {
        selectedEmails.add(email);
        selectedSmsEmails.add(email);
      } else {
        selectedSmsEmails.delete(email);
      }
    }
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
    ? "Add or remove client accounts for this project. Choose SMS only for clients who added a phone number."
    : "Choose the client accounts that should see this project. Email is sent by default; SMS is optional.";
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
      <input id="shareSmsEmails" name="shareSmsEmails" type="hidden" />
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
    smsHiddenId: "shareSmsEmails",
    enableSms: true,
    selected: recipients,
    selectedSms: projectSmsRecipientEmails(project.id),
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
    projectSmsRecipients: structuredClone(state.projectSmsRecipients),
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
        ? `Invited ${shareResult.invitedCount} new client${shareResult.invitedCount === 1 ? "" : "s"}${shareResult.smsCount ? ` / ${shareResult.smsCount} SMS` : ""}`
        : shareResult.selectedCount
          ? `Project access saved for ${shareResult.selectedCount} client${shareResult.selectedCount === 1 ? "" : "s"}${shareResult.smsCount ? ` / ${shareResult.smsCount} SMS` : ""}`
          : "Project client access cleared";
      showToast(shareResult.smsError ? `${shareMessage}. SMS needs setup: ${shareResult.smsError}` : shareMessage);
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
        await offerProcessingWait({ provider, videoId: bunnyVideoId, button: saveButton });
      }

      const version = {
        id: `version-${nowId}`,
        videoId: video.id,
        label,
        provider,
        embedUrl,
        bunnyVideoId,
        note: form.get("note") || "New review version.",
        createdAt: freshTimestampLabel(),
        createdAtRaw: new Date().toISOString(),
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
    state.projectSmsRecipients = previousData.projectSmsRecipients;
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
