const BOT_PATTERN = /(?:bot|crawler|spider|slurp|preview|prerender|headless|facebookexternalhit|whatsapp|discordbot|telegrambot|linkedinbot|google-inspectiontool|bingpreview)/i;
const DEFAULT_ALLOWED_HOSTS = [
    "drive.google.com",
    "docs.google.com"
];
const SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};
export default {
    async fetch (request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname.replace(/\/+$/, "") || "/";
        if (path.startsWith("/partenaire/")) return handlePartnerRedirect(request, env, ctx, path);
        if (path === "/confidentialite-statistiques") return privacyPage();
        if (path.startsWith("/admin")) return handleAdmin(request, env, url, path);
        return notFound();
    },
    async scheduled (_event, env) {
        await purgeExpiredEvents(env);
    }
};
async function handlePartnerRedirect(request, env, ctx, path) {
    if (request.method !== "GET" && request.method !== "HEAD") return text("Méthode non autorisée.", 405);
    const slug = path.slice("/partenaire/".length);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return notFound();
    const partner = await env.DB.prepare("SELECT id, name, slug, destination_url, active, created_at, updated_at FROM partners WHERE slug = ? LIMIT 1").bind(slug).first();
    if (!partner || !partner.active || !isAllowedDestination(partner.destination_url, env)) return notFound();
    if (request.method === "GET" && isHumanNavigation(request)) {
        ctx.waitUntil(env.DB.prepare("INSERT INTO click_events (partner_id, occurred_at) VALUES (?, datetime('now'))").bind(partner.id).run());
    }
    return new Response(null, {
        status: 302,
        headers: withSecurityHeaders({
            Location: partner.destination_url,
            "Cache-Control": "no-store, private",
            "X-Robots-Tag": "noindex, nofollow, noarchive"
        })
    });
}
function isHumanNavigation(request) {
    const headers = request.headers;
    const purpose = `${headers.get("Purpose") || ""} ${headers.get("Sec-Purpose") || ""} ${headers.get("X-Purpose") || ""}`;
    if (/prefetch|preview|prerender/i.test(purpose)) return false;
    if (BOT_PATTERN.test(headers.get("User-Agent") || "")) return false;
    const destination = headers.get("Sec-Fetch-Dest");
    return !destination || destination === "document";
}
async function handleAdmin(request, env, url, path) {
    if (!await isAuthenticated(request, env)) return unauthorized();
    if (request.method === "POST") {
        if (!sameOriginMutation(request, url.origin)) return text("Requête refusée.", 403);
        return handleAdminMutation(request, env, url, path);
    }
    if (request.method !== "GET") return text("Méthode non autorisée.", 405);
    if (path === "/admin" || path === "/admin/statistiques") return dashboard(request, env, url);
    return notFound();
}
async function handleAdminMutation(request, env, url, path) {
    const form = await request.formData();
    let message = "";
    let status = "ok";
    try {
        if (path === "/admin/partenaires" && form.get("action") === "add") {
            const name = compact(form.get("name"));
            const destination = compact(form.get("destination_url"));
            if (!name) throw new Error("Le nom du partenaire est obligatoire.");
            if (!isAllowedDestination(destination, env)) throw new Error("La destination doit être une URL HTTPS Google Drive autorisée.");
            const slug = await uniqueSlug(env, slugify(compact(form.get("slug")) || name));
            await env.DB.prepare("INSERT INTO partners (name, slug, destination_url, active, created_at, updated_at) VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))").bind(name, slug, destination).run();
            message = `Partenaire ajouté : ${name}.`;
        } else if (/^\/admin\/partenaires\/\d+$/.test(path)) {
            const id = Number(path.split("/").pop());
            const action = compact(form.get("action"));
            if (!Number.isInteger(id)) throw new Error("Partenaire introuvable.");
            if (action === "update") {
                const name = compact(form.get("name"));
                const destination = compact(form.get("destination_url"));
                if (!name) throw new Error("Le nom du partenaire est obligatoire.");
                if (!isAllowedDestination(destination, env)) throw new Error("La destination doit être une URL HTTPS Google Drive autorisée.");
                await env.DB.prepare("UPDATE partners SET name = ?, destination_url = ?, updated_at = datetime('now') WHERE id = ?").bind(name, destination, id).run();
                message = "Partenaire mis à jour.";
            } else if (action === "toggle") {
                await env.DB.prepare("UPDATE partners SET active = CASE active WHEN 1 THEN 0 ELSE 1 END, updated_at = datetime('now') WHERE id = ?").bind(id).run();
                message = "État du lien mis à jour.";
            } else {
                throw new Error("Action inconnue.");
            }
        } else if (path === "/admin/nettoyage" && form.get("action") === "purge") {
            const days = boundedDays(compact(form.get("days")), 365);
            const result = await env.DB.prepare("DELETE FROM click_events WHERE occurred_at < datetime('now', ?)").bind(`-${days} days`).run();
            message = `${result.meta.changes || 0} statistique(s) supprimée(s).`;
        } else {
            throw new Error("Action inconnue.");
        }
    } catch (error) {
        status = "error";
        message = error instanceof Error ? error.message : "Une erreur est survenue.";
    }
    const destination = new URL("/admin/statistiques", url.origin);
    destination.searchParams.set(status, message);
    return Response.redirect(destination.toString(), 303);
}
async function dashboard(request, env, url) {
    const selectedPartner = slugify(url.searchParams.get("partenaire") || "");
    const days = boundedDays(url.searchParams.get("periode"), 30);
    const partnerClause = selectedPartner ? " AND p.slug = ?" : "";
    const eventPartnerClause = selectedPartner ? " AND p.slug = ?" : "";
    const dateModifier = `-${days} days`;
    const partnerParams = [
        dateModifier
    ];
    if (selectedPartner) partnerParams.push(selectedPartner);
    const partnersResult = await env.DB.prepare(`SELECT p.id, p.name, p.slug, p.destination_url, p.active, p.created_at, p.updated_at,
       COUNT(c.id) AS clicks, MAX(c.occurred_at) AS last_click
     FROM partners p
     LEFT JOIN click_events c ON c.partner_id = p.id AND c.occurred_at >= datetime('now', ?)
     WHERE 1=1${partnerClause}
     GROUP BY p.id ORDER BY clicks DESC, p.name COLLATE NOCASE ASC`).bind(...partnerParams).all();
    const partners = partnersResult.results || [];
    const eventParams = [
        dateModifier
    ];
    if (selectedPartner) eventParams.push(selectedPartner);
    const totals = await env.DB.prepare(`SELECT COUNT(*) AS total FROM click_events c JOIN partners p ON p.id = c.partner_id
     WHERE c.occurred_at >= datetime('now', ?)${eventPartnerClause}`).bind(...eventParams).first();
    const history = await env.DB.prepare(`SELECT c.occurred_at, p.name, p.slug FROM click_events c JOIN partners p ON p.id = c.partner_id
     WHERE c.occurred_at >= datetime('now', ?)${eventPartnerClause}
     ORDER BY c.occurred_at DESC LIMIT 100`).bind(...eventParams).all();
    const chart7 = await chartData(env, 7, selectedPartner);
    const chart30 = await chartData(env, 30, selectedPartner);
    const flash = url.searchParams.get("ok") || url.searchParams.get("error");
    const flashType = url.searchParams.has("error") ? "error" : "success";
    const origin = url.origin;
    return html(`<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive"><title>Statistiques partenaires — ANIMA</title>
<style>${adminStyles()}</style></head><body>
<main class="wrap"><header><p class="eyebrow">ANIMA · ACCÈS PRIVÉ</p><h1>Statistiques partenaires</h1><p class="lede">Suivi minimal des consultations des dossiers professionnels. Période affichée : ${days} jours.</p></header>
${flash ? `<p class="flash ${flashType}" role="status">${escapeHtml(flash)}</p>` : ""}
<section class="panel filters"><form method="get" action="/admin/statistiques"><label>Partenaire<select name="partenaire"><option value="">Tous les partenaires</option>${partners.map((p)=>`<option value="${escapeHtml(p.slug)}"${p.slug === selectedPartner ? " selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}</select></label><label>Période<select name="periode">${[
        7,
        30,
        90,
        365
    ].map((value)=>`<option value="${value}"${value === days ? " selected" : ""}>${value} jours</option>`).join("")}</select></label><button type="submit">Filtrer</button></form></section>
<section class="metrics"><article><span>Total des clics</span><strong>${Number(totals?.total || 0)}</strong><small>sur la période</small></article><article><span>Partenaires actifs</span><strong>${partners.filter((p)=>p.active).length}</strong><small>dans ce filtre</small></article><article><span>Dernière consultation</span><strong class="date">${formatDate(history.results?.[0]?.occurred_at)}</strong><small>horodatage local</small></article></section>
<section class="charts"><article class="panel"><h2>7 derniers jours</h2>${chart(chart7)}</article><article class="panel"><h2>30 derniers jours</h2>${chart(chart30)}</article></section>
<section class="panel"><div class="section-title"><div><p class="eyebrow">LIENS INDIVIDUELS</p><h2>Partenaires</h2></div><a href="/confidentialite-statistiques" target="_blank" rel="noopener">Notice de confidentialité</a></div>
<div class="partners">${partners.length ? partners.map((p)=>partnerCard(p, origin)).join("") : `<p class="empty">Aucun partenaire ne correspond à ce filtre.</p>`}</div></section>
<section class="panel add"><p class="eyebrow">NOUVEAU LIEN</p><h2>Ajouter un partenaire</h2><form method="post" action="/admin/partenaires"><input type="hidden" name="action" value="add"><label>Entreprise<input name="name" required maxlength="120" autocomplete="organization"></label><label>Identifiant de lien <small>optionnel, généré depuis le nom si vide</small><input name="slug" maxlength="80" pattern="[a-zA-Z0-9À-ÿ -]+"></label><label class="wide">Dossier Google Drive public<input type="url" name="destination_url" required placeholder="https://drive.google.com/drive/folders/…" inputmode="url"></label><button type="submit">Créer le lien partenaire</button></form></section>
<section class="panel"><p class="eyebrow">HISTORIQUE</p><h2>100 dernières consultations</h2><div class="table-wrap"><table><thead><tr><th>Date et heure</th><th>Partenaire</th></tr></thead><tbody>${(history.results || []).length ? (history.results || []).map((event)=>`<tr><td>${formatDate(event.occurred_at)}</td><td>${escapeHtml(event.name)}</td></tr>`).join("") : `<tr><td colspan="2">Aucune consultation pour cette période.</td></tr>`}</tbody></table></div></section>
<section class="panel retention"><p class="eyebrow">CONSERVATION LIMITÉE</p><h2>Supprimer les statistiques anciennes</h2><p>Les clics ne contiennent ni adresse IP, ni cookie, ni empreinte, ni URL de provenance. Cette action est irréversible.</p><form method="post" action="/admin/nettoyage"><input type="hidden" name="action" value="purge"><label>Supprimer les données âgées de plus de <select name="days"><option value="90">90 jours</option><option value="180">180 jours</option><option value="365" selected>365 jours</option></select></label><button class="danger" type="submit">Supprimer les statistiques</button></form></section>
</main><script>document.querySelectorAll('[data-copy]').forEach((button)=>button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(button.dataset.copy);button.textContent='Lien copié';setTimeout(()=>button.textContent='Copier le lien',1400)}catch{prompt('Copiez ce lien :',button.dataset.copy)}}));</script></body></html>`);
}
function partnerCard(partner, origin) {
    const link = `${origin}/partenaire/${partner.slug}`;
    return `<article class="partner-card ${partner.active ? "" : "disabled"}"><div class="partner-heading"><div><h3>${escapeHtml(partner.name)}</h3><p><a href="${escapeHtml(link)}" target="_blank" rel="noreferrer">${escapeHtml(link)}</a></p></div><span class="badge">${partner.active ? "Actif" : "Désactivé"}</span></div><dl><div><dt>Clics</dt><dd>${Number(partner.clicks || 0)}</dd></div><div><dt>Dernière consultation</dt><dd>${formatDate(partner.last_click)}</dd></div></dl><div class="actions"><button type="button" data-copy="${escapeHtml(link)}">Copier le lien</button><details><summary>Modifier</summary><form method="post" action="/admin/partenaires/${partner.id}"><input type="hidden" name="action" value="update"><label>Entreprise<input name="name" value="${escapeHtml(partner.name)}" required maxlength="120"></label><label>Destination Google Drive<input name="destination_url" type="url" value="${escapeHtml(partner.destination_url)}" required></label><button type="submit">Enregistrer</button></form></details><form method="post" action="/admin/partenaires/${partner.id}"><input type="hidden" name="action" value="toggle"><button class="secondary" type="submit">${partner.active ? "Désactiver le lien" : "Réactiver le lien"}</button></form></div></article>`;
}
async function chartData(env, days, slug) {
    const clause = slug ? " AND p.slug = ?" : "";
    const params = [
        `-${days - 1} days`
    ];
    if (slug) params.push(slug);
    const result = await env.DB.prepare(`SELECT date(c.occurred_at) AS day, COUNT(*) AS total FROM click_events c JOIN partners p ON p.id = c.partner_id
     WHERE c.occurred_at >= datetime('now', ?)${clause} GROUP BY date(c.occurred_at) ORDER BY day ASC`).bind(...params).all();
    const index = new Map((result.results || []).map((row)=>[
            row.day,
            Number(row.total)
        ]));
    const points = [];
    for(let offset = days - 1; offset >= 0; offset -= 1){
        const date = new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);
        points.push({
            day: date,
            total: index.get(date) || 0
        });
    }
    return points;
}
function chart(points) {
    const highest = Math.max(1, ...points.map((point)=>point.total));
    const stride = points.length > 10 ? 5 : 1;
    return `<div class="chart" aria-label="Graphique des consultations">${points.map((point, index)=>`<div class="bar-wrap" title="${point.day} : ${point.total} consultation(s)"><span class="bar" style="height:${Math.max(point.total ? 8 : 2, Math.round(point.total / highest * 100))}%"></span>${index % stride === 0 || index === points.length - 1 ? `<small>${point.day.slice(5)}</small>` : ""}</div>`).join("")}</div>`;
}
async function isAuthenticated(request, env) {
    if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD && !env.ADMIN_PASSWORD_HASH) return false;
    const header = request.headers.get("Authorization") || "";
    if (!header.startsWith("Basic ")) return false;
    try {
        const decoded = atob(header.slice(6));
        const separator = decoded.indexOf(":");
        if (separator < 0) return false;
        const username = decoded.slice(0, separator);
        const password = decoded.slice(separator + 1);
        const passwordMatches = env.ADMIN_PASSWORD ? safeEqual(password, env.ADMIN_PASSWORD) : safeEqual(await sha256(password), env.ADMIN_PASSWORD_HASH.toLowerCase());
        return safeEqual(username, env.ADMIN_USERNAME) && passwordMatches;
    } catch  {
        return false;
    }
}
function sameOriginMutation(request, origin) {
    const requestOrigin = request.headers.get("Origin");
    return requestOrigin === origin;
}
async function sha256(value) {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(hash), (byte)=>byte.toString(16).padStart(2, "0")).join("");
}
function safeEqual(left, right) {
    if (left.length !== right.length) return false;
    let difference = 0;
    for(let index = 0; index < left.length; index += 1)difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    return difference === 0;
}
function isAllowedDestination(value, env) {
    try {
        const destination = new URL(value);
        const allowed = (env.ALLOWED_DESTINATION_HOSTS || DEFAULT_ALLOWED_HOSTS.join(",")).split(",").map((host)=>host.trim().toLowerCase());
        return destination.protocol === "https:" && allowed.includes(destination.hostname.toLowerCase());
    } catch  {
        return false;
    }
}
async function uniqueSlug(env, value) {
    const base = slugify(value);
    if (!base) throw new Error("Impossible de générer un identifiant de lien.");
    for(let suffix = 1; suffix <= 99; suffix += 1){
        const candidate = suffix === 1 ? base : `${base}-${suffix}`;
        const row = await env.DB.prepare("SELECT id FROM partners WHERE slug = ? LIMIT 1").bind(candidate).first();
        if (!row) return candidate;
    }
    throw new Error("Trop de liens similaires existent déjà.");
}
async function purgeExpiredEvents(env) {
    const days = boundedDays(env.DATA_RETENTION_DAYS, 365);
    await env.DB.prepare("DELETE FROM click_events WHERE occurred_at < datetime('now', ?)").bind(`-${days} days`).run();
}
function boundedDays(value, fallback) {
    const parsed = Number.parseInt(value || "", 10);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 3650 ? parsed : fallback;
}
function compact(value) {
    return typeof value === "string" ? value.trim() : "";
}
function slugify(value) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
}
function formatDate(value) {
    if (!value) return "Aucune";
    const date = new Date(`${value.replace(" ", "T")}Z`);
    return Number.isNaN(date.getTime()) ? "Aucune" : new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(date);
}
function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character)=>({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "'": "&#39;",
            '"': "&quot;"
        })[character] || character);
}
function withSecurityHeaders(headers = {}) {
    const result = new Headers(headers);
    for (const [name, value] of Object.entries(SECURITY_HEADERS))result.set(name, value);
    return result;
}
function html(content, status = 200) {
    return new Response(content, {
        status,
        headers: withSecurityHeaders({
            "Content-Type": "text/html; charset=UTF-8",
            "Cache-Control": "no-store, private",
            "X-Robots-Tag": "noindex, nofollow, noarchive"
        })
    });
}
function text(content, status) {
    return new Response(content, {
        status,
        headers: withSecurityHeaders({
            "Content-Type": "text/plain; charset=UTF-8",
            "Cache-Control": "no-store",
            "X-Robots-Tag": "noindex, nofollow"
        })
    });
}
function notFound() {
    return text("Lien introuvable ou désactivé.", 404);
}
function unauthorized() {
    return new Response("Authentification requise.", {
        status: 401,
        headers: withSecurityHeaders({
            "WWW-Authenticate": 'Basic realm="ANIMA Administration", charset="UTF-8"',
            "Cache-Control": "no-store",
            "X-Robots-Tag": "noindex, nofollow"
        })
    });
}
function privacyPage() {
    return html(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confidentialité — liens partenaires ANIMA</title><style>${adminStyles()}</style></head><body><main class="wrap notice"><p class="eyebrow">ANIMA · TRANSPARENCE</p><h1>Statistiques de consultation des liens partenaires</h1><p>Les liens professionnels ANIMA servent uniquement à mesurer la consultation de dossiers commerciaux partagés avec un partenaire identifié par son lien unique.</p><h2>Données enregistrées</h2><p>Le partenaire associé au lien et la date et l’heure de consultation. Aucune adresse IP, cookie, donnée de géolocalisation, URL de provenance ou empreinte du terminal n’est enregistrée.</p><h2>Finalité et durée</h2><p>Ces statistiques permettent à ANIMA d’évaluer l’intérêt professionnel pour ses dossiers. Elles sont conservées au maximum 365 jours puis supprimées automatiquement.</p><h2>Accès</h2><p>Les statistiques ne sont accessibles qu’à l’administration ANIMA et ne sont jamais publiées.</p></main></body></html>`);
}
function adminStyles() {
    return `:root{color-scheme:dark;--bg:#090b0e;--panel:#11161b;--line:#29323a;--ink:#f0ece3;--muted:#aeb8bd;--gold:#c8ab77;--danger:#c56d64}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top right,#1c2730,transparent 36rem),var(--bg);color:var(--ink);font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}.wrap{max-width:1180px;margin:auto;padding:44px 22px 80px}header{padding:8px 0 24px}h1,h2,h3{font-family:Georgia,'Times New Roman',serif;line-height:1.05;margin:0 0 12px}h1{font-size:clamp(2.2rem,5vw,4.2rem);font-weight:500}h2{font-size:1.65rem;font-weight:500}.eyebrow{margin:0 0 8px;color:var(--gold);font-size:.72rem;font-weight:700;letter-spacing:.13em}.lede,.notice>p{max-width:680px;color:var(--muted);font-size:1.05rem}.panel{background:rgba(17,22,27,.94);border:1px solid var(--line);border-radius:16px;padding:22px;margin:18px 0}.filters form,.add form,.retention form,.partner-card form{display:flex;flex-wrap:wrap;gap:12px;align-items:end}label{display:grid;gap:5px;color:var(--muted);font-size:.86rem;flex:1;min-width:180px}label.wide{flex-basis:360px}input,select{width:100%;border:1px solid #42505b;border-radius:8px;background:#0b1014;color:var(--ink);padding:10px 11px;font:inherit}button{border:0;border-radius:8px;padding:10px 14px;background:var(--gold);color:#15120e;font:700 .86rem Inter,system-ui,sans-serif;cursor:pointer}.secondary{background:#263039;color:var(--ink)}.danger{background:var(--danger);color:#210b08}.metrics,.charts{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:18px 0}.charts{grid-template-columns:repeat(2,1fr)}.metrics article{background:#0e1318;border:1px solid var(--line);border-radius:14px;padding:20px}.metrics span,.metrics small{display:block;color:var(--muted)}.metrics strong{display:block;font:500 2.6rem Georgia,serif;color:var(--gold);margin:7px 0}.metrics strong.date{font-size:1.1rem;color:var(--ink);line-height:1.3}.chart{height:190px;display:flex;align-items:end;gap:3px;border-bottom:1px solid var(--line);padding-top:20px}.bar-wrap{height:100%;flex:1;min-width:0;display:flex;align-items:center;justify-content:end;flex-direction:column}.bar{width:100%;background:linear-gradient(#d7c094,var(--gold));border-radius:3px 3px 0 0;min-height:2px}.bar-wrap small{display:block;color:var(--muted);font-size:.62rem;white-space:nowrap;margin-top:6px}.section-title,.partner-heading{display:flex;justify-content:space-between;gap:16px;align-items:start}.section-title a,a{color:#dfc996}.partners{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.partner-card{border:1px solid var(--line);border-radius:12px;padding:16px;background:#0c1115}.partner-card.disabled{opacity:.65}.partner-card h3{font-size:1.35rem}.partner-card p{margin:0;color:var(--muted);overflow-wrap:anywhere}.badge{font-size:.72rem;padding:3px 8px;border:1px solid var(--line);border-radius:20px;color:var(--gold)}dl{display:flex;gap:30px;margin:16px 0}dt{font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}dd{margin:2px 0 0;font-weight:700}.actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.actions>form{display:inline-flex}.actions details{flex:1}.actions summary{cursor:pointer;color:var(--gold);font-size:.88rem}.actions details form{margin-top:10px}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid var(--line);text-align:left}th{font-size:.72rem;text-transform:uppercase;color:var(--muted)}.flash{border-radius:10px;padding:12px 15px;background:#25372b;border:1px solid #456a51}.flash.error{background:#482421;border-color:#7d403a}.retention p{color:var(--muted)}.notice{max-width:760px}.notice h2{margin-top:32px}.empty{color:var(--muted)}@media(max-width:760px){.wrap{padding:28px 14px 56px}.metrics,.charts,.partners{grid-template-columns:1fr}.panel{padding:16px}.section-title,.partner-heading{display:block}.badge{display:inline-block;margin-top:8px}.chart{height:155px}button{width:100%}.actions button,.actions form,.actions form button{width:auto}}`;
}


//# sourceURL=index.ts