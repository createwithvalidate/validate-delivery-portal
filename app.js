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
  processingJobs: [],
};

const storeKey = "validate-delivery-portal-empty-v4";
const productionOrigin = "https://createwithvalidate.com/delivery";
const fallbackSupabaseUrl = "https://axvnifoamejuxxqhezwr.supabase.co";
const fallbackSupabasePublishableKey = "sb_publishable_IFOVI5nvp8DdOeqAs4lNsg__Iewd4BN";
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
state.processingJobs ??= [];
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
const homeNavLabel = document.querySelector("#homeNavLabel");
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
const processingStatus = document.querySelector("#processingStatus");
const confirmOverlay = document.querySelector("#confirmOverlay");
const confirmEyebrow = document.querySelector("#confirmEyebrow");
const confirmTitle = document.querySelector("#confirmTitle");
const confirmMessage = document.querySelector("#confirmMessage");
const confirmAccept = document.querySelector("#confirmAccept");
const confirmCancel = document.querySelector("#confirmCancel");

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
let confirmHideTimer = null;
let processingPollInterval = null;
let processingPollInFlight = false;
const loginBackgroundCount = 9;
const dashboardBackgroundCount = 5;
const loginReelSources = [
  "https://createwithvalidate.com/videos/header-loop-2.mp4",
  "https://createwithvalidate.com/videos/fishing-loop.mp4",
];
const reviewEventPrefix = "__validate_review_event__:";
let supabaseClient = null;
let supabaseConfig = null;
let supabaseConfigPromise = null;

