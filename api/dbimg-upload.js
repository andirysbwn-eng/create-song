// DBImg upload proxy. Configure DBIMG_API_KEY in Vercel Environment Variables.
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const key = process.env.DBIMG_API_KEY;
  if (!key) return res.status(500).json({ error: "DBIMG_API_KEY belum diatur di Environment Variables." });
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 4 * 1024 * 1024) return res.status(413).json({ error: "File terlalu besar untuk upload lewat Vercel (batas aplikasi 4 MB). Gunakan file lebih kecil atau uploader eksternal." });
      chunks.push(chunk);
    }
    if (!size) return res.status(400).json({ error: "File upload kosong." });
    const filename = String((req.query && req.query.filename) || "upload.bin").replace(/[\\/\r\n\0]/g, "_").slice(0, 180);
    const type = String(req.headers["content-type"] || "application/octet-stream").split(";")[0];
    const form = new FormData();
    form.append("file", new Blob([Buffer.concat(chunks)], { type }), filename);
    const upstream = await fetch("https://dbimg.app/api/upload", {
      method: "POST",
      headers: { Authorization: "Bearer " + key },
      body: form
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return res.status(upstream.status).json({ error: data.error || data.message || "DBImg menolak upload", details: data });
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Upload DBImg gagal." });
  }
};
module.exports.config = { api: { bodyParser: false } };
