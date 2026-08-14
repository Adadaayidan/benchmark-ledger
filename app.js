const state = {
  page: 1,
  pages: 1,
  limit: 25,
  total: 0,
  filters: { search: "", type: "", capability: "", language: "", evidence: "", freshness: "", sort: "authority", traceable: "" },
  selected: new Map(),
  facets: null,
  stats: null,
  dataset: null,
  resultsDataset: null,
  standardsDataset: null,
  standardsFiltered: [],
  backendAvailable: null,
  staticOnly: false,
  currentView: "catalog",
  updateObservedRunning: false,
  boundary: { grain: "quarter", period: "", capability: "overall", search: "", radarMode: "compare", radarCountry: "", radarCountries: [] },
  standardFilters: { search: "", country: "", type: "", capability: "", update: "" },
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const labels = {
  freshness: { current: "近期", scheduled: "已排期", aging: "较旧", stale: "过期", overdue: "已逾期", unknown: "未知" },
  sourceType: { result_page: "结果页", repository: "代码仓库", paper: "论文", reference_text: "文本引用" },
};

const capabilityShort = {
  "知识与语言": "知", "推理与数学": "推", "编程与软件工程": "编",
  "多模态理解与生成": "多", "智能体与具身执行": "智", "安全、对齐与可靠性": "安",
};

const radarColors = ["#155e4b", "#a55b09", "#316f9f", "#a23a32"];
const MIN_OVERALL_DIMENSIONS = 3;
const radarCompactLabels = {
  "知识与语言": "知识语言", "推理与数学": "推理数学", "编程与软件工程": "编程工程",
  "多模态理解与生成": "多模态", "智能体与具身执行": "智能体", "安全、对齐与可靠性": "安全可靠",
};

const itemCapabilities = (item) => item.capabilities?.length ? item.capabilities : [item.primary_capability].filter(Boolean);

const standardOriginLabel = (value) => {
  if (!value) return "待核验";
  if (value.includes("中国") && value.includes("美国")) return "中美合作";
  if (value.includes("中国")) return "中国";
  if (value.includes("美国")) return "美国";
  return "其他/国际";
};

function standardIsRecent(item) {
  const value = item.current_updated || "";
  const match = value.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
  if (!match) return false;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3] || 1));
  return (Date.now() - date.getTime()) / 86400000 <= 366;
}

function standardIsRecurring(item) {
  const frequency = String(item.update_frequency || "").trim();
  const unknownFrequency = ["不定", "不定期", "未知", "未记录"].includes(frequency);
  return Boolean(item.next_updated || (frequency && !unknownFrequency));
}

function standardMatches(item) {
  const filters = state.standardFilters || { search: "", country: "", type: "", capability: "", update: "" };
  const haystack = [item.name, item.publisher, item.origin_country, item.ai_type, item.primary_capability, item.secondary_capability, item.paper_title, item.authors, item.note]
    .filter(Boolean).join(" ").toLocaleLowerCase("zh-CN");
  if (filters.search && !haystack.includes(filters.search.toLocaleLowerCase("zh-CN"))) return false;
  if (filters.country && standardOriginLabel(item.origin_country) !== filters.country) return false;
  if (filters.type && item.ai_type !== filters.type) return false;
  if (filters.capability && item.primary_capability !== filters.capability) return false;
  if (filters.update === "recurring" && !standardIsRecurring(item)) return false;
  if (filters.update === "recent" && !standardIsRecent(item)) return false;
  if (filters.update === "supplemental" && item.record_status !== "补录项") return false;
  return true;
}

function standardLink(value, label) {
  return value ? `<a href="${escapeHtml(value)}" target="_blank" rel="noreferrer">${escapeHtml(label || value)}</a>` : '<span class="missing-link">未记录</span>';
}

function standardDateLabel(value) {
  if (!value) return "未记录";
  return value.replaceAll("-", ".");
}

function standardRowTemplate(item) {
  const origin = standardOriginLabel(item.origin_country);
  const status = item.record_status === "补录项" ? '<span class="record-status supplemental">补录</span>' : '<span class="record-status">已纳入</span>';
  const updateMeta = [item.update_frequency, item.next_updated ? `下次 ${standardDateLabel(item.next_updated)}` : ""].filter(Boolean).join(" · ");
  return `<tr data-standard-id="${escapeHtml(item.id)}">
    <td class="standard-name-cell"><button type="button" data-standard-open="${escapeHtml(item.id)}">${escapeHtml(item.name)}</button>${status}<small>${escapeHtml(item.publisher || "机构未记录")}</small></td>
    <td>${standardLink(item.source_url, "打开来源 ↗")}</td>
    <td><span class="type-pill">${escapeHtml(item.ai_type || "未记录")}</span></td>
    <td><strong>${escapeHtml(item.primary_capability || "未记录")}</strong></td>
    <td>${escapeHtml(item.secondary_capability || "未记录")}</td>
    <td class="standard-date-cell"><strong>${standardDateLabel(item.current_updated)}</strong><small>${escapeHtml(updateMeta || "更新频率未记录")}</small></td>
    <td class="logic-cell">${escapeHtml(item.evaluation_logic || "未记录")}</td>
    <td>${escapeHtml(item.data_type || "未记录")}</td>
    <td>${escapeHtml(item.language || "未记录")}</td>
    <td><span class="value-badge value-${escapeHtml((item.reference_value || "未知").toLowerCase())}">${escapeHtml(item.reference_value || "未知")}</span></td>
    <td>${standardLink(item.github_url, "GitHub ↗")}</td>
    <td class="paper-cell">${item.paper_title ? `<strong>${escapeHtml(item.paper_title)}</strong>` : '<span class="missing-link">论文未记录</span>'}<small>${escapeHtml(item.authors || "作者未记录")}${item.paper_url ? ` · ${standardLink(item.paper_url, "论文链接")}` : ""}</small></td>
    <td><span class="origin-badge origin-${origin === "中国" ? "cn" : origin === "美国" ? "us" : "other"}">${escapeHtml(origin)}</span><small>${escapeHtml(item.publisher || "机构未记录")}</small></td>
  </tr>`;
}

