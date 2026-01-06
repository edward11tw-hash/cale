// netlify/functions/menu.js
// 功能：
// - GET  /.netlify/functions/menu  -> 讀 GitHub repo 的 menu.json
// - POST /.netlify/functions/menu  -> 驗證 token 後，把新的 menu.json commit 回 GitHub

const GH_API = "https://api.github.com";

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function b64encodeUtf8(str) {
  return Buffer.from(str, "utf8").toString("base64");
}

async function ghFetch(path, opts = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("Missing env: GITHUB_TOKEN");

  const res = await fetch(`${GH_API}${path}`, {
    ...opts,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      ...(opts.headers || {}),
    },
  });

  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    const msg = typeof data === "object" ? JSON.stringify(data) : String(data);
    throw new Error(`GitHub API error ${res.status}: ${msg}`);
  }
  return data;
}

exports.handler = async (event) => {
  try {
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || "main";
    const filePath = process.env.MENU_PATH || "menu.json";
    const adminToken = process.env.ADMIN_TOKEN || "";

    if (!owner || !repo) return json(500, { error: "Missing env: GITHUB_OWNER / GITHUB_REPO" });

    // 1) 讀取 menu.json（GitHub contents API）
    // GitHub contents endpoint 文件：:contentReference[oaicite:7]{index=7}
    if (event.httpMethod === "GET") {
      const info = await ghFetch(`/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(branch)}`);
      const contentB64 = info.content || "";
      const raw = Buffer.from(contentB64, "base64").toString("utf8");
      const parsed = JSON.parse(raw);
      return json(200, parsed);
    }

    // 2) 寫入 menu.json（commit）
    if (event.httpMethod === "POST") {
      const token = event.headers["x-admin-token"] || event.headers["X-Admin-Token"] || "";
      if (!adminToken || token !== adminToken) return json(401, { error: "unauthorized" });

      const next = JSON.parse(event.body || "null");
      if (!Array.isArray(next)) return json(400, { error: "menu must be an array []" });

      // 保底：enabled 預設 true（你前台已用 enabled 過濾）:contentReference[oaicite:8]{index=8}
      for (const it of next) {
        if (it && typeof it === "object" && typeof it.enabled === "undefined") it.enabled = true;
      }

      // 先抓現有檔案 sha（更新必備）
      const info = await ghFetch(`/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(branch)}`);
      const sha = info.sha;

      const content = JSON.stringify(next, null, 2);
      const payload = {
        message: `Update ${filePath} from admin`,
        content: b64encodeUtf8(content),
        sha,
        branch,
      };

      // PUT /repos/{owner}/{repo}/contents/{path}
      // GitHub REST 文件：:contentReference[oaicite:9]{index=9}
      await ghFetch(`/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      return json(200, { ok: true });
    }

    return json(405, { error: "method not allowed" });
  } catch (e) {
    return json(500, { error: e.message || String(e) });
  }
};
