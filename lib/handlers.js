// Logika bersama untuk Vercel (folder /api) dan server lokal (server.js).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const API_ROOT = "https://api.emix.ai/api/v1"; // Endpoint internal; branding provider tidak ditampilkan di UI.
const API = API_ROOT + "/client/tasks";
const KLING_API = API;
const MODEL = "suno/upload-and-cover-audio";
const SUNO_MODELS = {
  generate: "Suno/generate",
  cover: "suno/upload-and-cover-audio",
  extend: "Suno/upload And Extend Audio",
};
const ALLOWED = [
  "uploadUrl", "title", "style", "duration", "instrumental", "lyrics", "prompt", "model",
  "negativeTags", "vocalGender", "styleWeight", "weirdnessConstraint",
  "audioWeight", "variety", "personaId", "personaModel", "continueAt",
  "customMode", "audioId", "audioIds", "startTime", "endTime", "negativeTags", "callBackUrl",
  "voiceId", "stylePrompt", "taskId", "uploadUrl", "audioUrl", "audioUrls", "audioId", "audioIds", "personaId", "personaModel", "startTime", "endTime", "callBackUrl",
];


const SESSION_COOKIE = "studio_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
function sessionSecret() { return process.env.SESSION_SECRET || (process.env.NODE_ENV === "production" ? "" : "local-only-change-me"); }
function accountPrefixes() {
  return Object.keys(process.env).filter((k) => /^[A-Z0-9_]+_USERNAME$/.test(k)).map((k) => k.slice(0, -9));
}
function safeEqual(a, b) {
  const aa = Buffer.from(String(a || "")); const bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function sign(value) { return crypto.createHmac("sha256", sessionSecret()).update(value).digest("base64url"); }
function createSession(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS })).toString("base64url");
  return payload + "." + sign(payload);
}
function getSession(req) {
  const secret = sessionSecret(); if (!secret) return null;
  const header = req.headers && req.headers.cookie || "";
  const item = header.split(";").map(v => v.trim()).find(v => v.startsWith(SESSION_COOKIE + "="));
  if (!item) return null;
  const token = decodeURIComponent(item.slice(SESSION_COOKIE.length + 1));
  const parts = token.split("."); if (parts.length !== 2 || !safeEqual(parts[1], sign(parts[0]))) return null;
  try { const data = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); if (!data.u || data.exp < Math.floor(Date.now()/1000)) return null; return data.u; } catch (_) { return null; }
}
function setSessionCookie(res, value, clear) {
  const secure = process.env.NODE_ENV === "production" || (process.env.VERCEL === "1");
  res.setHeader("Set-Cookie", SESSION_COOKIE + "=" + (clear ? "" : encodeURIComponent(value)) + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + (clear ? 0 : SESSION_TTL_SECONDS) + (secure ? "; Secure" : ""));
}
function getUserKeys(username) {
  const prefix = accountPrefixes().find(p => String(process.env[p + "_USERNAME"] || "").toLowerCase() === String(username || "").toLowerCase());
  if (!prefix) return [];
  const keys = [];
  Object.keys(process.env).map(name => ({ name, m: name.match(new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "_API_KEY_(\\d+)$", "i")) }))
    .filter(x => x.m).sort((a,b) => Number(a.m[1])-Number(b.m[1])).forEach(x => { const k = String(process.env[x.name] || "").trim().replace(/^Bearer\s+/i, ""); if (validKeyFormat(k) && !keys.includes(k)) keys.push(k); });
  return keys;
}
async function handleAuth(req, res) {
  if (req.method === "GET") {
    const username = getSession(req);
    return username ? send(res, 200, { code: 200, authenticated: true, username }) : send(res, 401, { code: 401, authenticated: false, msg: "Silakan masuk untuk melanjutkan." });
  }
  if (req.method === "DELETE") { setSessionCookie(res, "", true); return send(res, 200, { code: 200, msg: "Berhasil keluar." }); }
  if (req.method !== "POST") return send(res, 405, { code: 405, msg: "Permintaan tidak didukung." });
  if (!sessionSecret()) return send(res, 503, { code: 503, msg: "Login belum dikonfigurasi. Hubungi administrator." });
  let body; try { body = await readJson(req); } catch (_) { return send(res, 400, { code: 400, msg: "Periksa nama pengguna dan kata sandi." }); }
  const username = String(body.username || "").trim(); const password = String(body.password || "");
  const prefixes = accountPrefixes();
  if (!prefixes.length) return send(res, 503, { code: 503, msg: "Akun belum dikonfigurasi. Hubungi administrator." });
  const prefix = prefixes.find(p => String(process.env[p + "_USERNAME"] || "").toLowerCase() === username.toLowerCase());
  if (!prefix || !process.env[prefix + "_PASSWORD"] || !username || !password || !safeEqual(password, process.env[prefix + "_PASSWORD"])) return send(res, 401, { code: 401, msg: "Nama pengguna atau kata sandi salah." });
  if (!getUserKeys(username).length) return send(res, 503, { code: 503, msg: "Akun belum siap digunakan. Hubungi administrator." });
  setSessionCookie(res, createSession(String(process.env[prefix + "_USERNAME"])));
  return send(res, 200, { code: 200, authenticated: true, username: String(process.env[prefix + "_USERNAME"]) });
}
function authenticatedKeys(req, res) {
  const username = getSession(req);
  if (!username) { send(res, 401, { code: 401, msg: "Sesi berakhir. Silakan masuk kembali." }); return null; }
  const keys = getUserKeys(username);
  if (!keys.length) { send(res, 503, { code: 503, msg: "Akun belum siap digunakan. Hubungi administrator." }); return null; }
  return keys;
}
function publicError(code) {
  if (code === 401) return "Sesi berakhir atau permintaan tidak dapat diproses. Silakan masuk kembali.";
  if (code === 402 || code === 403 || code === 429) return "Layanan sedang sibuk. Coba lagi beberapa saat.";
  if (code === 422) return "Permintaan tidak dapat diproses. Periksa isian lalu coba lagi.";
  return "Terjadi kendala saat memproses permintaan. Coba lagi nanti.";
}
function sanitizeResult(json) {
  if (!json || typeof json !== "object") return { code: 500, msg: publicError(500) };
  const code = Number(json.code || 0);
  const out = { ...json };
  delete out.providerMessage; delete out.source; delete out.upstreamStatus; delete out.creditsConsumed;
  if (code && code !== 200) { out.msg = publicError(code); delete out.message; delete out.error; }
  if (out.data && typeof out.data === "object" && String(out.data.state || "").toLowerCase() === "fail") {
    out.data = { ...out.data, failMsg: "Tugas tidak dapat diselesaikan. Coba lagi nanti.", failCode: undefined };
    delete out.data.failCode;
  }
  return out;
}

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