function renderStandardFilters() {
  if (!state.standardsDataset) return;
  const records = state.standardsDataset.records;
  const unique = (key) => [...new Set(records.map((item) => item[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const countryValues = [...new Set(records.map((item) => standardOriginLabel(item.origin_country)))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  $("#standards-country-filter").innerHTML = '<option value="">全部地区</option>' + countryValues.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  $("#standards-type-filter").innerHTML = '<option value="">全部类型</option>' + unique("ai_type").map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  $("#standards-capability-filter").innerHTML = '<option value="">全部能力</option>' + unique("primary_capability").map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
}

function renderStandards() {
  if (!state.standardsDataset) return;
  const records = state.standardsDataset.records.filter(standardMatches);
  state.standardsFiltered = records;
  $("#standards-rows").innerHTML = records.map(standardRowTemplate).join("");
  $("#standards-empty").hidden = records.length !== 0;
  $("#standards-result-count").textContent = `${records.length} / ${state.standardsDataset.records.length} 条`;
}

function renderStandardsSummary() {
  const records = state.standardsDataset.records;
  const counts = records.reduce((map, item) => map.set(standardOriginLabel(item.origin_country), (map.get(standardOriginLabel(item.origin_country)) || 0) + 1), new Map());
  const countrySummary = ["中国", "美国", "中美合作", "其他/国际", "待核验"].map((label) => `${label} ${counts.get(label) || 0}`).join(" · ");
  $("#standards-total").textContent = records.length;
  $("#standards-country-mix").textContent = countrySummary;
  $("#standards-refresh-rate").textContent = `${Math.round(records.filter((item) => standardIsRecurring(item)).length / records.length * 100)}%`;
  $("#standards-supplemental").textContent = records.filter((item) => item.record_status === "补录项").length;
  $("#standards-source-count").textContent = `${state.standardsDataset.meta.source_rows} 条 Excel · ${state.standardsDataset.meta.supplemental_rows} 条补录`;
  const externalRows = state.standardsDataset.meta.external_rows || 0;
  $("#standards-source-note").textContent = `读取自 ${state.standardsDataset.meta.source_file}${externalRows ? ` · 另含 ${externalRows} 条 Epoch AI 快照` : ""}`;
  const covered = state.standardsDataset.meta.important_audit.covered || [];
  const added = new Set(state.standardsDataset.meta.important_audit.added || []);
  const externalAdded = state.standardsDataset.meta.important_audit.external_added || [];
  $("#standards-audit-summary").textContent = `${covered.length} 个核心标准已在目录中 · ${added.size + externalAdded.length} 个补录`;
  const externalChip = externalAdded.length ? `<span class="audit-chip added"><i></i>Epoch AI Benchmark Hub<small>${externalAdded.length} 条快照补录</small></span>` : "";
  $("#standards-audit-chips").innerHTML = [...covered.map((name) => `<span class="audit-chip covered"><i></i>${escapeHtml(name)}<small>已纳入</small></span>`), ...[...added].map((name) => `<span class="audit-chip added"><i></i>${escapeHtml(name)}<small>补录</small></span>`), externalChip].join("");
}

function openStandardDetails(id) {
  const item = state.standardsDataset.records.find((record) => record.id === id);
  if (!item) return;
  const drawer = $("#detail-drawer");
  $("#detail-drawer .drawer-kicker").textContent = "BENCHMARK STANDARD RECORD";
  $("#detail-title").textContent = item.name;
  $("#drawer-overlay").hidden = false;
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  $("#drawer-content").innerHTML = `<div class="standard-detail-status"><span class="origin-badge origin-${standardOriginLabel(item.origin_country) === "中国" ? "cn" : standardOriginLabel(item.origin_country) === "美国" ? "us" : "other"}">${escapeHtml(standardOriginLabel(item.origin_country))}</span><strong>${escapeHtml(item.publisher || "机构未记录")}</strong><small>${escapeHtml(item.record_status)}</small></div>
    <div class="detail-grid">${detailsField("AI 类型", item.ai_type)}${detailsField("一级能力", item.primary_capability)}${detailsField("二级能力", item.secondary_capability)}${detailsField("语言", item.language)}${detailsField("当前更新时间", standardDateLabel(item.current_updated))}${detailsField("下次更新时间", standardDateLabel(item.next_updated))}${detailsField("更新频率", item.update_frequency)}${detailsField("数据类型", item.data_type)}${detailsField("参考价值", item.reference_value)}${detailsField("机构 / 作者归属", item.origin_country)}</div>
    <section class="drawer-section"><h3>测评逻辑</h3><p>${escapeHtml(item.evaluation_logic || "未记录")}</p></section>
    <section class="drawer-section"><h3>来源与代码</h3><div class="source-list"><article class="source-item"><strong>评测来源</strong>${standardLink(item.source_url, "打开来源 ↗")}<p>${escapeHtml(item.source_url || "未记录")}</p></article><article class="source-item"><strong>GitHub</strong>${standardLink(item.github_url, "打开仓库 ↗")}<p>${escapeHtml(item.github_url || "未记录")}</p></article></div></section>
    <section class="drawer-section"><h3>论文与作者</h3><p>${escapeHtml(item.paper_title || "论文未记录")}</p><p class="drawer-muted">${escapeHtml(item.authors || "作者未记录")}</p>${item.paper_url ? `<p>${standardLink(item.paper_url, "打开论文链接 ↗")}</p>` : ""}</section>
    <section class="drawer-section"><h3>参考备注</h3><p>${escapeHtml(item.note || "未记录")}</p></section>`;
}

function appUrl(path) {
  return path;
}

function staticStats() {
  const items = state.dataset.benchmarks;
  const actionableIssues = items.reduce(
    (total, item) => total + item.issues.filter((issue) => ["warning", "error"].includes(issue.severity)).length,
    0,
  );
  return {
    stats: {
      benchmarks: items.length,
      high_traceability: items.filter((item) => ["A", "B"].includes(item.evidence_tier)).length,
      overdue: items.filter((item) => item.freshness_status === "overdue").length,
      average_authority_score: Math.round(items.reduce((sum, item) => sum + item.authority_score, 0) / items.length * 10) / 10,
      direct_result_pages: state.dataset.stats.direct_result_pages,
      actionable_issues: actionableIssues,
      model_results: state.resultsDataset?.stats.observations || 0,
    },
    meta: state.dataset.meta,
  };
}

function staticFacets() {
  const facets = state.dataset.facets;
  return {
    types: facets.ai_types,
    capabilities: facets.capabilities,
    languages: facets.languages,
    evidence: facets.evidence_tiers,
    freshness: facets.freshness,
  };
}

function staticFilteredItems(params) {
  const value = (key) => params.get(key)?.trim() || "";
  const search = value("search").toLocaleLowerCase("zh-CN");
  let items = state.dataset.benchmarks.filter((item) => {
    const haystack = [item.name, ...itemCapabilities(item), item.secondary_capability, item.notes]
      .filter(Boolean).join(" ").toLocaleLowerCase("zh-CN");
    return (!search || haystack.includes(search))
      && (!value("type") || item.ai_type === value("type"))
      && (!value("capability") || itemCapabilities(item).includes(value("capability")))
      && (!value("language") || item.language === value("language"))
      && (!value("evidence") || item.evidence_tier === value("evidence"))
      && (!value("freshness") || item.freshness_status === value("freshness"))
      && (value("traceable") !== "1" || ["A", "B"].includes(item.evidence_tier));
  });
  const byName = (a, b) => a.name.localeCompare(b.name, "zh-CN");
  const sorters = {
    authority: (a, b) => b.authority_score - a.authority_score || byName(a, b),
    updated: (a, b) => (b.current_updated || "").localeCompare(a.current_updated || "") || byName(a, b),
    name: byName,
    issues: (a, b) => b.issue_count - a.issue_count || a.authority_score - b.authority_score,
  };
  return items.sort(sorters[value("sort")] || sorters.authority);
}

function staticApi(path) {
  const request = new URL(path, "https://static.local");
  if (request.pathname === "/api/stats") return staticStats();
  if (request.pathname === "/api/facets") return staticFacets();
  if (request.pathname === "/api/benchmarks") {
    const items = staticFilteredItems(request.searchParams);
    const page = Math.max(1, Number(request.searchParams.get("page")) || 1);
    const limit = Math.min(100, Math.max(10, Number(request.searchParams.get("limit")) || 25));
    return {
      items: items.slice((page - 1) * limit, page * limit),
      total: items.length,
      page,
      limit,
      pages: Math.max(1, Math.ceil(items.length / limit)),
    };
  }
  if (request.pathname.startsWith("/api/benchmarks/")) {
    const id = decodeURIComponent(request.pathname.split("/").pop());
    const item = state.dataset.benchmarks.find((candidate) => candidate.id === id);
    if (item) return item;
  }
  throw new Error("静态数据中没有该记录");
}

async function api(path) {
  if (state.staticOnly && path.startsWith("/api/")) return staticApi(path);
  try {
    const response = await fetch(appUrl(path));
    if (!response.ok) throw new Error(`请求失败：${response.status}`);
    if (path.startsWith("/api/")) state.backendAvailable = true;
    return response.json();
  } catch (error) {
    if (state.dataset && path.startsWith("/api/")) {
      state.backendAvailable = false;
      return staticApi(path);
    }
    throw error;
  }
}

function formatDate(value) {
  if (!value) return "未记录";
  return value.replaceAll("-", ".");
}

function formatImportTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return `导入于 ${new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date)}`;
}

function formatResultUpdateTime(value) {
  if (!value) return "更新时间未记录";
  const date = new Date(value);
  return `最近更新 ${new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date)}`;
}

function buildParams(includePage = true) {
  const params = new URLSearchParams();
  Object.entries(state.filters).forEach(([key, value]) => value && params.set(key, value));
  if (includePage) {
    params.set("page", state.page);
    params.set("limit", state.limit);
  }
  return params;
}

function populateSelect(selector, items) {
  const select = $(selector);
  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value === "未分类" ? "" : item.value;
    option.textContent = `${item.value} (${item.count})`;
    select.append(option);
  });
}

function renderStats(payload) {
  state.stats = payload;
  const { stats, meta } = payload;
  $("#metric-total").textContent = stats.benchmarks;
  $("#metric-traceable").textContent = stats.high_traceability;
  $("#metric-traceable-rate").textContent = `${Math.round(stats.high_traceability / stats.benchmarks * 100)}% 可追溯比例`;
  $("#metric-direct").textContent = stats.direct_result_pages;
  $("#metric-issues").textContent = stats.actionable_issues;
  $("#source-file").textContent = meta.source_file;
  $("#source-file").title = meta.source_file;
  $("#imported-at").textContent = formatImportTime(meta.imported_at);
  $("#result-record-count").textContent = stats.model_results;
}

function renderFacets(facets) {
  state.facets = facets;
  populateSelect("#type-filter", facets.types);
  populateSelect("#language-filter", facets.languages);
  const list = $("#capability-list");
  list.innerHTML = facets.capabilities.map((item) => `
    <button class="facet-button" type="button" data-capability="${escapeHtml(item.value === "未分类" ? "" : item.value)}" title="${escapeHtml(item.value)}">
      <span>${escapeHtml(item.value)}</span><span>${item.count}</span>
    </button>
  `).join("");
  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-capability]");
    if (!button) return;
    state.filters.capability = button.dataset.capability;
    state.page = 1;
    $$(".facet-button", list).forEach((item) => item.classList.toggle("is-active", item === button));
    loadBenchmarks();
  });
  renderMap();
}

