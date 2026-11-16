const { Plugin, Menu, Dialog, showMessage, fetchPost } = require("siyuan");

const TABLE_ATTR = "custom-child-ref-table";
const REF_RE = /\(\(\s*(\d{14}-[0-9a-z]{7})/;
const ANCHOR_RE = /\(\(\s*\d{14}-[0-9a-z]{7}\s+["'](.*?)["']\s*\)\)/;
const STYLE_ID = "parent-child-ref-style";

const api = (url, data) =>
    new Promise((resolve, reject) => {
        fetchPost(url, data, (res) => {
            if (res.code === 0) {
                resolve(res.data);
            } else {
                reject(new Error(res.msg || url));
            }
        });
    });

const sql = (stmt) => api("/api/query/sql", { stmt });

const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const unescapeEntities = (s) =>
    s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

const refMarkdown = (child) => {
    const title = child.title.replace(/\|/g, "\\|").replace(/"/g, "&quot;");
    return `| ((${child.id} "${title}")) |`;
};

// 把表格的 kramdown 拆成：表格前的行、表头、分隔行、数据行、其余行（IAL 等）
const parseTable = (kramdown) => {
    const lines = kramdown.split("\n");
    const isRow = (l) => l.trim().startsWith("|");
    const first = lines.findIndex(isRow);
    const rows = [];
    let end = first;
    while (end < lines.length && isRow(lines[end])) {
        rows.push(lines[end]);
        end++;
    }
    return {
        before: lines.slice(0, first),
        header: rows[0],
        separator: rows[1],
        rows: rows.slice(2),
        after: lines.slice(end),
    };
};

const buildTable = (t, rows) =>
    [...t.before, t.header, t.separator, ...rows, ...t.after].join("\n");

const CSS = `
.pcr { display: flex; flex-direction: column; gap: 14px; padding: 16px 20px 18px; min-height: 340px; max-height: 72vh; box-sizing: border-box; color: var(--b3-theme-on-background); }
.pcr__actions { display: flex; gap: 10px; flex-wrap: wrap; }
.pcr__actions .b3-button { flex: 1; min-width: 150px; justify-content: center; }
.pcr__banner { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 8px; font-size: 13px; line-height: 1.5; background: var(--b3-theme-primary-lightest, rgba(66,133,244,.1)); border: 1px solid var(--b3-theme-primary-lighter, rgba(66,133,244,.35)); }
.pcr__banner--ok { background: rgba(46,160,67,.1); border-color: rgba(46,160,67,.4); }
.pcr__banner span { flex: 1; }
.pcr__progress { padding: 12px 14px; border-radius: 8px; background: var(--b3-theme-surface); border: 1px solid var(--b3-border-color); }
.pcr__progress-head { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; margin-bottom: 8px; gap: 12px; }
.pcr__progress-head b { font-size: 15px; }
.pcr__bar { height: 8px; border-radius: 4px; overflow: hidden; background: var(--b3-theme-surface-lighter, rgba(128,128,128,.2)); }
.pcr__bar > i { display: block; height: 100%; width: 0; border-radius: 4px; background: linear-gradient(90deg, var(--b3-theme-primary), var(--b3-theme-primary-light, var(--b3-theme-primary))); transition: width .15s ease-out; }
.pcr__current { margin-top: 8px; font-size: 12px; color: var(--b3-theme-on-surface); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pcr__stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px; }
.pcr__stat { padding: 10px 12px; border-radius: 8px; background: var(--b3-theme-surface); border: 1px solid var(--b3-border-color); }
.pcr__stat-num { font-size: 22px; font-weight: 600; line-height: 1.2; }
.pcr__stat-label { margin-top: 2px; font-size: 12px; color: var(--b3-theme-on-surface); }
.pcr__stat--bad .pcr__stat-num { color: var(--b3-theme-error); }
.pcr__stat--warn .pcr__stat-num { color: #d68a00; }
.pcr__stat--good .pcr__stat-num { color: #2ea043; }
.pcr__list { flex: 1; min-height: 120px; overflow: auto; display: flex; flex-direction: column; gap: 8px; }
.pcr__empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 28px 12px; text-align: center; color: var(--b3-theme-on-surface); font-size: 13px; }
.pcr__empty-icon { font-size: 34px; line-height: 1; }
.pcr__card { padding: 10px 12px; border-radius: 8px; border: 1px solid var(--b3-border-color); background: var(--b3-theme-background); }
.pcr__card-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pcr__path { flex: 1; min-width: 0; font-weight: 600; font-size: 13px; word-break: break-all; }
.pcr__badge { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; white-space: nowrap; }
.pcr__badge--bad { color: var(--b3-theme-error); background: rgba(215,58,73,.12); }
.pcr__badge--warn { color: #b87500; background: rgba(214,138,0,.14); }
.pcr__badge--good { color: #2ea043; background: rgba(46,160,67,.14); }
.pcr__items { margin: 8px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.pcr__items li { display: flex; gap: 8px; align-items: baseline; color: var(--b3-theme-on-surface); }
.pcr__items li > b { font-weight: normal; color: var(--b3-theme-on-background); }
.pcr__items code { font-size: 11px; opacity: .75; }
.pcr__foot { display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
`;

class Panel {
    constructor(plugin) {
        this.p = plugin;
        this.i18n = plugin.i18n;
        this.t = (k, v) => plugin.t(k, v);
        this.s = {
            phase: "idle", // idle | confirm | running | done
            kind: null, // ref | check | clear
            done: 0,
            total: 0,
            current: "",
            items: [],
            stats: {},
            notice: "",
            confirm: null,
            cancelled: false,
        };
        this.dialog = new Dialog({
            title: this.i18n.pluginName,
            width: plugin.isMobile() ? "94vw" : "720px",
            content: '<div class="pcr"></div>',
            destroyCallback: () => {
                this.s.cancelled = true;
                this.destroyed = true;
            },
        });
        this.root = this.dialog.element.querySelector(".pcr");
        this.root.addEventListener("click", (e) => this.onClick(e));
        this.render();
    }

    destroy() {
        this.dialog.destroy();
    }

    // ---- 交互 ----

    onClick(e) {
        const btn = e.target.closest("[data-act]");
        if (!btn || btn.disabled) return;
        const act = btn.getAttribute("data-act");
        if (act === "ref") this.askRef();
        else if (act === "check") this.runCheck();
        else if (act === "cancel") this.s.cancelled = true;
        else if (act === "dismiss") this.setState({ phase: this.s.items.length || this.s.kind ? "done" : "idle", confirm: null });
        else if (act === "ok") this.s.confirm?.onOk();
        else if (act === "clear") this.askClear();
        else if (act === "fill") this.askFill();
    }

    setState(patch) {
        if (this.destroyed) return;
        Object.assign(this.s, patch);
        this.render();
    }

    ask(text, onOk) {
        this.setState({ phase: "confirm", confirm: { text, onOk } });
    }

    async askRef() {
        try {
            const parents = await this.p.listParentDocIds();
            if (!parents.length) return this.setState({ notice: this.i18n.noChildren });
            this.ask(this.t("confirmRef", { count: parents.length }), () => this.runRef(parents));
        } catch (e) {
            showMessage(e.message, 6000, "error");
        }
    }

    askClear() {
        const n = this.s.stats.invalid;
        this.ask(this.t("confirmClear", { count: n }), () => this.runClear());
    }

    askFill() {
        const docs = this.s.items.filter((r) => r.missing?.length).map((r) => ({ id: r.docId, hpath: r.hpath }));
        this.ask(this.t("confirmFill", { count: docs.length }), () => this.runRef(docs));
    }

    // ---- 任务 ----

    begin(kind, total) {
        this.setState({
            phase: "running",
            kind,
            done: 0,
            total,
            current: "",
            items: [],
            stats: {},
            notice: "",
            noticeOk: false,
            confirm: null,
            cancelled: false,
        });
    }

    async step(label) {
        this.s.current = label;
        this.render();
    }

    async runRef(docs) {
        this.begin("ref", docs.length);
        const stats = { docs: docs.length, changed: 0, created: 0, rows: 0, removed: 0, errors: 0 };
        const items = [];
        for (const d of docs) {
            if (this.s.cancelled) break;
            await this.step(d.hpath);
            try {
                const r = await this.p.syncRefs(d.id);
                if (r.count || r.removed) {
                    stats.changed++;
                    stats.rows += r.count;
                    stats.removed += r.removed;
                    if (r.created) stats.created++;
                    items.push({ docId: d.id, hpath: d.hpath, created: r.created, count: r.count, removed: r.removed });
                }
            } catch (e) {
                stats.errors++;
                items.push({ docId: d.id, hpath: d.hpath, error: e.message });
            }
            this.s.done++;
            this.s.items = items;
            this.s.stats = stats;
        }
        this.setState({ phase: "done", items, stats, current: "" });
    }

    async runCheck(notice = "") {
        try {
            const tables = await this.p.listRefTables();
            if (!tables.length) return this.setState({ phase: "idle", kind: "check", items: [], stats: {}, notice: this.i18n.noTable });

            const rootIds = [...new Set(tables.map((r) => r.root_id))];
            const idList = rootIds.map((i) => `'${i}'`).join(",");
            const docs = await sql(`SELECT id, content, hpath FROM blocks WHERE type = 'd' AND id IN (${idList}) LIMIT 100000`);
            const info = new Map(docs.map((d) => [d.id, d]));
            const todo = tables.filter((t) => info.has(t.root_id));

            this.begin("check", todo.length);
            this.s.notice = notice;
            this.s.noticeOk = !!notice;
            const stats = { docs: todo.length, refs: 0, invalid: 0, missing: 0, missingDocs: 0, errors: 0 };
            const items = [];
            for (const { block_id, root_id } of todo) {
                if (this.s.cancelled) break;
                const d = info.get(root_id);
                await this.step(d.hpath || d.content);
                try {
                    const r = await this.p.analyzeDoc(root_id, block_id);
                    r.hpath = d.hpath || d.content;
                    stats.refs += r.refs.length;
                    stats.invalid += r.invalid.length;
                    stats.missing += r.missing.length;
                    if (r.missing.length) stats.missingDocs++;
                    if (r.invalid.length || r.missing.length) items.push(r);
                } catch (e) {
                    stats.errors++;
                    items.push({ docId: root_id, hpath: d.hpath || d.content, error: e.message, invalid: [], missing: [] });
                }
                this.s.done++;
                this.s.items = items;
                this.s.stats = stats;
            }
            this.setState({ phase: "done", items, stats, current: "" });
        } catch (e) {
            showMessage(e.message, 6000, "error");
            this.setState({ phase: "idle" });
        }
    }

    async runClear() {
        const targets = this.s.items.filter((r) => r.invalid?.length);
        const cleared = targets.reduce((n, r) => n + r.invalid.length, 0);
        this.begin("clear", targets.length);
        let errors = 0;
        for (const r of targets) {
            if (this.s.cancelled) break;
            await this.step(r.hpath);
            try {
                const drop = new Set(r.invalid.map((x) => x.index));
                await this.p.writeTable(r.tableId, r.t, r.t.rows.filter((_, i) => !drop.has(i)));
            } catch (e) {
                errors++;
            }
            this.s.done++;
        }
        // 清除后重新检查，确保结果与文档一致
        await this.runCheck(this.t("cleared", { count: cleared }) + (errors ? this.t("clearedErrors", { count: errors }) : ""));
    }

    // ---- 渲染 ----

    render() {
        if (this.destroyed || !this.root) return;
        const { phase, kind } = this.s;
        const busy = phase === "running" || phase === "confirm";
        const parts = [
            `<div class="pcr__actions">
                <button class="b3-button b3-button--outline" data-act="ref" ${busy ? "disabled" : ""}>🔗 ${escapeHtml(this.i18n.btnRef)}</button>
                <button class="b3-button b3-button--outline" data-act="check" ${busy ? "disabled" : ""}>🔍 ${escapeHtml(this.i18n.btnCheck)}</button>
            </div>`,
        ];
        if (phase === "confirm") parts.push(this.renderConfirm());
        if (this.s.notice) parts.push(`<div class="pcr__banner ${this.s.noticeOk ? "pcr__banner--ok" : ""}"><span>${escapeHtml(this.s.notice)}</span></div>`);
        if (phase === "running") parts.push(this.renderProgress());
        if (kind === "ref" || kind === "check") parts.push(this.renderStats());
        parts.push(this.renderList());
        const foot = this.renderFoot();
        if (foot) parts.push(foot);
        this.root.innerHTML = parts.join("");
    }

    renderConfirm() {
        return `<div class="pcr__banner">
            <span>${escapeHtml(this.s.confirm.text)}</span>
            <button class="b3-button b3-button--cancel" data-act="dismiss">${escapeHtml(this.i18n.cancel)}</button>
            <button class="b3-button b3-button--text" data-act="ok">${escapeHtml(this.i18n.confirm)}</button>
        </div>`;
    }

    renderProgress() {
        const { done, total, current, kind, cancelled } = this.s;
        const pct = total ? Math.round((done / total) * 100) : 0;
        const label = { ref: "progressRef", check: "progressCheck", clear: "progressClear" }[kind];
        return `<div class="pcr__progress">
            <div class="pcr__progress-head">
                <span><b>${escapeHtml(this.i18n[label])}</b> &nbsp;${done} / ${total}</span>
                <span>${pct}%</span>
            </div>
            <div class="pcr__bar"><i style="width:${pct}%"></i></div>
            <div class="pcr__current">${escapeHtml(current || "…")}</div>
        </div>
        <div class="pcr__foot"><button class="b3-button b3-button--cancel" data-act="cancel" ${cancelled ? "disabled" : ""}>${escapeHtml(this.i18n.cancel)}</button></div>`;
    }

    stat(num, label, cls = "") {
        return `<div class="pcr__stat ${cls}"><div class="pcr__stat-num">${num}</div><div class="pcr__stat-label">${escapeHtml(label)}</div></div>`;
    }

    renderStats() {
        const st = this.s.stats;
        if (!Object.keys(st).length) return "";
        let cards;
        if (this.s.kind === "ref") {
            cards = [
                this.stat(st.docs, this.i18n.statDocsScanned),
                this.stat(st.changed, this.i18n.statDocsChanged, st.changed ? "pcr__stat--good" : ""),
                this.stat(st.rows, this.i18n.statRowsAdded, st.rows ? "pcr__stat--good" : ""),
                this.stat(st.removed, this.i18n.statRowsRemoved, st.removed ? "pcr__stat--warn" : ""),
            ];
            if (st.errors) cards.push(this.stat(st.errors, this.i18n.statErrors, "pcr__stat--bad"));
        } else {
            cards = [
                this.stat(st.docs, this.i18n.statDocsChecked),
                this.stat(st.refs, this.i18n.statRefs),
                this.stat(st.invalid, this.i18n.statInvalid, st.invalid ? "pcr__stat--bad" : "pcr__stat--good"),
                this.stat(st.missing, this.i18n.statMissing, st.missing ? "pcr__stat--warn" : ""),
            ];
            if (st.errors) cards.push(this.stat(st.errors, this.i18n.statErrors, "pcr__stat--bad"));
        }
        return `<div class="pcr__stats">${cards.join("")}</div>`;
    }

    renderList() {
        const { phase, kind, items } = this.s;
        if (phase === "idle" && !items.length) {
            return `<div class="pcr__empty"><div class="pcr__empty-icon">🗂️</div><div>${escapeHtml(this.i18n.hint)}</div></div>`;
        }
        if (!items.length) {
            if (phase !== "done") return `<div class="pcr__list"></div>`;
            const icon = kind === "check" ? "✅" : "👍";
            const text = kind === "check" ? this.i18n.allValid : this.i18n.allUpToDate;
            return `<div class="pcr__empty"><div class="pcr__empty-icon">${icon}</div><div>${escapeHtml(text)}</div></div>`;
        }
        const cards = items.map((r) => (kind === "ref" ? this.refCard(r) : this.checkCard(r)));
        return `<div class="pcr__list">${cards.join("")}</div>`;
    }

    refCard(r) {
        if (r.error) {
            return this.card(r.hpath, [`<span class="pcr__badge pcr__badge--bad">${escapeHtml(this.i18n.failed)}</span>`], [escapeHtml(r.error)]);
        }
        const badges = [];
        if (r.created) badges.push(`<span class="pcr__badge pcr__badge--good">${escapeHtml(this.i18n.tableCreated)}</span>`);
        if (r.count) badges.push(`<span class="pcr__badge pcr__badge--good">${escapeHtml(this.t("rowsAdded", { count: r.count }))}</span>`);
        if (r.removed) badges.push(`<span class="pcr__badge pcr__badge--warn">${escapeHtml(this.t("rowsRemoved", { count: r.removed }))}</span>`);
        return this.card(r.hpath, badges, []);
    }

    checkCard(r) {
        if (r.error) {
            return this.card(r.hpath, [`<span class="pcr__badge pcr__badge--bad">${escapeHtml(this.i18n.failed)}</span>`], [escapeHtml(r.error)]);
        }
        const badges = [];
        if (r.invalid.length) badges.push(`<span class="pcr__badge pcr__badge--bad">${escapeHtml(this.t("badgeInvalid", { count: r.invalid.length }))}</span>`);
        if (r.missing.length) badges.push(`<span class="pcr__badge pcr__badge--warn">${escapeHtml(this.t("badgeMissing", { count: r.missing.length }))}</span>`);
        const lines = [
            ...r.invalid.map(
                (x) => `<b>${escapeHtml(x.title || x.id)}</b><span>${escapeHtml(this.i18n[x.reason])}</span><code>${escapeHtml(x.id)}</code>`
            ),
            ...r.missing.map((c) => `<b>${escapeHtml(c.title)}</b><span>${escapeHtml(this.i18n.notReferenced)}</span>`),
        ];
        return this.card(r.hpath, badges, lines);
    }

    card(path, badges, lines) {
        return `<div class="pcr__card">
            <div class="pcr__card-head"><span class="pcr__path">${escapeHtml(path)}</span>${badges.join("")}</div>
            ${lines.length ? `<ul class="pcr__items">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>` : ""}
        </div>`;
    }

    renderFoot() {
        const { phase, kind, stats } = this.s;
        if (phase !== "done" || kind !== "check") return "";
        const btns = [];
        if (stats.missingDocs) {
            btns.push(`<button class="b3-button b3-button--outline" data-act="fill">${escapeHtml(this.t("btnFill", { count: stats.missingDocs }))}</button>`);
        }
        if (stats.invalid) {
            btns.push(`<button class="b3-button b3-button--remove" data-act="clear">${escapeHtml(this.t("btnClear", { count: stats.invalid }))}</button>`);
        }
        return btns.length ? `<div class="pcr__foot">${btns.join("")}</div>` : "";
    }
}

module.exports = class ParentChildRefPlugin extends Plugin {
    onload() {
        this.injectStyle();

        this.addTopBar({
            icon: "iconLink",
            title: this.i18n.pluginName,
            position: "right",
            callback: () => this.openPanel(),
        });

        this.addCommand({ langKey: "oneClickRef", hotkey: "", callback: () => this.openPanel("ref") });
        this.addCommand({ langKey: "oneClickCheck", hotkey: "", callback: () => this.openPanel("check") });

        this.eventBus.on("click-editortitleicon", ({ detail }) => {
            detail.menu.addSeparator();
            this.fillMenu(detail.menu);
        });

        this.eventBus.on("open-menu-doctree", ({ detail }) => {
            const elements = detail.elements;
            if (!elements || elements.length !== 1) return;
            if (elements[0].getAttribute("data-type") !== "navigation-file") return;
            detail.menu.addSeparator();
            this.fillMenu(detail.menu);
        });
    }

    onunload() {
        this.panel?.destroy();
        document.getElementById(STYLE_ID)?.remove();
    }

    injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = CSS;
        document.head.appendChild(style);
    }

    fillMenu(menu) {
        menu.addItem({ icon: "iconLink", label: this.i18n.oneClickRef, click: () => this.openPanel("ref") });
        menu.addItem({ icon: "iconCheck", label: this.i18n.oneClickCheck, click: () => this.openPanel("check") });
    }

    // kind: 不传仅打开面板；"ref" 打开并进入确认；"check" 打开并立即检查
    openPanel(kind) {
        this.panel?.destroy();
        const panel = new Panel(this);
        this.panel = panel;
        if (kind === "ref") panel.askRef();
        else if (kind === "check") panel.runCheck();
    }

    isMobile() {
        return !!window.siyuan?.mobile;
    }

    t(key, params = {}) {
        return this.i18n[key].replace(/\$\{(\w+)\}/g, (_, k) => params[k]);
    }

    async listChildren(docId) {
        const { notebook, path } = await api("/api/filetree/getPathByID", { id: docId });
        const data = await api("/api/filetree/listDocsByPath", { notebook, path });
        return (data.files || []).map((f) => ({ id: f.id, title: f.name.replace(/\.sy$/, "") }));
    }

    // 引用表格：带插件属性的表格，或兼容已有的、表头为「子文档」的单列表格（首次写入时自动打上属性）
    async listRefTables(docId) {
        const headers = [...new Set(["子文档", this.i18n.tableHeader])];
        const like = headers.map((h) => `b.markdown LIKE '|${h.replace(/'/g, "''")}|%'`).join(" OR ");
        const scope = docId ? `AND b.root_id = '${docId}'` : "";
        const rows = await sql(
            `SELECT b.id AS block_id, b.root_id,
                    (b.id IN (SELECT block_id FROM attributes WHERE name = '${TABLE_ATTR}')) AS has_attr
             FROM blocks b
             WHERE b.type = 't' ${scope}
               AND (b.id IN (SELECT block_id FROM attributes WHERE name = '${TABLE_ATTR}') OR ${like})
             ORDER BY has_attr DESC, b.sort ASC
             LIMIT 100000`
        );
        // 每个文档只取一个表格：优先带属性的，其次第一个匹配的
        const byRoot = new Map();
        for (const r of rows) if (!byRoot.has(r.root_id)) byRoot.set(r.root_id, r);
        return [...byRoot.values()];
    }

    async findTableId(docId) {
        return (await this.listRefTables(docId))[0]?.block_id;
    }

    async readTable(tableId) {
        const { kramdown } = await api("/api/block/getBlockKramdown", { id: tableId });
        return parseTable(kramdown);
    }

    async writeTable(tableId, t, rows) {
        await api("/api/block/updateBlock", {
            dataType: "markdown",
            data: buildTable(t, rows),
            id: tableId,
        });
        await api("/api/attr/setBlockAttrs", { id: tableId, attrs: { [TABLE_ATTR]: "true" } });
    }

    // 为单个文档同步引用表格：仅在存在缺失或不合法引用时才写入
    async syncRefs(docId) {
        const none = { created: false, count: 0, removed: 0 };
        const children = await this.listChildren(docId);
        const tableId = await this.findTableId(docId);

        if (!tableId) {
            if (!children.length) return none;
            const md = [`| ${this.i18n.tableHeader} |`, "| --- |", ...children.map(refMarkdown)].join("\n");
            const res = await api("/api/block/appendBlock", {
                dataType: "markdown",
                data: md,
                parentID: docId,
            });
            const newId = res[0].doOperations[0].id;
            await api("/api/attr/setBlockAttrs", { id: newId, attrs: { [TABLE_ATTR]: "true" } });
            return { created: true, count: children.length, removed: 0 };
        }

        const a = await this.analyzeDoc(docId, tableId, children);
        if (!a.invalid.length && !a.missing.length) return none;
        const drop = new Set(a.invalid.map((x) => x.index));
        const rows = [...a.t.rows.filter((_, i) => !drop.has(i)), ...a.missing.map(refMarkdown)];
        await this.writeTable(tableId, a.t, rows);
        return { created: false, count: a.missing.length, removed: a.invalid.length };
    }

    // 工作空间内所有拥有子文档的文档
    async listParentDocIds() {
        const docs = await sql("SELECT id, path, hpath FROM blocks WHERE type = 'd' LIMIT 1000000");
        const hpaths = new Map(docs.map((d) => [d.id, d.hpath]));
        const parents = new Set();
        for (const { path } of docs) {
            const segs = path.split("/");
            if (segs.length > 2) parents.add(segs[segs.length - 2]);
        }
        // 已有引用表格但子文档已全部移走的文档，也需要清理其中的不合法引用
        for (const { root_id } of await this.listRefTables()) parents.add(root_id);
        return [...parents].map((id) => ({ id, hpath: hpaths.get(id) || id }));
    }

    async analyzeDoc(docId, tableId, prefetched) {
        const children = prefetched || (await this.listChildren(docId));
        const childIds = new Set(children.map((c) => c.id));
        const t = await this.readTable(tableId);

        const refs = t.rows
            .map((line, index) => ({
                line,
                index,
                id: line.match(REF_RE)?.[1],
                title: unescapeEntities(line.match(ANCHOR_RE)?.[1] || ""),
            }))
            .filter((r) => r.id);
        const ids = [...new Set(refs.map((r) => r.id))];
        const found = new Set();
        if (ids.length) {
            const list = ids.map((i) => `'${i}'`).join(",");
            (await sql(`SELECT id FROM blocks WHERE id IN (${list}) LIMIT 100000`)).forEach((b) => found.add(b.id));
        }

        const seen = new Set();
        const invalid = [];
        for (const r of refs) {
            let reason;
            if (!found.has(r.id)) reason = "notExist";
            else if (!childIds.has(r.id)) reason = "notChild";
            else if (seen.has(r.id)) reason = "duplicate";
            seen.add(r.id);
            if (reason) invalid.push({ ...r, reason });
        }
        const missing = children.filter((c) => !seen.has(c.id));
        return { docId, tableId, t, refs, invalid, missing };
    }
};