function apiUrl(path) {
  const isLocalPreview =
    location.protocol === "file:" ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1";
  const deliveryBasePath = location.pathname === "/delivery" || location.pathname.startsWith("/delivery/")
    ? "/delivery"
    : "";
  return `${isLocalPreview ? productionOrigin : deliveryBasePath}${path}`;
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

function idTimestampValue(id = "") {
  const match = String(id || "").match(/-(\d{10,})$/);
  return match ? Number(match[1]) : 0;
}

function mediaTimestampValue(item = {}) {
  return timestampValue(item.createdAtRaw || item.createdAt) || idTimestampValue(item.id);
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

function smsSchemaMessage() {
  return "Run the latest schema.sql in Supabase before saving SMS selections.";
}

function smsStatusSummary(results = []) {
  const statuses = [...new Set(results.map((result) => result.status).filter(Boolean))];
  if (!statuses.length) return "";
  return statuses.length === 1 ? statuses[0] : statuses.join(", ");
}

function splitProjectDescription(value = "") {
  const raw = String(value || "");
  const match = raw.match(/\n?<!--validate-project-meta:([^]*?)-->\s*$/);
  if (!match) return { description: raw, meta: {} };

  let meta = {};
  try {
    meta = JSON.parse(decodeURIComponent(match[1]));
  } catch {
    meta = {};
  }

  return {
    description: raw.slice(0, match.index).trim(),
    meta,
  };
}

function projectDownloadMeta(project = {}) {
  const versionIds = Array.isArray(project.downloadVersionIds)
    ? project.downloadVersionIds.filter(Boolean)
    : [];
  return {
    downloadVersionIds: [...new Set(versionIds)],
    downloadSentAt: project.downloadSentAt || "",
    downloadNotifiedAt: project.downloadNotifiedAt || "",
    lastNotifiedVersionId: project.lastNotifiedVersionId || "",
    pendingVersionId: project.pendingVersionId || "",
  };
}

function serializeProjectDescription(project = {}) {
  const description = String(project.description || "").trim();
  const meta = projectDownloadMeta(project);
  const hasMeta =
    meta.downloadVersionIds.length ||
    meta.downloadSentAt ||
    meta.downloadNotifiedAt ||
    meta.lastNotifiedVersionId ||
    meta.pendingVersionId;
  if (!hasMeta) return description || null;
  const encoded = encodeURIComponent(JSON.stringify(meta));
  return `${description}${description ? "\n\n" : ""}<!--validate-project-meta:${encoded}-->`;
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

function inviteSignupUrl({ code = "", email = "", role = "client" } = {}) {
  const url = new URL(location.href);
  url.searchParams.delete("reset");
  url.searchParams.set("signup", "1");
  url.searchParams.set("invite", code);
  url.searchParams.set("role", role);
  if (email) url.searchParams.set("email", email);
  url.hash = "";
  return url.toString();
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

async function loadSupabaseConfig() {
  if (supabaseConfig) return supabaseConfig;
  if (!supabaseConfigPromise) {
    supabaseConfigPromise = withTimeout(
      fetch(apiUrl("/api/public-config"), { cache: "no-store" }).then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Could not load portal configuration");
        if (!body.supabaseUrl || !body.supabasePublishableKey) {
          throw new Error("Portal configuration is missing Supabase settings");
        }
        supabaseConfig = {
          supabaseUrl: body.supabaseUrl,
          supabasePublishableKey: body.supabasePublishableKey,
        };
        return supabaseConfig;
      }),
      "Portal configuration took too long",
      9000
    ).catch((error) => {
      console.warn("Supabase config load failed; using bundled fallback", error);
      supabaseConfig = {
        supabaseUrl: fallbackSupabaseUrl,
        supabasePublishableKey: fallbackSupabasePublishableKey,
      };
      return supabaseConfig;
    });
  }
  return supabaseConfigPromise;
}

function getSupabase() {
  if (supabaseClient) return supabaseClient;
  if (!supabaseConfig) return null;
  if (!window.supabase?.createClient) return null;
  supabaseClient = window.supabase.createClient(
    supabaseConfig.supabaseUrl,
    supabaseConfig.supabasePublishableKey,
    {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
      storage: window.localStorage,
      storageKey: "validate-supabase-auth",
    },
    }
  );
  return supabaseClient;
}

async function ensureSupabase() {
  await loadSupabaseConfig();
  return getSupabase();
}

async function signInWithSupabase(email, password) {
  const client = await ensureSupabase();
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
  const client = await ensureSupabase();
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
  const isFirstAdmin = normalizeEmail(user.email) === normalizeEmail(firstAdminEmail);
  const role = isFirstAdmin || profile?.role === "admin" ? "admin" : "client";
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
  const client = await ensureSupabase();
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
  const descriptionData = splitProjectDescription(row.description || "");
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    description: descriptionData.description || "",
    status: row.status || "review",
    archived: Boolean(row.archived),
    createdAt: row.created_at || row.createdAt || "",
    downloadVersionIds: Array.isArray(descriptionData.meta?.downloadVersionIds)
      ? descriptionData.meta.downloadVersionIds
      : [],
    downloadSentAt: descriptionData.meta?.downloadSentAt || "",
    downloadNotifiedAt: descriptionData.meta?.downloadNotifiedAt || "",
    lastNotifiedVersionId: descriptionData.meta?.lastNotifiedVersionId || "",
    pendingVersionId: descriptionData.meta?.pendingVersionId || "",
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
          description: serializeProjectDescription(item),
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
  const accessRows = projectAccessRowsForSave();
  if (accessRows.length) {
    const { error } = await client.from("project_access").upsert(accessRows);
    if (error?.message?.toLowerCase?.().includes("sms_enabled")) {
      if (accessRows.some((row) => row.sms_enabled)) {
        throw new Error(smsSchemaMessage());
      }
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
  if (sessionLabel) sessionLabel.textContent = state.session?.role === "admin" ? "Admin account" : "Client account";
  if (sessionName) sessionName.textContent = name;
  if (sessionEmail) sessionEmail.textContent = email;
}

function updateNavigationLabels() {
  const isClient = state.session?.role === "client";
  if (homeNavLabel) homeNavLabel.textContent = isClient ? "Projects" : "Clients";
  const homeButton = document.querySelector('.nav-item[data-route="clients"]');
  if (homeButton) homeButton.setAttribute("aria-label", isClient ? "Projects" : "Clients");
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
  updateNavigationLabels();
  document.querySelector("#openCreate").hidden = state.session.role !== "admin" || state.mode === "client";
  if (deleteClientAction) deleteClientAction.hidden = true;
}

function renderCurrentView() {
  if (!state.session) {
    render();
    return;
  }

  if (state.mode === "client") {
    if (currentView === "activity") renderActivity();
    else if (currentView === "settings") renderSettings();
    else if (currentView === "clientReview" && state.selectedVideoId) renderClientReview();
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

function renderProcessingStatus() {
  if (!processingStatus) return;
  const jobs = state.processingJobs || [];
  const job = jobs.find((item) => item.status === "processing") || jobs[0];
  if (!job) {
    processingStatus.hidden = true;
    document.body.classList.remove("processing-active");
    return;
  }

  const isProcessing = job.status === "processing";
  const isReady = job.status === "ready";
  processingStatus.hidden = false;
  document.body.classList.add("processing-active");
  processingStatus.innerHTML = `
    <div class="processing-status-dot ${isReady ? "is-ready" : job.status === "error" ? "is-error" : ""}"></div>
    <div class="processing-status-copy">
      <strong>${escapeHtml(isReady ? "Video is ready" : job.status === "error" ? "Processing needs attention" : "Still processing")}</strong>
      <span>${escapeHtml(job.message || `${job.provider || "Video"} is finishing ${job.title || "your upload"}.`)}</span>
    </div>
    ${
      isProcessing
        ? ""
        : `<button class="ghost-button processing-status-action" type="button" id="dismissProcessingStatus">OK</button>`
    }
  `;
  processingStatus.querySelector("#dismissProcessingStatus")?.addEventListener("click", () => {
    state.processingJobs = jobs.filter((item) => item.id !== job.id);
    saveState();
    renderProcessingStatus();
    startProcessingPoller();
  });
}

function upsertProcessingJob({ provider, videoId, title, message = "" } = {}) {
  if (!videoId) return null;
  const jobs = state.processingJobs || [];
  const id = `${provider || "video"}:${videoId}`;
  const existing = jobs.find((item) => item.id === id);
  const job = {
    id,
    provider,
    videoId,
    title,
    status: "processing",
    message: message || `${provider || "Video"} is processing ${title || "your upload"}.`,
    updatedAt: new Date().toISOString(),
  };
  state.processingJobs = existing
    ? jobs.map((item) => (item.id === id ? { ...item, ...job } : item))
    : [job, ...jobs];
  saveState();
  renderProcessingStatus();
  startProcessingPoller();
  return job;
}

function updateProcessingJob(id, updates = {}) {
  state.processingJobs = (state.processingJobs || []).map((job) =>
    job.id === id ? { ...job, ...updates, updatedAt: new Date().toISOString() } : job,
  );
  saveState();
  renderProcessingStatus();
  startProcessingPoller();
}

async function pollProcessingJobs() {
  const jobs = (state.processingJobs || []).filter((job) => job.status === "processing");
  if (!jobs.length || processingPollInFlight) return;
  processingPollInFlight = true;
  try {
    await Promise.all(
      jobs.map(async (job) => {
        try {
          const status = await fetchVideoProcessingStatus({ provider: job.provider, videoId: job.videoId });
          if (status.error) {
            updateProcessingJob(job.id, {
              status: "error",
              message: status.message || `${job.provider} reported a processing problem.`,
            });
            return;
          }
          if (status.ready) {
            updateProcessingJob(job.id, {
              status: "ready",
              message: `${job.title || "Your video"} is ready to review.`,
            });
          }
        } catch {
          updateProcessingJob(job.id, {
            message: `${job.provider || "Video"} is still processing. We will check again shortly.`,
          });
        }
      }),
    );
  } finally {
    processingPollInFlight = false;
  }
}

function startProcessingPoller() {
  const hasProcessingJobs = (state.processingJobs || []).some((job) => job.status === "processing");
  window.clearInterval(processingPollInterval);
  processingPollInterval = null;
  renderProcessingStatus();
  if (!hasProcessingJobs) return;
  processingPollInterval = window.setInterval(() => {
    if (!document.hidden) pollProcessingJobs();
  }, 6000);
}

function showPortalPrompt({
  eyebrow = "Confirm",
  title = "Are you sure?",
  message = "",
  html = "",
  confirmText = "Continue",
  cancelText = "Cancel",
  danger = false,
  showCancel = true,
} = {}) {
  if (!confirmOverlay || !confirmAccept || !confirmCancel) {
    return Promise.resolve(!showCancel);
  }

  return new Promise((resolve) => {
    if (confirmHideTimer) {
      window.clearTimeout(confirmHideTimer);
      confirmHideTimer = null;
    }
    confirmEyebrow.textContent = eyebrow;
    confirmTitle.textContent = title;
    if (html) confirmMessage.innerHTML = html;
    else confirmMessage.textContent = message;
    confirmAccept.textContent = confirmText;
    confirmCancel.textContent = cancelText;
    confirmCancel.hidden = !showCancel;
    confirmAccept.classList.toggle("danger-confirm", danger);
    confirmOverlay.hidden = false;

    const cleanup = (result) => {
      confirmOverlay.classList.remove("show");
      confirmAccept.onclick = null;
      confirmCancel.onclick = null;
      confirmOverlay.onclick = null;
      confirmHideTimer = window.setTimeout(() => {
        confirmOverlay.hidden = true;
        confirmCancel.hidden = false;
        confirmAccept.classList.remove("danger-confirm");
        confirmHideTimer = null;
      }, 160);
      resolve(result);
    };

    confirmAccept.onclick = () => cleanup(true);
    confirmCancel.onclick = () => cleanup(false);
    confirmOverlay.onclick = (event) => {
      if (event.target === confirmOverlay && showCancel) cleanup(false);
    };

    requestAnimationFrame(() => {
      confirmOverlay.classList.add("show");
      confirmAccept.focus();
    });
  });
}

function renderNotifySummary({ project, video, version }) {
  const note = version?.note?.trim();

  return `
    <div class="confirm-summary">
      <p class="confirm-summary-kicker">People will be notified about</p>
      <h3>${escapeHtml(video?.title || project?.name || "This video")}</h3>
      <div class="confirm-summary-meta">
        <span>${escapeHtml(version?.label || "Latest version")}</span>
        <span>${escapeHtml(project?.name || "Project")}</span>
      </div>
      ${note ? `<p class="confirm-summary-note">${escapeHtml(note)}</p>` : ""}
    </div>
  `;
}

function projectPendingNotification(project = activeProject()) {
  if (!project || !projectRecipientEmails(project.id).length) return null;

  const downloadPending = Boolean(
    project.downloadSentAt &&
      project.downloadVersionIds?.length &&
      project.downloadNotifiedAt !== project.downloadSentAt,
  );
  if (downloadPending) {
    const itemCount = projectDownloadItems(project).length || project.downloadVersionIds.length;
    return {
      type: "download",
      label: "downloads",
      text: "Pending notifications",
      video: { title: "Final downloads" },
      version: {
        label: `${itemCount} final file${itemCount === 1 ? "" : "s"}`,
        note: `Final downloads are ready for ${project.name}.`,
      },
    };
  }

  const pendingVersionId = project.pendingVersionId || "";
  if (pendingVersionId) {
    const version = state.versions.find((item) => item.id === pendingVersionId);
    const video = version ? state.videos.find((item) => item.id === version.videoId) : null;
    if (!video || !version) return null;
    return {
      type: "version",
      label: "latest version",
      text: "Pending notifications",
      video,
      version,
    };
  }

  return null;
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

function renderAvatar(name) {
  const initials = avatarInitials(name);
  return `
    <div class="avatar">
      <span>${escapeHtml(initials)}</span>
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
  return `${summary.approvedCount}/${summary.total} approved`;
}

function versionReviewLabel(version, project) {
  const summary = reviewSummaryForVersion(version, project);
  if (!summary.total) return version?.approved ? "approved" : "review";
  if (summary.approvedCount) return `${summary.approvedCount}/${summary.total} approved`;
  return "in review";
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

function setRoute(nextRoute) {
  route = nextRoute;
  state.route = nextRoute;
  const homeView = state.session?.role === "client" ? "clientDashboard" : "clients";
  rememberView(nextRoute === "activity" || nextRoute === "settings" ? nextRoute : homeView);
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
    ? "Manage clients, projects, video versions, comments, notifications, and approvals from one clean workspace."
    : "Sign in to your review dashboard to see projects, versions, comments, and approvals.";
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
      ? "Manage clients, projects, video versions, comments, notifications, and approvals from one clean workspace."
      : "Sign in to your review dashboard to see projects, versions, comments, and approvals.";
}

function applyInviteSignupParams() {
  const params = new URLSearchParams(window.location.search);
  const inviteCode = String(params.get("invite") || "").trim();
  const email = normalizeEmail(params.get("email") || "");
  const role = params.get("role") === "admin" ? "admin" : "client";
  const shouldSignup = params.get("signup") === "1" || Boolean(inviteCode);
  if (!shouldSignup) return false;

  setLoginRole(role);
  setAuthMode("signup");
  if (email) loginForm.elements.email.value = email;
  if (inviteCode && inviteCodeField) inviteCodeField.querySelector("input").value = inviteCode;
  params.delete("signup");
  params.delete("invite");
  params.delete("email");
  params.delete("role");
  const nextUrl = `${location.pathname}${params.toString() ? `?${params}` : ""}${location.hash || ""}`;
  history.replaceState(null, "", nextUrl);
  return true;
}

function portalHandoffParams() {
  if (!window.location.hash.startsWith("#portal-sso?")) return null;
  const params = new URLSearchParams(window.location.hash.slice("#portal-sso?".length));
  const payload = String(params.get("payload") || "");
  const signature = String(params.get("signature") || "");
  return payload && signature ? { payload, signature } : null;
}

function clearPortalHandoffParams() {
  if (!window.location.hash.startsWith("#portal-sso?")) return;
  history.replaceState(null, "", `${location.pathname}${location.search}`);
}

async function redeemPortalHandoff(handoff) {
  if (!handoff) return false;

  let result;
  try {
    const response = await withTimeout(
      fetch(apiUrl("/api/portal-sso"), {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(handoff),
      }),
      "Delivery Portal sign-in took too long.",
      12000,
    );
    result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.success || !result?.session) {
      throw new Error(result?.error || "The main portal session could not be opened here.");
    }
  } finally {
    clearPortalHandoffParams();
  }

  const client = await ensureSupabase();
  if (!client) throw new Error("Supabase is still loading. Try again in a moment.");
  const { data, error } = await client.auth.setSession({
    access_token: result.session.accessToken,
    refresh_token: result.session.refreshToken,
  });
  if (error || !data?.user) throw error || new Error("Delivery Portal session could not be saved.");

  const profile = await getCurrentProfile(data.user).catch((profileError) => {
    console.warn("Profile load after portal handoff failed", profileError);
    return fallbackProfileForUser(data.user);
  });
  applyAccountSession(data.user, profile);
  if (state.session?.role !== "admin") {
    await client.auth.signOut().catch(() => {});
    clearAccountSession();
    throw new Error("The linked Delivery Portal account is not an admin.");
  }
  state.portalLoading = true;
  saveState();
  return true;
}

async function completeSignup(form) {
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "").trim();
  const fullName = String(form.get("fullName") || "").trim();
  const inviteCode = String(form.get("inviteCode") || "").trim();
  const phoneNumber = normalizePhone(form.get("phoneNumber"));
  const smsOptIn = Boolean(phoneNumber);
  if (!email || !password || !fullName || !inviteCode) {
    showToast("Name, email, password, and invite code are required");
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
  return videoVersions(videoId)[0];
}

function projectVideos(projectId) {
  if (!projectId) return [];
  return state.videos
    .filter((video) => video.projectId === projectId && video.status !== "image")
    .sort((a, b) => mediaTimestampValue(b) - mediaTimestampValue(a));
}

function videoVersions(videoId) {
  return state.versions
    .filter((version) => version.videoId === videoId)
    .sort((a, b) => mediaTimestampValue(b) - mediaTimestampValue(a));
}

function bunnyVideoIdFromEmbedUrl(embedUrl = "") {
  const match = String(embedUrl).match(/\/(?:embed|play)\/[^/]+\/([^/?#]+)/);
  return match ? match[1] : "";
}

function vimeoVideoIdFromEmbedUrl(embedUrl = "") {
  const match = String(embedUrl).match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return match ? match[1] : "";
}

function normalizeVideoUrl(value = "") {
  const url = String(value || "").trim();
  if (!url) return "";

  const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;

  const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (youtubeMatch) return `https://www.youtube.com/embed/${youtubeMatch[1]}`;

  const driveFileMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (driveFileMatch) return `https://drive.google.com/file/d/${driveFileMatch[1]}/preview`;

  const driveIdMatch = url.match(/drive\.google\.com\/(?:open|uc|thumbnail)\?[^#]*\bid=([^&#]+)/);
  if (driveIdMatch) return `https://drive.google.com/file/d/${driveIdMatch[1]}/preview`;

  return url;
}

function isVideoFileUrl(value = "") {
  return /\.(mp4|webm|mov)(?:$|[?#])/i.test(String(value || ""));
}

function isDownloadableVersion(version = {}) {
  return Boolean(
    version?.embedUrl &&
      (version.provider === "AWS S3" ||
        (version.provider === "Direct URL" && isVideoFileUrl(version.embedUrl)) ||
        isVideoFileUrl(version.embedUrl)),
  );
}

function shouldRenderNativeVideo(version = {}) {
  return (
    version?.provider === "AWS S3" ||
    (version?.provider === "Direct URL" && isVideoFileUrl(version.embedUrl))
  );
}

function renderNativeReviewVideo(url, title = "Video review") {
  return `
    <div class="native-video-stage">
      <video class="native-review-video" title="${escapeHtml(title)}" src="${escapeHtml(url)}" controls playsinline preload="metadata"></video>
    </div>
  `;
}

function mediaPreviewUrl(url = "") {
  const value = String(url || "").trim();
  if (!value) return "";
  const [base] = value.split("#");
  return `${base}#t=0.1`;
}

function videoThumbnailUrl(version) {
  if (version?.provider === "Direct URL" || version?.provider === "AWS S3") return "";

  if (version?.provider === "Vimeo") {
    const vimeoVideoId = version?.bunnyVideoId || vimeoVideoIdFromEmbedUrl(version?.embedUrl);
    return vimeoVideoId ? apiUrl(`/api/vimeo-thumbnail?videoId=${encodeURIComponent(vimeoVideoId)}`) : "";
  }

  const bunnyVideoId = version?.bunnyVideoId || bunnyVideoIdFromEmbedUrl(version?.embedUrl);
  if (!bunnyVideoId || !bunnyPullZoneHostname) return "";
  return `https://${bunnyPullZoneHostname}/${bunnyVideoId}/thumbnail.jpg`;
}

function renderVideoThumbnail({ version, title }) {
  if (shouldRenderNativeVideo(version)) {
    return `
      <span class="video-thumb is-video-preview">
        <video
          src="${escapeHtml(mediaPreviewUrl(version.embedUrl))}"
          title="${escapeHtml(`${title} preview`)}"
          muted
          playsinline
          preload="metadata"
          onerror="this.closest('.video-thumb')?.classList.add('is-empty'); this.remove();"
        ></video>
        <span>No thumbnail yet</span>
      </span>
    `;
  }

  const thumbnailUrl = videoThumbnailUrl(version);
  if (!thumbnailUrl) {
    return `
      <span class="video-thumb is-empty"></span>
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
  allowDelete = false,
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
            <div class="video-card-wrap">
              <button class="video-card" type="button" ${dataAttribute}="${escapeHtml(video.id)}" ${isDisabled ? "disabled" : ""}>
                ${renderVideoThumbnail({ version, title: video.title })}
                <span class="video-card-body">
                  <span>
                    <strong class="video-card-title">${escapeHtml(video.title)}</strong>
                    ${version ? `<span class="muted">Latest: ${escapeHtml(version.label)}</span>` : ""}
                  </span>
                  ${
                    versions.length || noteCount
                      ? `<span class="meta-strip">
                          ${versions.length ? `<span>${versionCountLabel(versions.length)}</span>` : ""}
                          ${noteCount ? `<span>${noteCount} comments</span>` : ""}
                        </span>`
                      : ""
                  }
                  <span class="video-card-action">${versions.length ? actionLabel : "Add first version"}</span>
                </span>
              </button>
              ${
                allowDelete
                  ? `<button class="media-delete-button" type="button" data-delete-video="${escapeHtml(video.id)}">Remove</button>`
                  : ""
              }
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function projectVersionCount(projectId) {
  return projectVideos(projectId).reduce((total, video) => total + videoVersions(video.id).length, 0);
}

function finalVersionForVideo(video) {
  if (!video) return null;
  const versions = videoVersions(video.id);
  if (!versions.length) return null;
  return versions.find((version) => /final/i.test(version.label || "")) || (video.status === "final" ? versions[0] : null);
}

function projectDownloadItems(project = activeProject()) {
  if (!project) return [];
  const ids = new Set(project.downloadVersionIds || []);
  if (!project.downloadSentAt || !ids.size) return [];
  const selectedItems = projectVideos(project.id)
    .map((video) => {
      const versions = videoVersions(video.id);
      const version = versions.find((item) => ids.has(item.id));
      return isDownloadableVersion(version) ? { video, version } : null;
    })
    .filter(Boolean);
  return selectedItems;
}

function downloadFileName({ video, version, index = 0 } = {}) {
  const url = String(version?.embedUrl || "");
  const extensionMatch = url.split(/[?#]/)[0].match(/\.([a-z0-9]{2,5})$/i);
  const extension = extensionMatch ? extensionMatch[1] : "mp4";
  const title = slug(`${video?.title || "download"}-${version?.label || index + 1}`) || `download-${index + 1}`;
  return `${title}.${extension}`;
}

function uniqueDownloadFiles(items = []) {
  const counts = new Map();
  return items.map((item, index) => {
    const baseName = downloadFileName({ ...item, index });
    const dotIndex = baseName.lastIndexOf(".");
    const stem = dotIndex > 0 ? baseName.slice(0, dotIndex) : baseName;
    const extension = dotIndex > 0 ? baseName.slice(dotIndex) : "";
    const count = counts.get(baseName) || 0;
    counts.set(baseName, count + 1);
    return {
      ...item,
      fileName: count ? `${stem}-${count + 1}${extension}` : baseName,
    };
  });
}

function renderDownloadPackage(project, { compact = false } = {}) {
  const items = projectDownloadItems(project);
  if (!items.length) return "";
  return `
    <div class="download-package ${compact ? "compact" : ""}">
      <div>
        <p class="eyebrow">Downloads</p>
        <h3>Final files are ready</h3>
        <p class="muted">${items.length} final video${items.length === 1 ? "" : "s"} available to download.</p>
      </div>
      <button class="primary-button" type="button" data-download-project="${escapeHtml(project.id)}">Download files</button>
    </div>
  `;
}

function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function waitForDownloadStep(ms = 450) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchDownloadBlobFromBrowser(item) {
  const response = await fetch(item.version.embedUrl);
  if (!response.ok) throw new Error(`Could not fetch ${item.video.title}`);
  return response.blob();
}

async function fetchDownloadBlobFromServer(item) {
  const token = await supabaseAccessToken();
  if (!token) throw new Error("Sign in again before downloading files.");
  const response = await fetch(apiUrl("/api/client-portal?downloadFile=1"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      url: item.version.embedUrl,
      fileName: item.fileName,
    }),
  });
  const errorResult = response.ok ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorResult?.error || "Download could not be created");
  return response.blob();
}

async function downloadSeparateFiles(items, button) {
  const preparedItems = uniqueDownloadFiles(items);
  for (let index = 0; index < preparedItems.length; index += 1) {
    const item = preparedItems[index];
    if (button) button.textContent = `Downloading ${index + 1}/${preparedItems.length}...`;
    let blob;
    try {
      blob = await fetchDownloadBlobFromBrowser(item);
    } catch (browserError) {
      console.warn("Browser file download failed, trying server download", browserError);
      blob = await fetchDownloadBlobFromServer(item);
    }
    saveBlob(blob, item.fileName);
    await waitForDownloadStep();
  }
}

async function downloadProjectFiles(projectId, button = null) {
  const project = state.projects.find((item) => item.id === projectId);
  const items = projectDownloadItems(project);
  if (!items.length) {
    showToast("No download files are ready yet");
    return;
  }

  const originalText = button?.textContent || "";
  if (button) {
    button.disabled = true;
    button.textContent = "Preparing downloads...";
  }

  try {
    await downloadSeparateFiles(items, button);
    showToast(`Downloading ${items.length} file${items.length === 1 ? "" : "s"}`);
  } catch (error) {
    showToast(error.message || "Download could not be created");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
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

function renderMetaStrip(items = []) {
  const visibleItems = items.filter((item) => item?.show);
  if (!visibleItems.length) return "";
  return `
    <div class="meta-strip">
      ${visibleItems.map((item) => `<span>${escapeHtml(item.label)}</span>`).join("")}
    </div>
  `;
}

function versionCountLabel(count) {
  return `${count} version${count === 1 ? "" : "s"}`;
}

function publicReviewHash({ mediaId = "", versionId = "" } = {}) {
  return `#public-review/${encodeURIComponent(mediaId)}${versionId ? `/${encodeURIComponent(versionId)}` : ""}`;
}

function publicReviewUrl({ mediaId = "", versionId = "" } = {}) {
  const isLocalPreview =
    location.protocol === "file:" ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1";
  const base = isLocalPreview ? productionOrigin : `${location.origin}${location.pathname}`;
  return `${base}${publicReviewHash({ mediaId, versionId })}`;
}

function publicReviewParamsFromHash() {
  const match = location.hash.match(/^#public-review\/([^/]+)(?:\/([^/]+))?$/);
  return match
    ? {
        mediaId: decodeURIComponent(match[1]),
        versionId: match[2] ? decodeURIComponent(match[2]) : "",
      }
    : null;
}

async function openPublicReviewLink(mediaId, versionId = "") {
  const media = state.videos.find((item) => item.id === mediaId && item.status !== "image");
  if (!media) return;
  const versions = videoVersions(media.id);
  const version = versions.find((item) => item.id === versionId) || versions[0] || null;
  const url = publicReviewUrl({ mediaId: media.id, versionId: version?.id || "" });
  const confirmed = await showPortalPrompt({
    eyebrow: "Public review link",
    title: "Send review link",
    html: `
      <div class="confirm-summary">
        <p class="confirm-summary-kicker">Anyone with this link can view only</p>
        <h3>${escapeHtml(media.title)}</h3>
        <div class="confirm-summary-meta">
          <span>${escapeHtml(version?.label || "Video")}</span>
          <span>No comments or approval</span>
        </div>
      </div>
      <div class="copy-row public-link-row">
        <code>${escapeHtml(url)}</code>
      </div>
    `,
    confirmText: "Copy link",
    cancelText: "Close",
  });
  if (!confirmed) return;
  try {
    await navigator.clipboard?.writeText(url);
    showToast("Review link copied");
  } catch {
    showToast("Copy failed. Select the link and copy it manually.");
  }
}

function publicReviewMediaFrame(review) {
  const version = review?.version;
  if (!version?.embedUrl) {
    return `<div class="review-placeholder"><span>Video not uploaded yet</span></div>`;
  }

  return shouldRenderNativeVideo(version)
    ? renderNativeReviewVideo(version.embedUrl, review.media.title)
    : `<iframe title="${escapeHtml(review.media.title)}" src="${escapeHtml(version.embedUrl)}" allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;" allowfullscreen></iframe>`;
}

function renderPublicReview(review) {
  document.body.classList.add("public-review-mode");
  loginScreen.hidden = true;
  appShell.hidden = false;
  dashboardHero.hidden = true;
  root.innerHTML = `
    <section class="public-review-page">
      <div class="public-review-brand">VALIDATE</div>
      <div class="public-review-card">
        <div class="public-review-header">
          <p class="eyebrow">Video review</p>
          <h1>${escapeHtml(review?.media?.title || "Review")}</h1>
          <div class="public-review-meta">
            ${
              review?.version?.label
                ? `<span>${escapeHtml(review.version.label)}</span>`
                : review?.project?.name
                  ? `<span>${escapeHtml(review.project.name)}</span>`
                  : ""
            }
            <span>View only</span>
          </div>
        </div>
        <div class="public-review-frame">
          ${publicReviewMediaFrame(review)}
        </div>
        <div class="public-review-footer">
          <span>No login needed to watch.</span>
          ${review?.project?.name ? `<span>${escapeHtml(review.project.name)}</span>` : ""}
        </div>
      </div>
      <button class="ghost-button public-login-button" type="button" id="publicReviewLogin">Login</button>
    </section>
  `;
  root.querySelector("#publicReviewLogin")?.addEventListener("click", leavePublicReview);
}

async function openPublicReviewFromHash() {
  const params = publicReviewParamsFromHash();
  if (!params) return false;
  document.body.classList.add("public-review-mode");
  loginScreen.hidden = true;
  appShell.hidden = false;
  dashboardHero.hidden = true;
  root.innerHTML = `<section class="public-review-page"><div class="empty">Loading review...</div></section>`;
  try {
    const search = new URLSearchParams({
      mediaId: params.mediaId,
    });
    if (params.versionId) search.set("versionId", params.versionId);
    search.set("publicReview", "1");
    const response = await fetch(apiUrl(`/api/client-portal?${search.toString()}`));
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Review link could not load.");
    renderPublicReview(result);
  } catch (error) {
    root.innerHTML = `
      <section class="public-review-page">
        <div class="empty">${escapeHtml(error.message || "Review link could not load.")}</div>
        <button class="ghost-button public-login-button" type="button" id="publicReviewLogin">Login</button>
      </section>
    `;
    root.querySelector("#publicReviewLogin")?.addEventListener("click", leavePublicReview);
  }
  return true;
}

async function leavePublicReview() {
  document.body.classList.remove("public-review-mode");
  if (location.hash.startsWith("#public-review/")) history.replaceState(null, "", location.pathname);
  let restored = false;
  try {
    restored = await restoreSupabaseSession();
    if (restored) startCrossDeviceSync();
  } catch (error) {
    console.warn("Public review login handoff failed", error);
  }
  if (!restored) clearAccountSession();
  render();
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
  const confirmed = await showPortalPrompt({
    title: `Delete ${client.name}?`,
    message: "This will remove the client workspace and all projects inside it.",
    confirmText: "Delete client",
    danger: true,
  });
  if (!confirmed) return;
  const veryConfirmed = await showPortalPrompt({
    eyebrow: "Final check",
    title: "Are you very sure?",
    message: `This permanently deletes ${client.name}, its projects, videos, versions, comments, and client access.`,
    confirmText: "Yes, delete permanently",
    danger: true,
  });
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
  const confirmed = await showPortalPrompt({
    title: `Delete ${project.name}?`,
    message: "This will remove the project from admin and client dashboards.",
    confirmText: "Delete project",
    danger: true,
  });
  if (!confirmed) return;
  const veryConfirmed = await showPortalPrompt({
    eyebrow: "Final check",
    title: "Are you very sure?",
    message: `This permanently deletes ${project.name}, its videos, versions, comments, and client access.`,
    confirmText: "Yes, delete permanently",
    danger: true,
  });
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

async function deleteVideo(videoId) {
  const video = state.videos.find((item) => item.id === videoId && item.status !== "image");
  if (!video) return;
  const confirmed = await showPortalPrompt({
    title: `Remove ${video.title}?`,
    message: "This removes the video, every version inside it, and the comments attached to those versions.",
    confirmText: "Remove video",
    danger: true,
  });
  if (!confirmed) return;

  const versionIds = state.versions.filter((version) => version.videoId === videoId).map((version) => version.id);
  state.videos = state.videos.filter((item) => item.id !== videoId);
  state.versions = state.versions.filter((version) => version.videoId !== videoId);
  state.comments = state.comments.filter((comment) => !versionIds.includes(comment.versionId));
  if (state.selectedVideoId === videoId) {
    state.selectedVideoId = projectVideos(state.selectedProjectId)[0]?.id || "";
    state.selectedVersionId = "";
  }
  state.activity.unshift(`Removed video ${video.title}`);
  saveState();

  try {
    const supabase = getSupabase();
    const { data: userData } = supabase ? await supabase.auth.getUser() : { data: {} };
    if (userData?.user) await supabase.from("videos").delete().eq("id", videoId);
  } catch (error) {
    console.warn("Supabase video delete failed", error);
    showToast("Removed locally. Supabase did not delete yet.");
  }

  showToast("Video removed");
  renderProjectDetail();
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
    ? "Open a project, review the latest version, leave comments, and approve final cuts."
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
    results.push({ email, id: result.id, status: result.status || "" });
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
    if (rows.some((row) => row.sms_enabled)) {
      throw new Error(smsSchemaMessage());
    }
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

  button.textContent = "Saving access...";
  await savePortalData();
  await replaceProjectAccessInSupabase(project.id);
  if (emails.length) await verifyProjectInviteAccess({ project, emails });

  state.activity.unshift(`Updated client access for ${project.name}`);
  await savePortalData();
  return { selectedCount: emails.length, smsCount: smsEmails.length };
}

async function prepareDownloadsFromForm(form, button) {
  const project = activeProject();
  const projectId = String(form.get("projectId") || project?.id || "");
  const emails = projectRecipientEmails(project?.id);
  const versionIds = [...new Set(form.getAll("downloadVersionIds").map(String).filter(Boolean))];

  if (!project || project.id !== projectId) {
    throw new Error("Open a project before sending downloads.");
  }
  if (!emails.length) {
    throw new Error("Share this project with clients before preparing downloads.");
  }

  const selectedItems = projectVideos(project.id)
    .map((video) => ({ video, version: finalVersionForVideo(video) }))
    .filter((item) => item.version?.embedUrl && versionIds.includes(item.version.id));

  if (!selectedItems.length) {
    throw new Error("Choose at least one video with a final version.");
  }

  project.downloadVersionIds = selectedItems.map((item) => item.version.id);
  project.downloadSentAt = new Date().toISOString();
  project.downloadNotifiedAt = "";
  button.textContent = "Saving downloads...";
  await saveAndReloadPortalData();

  const savedProject = activeProject() || project;

  state.activity.unshift(
    `Prepared ${selectedItems.length} download file${selectedItems.length === 1 ? "" : "s"} for ${savedProject.name}`,
  );
  saveState();
  return {
    selectedCount: selectedItems.length,
    clientCount: emails.length,
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

  const pendingNotification = projectPendingNotification(project);
  const { video: latestVideo, version: latestVersion } = latestProjectVersion(project.id);
  const video = pendingNotification?.video || latestVideo;
  const version = pendingNotification?.version || latestVersion;
  const notificationType = pendingNotification?.type || "version";
  if (!video || !version) {
    showToast("Upload a version before notifying clients");
    return;
  }

  const confirmed = await showPortalPrompt({
    eyebrow: "Notify people",
    title: pendingNotification ? "Send pending notifications?" : "Send this update?",
    html: renderNotifySummary({ project, video, version }),
    confirmText: "Notify people",
    cancelText: "Cancel",
  });
  if (!confirmed) return;

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = emails.length === projectRecipientEmails(project.id).length ? "Notifying people..." : "Sending reminder...";

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
      emailType: notificationType === "download" ? "download" : "version",
    });
    const savedSmsEmails = projectSmsRecipientEmails(project.id);
    const smsReadyEmails = emails.filter((email) => canSendSmsToAccount(accountForEmail(email)));
    const smsEmails = emails.filter(
      (email) => savedSmsEmails.includes(email) && canSendSmsToAccount(accountForEmail(email)),
    );
    let smsSent = 0;
    let smsError = "";
    let smsStatus = "";
    if (smsEmails.length) {
      button.textContent = "Sending SMS...";
      try {
        const smsResult = await smsProjectClient({
          project,
          video,
          version,
          emails: smsEmails,
          smsType: notificationType === "download" ? "download" : "version",
        });
        smsSent = smsResult.sent || smsEmails.length;
        smsStatus = smsStatusSummary(smsResult.results);
      } catch (error) {
        smsError = error.message || "SMS could not be sent yet";
      }
    }
    state.activity.unshift(
      `Notified ${emails.length} client account${emails.length === 1 ? "" : "s"} about ${notificationType === "download" ? "downloads" : version.label} for ${project.name}${
        smsSent ? ` and sent ${smsSent} SMS` : ""
      }`,
    );
    if (notificationType === "download") {
      project.downloadNotifiedAt = project.downloadSentAt || new Date().toISOString();
      if (latestVersion?.id) project.lastNotifiedVersionId = latestVersion.id;
      project.pendingVersionId = "";
    } else if (version?.id) {
      project.lastNotifiedVersionId = version.id;
      if (project.pendingVersionId === version.id) project.pendingVersionId = "";
    }
    await savePortalData();
    showToast(
      smsError
        ? `Email sent. SMS needs setup: ${smsError}`
        : !smsEmails.length && smsReadyEmails.length
          ? "Email sent. SMS was not sent because no SMS recipients are selected for this project."
        : `Sent to ${emails.length} client account${emails.length === 1 ? "" : "s"}${
            smsSent ? ` / ${smsSent} SMS accepted${smsStatus ? ` (${smsStatus})` : ""}` : ""
          }`,
    );
  } catch (error) {
    showToast(error.message || "Clients could not be notified");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function createBunnyUploadCredentials({ title, projectTitle }) {
  const token = await supabaseAccessToken();
  if (!token) throw new Error("Sign in again before uploading a video.");
  const response = await fetch(apiUrl("/api/create-bunny-upload"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ title, projectTitle }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Bunny upload could not start");
  return result;
}

async function createVimeoUploadCredentials({ title, size, projectTitle }) {
  const token = await supabaseAccessToken();
  if (!token) throw new Error("Sign in again before uploading a video.");
  const response = await fetch(apiUrl("/api/create-vimeo-upload"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ title, size, projectTitle }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Vimeo upload could not start");
  return result;
}

async function createS3UploadCredentials({ title, file, projectTitle }) {
  const token = await supabaseAccessToken();
  if (!token) throw new Error("Sign in again before uploading a video.");
  const response = await fetch(apiUrl("/api/create-s3-upload"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      title,
      projectTitle,
      fileName: file.name,
      contentType: file.type || "video/mp4",
      size: file.size,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "AWS upload could not start");
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

async function uploadToS3(file, credentials, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", credentials.uploadUrl);
    request.setRequestHeader("Content-Type", credentials.contentType || file.type || "video/mp4");
    request.upload.onprogress = (event) => {
      const percent = event.lengthComputable ? Math.round((event.loaded / event.total) * 100) : 0;
      onProgress(percent);
    };
    request.onerror = () => reject(new Error("AWS upload failed. Check the bucket CORS settings."));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve(credentials);
      else reject(new Error(`AWS upload failed with status ${request.status}`));
    };
    request.send(file);
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

async function uploadVersionFileToS3({ file, title, projectTitle, button }) {
  button.textContent = "Preparing AWS upload...";
  let credentials;
  try {
    credentials = await createS3UploadCredentials({ title, file, projectTitle });
  } catch (error) {
    throw new Error(`Could not prepare AWS upload: ${error.message}`);
  }
  credentials.title = title;
  button.textContent = "Uploading 0%";
  try {
    await uploadToS3(file, credentials, (percent) => {
      button.textContent = `Uploading ${percent}%`;
    });
  } catch (error) {
    throw new Error(`AWS upload failed: ${error.message}`);
  }
  return {
    ...credentials,
    videoId: credentials.key,
    embedUrl: credentials.publicUrl,
  };
}

async function uploadVersionFile({ provider, file, title, projectTitle, button }) {
  if (provider === "Vimeo") return uploadVersionFileToVimeo({ file, title, projectTitle, button });
  if (provider === "AWS S3") return uploadVersionFileToS3({ file, title, projectTitle, button });
  return uploadVersionFileToBunny({ file, title, projectTitle, button });
}

async function fetchVideoProcessingStatus({ provider, videoId }) {
  if (!videoId) return { ready: false, message: "Video ID is not available yet." };
  const params = new URLSearchParams({ provider, videoId });
  const token = await supabaseAccessToken();
  const response = await fetch(apiUrl(`/api/video-processing-status?${params.toString()}`), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Video processing status could not be checked.");
  return result;
}

async function offerProcessingWait({ provider, videoId, title, button }) {
  if (!videoId) return;
  const job = upsertProcessingJob({
    provider,
    videoId,
    title,
    message: `Checking ${provider} processing for ${title || "your upload"}.`,
  });
  let status;
  try {
    button.textContent = "Checking processing...";
    status = await fetchVideoProcessingStatus({ provider, videoId });
  } catch (error) {
    if (dialog?.open) dialog.close();
    const proceed = await showPortalPrompt({
      eyebrow: "Processing",
      title: "Could not check processing yet.",
      message: "This version can still be saved. We will keep checking processing in the bottom-right while you keep working.",
      confirmText: "Save and keep checking",
      cancelText: "Stop",
    });
    if (!proceed) throw error;
    return;
  }

  if (status.ready) {
    if (job) {
      updateProcessingJob(job.id, {
        status: "ready",
        message: `${title || "Your video"} is ready to review.`,
      });
    }
    return;
  }
  if (status.error) {
    if (job) {
      updateProcessingJob(job.id, {
        status: "error",
        message: status.message || `${provider} reported a processing problem.`,
      });
    }
    throw new Error(status.message || `${provider} reported a processing problem.`);
  }

  if (job) {
    updateProcessingJob(job.id, {
      message: `${provider} is still processing ${title || "your upload"}. You can keep working.`,
    });
  }
  if (dialog?.open) dialog.close();
  const shouldSave = await showPortalPrompt({
    eyebrow: "Processing",
    title: "Video is still processing.",
    message: "We will save this version now and keep checking in the bottom-right. It may not play or show thumbnails until processing is done.",
    confirmText: "Save and keep checking",
    cancelText: "Stop",
  });
  if (!shouldSave) throw new Error("Upload saved at the provider, but the version was not saved here.");
}

function render() {
  renderProcessingStatus();
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
                    const versions = projectVersionCount(project.id);
                    const recipients = projectRecipientEmails(project.id);
                    return `
                      <article class="card project-card">
                        <p class="eyebrow">${project.status}</p>
                        <h3>${project.name}</h3>
                        <p>${project.description}</p>
                        ${renderMetaStrip([
                          { show: videos.length > 0, label: `${videos.length} video${videos.length === 1 ? "" : "s"}` },
                          { show: versions > 0, label: versionCountLabel(versions) },
                        ])}
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
  const recipients = projectRecipientEmails(project.id);
  const isShared = recipients.length > 0;
  const pendingNotification = projectPendingNotification(project);
  const latestStatus = latestProjectReviewStatus(project);
  const sendStatus = !isShared
    ? "Share this project when the first review is ready."
    : pendingNotification
      ? "Notifications are pending. Nothing sends until you click the button."
    : !latestStatus.version
      ? `${recipients.length} client account${recipients.length === 1 ? "" : "s"} ${recipients.length === 1 ? "has" : "have"} access.`
      : `${recipients.length} client account${recipients.length === 1 ? "" : "s"} will receive update notices when you choose to send them.`;
  const deliveryButtonLabel = !isShared ? "Share project" : pendingNotification ? "Pending notifications" : "Notify people";
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
            ${renderVideoCardGrid({ videos, dataAttribute: "data-video", actionLabel: "Open", allowDelete: true })}
          </div>
        </div>
      </section>
      <aside class="panel stack action-panel">
        <p class="eyebrow">Delivery</p>
        <button class="primary-button" id="deliveryPrimary">${deliveryButtonLabel}</button>
        <button class="ghost-button" id="sendDownloads">Prepare downloads</button>
        <p class="muted">${sendStatus}</p>
        ${renderDownloadPackage(project, { compact: true })}
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
  root.querySelector("#sendDownloads").addEventListener("click", () => openProjectDownloadsDialog());
  root.querySelector("[data-download-project]")?.addEventListener("click", (event) => {
    downloadProjectFiles(event.currentTarget.dataset.downloadProject, event.currentTarget);
  });
  root.querySelector("#addVideo").addEventListener("click", () => openDialog("video"));
  root.querySelectorAll("[data-delete-video]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteVideo(button.dataset.deleteVideo);
    });
  });
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
                  const versions = videos
                    .flatMap((video) => videoVersions(video.id))
                    .sort((a, b) => mediaTimestampValue(b) - mediaTimestampValue(a));
                  const latest = versions[0];
                  const hasUnseenLatest = Boolean(latest && !clientReviewEvent(latest.id, "seen"));
                  return `
                    <article class="card client-project-card ${hasUnseenLatest ? "has-unseen-latest" : ""}">
                      ${hasUnseenLatest ? `<span class="new-project-dot" aria-label="New update"></span>` : ""}
                      <p class="eyebrow">Project</p>
                      <h3>${project.name}</h3>
                      <p>${project.description || "Review files and comments for this project."}</p>
                      ${renderMetaStrip([
                        { show: videos.length > 0, label: `${videos.length} video${videos.length === 1 ? "" : "s"}` },
                        { show: versions.length > 0, label: versionCountLabel(versions.length) },
                      ])}
                      <div class="card-footer">
                        <span class="metric">${latest ? `Latest: ${escapeHtml(latest.label)}` : "Project"}</span>
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

  root.querySelectorAll("[data-download-project]").forEach((button) => {
    button.addEventListener("click", (event) => {
      downloadProjectFiles(event.currentTarget.dataset.downloadProject, event.currentTarget);
    });
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
  setPageHeader(project.name, "Project review", "client");
  document.querySelector("#openCreate").hidden = true;

  root.innerHTML = `
    <section class="workspace-panel">
      <div class="workspace-head media-clean-head">
        <p class="muted">${project.description || "Review videos and comments."}</p>
        <button class="ghost-button" type="button" id="backClientDashboard">Back to projects</button>
      </div>
      ${renderDownloadPackage(project)}
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
      </div>
    </section>
  `;

  root.querySelector("#backClientDashboard")?.addEventListener("click", renderClientDashboard);
  root.querySelector("[data-download-project]")?.addEventListener("click", (event) => {
    downloadProjectFiles(event.currentTarget.dataset.downloadProject, event.currentTarget);
  });
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
              ? `Viewed ${escapeHtml(formatReviewEventTime(row.seenAt))}`
              : "Awaiting review";
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
              ? shouldRenderNativeVideo(version)
                ? renderNativeReviewVideo(version.embedUrl, video.title)
                : `<iframe title="${video.title}" src="${version.embedUrl}" allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;" allowfullscreen></iframe>`
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
                  ${
                    isAdmin
                      ? `<span class="status-pill ${summary.hasApproval ? "approved" : ""}">${escapeHtml(versionReviewLabel(version, project))}</span>`
                      : ""
                  }
                </div>`
              : ""
          }
        </div>
      </section>
      <aside class="panel stack review-side-panel">
        <p class="eyebrow">Versions</p>
        ${
          isAdmin
            ? `<button class="primary-button" id="addReviewVersion">${versions.length ? "Upload new version" : "Add first version"}</button>
              <button class="ghost-button" id="addFinalReviewVersion">Upload final version</button>`
            : ""
        }
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
                                ${
                                  isAdmin
                                    ? `<span class="status-pill ${reviewSummaryForVersion(item, project).hasApproval ? "approved" : ""}">${escapeHtml(versionReviewLabel(item, project))}</span>`
                                    : ""
                                }
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
        ${!isAdmin ? renderDownloadPackage(project, { compact: true }) : ""}
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
                              ${renderAvatar(comment.author)}
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
                  <button class="primary-button">Post comment</button>
                </form>
              </div>
              ${
                isAdmin
                  ? `<div class="review-share-block">
                      <p class="eyebrow">Public review</p>
                      <button class="ghost-button review-link-under-comments" id="shareReviewVersion" type="button">Review link</button>
                    </div>`
                  : ""
              }`
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
  root.querySelector("#addFinalReviewVersion")?.addEventListener("click", () => openDialog("finalVersion"));
  root
    .querySelector("#shareReviewVersion")
    ?.addEventListener("click", () => openPublicReviewLink(video.id, version?.id || ""));
  root.querySelectorAll("[data-download-project]").forEach((button) => {
    button.addEventListener("click", (event) => {
      downloadProjectFiles(event.currentTarget.dataset.downloadProject, event.currentTarget);
    });
  });

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
    };
    state.comments.unshift(comment);
    try {
      saveState();
      const savedComment = await insertCommentInSupabase(comment);
      if (savedComment) upsertById(state.comments, mapCommentRow(savedComment));
      saveState();
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
  const isAdmin = state.session?.role === "admin";
  setPageHeader("Activity", isAdmin ? "Workspace activity" : "Client activity");
  document.querySelector("#openCreate").hidden = true;

  const rows = isAdmin ? adminActivityRows() : clientActivityRows();
  const emptyText =
    isAdmin
      ? "New admin and client accounts will appear here."
      : "Project updates will appear here when Validate shares or updates a review.";

  root.innerHTML = `
    <div class="activity-layout">
      <section class="panel stack activity-panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">${isAdmin ? "Accounts" : "Project updates"}</p>
            <h3>${isAdmin ? "Recent accounts" : "Latest in your projects"}</h3>
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
  const isAdmin = state.session?.role === "admin";
  setPageHeader("Settings", isAdmin ? "Admin settings" : "Account settings");
  document.querySelector("#openCreate").hidden = true;
  const phoneNumber = state.session?.phoneNumber || "";
  const smsEnabled = Boolean(phoneNumber && state.session?.smsOptIn && !state.session?.smsOptedOut);
  root.innerHTML = `
    <div class="settings-layout">
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
                  <h3>Create signup link</h3>
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
                <button class="primary-button" type="submit">Generate link</button>
              </form>
              <div class="invite-result" id="inviteResult" hidden></div>
            </section>`
          : ""
      }
    </div>
  `;

  setupSettingsHandlers();
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
      const signupUrl = inviteSignupUrl({ code: invite.code, email: invite.email, role: invite.role });
      resultBox.hidden = false;
      resultBox.innerHTML = `
        <p class="eyebrow">${escapeHtml(invite.role)} invite</p>
        <div class="copy-row">
          <code>${escapeHtml(invite.code)}</code>
          <button class="ghost-button small-action" type="button" id="copyInviteCode">Copy</button>
        </div>
        <div class="copy-row">
          <code>${escapeHtml(signupUrl)}</code>
          <button class="primary-button small-action" type="button" id="copyInviteLink">Copy link</button>
        </div>
        <p class="muted">Send this signup link to ${escapeHtml(invite.email)}. It opens the account creator with the code already entered.</p>
      `;
      root.querySelector("#copyInviteCode")?.addEventListener("click", async () => {
        await navigator.clipboard?.writeText(invite.code);
        showToast("Invite code copied");
      });
      root.querySelector("#copyInviteLink")?.addEventListener("click", async () => {
        await navigator.clipboard?.writeText(signupUrl);
        showToast("Signup link copied");
      });
      showToast("Signup link generated");
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
  const defaultSmsForSelected = enableSms && selectedEmails.size > 0 && selectedSmsEmails.size === 0;
  const search = dialogFields.querySelector("#accountSearch");
  const options = dialogFields.querySelector("#accountOptions");

  const addDefaultSmsRecipients = () => {
    if (!defaultSmsForSelected) return;
    selectedEmails.forEach((email) => {
      const account = accountForEmail(email);
      if (canSendSmsToAccount(account)) selectedSmsEmails.add(email);
    });
  };

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
      if (checkbox.checked) {
        selectedEmails.add(email);
        const account = accountForEmail(email);
        if (enableSms && canSendSmsToAccount(account)) selectedSmsEmails.add(email);
      } else {
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

  if (state.accountDirectory?.length) {
    addDefaultSmsRecipients();
    renderOptions();
  }

  loadAccountDirectory({ force: true })
    .then(() => {
      addDefaultSmsRecipients();
      renderOptions();
    })
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
  createSubmit.disabled = false;
  document.querySelector("#cancelDialog").textContent = "Cancel";
  dialogFields.innerHTML = `
    <label>
      Client name
      <input name="name" value="${escapeHtml(name)}" autocomplete="off" />
    </label>
    <label>
      Summary
      <textarea name="summary" autocomplete="off">${escapeHtml(summary)}</textarea>
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
    ? "Add or remove client access. Nothing sends until you press Notify people."
    : "Choose who can see this project. Nothing sends until you press Notify people.";
  createSubmit.textContent = "Save access";
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

function openProjectDownloadsDialog() {
  const project = activeProject();
  if (!project) {
    showToast("Open a project before sending downloads");
    return;
  }

  const videos = projectVideos(project.id);
  const selectedIds = new Set(project.downloadVersionIds || []);
  const readyCount = videos.filter((video) => isDownloadableVersion(finalVersionForVideo(video))).length;
  createIntent = "downloads";
  clientDialogStep = "";
  createForm.reset();
  dialogEyebrow.hidden = false;
  dialogEyebrow.textContent = "Downloads";
  dialogTitle.textContent = "Prepare downloads";
  dialogSubtitle.hidden = false;
  dialogSubtitle.textContent = "Choose final files to make available. Email and SMS wait for the Notify people button.";
  createSubmit.textContent = "Prepare downloads";
  createSubmit.disabled = readyCount === 0;
  document.querySelector("#cancelDialog").textContent = "Cancel";
  dialogFields.innerHTML = `
    <input name="projectId" type="hidden" value="${escapeHtml(project.id)}" />
    <div class="download-picker">
      ${
        videos.length
          ? videos
                .map((video) => {
                  const version = finalVersionForVideo(video);
                  const isReady = isDownloadableVersion(version);
                  const isSelected = isReady && selectedIds.has(version.id);
                return `
                  <label class="download-choice ${isReady ? "" : "is-disabled"}">
                    <input
                      type="checkbox"
                      name="downloadVersionIds"
                      value="${escapeHtml(version?.id || "")}"
                      ${isReady ? "" : "disabled"}
                      ${isSelected ? "checked" : ""}
                    />
                    <span class="download-choice-dot" aria-hidden="true"></span>
                    <span>
                      <strong>${escapeHtml(video.title)}</strong>
                      <small>${isReady ? `Final: ${escapeHtml(version.label)}` : "Upload a downloadable final version first"}</small>
                    </span>
                  </label>
                `;
              })
              .join("")
          : `<div class="account-empty">Add videos before sending downloads.</div>`
      }
    </div>
  `;
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

function openFinalVersionDialog() {
  const videos = projectVideos(activeProject()?.id);
  if (!videos.length) {
    showToast("Add a video before uploading a final version");
    return;
  }
  if (!videos.some((video) => video.id === state.selectedVideoId)) {
    state.selectedVideoId = videos[0].id;
    saveState();
  }
  openDialog("finalVersion");
}

function setupProviderFieldToggle() {
  const provider = dialogFields.querySelector('select[name="provider"]');
  const fileInput = dialogFields.querySelector('input[name="file"]');
  const urlInput = dialogFields.querySelector('input[name="embedUrl"]');
  if (!provider || !fileInput || !urlInput) return;

  const fileLabel = fileInput.closest("label");
  const urlLabel = urlInput.closest("label");
  const syncFields = () => {
    const isDirectUrl = provider.value === "Direct URL";
    if (fileLabel) fileLabel.hidden = isDirectUrl;
    if (urlLabel) urlLabel.hidden = !isDirectUrl;
    fileInput.required = !isDirectUrl;
    urlInput.required = isDirectUrl;
  };

  provider.addEventListener("change", syncFields);
  syncFields();
}

function openDialog(intent = createIntent) {
  createIntent = intent;
  clientDialogStep = intent === "client" ? "details" : "";
  const fields = {
    client: [
      ["name", "Client name"],
      ["summary", "Summary"],
    ],
    project: [
      ["name", "Project name"],
      ["description", "Description"],
      ["status", "Status", "review"],
    ],
    video: [
      ["title", "Video title"],
      ["due", "Details"],
    ],
    version: [
      ["label", "Version label"],
      ["provider", "Provider", "Bunny Stream", "select"],
      ["file", "Video file", ""],
      ["embedUrl", "Video URL", "", "url"],
      ["note", "Client comment"],
    ],
    finalVersion: [
      ["label", "Final cut name", "Final cut"],
      ["provider", "Provider", "Bunny Stream", "select"],
      ["file", "Video file", ""],
      ["embedUrl", "Video URL", "", "url"],
      ["note", "Client comment"],
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

  if ((intent === "video" || intent === "version" || intent === "finalVersion") && !activeProject()) {
    showToast("Open a project before uploading");
    return;
  }

  const isFirstVersion = intent === "version" && !videoVersions(activeVideo()?.id).length;
  dialogTitle.textContent = {
    client: "New client",
    project: "New project",
    video: "Add video",
    version: isFirstVersion ? "Add first version" : "Upload new version",
    finalVersion: "Upload final version",
  }[intent];
  dialogEyebrow.hidden = false;
  dialogEyebrow.textContent = "Create";
  dialogSubtitle.hidden = true;
  dialogSubtitle.textContent = "";
  if (intent === "finalVersion") {
    const video = activeVideo();
    dialogSubtitle.hidden = !video;
    dialogSubtitle.textContent = video ? `Uploading final cut for ${video.title}` : "";
  }
  if (createSubmit) {
    createSubmit.textContent = intent === "version" || intent === "finalVersion" ? "Upload" : "Save";
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
              ? `<textarea name="${name}" autocomplete="off"></textarea>`
              : type === "select" && name === "provider"
                ? `<select name="${name}">
                    <option value="Bunny Stream">Bunny</option>
                    <option value="Vimeo">Vimeo</option>
                    ${createIntent === "finalVersion" ? `<option value="AWS S3">AWS S3</option>` : ""}
                    <option value="Direct URL">URL</option>
                  </select>`
              : name === "file"
                ? `<input name="${name}" type="file" accept="video/*" />`
              : name === "embedUrl"
                ? `<input name="${name}" type="url" autocomplete="off" />`
                : `<input name="${name}" autocomplete="off" />`
          }
        </label>
      `,
    )
    .join("");

  setupProviderFieldToggle();
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
    selectedVersionId: state.selectedVersionId,
  };
  saveButton.disabled = true;
  const uploadsVideo = createIntent === "version" || createIntent === "finalVersion";
  saveButton.textContent = uploadsVideo ? "Starting upload..." : "Saving...";
  showToast(uploadsVideo ? "Starting upload..." : "Saving...");
  syncPaused = true;

  try {
    if (createIntent === "share") {
      const shareResult = await shareProjectFromForm(form, saveButton);
      dialog.close();
      createForm.reset();
      const shareMessage = shareResult.selectedCount
        ? `Project access saved for ${shareResult.selectedCount} client${shareResult.selectedCount === 1 ? "" : "s"}${
            shareResult.smsCount ? ` / ${shareResult.smsCount} SMS-ready` : ""
          }. Press Notify people when you are ready.`
        : "Project client access cleared";
      showToast(shareMessage);
      renderProjectDetail();
      return;
    }

    if (createIntent === "downloads") {
      const downloadResult = await prepareDownloadsFromForm(form, saveButton);
      dialog.close();
      createForm.reset();
      showToast(
        `Prepared ${downloadResult.selectedCount} download file${downloadResult.selectedCount === 1 ? "" : "s"}. Pending notifications for ${downloadResult.clientCount} client${downloadResult.clientCount === 1 ? "" : "s"}.`,
      );
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
        downloadVersionIds: [],
        downloadSentAt: "",
        downloadNotifiedAt: "",
        lastNotifiedVersionId: "",
        pendingVersionId: "",
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
        createdAt: new Date().toISOString(),
      };
      state.videos.unshift(video);
      state.selectedVideoId = videoId;
      state.selectedVersionId = "";
    }

    if (createIntent === "version" || createIntent === "finalVersion") {
      const project = activeProject();
      const selectedVideoId = state.selectedVideoId;
      const video = projectVideos(project?.id).find((item) => item.id === selectedVideoId);
      if (!video) {
        throw new Error("Open a video before uploading a version.");
      }

      const file = form.get("file");
      const label = form.get("label") || (createIntent === "finalVersion" ? "Final cut" : "New version");
      const provider = form.get("provider") || "Bunny Stream";
      const isDirectUrl = provider === "Direct URL";
      let embedUrl = "";
      let bunnyVideoId = "";

      if (isDirectUrl) {
        embedUrl = normalizeVideoUrl(form.get("embedUrl"));
        if (!embedUrl) throw new Error("Paste a video URL before saving this version.");
      } else {
        if (!file?.size) {
          throw new Error("Choose a video file before saving a version");
        }
        const upload = await uploadVersionFile({
          provider,
          file,
          title: `${video.title} - ${label}`,
          projectTitle: project.name,
          button: saveButton,
        });
        embedUrl = upload.embedUrl;
        bunnyVideoId = upload.videoId || "";
        if (provider !== "AWS S3") {
          await offerProcessingWait({
            provider,
            videoId: bunnyVideoId,
            title: video.title,
            button: saveButton,
          });
        }
      }

      const version = {
        id: `version-${nowId}`,
        videoId: video.id,
        label,
        provider,
        embedUrl,
        bunnyVideoId,
        note: form.get("note") || (createIntent === "finalVersion" ? "Final cut ready for review." : "New review version."),
        createdAt: freshTimestampLabel(),
        createdAtRaw: new Date().toISOString(),
        approved: false,
      };
      if (createIntent === "finalVersion") {
        project.status = "final";
        video.status = "final";
      }
      state.versions.unshift(version);
      project.pendingVersionId = version.id;
      state.selectedVideoId = video.id;
      state.selectedVersionId = version.id;
    }

    saveButton.textContent = uploadsVideo ? "Saving version..." : "Saving...";
    await saveAndReloadPortalData();
    if (dialog.open) dialog.close();
    createForm.reset();
    const successMessage = uploadsVideo
      ? createIntent === "finalVersion"
        ? "Final version saved"
        : "Version saved"
      : createIntent === "video"
        ? "Video added"
        : "Saved";
    showToast(successMessage);
    if (createIntent === "project") renderProjects();
    else if (createIntent === "video") renderProjectDetail();
    else if (createIntent === "version" || createIntent === "finalVersion") renderReviewShell(state.mode === "admin");
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
    state.selectedVersionId = previousData.selectedVersionId;
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
  applyInviteSignupParams();
  const portalHandoff = portalHandoffParams();
  await loadSupabaseConfig();
  watchSupabaseAuth();
  startProcessingPoller();
  if (publicReviewParamsFromHash()) {
    await openPublicReviewFromHash();
    return;
  }
  let restored = false;
  try {
    restored = portalHandoff
      ? await redeemPortalHandoff(portalHandoff)
      : await restoreSupabaseSession();
    if (!restored && state.session) {
      clearAccountSession();
    }
    if (restored) startCrossDeviceSync();
  } catch (error) {
    console.warn("Supabase startup load failed", error);
    if (portalHandoff) clearPortalHandoffParams();
    clearAccountSession();
    showToast(error.message || "Could not open the Delivery Portal session");
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
  if (publicReviewParamsFromHash()) {
    openPublicReviewFromHash();
    return;
  }
  if (document.body.classList.contains("public-review-mode")) {
    leavePublicReview();
    return;
  }
  openReviewFromHash({ showMissingMessage: true });
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !state.session) startLoginReel();
  if (!document.hidden) pollProcessingJobs();
  if (!document.hidden && state.session) {
    const isWatchingReview = currentView === "adminReview" || currentView === "clientReview";
    syncPortalData({ rerender: !isWatchingReview });
  }
});
window.addEventListener("focus", () => {
  pollProcessingJobs();
  const isWatchingReview = currentView === "adminReview" || currentView === "clientReview";
  syncPortalData({ rerender: !isWatchingReview });
});