function rowTemplate(item) {
  const selected = state.selected.has(item.id);
  const sourceCount = item.sources.filter((source) => source.is_direct).length;
  return `
    <tr data-id="${item.id}">
      <td class="select-cell"><input class="row-select" type="checkbox" aria-label="选择 ${escapeHtml(item.name)}" ${selected ? "checked" : ""}></td>
      <td class="benchmark-name"><button type="button" data-open="${item.id}">${escapeHtml(item.name)}</button><small>${escapeHtml(item.data_type || item.score_direction || "未记录数据类型")}</small></td>
      <td class="capability-cell"><strong>${escapeHtml(item.primary_capability || "未分类")}</strong><small>${itemCapabilities(item).length > 1 ? `覆盖 ${itemCapabilities(item).length} 维 · ` : ""}${escapeHtml(item.secondary_capability || "未填写二级能力")}</small></td>
      <td><span class="type-pill">${escapeHtml(item.ai_type || "未分类")}</span></td>
      <td><div class="source-score"><span class="tier-pill tier-${item.evidence_tier.toLowerCase()}-bg">${item.evidence_tier}</span><span>${item.authority_score} · ${sourceCount} 直链</span></div></td>
      <td class="date-cell">${formatDate(item.current_updated)}<small>${escapeHtml(labels.freshness[item.freshness_status] || item.freshness_status)}</small></td>
      <td><span class="issue-pill ${item.issue_count ? "" : "none"}">${item.issue_count ? `${item.issue_count} 项` : "无"}</span></td>
      <td class="action-cell"><button class="row-open" type="button" data-open="${item.id}" aria-label="查看 ${escapeHtml(item.name)} 详情">→</button></td>
    </tr>
  `;
}

async function loadBenchmarks() {
  const tbody = $("#benchmark-rows");
  tbody.innerHTML = '<tr><td colspan="8" class="loading-row">正在查询数据库…</td></tr>';
  $("#empty-state").hidden = true;
  try {
    const payload = await api(`/api/benchmarks?${buildParams()}`);
    state.total = payload.total;
    state.pages = payload.pages;
    state.page = payload.page;
    tbody.innerHTML = payload.items.map(rowTemplate).join("");
    tbody.hidden = payload.items.length === 0;
    $("#empty-state").hidden = payload.items.length !== 0;
    $("#result-count").textContent = `${payload.total} 条`;
    const from = payload.total ? (payload.page - 1) * payload.limit + 1 : 0;
    const to = Math.min(payload.total, payload.page * payload.limit);
    $("#page-summary").textContent = `${from}–${to} / ${payload.total}`;
    $("#page-number").textContent = `${payload.page} / ${payload.pages}`;
    $("#prev-page").disabled = payload.page <= 1;
    $("#next-page").disabled = payload.page >= payload.pages;
  } catch (error) {
    tbody.hidden = false;
    tbody.innerHTML = `<tr><td colspan="8" class="loading-row">${escapeHtml(error.message)}</td></tr>`;
    setDataState("数据库连接失败", true);
  }
}

function setDataState(message, isError = false) {
  const node = $("#data-state");
  node.lastChild.textContent = ` ${message}`;
  node.querySelector("i").style.background = isError ? "#a23a32" : "#2e9c70";
}

function detailsField(label, value) {
  return `<div class="detail-field"><span>${label}</span><strong>${escapeHtml(value || "未记录")}</strong></div>`;
}

function sourceTemplate(source) {
  const link = source.url
    ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">打开来源 ↗</a>`
    : `<small>缺少可点击 URL</small>`;
  return `<article class="source-item"><strong>${escapeHtml(labels.sourceType[source.source_type] || source.label)}</strong>${link}<p>${escapeHtml(source.citation_text || source.url || "未记录引用")}</p>${source.author ? `<small>作者：${escapeHtml(source.author)}</small>` : ""}</article>`;
}

async function openDetails(id) {
  const drawer = $("#detail-drawer");
  $("#drawer-content").innerHTML = '<div class="loading-row">正在读取记录…</div>';
  $("#drawer-overlay").hidden = false;
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  try {
    const item = await api(`/api/benchmarks/${encodeURIComponent(id)}`);
    $("#detail-drawer .drawer-kicker").textContent = "BENCHMARK RECORD";
    $("#detail-title").textContent = item.name;
    $("#drawer-content").innerHTML = `
      <div class="detail-score"><span class="tier-badge tier-${item.evidence_tier.toLowerCase()}-bg">${item.evidence_tier}</span><strong>${item.traceability_status}</strong><span>来源完整度 ${item.authority_score} / 100</span></div>
      <div class="detail-grid">
        ${detailsField("AI 类型", item.ai_type)}${detailsField("评测范围", item.evaluation_scope)}
        ${detailsField("主能力", item.primary_capability)}${detailsField("覆盖能力", itemCapabilities(item).join(" / "))}
        ${detailsField("原始一级能力", item.source_primary_capability)}${detailsField("二级能力", item.secondary_capability)}
        ${detailsField("语言", item.language)}${detailsField("测评方向", item.score_direction)}
        ${detailsField("参考价值", item.reference_value)}
        ${detailsField("当前更新", formatDate(item.current_updated))}${detailsField("下次更新", formatDate(item.next_updated))}
        ${detailsField("更新频率", item.update_frequency)}${detailsField("数据类型", item.data_type)}
      </div>
      <section class="drawer-section"><h3>评测备注</h3><p>${escapeHtml(item.notes || "未记录")}</p></section>
      <section class="drawer-section"><h3>来源链 · ${item.sources.length}</h3><div class="source-list">${item.sources.length ? item.sources.map(sourceTemplate).join("") : '<p>未记录来源。</p>'}</div></section>
      <section class="drawer-section"><h3>数据问题 · ${item.issues.length}</h3><div class="issue-list">${item.issues.length ? item.issues.map((issue) => `<div class="issue-item ${issue.severity}"><small>${escapeHtml(issue.field_name)} · ${escapeHtml(issue.issue_code)}</small>${escapeHtml(issue.message)}</div>`).join("") : '<p>未发现导入问题。</p>'}</div></section>
      <section class="drawer-section"><h3>溯源定位</h3><p>Excel 第 ${item.source_row} 行 · ID ${escapeHtml(item.id)}</p></section>
    `;
  } catch (error) {
    $("#drawer-content").innerHTML = `<div class="loading-row">${escapeHtml(error.message)}</div>`;
  }
}

function closeDetails() {
  $("#detail-drawer").classList.remove("is-open");
  $("#detail-drawer").setAttribute("aria-hidden", "true");
  window.setTimeout(() => { $("#drawer-overlay").hidden = true; }, 180);
}

function toggleSelected(item, checked) {
  if (checked && state.selected.size >= 4 && !state.selected.has(item.id)) {
    setDataState("最多对比 4 条记录", true);
    window.setTimeout(() => setDataState("数据已载入"), 1800);
    return false;
  }
  if (checked) state.selected.set(item.id, item);
  else state.selected.delete(item.id);
  updateCompareBar();
  return true;
}

function updateCompareBar() {
  const count = state.selected.size;
  $("#compare-bar").hidden = count === 0;
  $("#compare-count").textContent = count;
  $("#open-compare").disabled = count < 2;
}