async function readJson(req) {
  if (req.body !== undefined && req.body !== null) {
    return typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
  }
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 100000) throw new Error("Body terlalu besar");
  }
  return JSON.parse(data || "{}");
}

// Kumpulan key: Vercel API_KEY_1, API_KEY_2, ... atau keys.txt lokal.
// Tidak pernah mengirim key ke browser/log. Key berikutnya dicoba jika key sebelumnya
// ditolak, kuotanya habis, atau terkena rate limit.
function getRequestKeys() {
  const keys = [];
  const add = (value) => {
    if (typeof value !== "string") return;
    const k = value.trim().replace(/^Bearer\s+/i, "").trim();
    if (k && !keys.includes(k)) keys.push(k);
  };

  // Legacy names tetap didukung.
  add(process.env.API_KEY);
  add(process.env.SUNO_API_KEY);

  // Sort numerically so API_KEY_2 comes after API_KEY_1 (not API_KEY_10).
  Object.keys(process.env)
    .map((name) => ({ name, match: name.match(/^API_KEY_(\d+)$/i) }))
    .filter((item) => item.match)
    .sort((a, b) => Number(a.match[1]) - Number(b.match[1]))
    .forEach(({ name }) => add(process.env[name]));

  try {
    const contents = fs.readFileSync(path.join(__dirname, "..", "keys.txt"), "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const value = trimmed.replace(/^API_KEY(?:_\d+)?\s*=\s*/i, "").replace(/^Bearer\s+/i, "").trim();
      add(value.replace(/^("|')(.*)\1$/, "$2"));
    }
  } catch (_e) { /* keys.txt opsional pada hosting */ }

  return keys.filter(validKeyFormat);
}

function getRequestKey(_req) {
  return getRequestKeys()[0] || "";
}

function validKeyFormat(k) {
  return typeof k === "string" && /^[^\s]{8,512}$/.test(k);
}

async function call(key, url, options) {
  const r = await fetch(url, {
    ...options,
    headers: {
      ...(options && options.headers ? options.headers : {}),
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
    },
  });
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = { msg: text.slice(0, 500) || "Respons tidak valid dari provider" };
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    json = { msg: "Format respons tidak dikenali dari provider" };
  }
  // Beberapa gateway mengirim HTTP 200 tetapi code error di JSON, dan sebaliknya.
  const bodyCode = Number(json.code);
  const code = (r.status === 401 || r.status === 402)
    ? r.status
    : (Number.isFinite(bodyCode) && bodyCode > 0 ? bodyCode : r.status);
  return {
    ...json,
    code,
    upstreamStatus: r.status,
    source: "provider",
    // Keep a compact provider diagnostic so the UI can show the actual missing-field message.
    providerMessage: String(json.msg || json.message || json.error || "").slice(0, 600),
  };
}


async function callWithKeyFallback(keys, url, options) {
  if (!keys.length) throw new Error("API key belum ditemukan.");
  let result;
  for (let i = 0; i < keys.length; i++) {
    result = await call(keys[i], url, options);
    const status = Number(result.upstreamStatus || result.code || 0);
    const bodyCode = Number(result.code || 0);
    // Log only safe diagnostics (never the API key, request headers, or full audio URL).
    if (status >= 400 || (bodyCode && bodyCode !== 200)) {
      const endpoint = String(url).includes('/jobs/recordInfo') ? 'cover-status'
        : String(url).includes('/jobs/createTask') ? 'cover-create' : 'task';
      console.warn('[Studio Cover upstream]', JSON.stringify({
        endpoint, keySlot: i + 1, httpStatus: status, responseCode: bodyCode,
        message: String(result.providerMessage || result.msg || '').slice(0, 240)
      }));
    }
    const shouldTryNext = [401, 402, 403, 429].includes(status) || [401, 402, 403, 429].includes(bodyCode);
    if (!shouldTryNext || i === keys.length - 1) return result;
  }
  return result;
}


async function handleCreate(req, res) {
  if (req.method !== "POST") return send(res, 405, { code: 405, msg: "Gunakan POST" });
  let body;
  try { body = await readJson(req); } catch (e) { return send(res, 400, { code: 400, msg: "Body bukan JSON yang valid" }); }

  const keys = authenticatedKeys(req, res); if (!keys) return;
  if (body.workflow === "kling" || (body.input && body.input.workflow === "kling")) return handleKlingCreate(req, res, body, keys);

  const workflow = body.workflow || "cover";
  if (!Object.prototype.hasOwnProperty.call(SUNO_MODELS, workflow)) return send(res, 422, { code: 422, msg: "Fitur Suno tidak dikenal atau belum dipetakan." });
  const input = {};
  for (const k of ALLOWED) {
    let v = body.input && body.input[k];
    // Dokumentasi Upload and Cover Audio memakai field Lyrics dengan huruf besar.
    if (k === "lyrics" && (v === undefined || v === null || v === "") && body.input) v = body.input.Lyrics;
    if (v !== undefined && v !== null && v !== "") input[k] = v;
  }
  const urlWorkflows = ["cover", "extend"];
  const sourceUrl = input.uploadUrl || input.audioUrl || (Array.isArray(input.audioUrls) ? input.audioUrls[0] : "");
  const hasPublicUrl = /^https?:\/\//i.test(sourceUrl || "");
  if (urlWorkflows.includes(workflow) && !hasPublicUrl) {
    return send(res, 422, { code: 422, msg: "Fitur ini memerlukan URL audio publik." });
  }
  if (workflow === "extend" && (!Number.isFinite(Number(input.continueAt)) || Number(input.continueAt) < 0)) return send(res, 422, { code: 422, msg: "Posisi extend harus berupa detik yang valid." });
  // Keep the selected Suno model for endpoints that require it. The UI sends it,
  // so it must be included in ALLOWED and must not be silently discarded.
  input.model = String(input.model || "V6").toUpperCase();
  if (!["V6", "V6_MINI", "V6_WILD"].includes(input.model)) input.model = "V6";
  // Remove only UI-only fields; model is a real API parameter.
  delete input.workflow;
  if (workflow === "generate") delete input.uploadUrl;
  // Provider validates `variety` differently by endpoint:
  // Generate accepts numeric strings 0-4; upload-cover/extend accept
  // off|normal|high|extra|max. The UI currently sends numeric 1 for all workflows.
  if (workflow === "cover" || workflow === "extend") {
    const varietyMap = { "0": "off", "1": "normal", "2": "high", "3": "extra", "4": "max" };
    if (input.variety !== undefined) {
      const rawVariety = String(input.variety).toLowerCase();
      input.variety = ["off", "normal", "high", "extra", "max"].includes(rawVariety)
        ? rawVariety
        : (varietyMap[rawVariety] || "normal");
    }
  }
  if (workflow === "generate") {
    // Generate Music requires customMode, instrumental, and model.
    input.customMode = input.customMode === true || input.customMode === "true";
    input.instrumental = input.instrumental === true || input.instrumental === "true";
    if (!input.customMode) {
      // Non-custom mode accepts prompt plus optional attachments/style/lyrics.
      delete input.title; delete input.negativeTags; delete input.duration;
      delete input.vocalGender; delete input.styleWeight; delete input.weirdnessConstraint;
      delete input.audioWeight; delete input.variety;
      if (!input.prompt && !input.style && !input.lyrics && !input.audioUrls && !input.imageUrls && !input.videoUrls) {
        return send(res, 422, { code: 422, msg: "Isi prompt, gaya musik, lirik, atau URL media untuk Generate Music." });
      }
    } else {
      if (!input.style && !input.lyrics && !input.prompt && !input.negativeTags) {
        return send(res, 422, { code: 422, msg: "Custom Mode membutuhkan minimal gaya musik, lirik, atau negative tags." });
      }
      for (const k of ["title", "style", "lyrics", "prompt", "negativeTags"]) {
        if (input[k] !== undefined && typeof input[k] !== "string") {
          return send(res, 422, { code: 422, msg: "Parameter " + k + " harus berupa teks." });
        }
      }
      if (input.title && input.title.length > 80) return send(res, 422, { code: 422, msg: "Judul maksimal 80 karakter." });
      if (input.style && input.style.length > 1000) return send(res, 422, { code: 422, msg: "Gaya musik maksimal 1000 karakter." });
      if (input.lyrics && input.lyrics.length > 5000) return send(res, 422, { code: 422, msg: "Lirik maksimal 5000 karakter." });
      if (input.prompt && input.prompt.length > 5000) return send(res, 422, { code: 422, msg: "Prompt/lirik maksimal 5000 karakter untuk model V6." });
      if (input.negativeTags && input.negativeTags.length > 1000) return send(res, 422, { code: 422, msg: "Negative tags maksimal 1000 karakter." });
      if (input.instrumental) {
        // Provider does not support audioWeight when generating without vocals.
        delete input.audioWeight;
        delete input.lyrics;
        delete input.prompt;
      }
      input.variety = Number.isFinite(Number(input.variety)) ? Math.max(0, Math.min(4, Math.round(Number(input.variety)))) : 1;
      for (const k of ["styleWeight", "weirdnessConstraint", "audioWeight"]) {
        if (input[k] !== undefined) {
          const n = Number(input[k]);
          if (!Number.isFinite(n)) return send(res, 422, { code: 422, msg: k + " harus berupa angka antara 0 dan 1." });
          input[k] = Math.round(Math.max(0, Math.min(1, n)) * 100) / 100;
        }
      }
    }
  }
  const apiModel = SUNO_MODELS[workflow];
  if (workflow === "cover") {
    // Upload And Cover Audio has a dedicated endpoint and a stricter input schema.
    // Do not forward UI-only or endpoint-incompatible fields such as prompt/customMode.
    if (input.lyrics !== undefined) { input.Lyrics = input.lyrics; delete input.lyrics; }
    const allowedCoverFields = ["model", "uploadUrl", "title", "style", "duration", "instrumental", "Lyrics", "negativeTags", "vocalGender", "styleWeight", "weirdnessConstraint", "audioWeight", "variety", "personaId", "personaModel"];
    for (const key of Object.keys(input)) if (!allowedCoverFields.includes(key)) delete input[key];
    // Normalize and validate fields exactly as the Upload And Cover Audio schema expects.
    try {
      const parsedUrl = new URL(String(input.uploadUrl || ''));
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('protocol');
    } catch (_) {
      return send(res, 422, { code: 422, msg: "Link audio harus berupa URL HTTP/HTTPS yang valid." });
    }
    input.instrumental = input.instrumental === true || input.instrumental === 'true';
    if (input.title !== undefined && typeof input.title !== 'string') input.title = String(input.title);
    if (input.style !== undefined && typeof input.style !== 'string') input.style = String(input.style);
    if (input.negativeTags !== undefined && typeof input.negativeTags !== 'string') input.negativeTags = String(input.negativeTags);
    if (input.title && input.title.length > 100) return send(res, 422, { code: 422, msg: "Judul maksimal 100 karakter." });
    if (input.style && input.style.length > 1000) return send(res, 422, { code: 422, msg: "Gaya musik maksimal 1000 karakter." });
    if (input.negativeTags && input.negativeTags.length > 1000) return send(res, 422, { code: 422, msg: "Negative tags maksimal 1000 karakter." });
    if (input.Lyrics && input.Lyrics.length > 5000) return send(res, 422, { code: 422, msg: "Lirik maksimal 5000 karakter." });
    if (input.variety !== undefined) {
      const varietyMap = { '0': 'off', '1': 'normal', '2': 'high', '3': 'extra', '4': 'max' };
      const variety = String(input.variety).toLowerCase();
      input.variety = ['off', 'normal', 'high', 'extra', 'max'].includes(variety) ? variety : (varietyMap[variety] || 'normal');
    }
    if (input.vocalGender !== undefined && !['f', 'm'].includes(String(input.vocalGender).toLowerCase())) delete input.vocalGender;
    const duration = Number(input.duration);
    if (!Number.isFinite(duration) || duration < 10 || duration > 360) return send(res, 422, { code: 422, msg: "Durasi cover harus antara 10 sampai 360 detik." });
    input.duration = duration;
    for (const key of ["styleWeight", "weirdnessConstraint", "audioWeight"]) {
      if (input[key] !== undefined) {
        const n = Number(input[key]);
        if (!Number.isFinite(n) || n < 0 || n > 1 || Math.round(n * 100) !== n * 100) return send(res, 422, { code: 422, msg: "Pengaturan gaya audio harus berupa angka 0–1 dengan maksimal 2 desimal." });
        input[key] = n;
      }
    }
  }
  const payload = { method: "POST", body: JSON.stringify({ model: apiModel, input }) };
  const endpoint = workflow === "cover" ? API_ROOT + "/jobs/createTask" : API;

  try {
    const json = await callWithKeyFallback(keys, endpoint, payload);
    return send(res, 200, sanitizeResult(json));
  } catch (e) {
    return send(res, 500, { code: 500, msg: publicError(500) });
  }
}


async function handleKlingCreate(req, res, body, keys) {

  const raw = body.input || {};
  const prompt = typeof raw.prompt === "string" ? raw.prompt.trim() : "";
  const image = Array.isArray(raw.input_urls) ? raw.input_urls[0] : "";
  const video = Array.isArray(raw.video_urls) ? raw.video_urls[0] : "";
  const orientation = raw.character_orientation;
  const mode = raw.mode;
  if (!/^https?:\/\//i.test(image || "")) return send(res, 422, { code: 422, msg: "URL gambar harus berupa link http:// atau https:// yang publik." });
  if (!/^https?:\/\//i.test(video || "")) return send(res, 422, { code: 422, msg: "URL video harus berupa link http:// atau https:// yang publik." });
  if (prompt.length > 2500) return send(res, 422, { code: 422, msg: "Prompt maksimal 2500 karakter." });
  if (!["image", "video"].includes(orientation)) return send(res, 422, { code: 422, msg: "Orientasi karakter tidak valid." });
  if (!["720p", "1080p"].includes(mode)) return send(res, 422, { code: 422, msg: "Resolusi harus 720p atau 1080p." });

  const payload = { method: "POST", body: JSON.stringify({
    model: "kling/v2-6-motion-control",
    input: { prompt: prompt || "The character is dancing.", input_urls: [image], video_urls: [video], character_orientation: orientation, mode }
  }) };
  const url = KLING_API; // Kling 2.6 docs: POST /api/v1/client/tasks
  try {
    const json = await callWithKeyFallback(keys, url, payload);
    return send(res, 200, sanitizeResult(json));
  } catch (e) { return send(res, 500, { code: 500, msg: publicError(500) }); }
}

async function handleStatus(req, res) {
  if (req.method !== "GET") return send(res, 405, { code: 405, msg: "Gunakan GET" });
  const keys = authenticatedKeys(req, res); if (!keys) return;
  const q = new URL(req.url, "http://localhost").searchParams;
  const id = q.get("taskId") || "";
  if (!/^[\w-]{6,100}$/.test(id)) return send(res, 422, { code: 422, msg: "taskId tidak valid" });

  try {
    // Cover tasks use the documented recordInfo endpoint; other workflows use client/tasks.
    const t = encodeURIComponent(id);
    const workflow = q.get("workflow") || "";
    const statusUrl = workflow === "cover"
      ? API_ROOT + "/jobs/recordInfo?taskId=" + t
      : API_ROOT + "/client/tasks/" + t;
    const json = await callWithKeyFallback(keys, statusUrl, { method: "GET" });
    if (workflow === "cover" && json && json.data && String(json.data.state || "").toLowerCase() === "fail") {
      // Provider task failure details stay in server logs only; never expose secrets or raw diagnostics in the UI.
      console.warn('[Studio Cover task failed]', JSON.stringify({
        taskId: String(json.data.taskId || id).slice(0, 12),
        failCode: String(json.data.failCode || '').slice(0, 80),
        failMsg: String(json.data.failMsg || '').slice(0, 240)
      }));
    }
    return send(res, 200, sanitizeResult(json || { code: 502, msg: "Tidak ada respons status task", source: "provider" }));
  } catch (e) {
    return send(res, 500, { code: 500, msg: publicError(500) });
  }
}

module.exports = { handleCreate, handleStatus, handleAuth, send };
