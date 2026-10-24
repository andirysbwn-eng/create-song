// Logika bersama untuk Vercel (folder /api) dan server lokal (server.js).
const fs = require("fs");
const path = require("path");
const API_ROOT = "https://api.emix.ai/api/v1"; // Endpoint internal; branding provider tidak ditampilkan di UI.
const API = API_ROOT + "/client/tasks";
const KLING_API = API;
const MODEL = "suno/upload-and-cover-audio";
const SUNO_MODELS = {
  generate: "ai-music-api/generate",
  cover: "suno/upload-and-cover-audio",
  extend: "suno/upload-and-extend-audio",
};
const ALLOWED = [
  "uploadUrl", "title", "style", "duration", "instrumental", "lyrics", "prompt", "model",
  "negativeTags", "vocalGender", "styleWeight", "weirdnessConstraint",
  "audioWeight", "variety", "personaId", "personaModel", "continueAt",
  "customMode", "audioId", "audioIds", "startTime", "endTime", "negativeTags", "callBackUrl",
  "voiceId", "stylePrompt", "taskId", "uploadUrl", "audioUrl", "audioUrls", "audioId", "audioIds", "personaId", "personaModel", "startTime", "endTime", "callBackUrl",
];

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
    const shouldTryNext = [401, 402, 403, 429].includes(status) || [401, 402, 403, 429].includes(bodyCode);
    if (!shouldTryNext || i === keys.length - 1) return result;
  }
  return result;
}


async function handleCreate(req, res) {
  if (req.method !== "POST") return send(res, 405, { code: 405, msg: "Gunakan POST" });
  let body;
  try { body = await readJson(req); } catch (e) { return send(res, 400, { code: 400, msg: "Body bukan JSON yang valid" }); }

  if (body.workflow === "kling" || (body.input && body.input.workflow === "kling")) return handleKlingCreate(req, res, body);

  const workflow = body.workflow || "cover";
  if (!Object.prototype.hasOwnProperty.call(SUNO_MODELS, workflow)) return send(res, 422, { code: 422, msg: "Fitur Suno tidak dikenal atau belum dipetakan." });
  const keys = getRequestKeys();
  if (!keys.length) return send(res, 400, { code: 400, msg: "API key belum ditemukan. Atur API_KEY_1, API_KEY_2, dan seterusnya di Vercel, atau isi keys.txt untuk server lokal." });
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
  if (workflow === "cover" && input.lyrics !== undefined) { input.Lyrics = input.lyrics; delete input.lyrics; }
  const payload = { method: "POST", body: JSON.stringify({ model: apiModel, input }) };

  try {
    const json = await callWithKeyFallback(keys, API, payload);
    return send(res, 200, json);
  } catch (e) {
    return send(res, 500, { code: 500, msg: e.message || "Server error" });
  }
}


async function handleKlingCreate(req, res, body) {
  const keys = getRequestKeys();
  if (!keys.length) return send(res, 400, { code: 400, msg: "API key belum ditemukan. Atur API_KEY_1, API_KEY_2, dan seterusnya di Vercel, atau isi keys.txt untuk server lokal." });

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
    return send(res, 200, json);
  } catch (e) { return send(res, 500, { code: 500, msg: e.message || "Server error" }); }
}

async function handleStatus(req, res) {
  if (req.method !== "GET") return send(res, 405, { code: 405, msg: "Gunakan GET" });
  const q = new URL(req.url, "http://localhost").searchParams;
  const id = q.get("taskId") || "";
  if (!/^[\w-]{6,100}$/.test(id)) return send(res, 422, { code: 422, msg: "taskId tidak valid" });

  const keys = getRequestKeys();
  if (!keys.length) return send(res, 400, { code: 400, msg: "API key belum ditemukan. Atur API_KEY_1, API_KEY_2, dan seterusnya di Vercel, atau isi keys.txt untuk server lokal." });
  try {
    // Ambil detail task, bukan endpoint daftar task ber-pagination (pageSize/pageNum).
    const t = encodeURIComponent(id);
    const json = await callWithKeyFallback(keys, API_ROOT + "/client/tasks/" + t, { method: "GET" });
    return send(res, 200, json || { code: 502, msg: "Tidak ada respons status task dari provider", source: "provider" });
  } catch (e) {
    return send(res, 500, { code: 500, msg: e.message || "Server error" });
  }
}

module.exports = { handleCreate, handleStatus, send };