function openCompare() {
  const items = [...state.selected.values()];
  const rows = [
    ["信源等级", ...items.map((item) => `<span class="tier-pill tier-${item.evidence_tier.toLowerCase()}-bg">${item.evidence_tier}</span> ${item.authority_score}`)],
    ["AI 类型", ...items.map((item) => escapeHtml(item.ai_type || "未记录"))],
    ["评测范围", ...items.map((item) => escapeHtml(item.evaluation_scope || "未记录"))],
    ["主能力", ...items.map((item) => escapeHtml(item.primary_capability || "未记录"))],
    ["覆盖能力", ...items.map((item) => escapeHtml(itemCapabilities(item).join(" / ") || "未记录"))],
    ["二级能力", ...items.map((item) => escapeHtml(item.secondary_capability || "未记录"))],
    ["语言", ...items.map((item) => escapeHtml(item.language || "未记录"))],
    ["更新时间", ...items.map((item) => formatDate(item.current_updated))],
    ["信源状态", ...items.map((item) => escapeHtml(item.traceability_status))],
    ["直接来源", ...items.map((item) => String(item.sources.filter((source) => source.is_direct).length))],
  ];
  $("#compare-content").innerHTML = `<table class="compare-table"><thead><tr><th>字段</th>${items.map((item) => `<th>${escapeHtml(item.name)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr><th>${row[0]}</th>${row.slice(1).map((value) => `<td>${value}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  $("#compare-dialog").showModal();
}

function renderMap() {
  if (!state.facets || !state.dataset) return;
  const capabilities = state.facets.capabilities.filter((item) => item.value !== "未分类");
  const max = Math.max(...capabilities.map((item) => item.count));
  $("#capability-total").textContent = `${capabilities.length} 个维度`;
  $("#capability-chart").innerHTML = capabilities.slice(0, 16).map((item) => `
    <div class="bar-row"><span class="bar-label" title="${escapeHtml(item.value)}">${escapeHtml(item.value)}</span><span class="bar-track"><i class="bar-fill" style="width:${item.count / max * 100}%"></i></span><strong class="bar-value">${item.count}</strong></div>
  `).join("");
  const total = state.stats?.stats.benchmarks || state.dataset.benchmarks.length;
  $("#type-distribution").innerHTML = state.facets.types.map((item) => `<div class="type-row"><strong>${escapeHtml(item.value)}</strong><small>${Math.round(item.count / total * 100)}% 覆盖</small><span>${item.count}</span></div>`).join("");

  const types = state.facets.types.map((item) => item.value);
  const matrixCapabilities = capabilities.slice(0, 18).map((item) => item.value);
  const counts = new Map();
  state.dataset.benchmarks.forEach((item) => {
    itemCapabilities(item).forEach((capability) => {
      const key = `${capability || "未分类"}\u0000${item.ai_type || "未分类"}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  });
  $("#coverage-matrix").innerHTML = `<thead><tr><th>能力维度</th>${types.map((type) => `<th>${escapeHtml(type)}</th>`).join("")}<th>合计</th></tr></thead><tbody>${matrixCapabilities.map((capability) => {
    const values = types.map((type) => counts.get(`${capability}\u0000${type}`) || 0);
    return `<tr><td>${escapeHtml(capability)}</td>${values.map((value) => `<td>${value ? `<span class="matrix-count">${value}</span>` : '<span class="matrix-zero">—</span>'}</td>`).join("")}<td><strong>${values.reduce((sum, value) => sum + value, 0)}</strong></td></tr>`;
  }).join("")}</tbody>`;
}

function formatReleaseDate(value) {
  return value ? value.replaceAll("-", ".") : "待补日期";
}

function periodLabel(value) {
  if (!value) return "未选择";
  const quarter = value.match(/^(\d{4})-Q([1-4])$/);
  if (quarter) return `${quarter[1]} 年第 ${quarter[2]} 季度`;
  const month = value.match(/^(\d{4})-(\d{2})$/);
  return month ? `${month[1]} 年 ${Number(month[2])} 月` : value;
}

function scoreForCapability(model, capability) {
  if (capability === "overall") {
    const scores = (model.capability_scores || []).filter((score) => Number.isFinite(Number(score.boundary_score)));
    if (scores.length < MIN_OVERALL_DIMENSIONS) return null;
    const totalDimensions = state.resultsDataset?.capabilities?.length || 6;
    const confidence = scores.reduce((sum, score) => sum + Number(score.confidence || 0), 0) / scores.length;
    const boundary_score = scores.reduce((sum, score) => sum + Number(score.boundary_score), 0) / scores.length;
    return {
      boundary_score,
      coverage: scores.length / totalDimensions,
      confidence,
      observed_dimensions: scores.length,
      total_dimensions: totalDimensions,
      source_coverage: model.overall_coverage,
    };
  }
  return model.capability_scores.find((score) => score.capability === capability) || null;
}

function boundaryPeriodField() {
  return state.boundary.grain === "month" ? "release_month" : "release_quarter";
}

function boundaryPeriods() {
  const key = state.boundary.grain === "month" ? "months" : "quarters";
  return state.resultsDataset.periods[key];
}

function populateBoundaryPeriods(preferred = "") {
  const periods = boundaryPeriods();
  state.boundary.period = periods.includes(preferred) ? preferred : periods.at(-1) || "";
  $("#boundary-period").innerHTML = periods.slice().reverse().map((period) => `<option value="${escapeHtml(period)}">${escapeHtml(periodLabel(period))}</option>`).join("");
  $("#boundary-period").value = state.boundary.period;
}

function boundaryModelsForPeriod(includeSearch = true) {
  const field = boundaryPeriodField();
  const search = state.boundary.search.toLocaleLowerCase("zh-CN");
  return state.resultsDataset.models.filter((model) => {
    const matchesSearch = !includeSearch || !search || [model.name, model.organization].filter(Boolean).join(" ").toLocaleLowerCase("zh-CN").includes(search);
    return model[field] === state.boundary.period && matchesSearch;
  });
}

function timelineData() {
  const periodField = boundaryPeriodField();
  const periods = boundaryPeriods();
  if (state.boundary.capability !== "overall") {
    const key = state.boundary.grain === "month" ? "months" : "quarters";
    return state.resultsDataset.frontier[key].filter((entry) => entry.capability === state.boundary.capability);
  }
  let best = null;
  const output = [];
  periods.forEach((period) => {
    state.resultsDataset.models.filter((model) => model[periodField] === period).forEach((model) => {
      const score = scoreForCapability(model, "overall");
      if (score && (!best || score.boundary_score > best.score)) best = { score: score.boundary_score, model_id: model.id, model_name: model.name };
    });
    if (best) output.push({ period, capability: "综合能力", ...best });
  });
  return output;
}

function renderTimeline() {
  const data = timelineData();
  const capabilityLabel = state.boundary.capability === "overall" ? "综合能力" : state.boundary.capability;
  $("#frontier-title").textContent = `${capabilityLabel}前沿`;
  if (!data.length) {
    $("#frontier-chart").innerHTML = '<div class="timeline-empty">该维度暂无带发布日期的结果</div>';
    return;
  }
  const compact = window.innerWidth <= 760;
  const width = compact ? 430 : 860; const height = compact ? 250 : 290;
  const padding = { left: 46, right: 24, top: 22, bottom: 42 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const x = (index) => padding.left + (data.length === 1 ? chartWidth / 2 : index / (data.length - 1) * chartWidth);
  const y = (score) => padding.top + (100 - score) / 100 * chartHeight;
  const points = data.map((entry, index) => [x(index), y(entry.score)]);
  const line = points.map((point, index) => `${index ? "L" : "M"}${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(" ");
  const area = `${line} L${points.at(-1)[0].toFixed(1)},${(padding.top + chartHeight).toFixed(1)} L${points[0][0].toFixed(1)},${(padding.top + chartHeight).toFixed(1)} Z`;
  const labelEvery = Math.max(1, Math.ceil(data.length / (compact ? 4 : 6)));
  const grids = [0, 25, 50, 75, 100].map((value) => `<line class="frontier-grid" x1="${padding.left}" y1="${y(value)}" x2="${width - padding.right}" y2="${y(value)}"></line><text class="frontier-axis-label" x="${padding.left - 9}" y="${y(value) + 3}" text-anchor="end">${value}</text>`).join("");
  const xLabels = data.map((entry, index) => (index % labelEvery === 0 || index === data.length - 1) ? `<text class="frontier-axis-label" x="${x(index)}" y="${height - 14}" text-anchor="middle">${escapeHtml(entry.period)}</text>` : "").join("");
  const circles = data.map((entry, index) => `<circle class="frontier-point ${index === data.length - 1 ? "frontier-point-latest" : ""}" cx="${x(index)}" cy="${y(entry.score)}" r="4"><title>${escapeHtml(entry.period)} · ${escapeHtml(entry.model_name)} · ${entry.score}</title></circle>`).join("");
  $("#frontier-chart").innerHTML = `<svg class="frontier-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(capabilityLabel)}能力前沿时间序列">${grids}<path class="frontier-area" d="${area}"></path><path class="frontier-line" d="${line}"></path>${circles}${xLabels}</svg>`;
}

function renderBoundaryCoverage(periodModels) {
  const counts = state.resultsDataset.capabilities.map((capability) => ({
    name: capability.name,
    count: periodModels.filter((model) => scoreForCapability(model, capability.name)).length,
  }));
  const max = Math.max(1, ...counts.map((entry) => entry.count));
  $("#boundary-coverage-list").innerHTML = counts.map((entry) => `<div class="boundary-coverage-row"><span title="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</span><strong>${entry.count}</strong><i><b style="width:${entry.count / max * 100}%"></b></i></div>`).join("");
}

function radarCountryOptions() {
  const counts = new Map();
  state.resultsDataset.models.forEach((model) => {
    if (!model.country || !model.release_date || !model.capability_scores.length) return;
    counts.set(model.country, (counts.get(model.country) || 0) + 1);
  });
  return [...counts].map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country, "zh-CN"));
}

function countryRadarColor(country) {
  const index = Math.max(0, radarCountryOptions().findIndex((entry) => entry.country === country));
  return radarColors[index % radarColors.length];
}

function countryFrontierAt(country, period) {
  const periods = boundaryPeriods();
  const selectedIndex = periods.indexOf(period);
  const field = boundaryPeriodField();
  const models = state.resultsDataset.models.filter((model) => {
    const modelIndex = periods.indexOf(model[field]);
    return model.country === country && modelIndex >= 0 && modelIndex <= selectedIndex && model.capability_scores.length;
  });
  const values = state.resultsDataset.capabilities.map((capability) => {
    let best = null;
    models.forEach((model) => {
      const score = scoreForCapability(model, capability.name);
      if (score && (!best || score.boundary_score > best.score)) best = { score: score.boundary_score, model: model.name };
    });
    return best;
  });
  return { country, period, values, modelCount: models.length, dimensionCount: values.filter(Boolean).length };
}

function countryScoreAt(country, period) {
  const periods = boundaryPeriods();
  const selectedIndex = periods.indexOf(period);
  const field = boundaryPeriodField();
  const models = state.resultsDataset.models.filter((model) => {
    const modelIndex = periods.indexOf(model[field]);
    return model.country === country && modelIndex >= 0 && modelIndex <= selectedIndex;
  });
  const scored = models.map((model) => ({ model, score: scoreForCapability(model, state.boundary.capability) })).filter((entry) => entry.score);
  const best = scored.slice().sort((a, b) => b.score.boundary_score - a.score.boundary_score || b.score.coverage - a.score.coverage)[0];
  const average = scored.length ? scored.reduce((sum, entry) => sum + entry.score.boundary_score, 0) / scored.length : null;
  return { models, scored, best, average };
}

function countryEvolutionSeries(country) {
  const periods = boundaryPeriods();
  const selectedIndex = periods.indexOf(state.boundary.period);
  const changes = [];
  let previous = null;
  periods.slice(0, selectedIndex + 1).forEach((period) => {
    const frontier = countryFrontierAt(country, period);
    const signature = frontier.values.map((entry) => entry?.score ?? null).join("|");
    if (frontier.dimensionCount >= 3 && signature !== previous) {
      changes.push({ ...frontier, label: periodLabel(period) });
      previous = signature;
    }
  });
  return changes.slice(-4).map((entry, index, items) => ({ ...entry, color: radarColors[(index + 4 - items.length) % radarColors.length] }));
}

function initCountryRadar() {
  const options = radarCountryOptions();
  const preferred = ["中国", "美国", "法国"].filter((country) => options.some((entry) => entry.country === country));
  state.boundary.radarCountries = [...new Set([...preferred, ...options.map((entry) => entry.country)])].slice(0, 3);
  state.boundary.radarCountry = preferred[0] || options[0]?.country || "";
}

function renderCountryRadarControls() {
  const options = radarCountryOptions();
  const compare = state.boundary.radarMode === "compare";
  $("#radar-country-list").hidden = !compare;
  $("#radar-country-select-wrap").hidden = compare;
  $("#radar-country-list").innerHTML = `<legend>对比国家 <small>最多 4 个</small></legend>${options.map((entry) => {
    const checked = state.boundary.radarCountries.includes(entry.country) ? " checked" : "";
    return `<label><input type="checkbox" value="${escapeHtml(entry.country)}"${checked}><i style="--radar-color:${countryRadarColor(entry.country)}"></i><span>${escapeHtml(entry.country)}</span><small>${entry.count} 个模型</small></label>`;
  }).join("")}`;
  $("#radar-country-select").innerHTML = options.map((entry) => `<option value="${escapeHtml(entry.country)}">${escapeHtml(entry.country)} · ${entry.count} 个模型</option>`).join("");
  $("#radar-country-select").value = state.boundary.radarCountry;
}

function radarPoint(index, value, radius, centerX, centerY) {
  const angle = -Math.PI / 2 + index * Math.PI * 2 / state.resultsDataset.capabilities.length;
  const distance = radius * value / 100;
  return [centerX + Math.cos(angle) * distance, centerY + Math.sin(angle) * distance];
}

function renderRadarSvg(series) {
  if (!series.length || series.every((entry) => entry.dimensionCount < 3)) {
    $("#country-radar-chart").innerHTML = '<div class="radar-empty">所选国家在该时期暂无足够的分维度结果</div>';
    return;
  }
  const compact = window.innerWidth <= 760;
  const width = compact ? 360 : 620; const height = compact ? 350 : 430;
  const centerX = width / 2; const centerY = compact ? 168 : 210; const radius = compact ? 100 : 150;
  const count = state.resultsDataset.capabilities.length;
  const polygon = (level) => Array.from({ length: count }, (_, index) => radarPoint(index, level, radius, centerX, centerY).map((value) => value.toFixed(1)).join(",")).join(" ");
  const grids = [25, 50, 75, 100].map((level) => `<polygon class="radar-grid" points="${polygon(level)}"></polygon><text class="radar-scale" x="${centerX + 5}" y="${centerY - radius * level / 100 + 11}">${level}</text>`).join("");
  const axes = state.resultsDataset.capabilities.map((capability, index) => {
    const [x, y] = radarPoint(index, 100, radius, centerX, centerY);
    const [labelX, labelY] = radarPoint(index, 122, radius, centerX, centerY);
    const anchor = labelX < centerX - 8 ? "end" : labelX > centerX + 8 ? "start" : "middle";
    const label = compact ? radarCompactLabels[capability.name] : capability.name;
    return `<line class="radar-axis" x1="${centerX}" y1="${centerY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"></line><text class="radar-axis-text" x="${labelX.toFixed(1)}" y="${(labelY + 4).toFixed(1)}" text-anchor="${anchor}">${escapeHtml(label)}</text>`;
  }).join("");
  const shapes = series.map((entry) => {
    const points = entry.values.map((value, index) => radarPoint(index, value?.score ?? 0, radius, centerX, centerY).map((coordinate) => coordinate.toFixed(1)).join(",")).join(" ");
    const incomplete = entry.dimensionCount < count ? " radar-series-incomplete" : "";
    const markers = entry.values.map((value, index) => {
      if (!value) return "";
      const [x, y] = radarPoint(index, value.score, radius, centerX, centerY);
      return `<circle class="radar-marker" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" style="--radar-color:${entry.color}"><title>${escapeHtml(entry.label)} · ${escapeHtml(state.resultsDataset.capabilities[index].name)} · ${value.score} · ${escapeHtml(value.model)}</title></circle>`;
    }).join("");
    return `<polygon class="radar-series${incomplete}" points="${points}" style="--radar-color:${entry.color}"><title>${escapeHtml(entry.label)} · 覆盖 ${entry.dimensionCount}/6 个维度</title></polygon>${markers}`;
  }).join("");
  $("#country-radar-chart").innerHTML = `<svg class="radar-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="六维国家能力边界雷达图">${grids}${axes}${shapes}</svg>`;
}

function renderCountryRadar() {
  renderCountryRadarControls();
  let series;
  if (state.boundary.radarMode === "compare") {
    series = state.boundary.radarCountries.map((country) => ({
      ...countryFrontierAt(country, state.boundary.period), label: country, color: countryRadarColor(country),
    }));
    $("#radar-note").textContent = `截至 ${periodLabel(state.boundary.period)}，取各国模型在每个维度的历史最高边界值。虚线或中心缺口表示缺失，不代表 0 分。`;
  } else {
    series = countryEvolutionSeries(state.boundary.radarCountry);
    $("#radar-note").textContent = `${state.boundary.radarCountry || "所选国家"}截至 ${periodLabel(state.boundary.period)} 最近四个发生变化的前沿节点。虚线或中心缺口表示缺失，不代表 0 分。`;
  }
  renderRadarSvg(series);
  $("#radar-legend").innerHTML = series.map((entry) => `<div><i style="--radar-color:${entry.color}"></i><strong>${escapeHtml(entry.label)}</strong><span>${entry.dimensionCount}/6 维 · ${entry.modelCount} 个模型</span></div>`).join("");
}

function capabilityProfile(model) {
  return state.resultsDataset.capabilities.map((capability) => {
    const score = scoreForCapability(model, capability.name);
    return `<span class="profile-segment ${score ? "has-score" : ""}" style="--score:${score?.boundary_score || 0}" title="${escapeHtml(capability.name)}：${score ? score.boundary_score : "未覆盖"}">${capabilityShort[capability.name]}</span>`;
  }).join("");
}

function renderBoundaryTable(periodModels) {
  const ranked = periodModels
    .map((model) => ({ model, score: scoreForCapability(model, state.boundary.capability) }))
    .filter((entry) => entry.score)
    .sort((a, b) => b.score.boundary_score - a.score.boundary_score || b.score.confidence - a.score.confidence || a.model.name.localeCompare(b.model.name, "zh-CN"));
  $("#boundary-rows").innerHTML = ranked.map(({ model, score }, index) => `
    <tr>
      <td class="boundary-rank">${index + 1}</td>
      <td class="boundary-model-cell"><button type="button" class="boundary-model-button" data-boundary-model="${model.id}">${escapeHtml(model.name)}</button><small>${escapeHtml(model.organization || "机构未记录")}${model.country ? ` · ${escapeHtml(model.country)}` : ""}</small></td>
      <td>${formatReleaseDate(model.release_date)}<small class="date-confidence">${escapeHtml(model.release_date_confidence)}</small></td>
      <td><span class="boundary-value">${roundNumber(score.boundary_score)}<small>/100</small></span></td>
      <td><span class="coverage-meter"><i><b style="width:${score.coverage * 100}%"></b></i><span>${Math.round(score.coverage * 100)}%</span></span></td>
      <td><span class="confidence-label">${Math.round(score.confidence)}%</span></td>
      <td><div class="profile-strip">${capabilityProfile(model)}</div></td>
      <td class="action-cell"><button class="row-open" type="button" data-boundary-model="${model.id}" aria-label="查看 ${escapeHtml(model.name)} 能力详情">→</button></td>
    </tr>
  `).join("");
  $("#boundary-empty").hidden = ranked.length !== 0;
  $("#boundary-result-count").textContent = `${ranked.length} 个可比较模型`;
  $("#boundary-period-summary").textContent = periodLabel(state.boundary.period);
}

function renderCountryScoreStrip(periodModels) {
  const labels = [
    { key: "中国", label: "中国", tone: "cn" },
    { key: "美国", label: "美国", tone: "us" },
  ];
  const capabilityLabel = state.boundary.capability === "overall" ? "综合能力" : state.boundary.capability;
  const scoreFor = (country) => countryScoreAt(country, state.boundary.period);
  const values = labels.map((entry) => ({ ...entry, ...scoreFor(entry.key) }));
  const cn = values[0].best?.score.boundary_score;
  const us = values[1].best?.score.boundary_score;
  const gap = cn !== undefined && us !== undefined ? us - cn : null;
  $("#country-score-period").textContent = `${periodLabel(state.boundary.period)} · ${capabilityLabel}`;
  $("#country-score-strip").innerHTML = `${values.map((entry) => `<article class="country-score-card ${entry.tone}"><div><span>${entry.label}</span><small>${entry.scored.length} 个可比模型 / ${entry.models.length} 个模型</small></div><strong>${entry.best ? roundNumber(entry.best.score.boundary_score) : "—"}<small>/100</small></strong><p>${entry.best ? `前沿模型：${escapeHtml(entry.best.model.name)}` : "截至该期暂无至少 3 维结果"}</p><footer>${entry.average === null ? "平均值：—" : `截至该期平均：${roundNumber(entry.average)}`} · 维度覆盖 ${entry.best ? `${entry.best.score.observed_dimensions || 1}/${entry.best.score.total_dimensions || 6}` : "—"}</footer></article>`).join("")}<article class="country-score-card gap"><div><span>美国 − 中国</span><small>最高边界差值</small></div><strong>${gap === null ? "—" : `${gap > 0 ? "+" : ""}${roundNumber(gap)}`}<small>分</small></strong><p>${gap === null ? "需要两国在当前切片都有可用结果" : gap > 0 ? "当前切片美国前沿更高" : gap < 0 ? "当前切片中国前沿更高" : "当前切片两国前沿相同"}</p><footer>差值只比较同一时间与同一能力口径</footer></article>`;
}

function renderBoundary() {
  const periodModels = boundaryModelsForPeriod();
  renderTimeline();
  renderBoundaryCoverage(boundaryModelsForPeriod(false));
  renderCountryScoreStrip(boundaryModelsForPeriod(false));
  renderCountryRadar();
  renderBoundaryTable(periodModels);
}

function renderBoundaryStats() {
  const { stats } = state.resultsDataset;
  $("#boundary-model-count").textContent = stats.models;
  $("#boundary-observation-count").textContent = stats.observations;
  $("#boundary-source-count").textContent = stats.source_files;
  $("#boundary-date-rate").textContent = `${Math.round(stats.models_with_release_date / stats.models * 100)}%`;
  $("#boundary-date-count").textContent = `${stats.models_with_release_date} 个有发布日期`;
}

function renderBoundarySources() {
  const methodLabels = {
    official_public_api: "官方 API",
    official_versioned_frontend_data: "官方版本化数据",
    official_monthly_xlsx: "官方月度 Excel",
  };
  const verifiedLabels = {
    verified_primary: "一手已核验",
    source_documented: "来源已记录",
  };
  $("#boundary-source-links").innerHTML = state.resultsDataset.sources.map((source) => {
    const sourceLink = source.url
      ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.label)}</a>`
      : `<strong>${escapeHtml(source.label)}</strong>`;
    const downloadLink = source.download_url
      ? `<a class="source-download" href="${escapeHtml(source.download_url)}" target="_blank" rel="noreferrer">官方文件</a>`
      : "";
    const method = methodLabels[source.fetch_method] || "留存快照";
    const status = verifiedLabels[source.verification] || source.verification;
    return `<article>${sourceLink}<span>${escapeHtml(source.publisher || "发布方未记录")}</span><small>${escapeHtml(method)} · ${escapeHtml(status)}${source.snapshot ? ` · ${escapeHtml(source.snapshot)}` : ""}</small>${downloadLink}</article>`;
  }).join("");
}

function initBoundary() {
  renderBoundaryStats();
  renderBoundarySources();
  $("#results-updated").textContent = `${formatResultUpdateTime(state.resultsDataset.meta.generated_at)} · ${state.resultsDataset.stats.source_files} 个来源`;
  $("#boundary-capability").innerHTML = `<option value="overall">综合能力</option>${state.resultsDataset.capabilities.map((capability) => `<option value="${escapeHtml(capability.name)}">${escapeHtml(capability.name)}</option>`).join("")}`;
  populateBoundaryPeriods();
  initCountryRadar();
  renderBoundary();
}

const updatePhaseLabels = {
  starting: "准备中", remote: "抓取官方源", benchmarks: "更新目录", results: "更新结果", static: "生成页面",
  completed: "更新完成", failed: "更新失败", idle: "更新数据",
};

function renderUpdateStatus(payload) {
  const button = $("#update-button");
  if (!payload.can_update) {
    button.hidden = true;
    return;
  }
  button.hidden = false;
  const running = payload.status === "running";
  button.disabled = running;
  button.classList.toggle("is-running", running);
  $(".update-label", button).textContent = updatePhaseLabels[payload.phase] || "更新数据";
  if (running) {
    state.updateObservedRunning = true;
    setDataState(payload.message || "正在更新数据");
  } else if (payload.status === "failed") {
    setDataState(payload.error || payload.message || "更新失败", true);
    $(".update-label", button).textContent = "重新更新";
  } else if (payload.status === "completed" && state.updateObservedRunning) {
    setDataState(payload.message || "更新完成");
    window.setTimeout(() => window.location.reload(), 700);
  } else if (payload.status === "completed") {
    $(".update-label", button).textContent = "更新数据";
  }
}

async function readUpdateStatus() {
  if (state.staticOnly) throw new Error("静态部署不支持更新功能");
  const response = await fetch(appUrl("/api/update/status"), { cache: "no-store" });
  if (!response.ok) throw new Error(`更新状态请求失败：${response.status}`);
  return response.json();
}

async function pollUpdateStatus() {
  try {
    const payload = await readUpdateStatus();
    renderUpdateStatus(payload);
    if (payload.status === "running") window.setTimeout(pollUpdateStatus, 1200);
  } catch (error) {
    if (state.updateObservedRunning) window.setTimeout(pollUpdateStatus, 1800);
    else $("#update-button").hidden = true;
  }
}

async function initUpdateControl() {
  if (state.staticOnly) {
    $("#update-button").hidden = false;
    $("#update-button").disabled = false;
    $(".update-label", $("#update-button")).textContent = "检查数据更新";
    return;
  }
  try {
    const payload = await readUpdateStatus();
    renderUpdateStatus(payload);
    if (payload.status === "running") window.setTimeout(pollUpdateStatus, 1000);
  } catch {
    $("#update-button").hidden = true;
  }
}

async function requestDataUpdate() {
  if (state.staticOnly) {
    const button = $("#update-button");
    button.disabled = true;
    button.classList.add("is-running");
    $(".update-label", button).textContent = "检查中";
    setDataState("正在检查数据源");
    try {
      const stamp = state.standardsDataset?.meta?.generated_at || "";
      const responses = await Promise.all(["data/benchmarks.json", "data/results.json", "data/benchmark_catalog.json"].map((path) => fetch(appUrl(path), { cache: "no-store" })));
      if (responses.some((response) => !response.ok)) throw new Error("数据源暂时不可用");
      [state.dataset, state.resultsDataset, state.standardsDataset] = await Promise.all(responses.map((response) => response.json()));
      renderStandardFilters();
      renderStandardsSummary();
      renderStandards();
      renderStats(staticStats());
      await loadBenchmarks();
      $(".update-label", button).textContent = stamp && stamp === state.standardsDataset.meta?.generated_at ? "已是最新" : "已刷新";
      setDataState(stamp && stamp === state.standardsDataset.meta?.generated_at ? "数据已是最新" : "数据已刷新");
    } catch (error) {
      setDataState(error.message || "检查失败", true);
      $(".update-label", button).textContent = "重试检查";
    } finally {
      button.disabled = false;
      button.classList.remove("is-running");
    }
    return;
  }
  if (state.staticOnly) { setDataState("静态部署不支持数据更新", true); return; }
  const button = $("#update-button");
  button.disabled = true;
  button.classList.add("is-running");
  $(".update-label", button).textContent = "准备中";
  setDataState("正在准备更新");
  try {
    const response = await fetch(appUrl("/api/update"), {
      method: "POST",
      headers: { "X-Update-Request": "benchmark-ledger" },
    });
    const payload = await response.json();
    if (!response.ok && response.status !== 409) throw new Error(payload.error || `更新请求失败：${response.status}`);
    state.updateObservedRunning = true;
    renderUpdateStatus(payload);
    window.setTimeout(pollUpdateStatus, 900);
  } catch (error) {
    button.disabled = false;
    button.classList.remove("is-running");
    $(".update-label", button).textContent = "重新更新";
    setDataState(error.message, true);
  }
}

function modelRadarSvg(model) {
  const capabilities = state.resultsDataset.capabilities;
  const values = capabilities.map((capability) => scoreForCapability(model, capability.name));
  const dimensionCount = values.filter(Boolean).length;
  if (!dimensionCount) return '<div class="radar-empty model-radar-empty">该模型暂无分维度能力结果</div>';
  const width = 500; const height = 360; const centerX = 250; const centerY = 168; const radius = 105;
  const polygon = (level) => capabilities.map((_, index) => radarPoint(index, level, radius, centerX, centerY).map((value) => value.toFixed(1)).join(",")).join(" ");
  const grids = [25, 50, 75, 100].map((level) => `<polygon class="radar-grid" points="${polygon(level)}"></polygon><text class="radar-scale" x="${centerX + 4}" y="${centerY - radius * level / 100 + 10}">${level}</text>`).join("");
  const axes = capabilities.map((capability, index) => {
    const [x, y] = radarPoint(index, 100, radius, centerX, centerY);
    const [labelX, labelY] = radarPoint(index, 132, radius, centerX, centerY);
    const anchor = labelX < centerX - 8 ? "end" : labelX > centerX + 8 ? "start" : "middle";
    return `<line class="radar-axis" x1="${centerX}" y1="${centerY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"></line><text class="radar-axis-text" x="${labelX.toFixed(1)}" y="${(labelY + 4).toFixed(1)}" text-anchor="${anchor}">${escapeHtml(radarCompactLabels[capability.name])}</text>`;
  }).join("");
  const points = values.map((score, index) => radarPoint(index, score?.boundary_score ?? 0, radius, centerX, centerY).map((value) => value.toFixed(1)).join(",")).join(" ");
  const incomplete = dimensionCount < capabilities.length ? " radar-series-incomplete" : "";
  const markers = values.map((score, index) => {
    if (!score) return "";
    const [x, y] = radarPoint(index, score.boundary_score, radius, centerX, centerY);
    return `<circle class="radar-marker" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" style="--radar-color:${radarColors[0]}"><title>${escapeHtml(capabilities[index].name)} · ${score.boundary_score} · 覆盖 ${Math.round(score.coverage * 100)}% · 可信度 ${Math.round(score.confidence)}%</title></circle>`;
  }).join("");
  return `<svg class="model-radar-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(model.name)} 六维能力雷达图">${grids}${axes}<polygon class="radar-series${incomplete}" points="${points}" style="--radar-color:${radarColors[0]}"><title>${escapeHtml(model.name)} · 覆盖 ${dimensionCount}/6 个维度</title></polygon>${markers}</svg>`;
}

function openBoundaryModel(id) {
  const model = state.resultsDataset.models.find((entry) => entry.id === id);
  if (!model) return;
  const drawer = $("#detail-drawer");
  $("#detail-drawer .drawer-kicker").textContent = "MODEL CAPABILITY RECORD";
  $("#detail-title").textContent = model.name;
  $("#drawer-overlay").hidden = false;
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  const sourceById = new Map((state.resultsDataset.sources || []).map((source) => [source.id, source]));
  const overall = scoreForCapability(model, "overall");
  const modelScoreCount = (model.capability_scores || []).length;
  const scoreItems = state.resultsDataset.capabilities.map((capability) => {
    const score = scoreForCapability(model, capability.name);
    return `<div class="boundary-score-item"><span>${escapeHtml(capability.name)}</span><strong>${score ? roundNumber(score.boundary_score) : "—"}</strong><small>${score ? `覆盖 ${Math.round(score.coverage * 100)}% · 可信度 ${Math.round(score.confidence)}%` : "暂无直接评测"}</small></div>`;
  }).join("");
  const observations = (model.observations || []).slice().sort((a, b) => String(a.capability || "").localeCompare(String(b.capability || ""), "zh-CN") || String(a.metric_label || "").localeCompare(String(b.metric_label || ""), "zh-CN"));
  $("#drawer-content").innerHTML = `
    <div class="detail-score"><span class="boundary-value">${overall ? roundNumber(overall.boundary_score) : "—"}<small>/100</small></span><strong>${overall ? "综合能力边界" : "单维结果"}</strong><span>${overall ? `维度覆盖 ${overall.observed_dimensions}/${overall.total_dimensions}` : "暂无综合分"}</span></div>
    <div class="detail-grid">
      ${detailsField("机构", model.organization)}${detailsField("国家 / 地区", model.country)}
      ${detailsField("公开发布日期", formatReleaseDate(model.release_date))}${detailsField("日期可信度", model.release_date_confidence)}
      ${detailsField("国家口径", model.country_source)}${detailsField("日期来源", model.release_date_source)}
      ${detailsField("结果观测", String(observations.length))}${detailsField("覆盖维度", String(modelScoreCount))}
    </div>
    <section class="drawer-section"><h3>六维能力雷达 · ${modelScoreCount}/6</h3><div class="model-radar-chart">${modelRadarSvg(model)}</div><p class="model-radar-note">综合分为已有能力维度的算术平均；缺失维度不按 0 分补齐，维度覆盖度单独显示。</p><div class="boundary-score-grid">${scoreItems}</div></section>
    <section class="drawer-section"><h3>原始评测观测 · ${observations.length}</h3><div class="observation-table-wrap"><table class="observation-table"><thead><tr><th>指标</th><th>能力</th><th>原始分</th><th>标准化</th><th>来源定位</th></tr></thead><tbody>${observations.map((observation) => {
      const source = sourceById.get(observation.source_id);
      return `<tr><td>${escapeHtml(observation.metric_label)}</td><td>${escapeHtml(observation.capability)}</td><td>${escapeHtml(observation.score_display)}</td><td>${roundNumber(observation.normalized_score)}</td><td>${escapeHtml(source?.label || observation.source_id)}<small>${escapeHtml(observation.source_sheet)} · 第 ${observation.source_row} 行</small></td></tr>`;
    }).join("")}</tbody></table></div></section>
  `;
}

function roundNumber(value) {
  return Number(value).toFixed(1).replace(/\.0$/, "");
}

function setView(view) {
  const aliases = { catalog: "standards", map: "boundary" };
  const nextView = aliases[view] || (["standards", "boundary", "method"].includes(view) ? view : "standards");
  state.currentView = nextView;
  $$("[data-view-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.viewPanel === nextView));
  $$("[data-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.view === nextView));
  history.replaceState(null, "", `#${nextView}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function exportCsv() {
  if (state.currentView === "standards") {
    exportStandardsCsv();
    return;
  }
  if (state.currentView === "boundary") {
    exportBoundaryCsv();
    return;
  }
  const columns = [
    "name", "ai_type", "evaluation_scope", "primary_capability", "capabilities", "source_primary_capability", "secondary_capability", "language",
    "score_direction", "evidence_tier", "authority_score", "traceability_status",
    "current_updated", "freshness_status", "reference_value", "notes",
  ];
  const rows = staticFilteredItems(buildParams(false));
  const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [columns, ...rows.map((item) => columns.map((column) => column === "capabilities" ? itemCapabilities(item).join(" / ") : item[column]))]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "benchmark-ledger.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function exportStandardsCsv() {
  const columns = ["name", "source_url", "ai_type", "primary_capability", "secondary_capability", "current_updated", "next_updated", "update_frequency", "evaluation_logic", "data_type", "language", "reference_value", "github_url", "paper_title", "authors", "publisher", "origin_country", "record_status"];
  const rows = state.standardsFiltered?.length ? state.standardsFiltered : state.standardsDataset?.records || [];
  const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [columns, ...rows.map((item) => columns.map((column) => item[column]))].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "benchmark-standard-library.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function exportBoundaryCsv() {
  const capabilityNames = state.resultsDataset.capabilities.map((entry) => entry.name);
  const columns = [
    "name", "organization", "country", "release_date", "release_date_confidence", "overall_score", "overall_coverage",
    ...capabilityNames, "observation_count",
  ];
  const rows = boundaryModelsForPeriod().filter((model) => scoreForCapability(model, state.boundary.capability));
  const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const values = rows.map((model) => [
    model.name, model.organization, model.country, model.release_date, model.release_date_confidence,
    scoreForCapability(model, "overall")?.boundary_score ?? "", Math.round((scoreForCapability(model, "overall")?.coverage || 0) * 100),
    ...capabilityNames.map((capability) => scoreForCapability(model, capability)?.boundary_score ?? ""),
    model.observations.length,
  ]);
  const csv = [columns, ...values].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `capability-boundary-${state.boundary.period || "all"}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function bindEvents() {
  let searchTimer;
  $("#search-input").addEventListener("input", (event) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.filters.search = event.target.value.trim(); state.page = 1; loadBenchmarks(); }, 250);
  });
  [["#type-filter", "type"], ["#evidence-filter", "evidence"], ["#language-filter", "language"], ["#sort-filter", "sort"]].forEach(([selector, key]) => {
    $(selector).addEventListener("change", (event) => { state.filters[key] = event.target.value; state.page = 1; loadBenchmarks(); });
  });
  $("#traceable-only").addEventListener("change", (event) => { state.filters.traceable = event.target.checked ? "1" : ""; state.page = 1; loadBenchmarks(); });
  $("#clear-capability").addEventListener("click", () => { state.filters.capability = ""; $$(".facet-button").forEach((button) => button.classList.remove("is-active")); state.page = 1; loadBenchmarks(); });
  $("#reset-filters").addEventListener("click", () => {
    state.filters = { search: "", type: "", capability: "", language: "", evidence: "", freshness: "", sort: "authority", traceable: "" };
    $("#search-input").value = ""; $("#type-filter").value = ""; $("#evidence-filter").value = ""; $("#language-filter").value = ""; $("#sort-filter").value = "authority"; $("#traceable-only").checked = false;
    $$(".facet-button").forEach((button) => button.classList.remove("is-active")); state.page = 1; loadBenchmarks();
  });
  $("#prev-page").addEventListener("click", () => { if (state.page > 1) { state.page -= 1; loadBenchmarks(); } });
  $("#next-page").addEventListener("click", () => { if (state.page < state.pages) { state.page += 1; loadBenchmarks(); } });
  $("#benchmark-rows").addEventListener("click", async (event) => {
    const open = event.target.closest("[data-open]");
    if (open) { openDetails(open.dataset.open); return; }
    const checkbox = event.target.closest(".row-select");
    if (!checkbox) return;
    const id = checkbox.closest("tr").dataset.id;
    const item = await api(`/api/benchmarks/${encodeURIComponent(id)}`);
    if (!toggleSelected(item, checkbox.checked)) checkbox.checked = false;
  });
  $("#close-drawer").addEventListener("click", closeDetails); $("#drawer-overlay").addEventListener("click", closeDetails);
  $("#clear-compare").addEventListener("click", () => { state.selected.clear(); $$(".row-select").forEach((input) => { input.checked = false; }); updateCompareBar(); });
  $("#open-compare").addEventListener("click", openCompare); $("#close-compare").addEventListener("click", () => $("#compare-dialog").close());
  $("#export-button").addEventListener("click", exportCsv);
  $("#update-button").addEventListener("click", requestDataUpdate);
  $("#standards-search").addEventListener("input", (event) => { state.standardFilters.search = event.target.value.trim(); renderStandards(); });
  [["#standards-country-filter", "country"], ["#standards-type-filter", "type"], ["#standards-capability-filter", "capability"], ["#standards-update-filter", "update"]].forEach(([selector, key]) => {
    $(selector).addEventListener("change", (event) => { state.standardFilters[key] = event.target.value; renderStandards(); });
  });
  $("#standards-reset").addEventListener("click", () => {
    state.standardFilters = { search: "", country: "", type: "", capability: "", update: "" };
    $("#standards-search").value = "";
    ["#standards-country-filter", "#standards-type-filter", "#standards-capability-filter", "#standards-update-filter"].forEach((selector) => { $(selector).value = ""; });
    renderStandards();
  });
  $("#standards-rows").addEventListener("click", (event) => { const button = event.target.closest("[data-standard-open]"); if (button) openStandardDetails(button.dataset.standardOpen); });
  $("#boundary-grain").addEventListener("click", (event) => {
    const button = event.target.closest("[data-grain]");
    if (!button || button.dataset.grain === state.boundary.grain) return;
    state.boundary.grain = button.dataset.grain;
    $$("[data-grain]", $("#boundary-grain")).forEach((item) => item.classList.toggle("is-active", item === button));
    populateBoundaryPeriods();
    renderBoundary();
  });
  $("#boundary-capability").addEventListener("change", (event) => { state.boundary.capability = event.target.value; renderBoundary(); });
  $("#boundary-period").addEventListener("change", (event) => { state.boundary.period = event.target.value; renderBoundary(); });
  $("#boundary-search").addEventListener("input", (event) => { state.boundary.search = event.target.value.trim(); renderBoundary(); });
  $("#radar-mode").addEventListener("click", (event) => {
    const button = event.target.closest("[data-radar-mode]");
    if (!button || button.dataset.radarMode === state.boundary.radarMode) return;
    state.boundary.radarMode = button.dataset.radarMode;
    $$('[data-radar-mode]', $("#radar-mode")).forEach((item) => item.classList.toggle("is-active", item === button));
    renderCountryRadar();
  });
  $("#radar-country-select").addEventListener("change", (event) => { state.boundary.radarCountry = event.target.value; renderCountryRadar(); });
  $("#radar-country-list").addEventListener("change", (event) => {
    const input = event.target.closest('input[type="checkbox"]');
    if (!input) return;
    const selected = new Set(state.boundary.radarCountries);
    if (input.checked && selected.size >= 4) { input.checked = false; $("#radar-note").textContent = "最多同时比较 4 个国家。"; return; }
    if (input.checked) selected.add(input.value); else selected.delete(input.value);
    if (!selected.size) { input.checked = true; return; }
    state.boundary.radarCountries = [...selected];
    renderCountryRadar();
  });
  $("#boundary-rows").addEventListener("click", (event) => { const button = event.target.closest("[data-boundary-model]"); if (button) openBoundaryModel(button.dataset.boundaryModel); });
  $$("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  $$("[data-view-jump]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.viewJump)));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && $("#detail-drawer").classList.contains("is-open")) closeDetails(); });
}

async function init() {
  bindEvents();
  const legacyView = { catalog: "standards", map: "boundary" };
  const requestedView = location.hash.slice(1);
  const initialView = legacyView[requestedView] || (["standards", "boundary", "method"].includes(requestedView) ? requestedView : "standards");
  setView(initialView);
  try {
    const embeddedDataset = $("#benchmark-data");
    if (embeddedDataset) {
      state.dataset = JSON.parse(embeddedDataset.textContent);
      state.resultsDataset = JSON.parse($("#benchmark-results-data").textContent);
      state.standardsDataset = JSON.parse($("#benchmark-catalog-data").textContent);
      state.staticOnly = true;
      state.backendAvailable = false;
    } else {
      const fetchOptions = { cache: "no-store" };
      const [datasetResponse, resultsResponse, standardsResponse] = await Promise.all([fetch(appUrl("data/benchmarks.json"), fetchOptions), fetch(appUrl("data/results.json"), fetchOptions), fetch(appUrl("data/benchmark_catalog.json"), fetchOptions)]);
      if (!datasetResponse.ok || !resultsResponse.ok || !standardsResponse.ok) throw new Error(`数据载入失败：${datasetResponse.status} / ${resultsResponse.status} / ${standardsResponse.status}`);
      [state.dataset, state.resultsDataset, state.standardsDataset] = await Promise.all([datasetResponse.json(), resultsResponse.json(), standardsResponse.json()]);
      state.staticOnly = true;
      state.backendAvailable = false;
    }
    const [stats, facets] = await Promise.all([api("/api/stats"), api("/api/facets")]);
    renderStats(stats);
    renderFacets(facets);
    renderStandardFilters();
    renderStandardsSummary();
    renderStandards();
    initBoundary();
    await initUpdateControl();
    await loadBenchmarks();
    setDataState("数据已载入");
  } catch (error) {
    setDataState("载入失败", true);
    $("#benchmark-rows").innerHTML = `<tr><td colspan="8" class="loading-row">${escapeHtml(error.message)}</td></tr>`;
  }
}

init();
