const GERADOR_STORAGE_KEY = "gerador-app-state-v1";
const GERADOR_ACTIVE_TAB_KEY = "gerador-active-tab-v1";
let geradorActiveTab = "visao-geral";
let geradorDashboardIndex = 0;
let geradorState = null;
let geradorFeedbackTimeout = null;
let geradorEditingName = "";

function normalizeText(value) {
    return String(value || "").trim();
}

function getNumericValue(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    const normalized = normalizeText(value).replace(",", ".");
    if (!normalized) {
        return null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function roundNumber(value, decimals = 2) {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

function formatNumber(value, decimals = 2) {
    const numeric = getNumericValue(value);
    if (numeric === null) {
        return "";
    }
    return roundNumber(numeric, decimals).toFixed(decimals).replace(/\.?0+$/, "");
}

function formatHourReading(value, mode = "short") {
    const numeric = getNumericValue(value);
    if (numeric === null) {
        return "";
    }
    const totalMinutes = Math.round(numeric * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (mode === "long") {
        if (!hours) {
            return `${minutes} minuto${minutes === 1 ? "" : "s"}`;
        }
        if (!minutes) {
            return `${hours} hora${hours === 1 ? "" : "s"}`;
        }
        return `${hours} hora${hours === 1 ? "" : "s"} e ${minutes} minuto${minutes === 1 ? "" : "s"}`;
    }
    if (!hours) {
        return `${minutes}min`;
    }
    if (!minutes) {
        return `${hours}h`;
    }
    return `${hours}h ${minutes}min`;
}

function padNumber(value) {
    return String(value).padStart(2, "0");
}

function excelSerialToDate(serial) {
    const numeric = getNumericValue(serial);
    if (numeric === null) {
        return null;
    }
    const utcValue = Date.UTC(1899, 11, 30) + numeric * 86400000;
    const date = new Date(utcValue);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return "";
    }
    return `${padNumber(date.getDate())}/${padNumber(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function formatDateInput(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return "";
    }
    return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function formatTime(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return "";
    }
    return `${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`;
}

function formatDateTime(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return "";
    }
    return `${formatDate(date)} ${formatTime(date)}`;
}

function parseDateValue(value) {
    const text = normalizeText(value);
    if (!text) {
        return null;
    }
    const numeric = getNumericValue(text);
    if (numeric !== null && numeric > 20000) {
        return excelSerialToDate(numeric);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        return new Date(`${text}T12:00:00`);
    }
    const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) {
        return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12, 0, 0, 0);
    }
    return null;
}

function parseDateTimeValue(value) {
    const text = normalizeText(value);
    if (!text) {
        return null;
    }
    const numeric = getNumericValue(text);
    if (numeric !== null && numeric > 1) {
        return excelSerialToDate(numeric);
    }
    const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/);
    if (match) {
        return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4]), Number(match[5]), 0, 0);
    }
    return parseDateValue(text);
}

function normalizeDateDisplay(value) {
    const date = parseDateValue(value);
    return date ? formatDate(date) : normalizeText(value);
}

function normalizeTimeDisplay(value) {
    const text = normalizeText(value);
    if (!text) {
        return "";
    }
    const numeric = getNumericValue(text);
    if (numeric !== null && (numeric > 1 || (numeric >= 0 && numeric < 1))) {
        return formatTime(excelSerialToDate(numeric));
    }
    const match = text.match(/(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : text;
}

function normalizeDateTimeDisplay(value) {
    const date = parseDateTimeValue(value);
    return date ? formatDateTime(date) : normalizeText(value);
}

function parseDisplayDateTime(dateText, timeText = "00:00") {
    const date = parseDateValue(dateText);
    if (!date) {
        return null;
    }
    const time = normalizeTimeDisplay(timeText) || "00:00";
    const [hours, minutes] = time.split(":").map(Number);
    date.setHours(hours || 0, minutes || 0, 0, 0);
    return date;
}

function getTodayInputValue() {
    return formatDateInput(new Date());
}

function toDisplayDateFromInput(value) {
    return value ? normalizeDateDisplay(value) : "";
}
function getGeneratorNames(state) {
    const names = new Set();
    (state.status || []).forEach(item => item.gerador && names.add(item.gerador));
    (state.lancamentos || []).forEach(item => item.gerador && names.add(item.gerador));
    (state.manutencoes || []).forEach(item => item.gerador && names.add(item.gerador));
    return Array.from(names).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function ensureStatusRow(state, gerador) {
    let row = state.status.find(item => item.gerador === gerador);
    if (!row) {
        row = { gerador, horimetroAtual: "" };
        state.status.push(row);
    }
    return row;
}

function ensureMaintenanceRow(state, gerador) {
    let row = state.manutencoes.find(item => item.gerador === gerador);
    if (!row) {
        row = {
            gerador,
            oleo: "",
            preventiva: "",
            intervaloOleoDias: "180",
            intervaloPreventivaHoras: "250",
            arrefecimento: "",
            intervaloArrefecimentoDias: "730",
            geral: "",
            manutencaoPreventivaDias: "180",
            realizado: ""
        };
        state.manutencoes.unshift(row);
    }
    return row;
}

function getCurrentHorimeter(state, gerador) {
    const statusRow = state.status.find(item => item.gerador === gerador);
    const directValue = getNumericValue(statusRow?.horimetroAtual);
    const latestLaunch = state.lancamentos
        .filter(item => item.gerador === gerador)
        .map(item => getNumericValue(item.horimetroFim))
        .filter(value => value !== null)
        .sort((a, b) => b - a)[0];
    if (directValue !== null && latestLaunch !== undefined) {
        return Math.max(directValue, latestLaunch);
    }
    if (latestLaunch !== undefined) {
        return latestLaunch;
    }
    return directValue;
}

function getBaseHorimeterFromSource(gerador) {
    const source = window.GERADOR_DATA?.status || [];
    const row = source.find(item => normalizeText(item.gerador) === gerador);
    const value = getNumericValue(row?.horimetroAtual);
    return value === null ? null : value;
}

function setHorimeterFieldDisplay(fieldId, numericValue) {
    const input = document.getElementById(fieldId);
    if (!input) {
        return;
    }
    if (numericValue === null || numericValue === undefined || !Number.isFinite(Number(numericValue))) {
        input.value = "";
        delete input.dataset.numericValue;
        return;
    }
    input.dataset.numericValue = formatNumber(numericValue);
    input.value = formatHourReading(numericValue, "long");
}

function getHorimeterFieldNumeric(fieldId) {
    const input = document.getElementById(fieldId);
    if (!input) {
        return null;
    }
    const datasetValue = getNumericValue(input.dataset.numericValue);
    if (datasetValue !== null) {
        return datasetValue;
    }
    return getNumericValue(input.value);
}

function recalculateGeneratorHorimeter(gerador) {
    const statusRow = ensureStatusRow(geradorState, gerador);
    const remainingLatest = geradorState.lancamentos
        .filter(item => item.gerador === gerador)
        .map(item => getNumericValue(item.horimetroFim))
        .filter(value => value !== null)
        .sort((a, b) => b - a)[0];
    const baseValue = getBaseHorimeterFromSource(gerador);
    const nextValue = remainingLatest ?? baseValue;
    statusRow.horimetroAtual = nextValue === null || nextValue === undefined ? "" : formatNumber(nextValue);
}

function formatDaysDistance(days) {
    const total = Math.max(0, Math.round(days));
    if (total >= 365) {
        const years = Math.floor(total / 365);
        const months = Math.floor((total % 365) / 30);
        const remDays = total - years * 365 - months * 30;
        const parts = [];
        if (years) {
            parts.push(`${years} ano${years === 1 ? "" : "s"}`);
        }
        if (months) {
            parts.push(`${months} mes${months === 1 ? "" : "es"}`);
        }
        if (remDays || !parts.length) {
            parts.push(`${remDays} dia${remDays === 1 ? "" : "s"}`);
        }
        return parts.join(", ").replace(/,([^,]*)$/, " e$1");
    }
    if (total >= 30) {
        const months = Math.floor(total / 30);
        const remDays = total % 30;
        if (!remDays) {
            return `${months} mes${months === 1 ? "" : "es"}`;
        }
        return `${months} mes${months === 1 ? "" : "es"} e ${remDays} dia${remDays === 1 ? "" : "s"}`;
    }
    return `${total} dia${total === 1 ? "" : "s"}`;
}

function getDateStatusInfo(baseDateValue, intervalDaysValue) {
    const baseDate = parseDateValue(baseDateValue);
    const intervalDays = getNumericValue(intervalDaysValue);
    if (!baseDate || intervalDays === null) {
        return { severity: "warning", text: "Sem registro" };
    }
    const dueDate = new Date(baseDate);
    dueDate.setDate(dueDate.getDate() + Math.round(intervalDays));
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const diffDays = Math.round((dueDate - today) / 86400000);
    if (diffDays < 0) {
        return { severity: "critical", text: `Vencida ha ${Math.abs(diffDays)} dia${Math.abs(diffDays) === 1 ? "" : "s"}` };
    }
    if (diffDays <= 15) {
        return { severity: "warning", text: `Vence em ${formatDaysDistance(diffDays)}` };
    }
    return { severity: "ok", text: `Vence em ${formatDaysDistance(diffDays)}` };
}

function getHoursStatusInfo(baseHorimeterValue, intervalHoursValue, currentHorimeter) {
    const baseHorimeter = getNumericValue(baseHorimeterValue);
    const intervalHours = getNumericValue(intervalHoursValue);
    if (baseHorimeter === null || intervalHours === null || currentHorimeter === null) {
        return { severity: "warning", text: "Sem registro" };
    }
    const remaining = roundNumber(baseHorimeter + intervalHours - currentHorimeter, 2);
    if (remaining < 0) {
        return { severity: "critical", text: `Vencida ha ${formatHourReading(Math.abs(remaining), "long")}` };
    }
    if (remaining <= 30) {
        return { severity: "warning", text: `Faltam ${formatHourReading(remaining, "long")}` };
    }
    return { severity: "ok", text: `Faltam ${formatHourReading(remaining, "long")}` };
}

function getSeverityRank(severity) {
    if (severity === "critical") {
        return 3;
    }
    if (severity === "warning") {
        return 2;
    }
    return 1;
}

function maxSeverity() {
    return Array.from(arguments).reduce((current, next) => getSeverityRank(next) > getSeverityRank(current) ? next : current, "ok");
}

function getSeverityFromText(text) {
    const value = String(text || "").toUpperCase();
    if (!value) {
        return "ok";
    }
    if (value.includes("ATRASADA") || value.includes("VENCIDA")) {
        return "critical";
    }
    if (value.includes("ALERTA") || value.includes("VENCE") || value.includes("FALTAM") || value.includes("SEM REGISTRO")) {
        return "warning";
    }
    return "ok";
}

function getStatusSeverity(item) {
    return maxSeverity(
        item.severity || "ok",
        item.severityOleo || getSeverityFromText(item.statusOleo),
        item.severityGeral || getSeverityFromText(item.statusGeralHibrido),
        item.severityArrefecimento || getSeverityFromText(item.statusArrefecimento)
    );
}

function getSeverityLabel(severity) {
    if (severity === "critical") { return "Critico"; }
    if (severity === "warning") { return "Em alerta"; }
    return "No prazo";
}

function getSeverityClass(severity) {
    if (severity === "critical") { return "status-critical"; }
    if (severity === "warning") { return "status-warning"; }
    return "status-ok";
}

function getDashboardIcon(severity) {
    if (severity === "critical") { return "✕"; }
    if (severity === "warning") { return "!"; }
    return "✓";
}
function getMainAlert(item) {
    if (item.severityOleo === "critical") { return "ATRASADA: OLEO"; }
    if (item.severityGeral === "critical") { return "ATRASADA: GERAL"; }
    if (item.severityArrefecimento === "critical") { return "ATRASADA: ARREFECIMENTO"; }
    if (item.severityOleo === "warning") { return "ALERTA: OLEO"; }
    if (item.severityGeral === "warning") { return "ALERTA: GERAL"; }
    if (item.severityArrefecimento === "warning") { return "ALERTA: ARREFECIMENTO"; }
    return "FUNCIONAMENTO NORMAL";
}

function getStatusRows(state) {
    return getGeneratorNames(state).map(gerador => {
        const maintenance = ensureMaintenanceRow(state, gerador);
        const currentHorimeter = getCurrentHorimeter(state, gerador);
        const oilStatus = getDateStatusInfo(maintenance.oleo, maintenance.intervaloOleoDias);
        const generalDateStatus = getDateStatusInfo(maintenance.geral, maintenance.manutencaoPreventivaDias);
        const generalHourStatus = getHoursStatusInfo(maintenance.preventiva, maintenance.intervaloPreventivaHoras, currentHorimeter);
        const coolingStatus = getDateStatusInfo(maintenance.arrefecimento, maintenance.intervaloArrefecimentoDias);
        const hybridGeneral = getSeverityRank(generalDateStatus.severity) >= getSeverityRank(generalHourStatus.severity) ? generalDateStatus : generalHourStatus;
        return {
            gerador,
            horimetroAtual: currentHorimeter === null ? "" : formatNumber(currentHorimeter),
            statusOleo: oilStatus.text,
            statusGeral: generalHourStatus.text,
            statusArrefecimento: coolingStatus.text,
            statusGeralHibrido: hybridGeneral.text,
            severityOleo: oilStatus.severity,
            severityGeral: hybridGeneral.severity,
            severityArrefecimento: coolingStatus.severity,
            severity: maxSeverity(oilStatus.severity, hybridGeneral.severity, coolingStatus.severity),
            manutencaoCritica: getMainAlert({
                severityOleo: oilStatus.severity,
                severityGeral: hybridGeneral.severity,
                severityArrefecimento: coolingStatus.severity
            })
        };
    });
}

function getDashboardLines(item) {
    return [
        { label: "Oleo", value: item.statusOleo || "-", severity: item.severityOleo || getSeverityFromText(item.statusOleo) },
        { label: "Geral", value: item.statusGeralHibrido || item.statusGeral || "-", severity: item.severityGeral || getSeverityFromText(item.statusGeralHibrido || item.statusGeral) },
        { label: "Arrefecimento", value: item.statusArrefecimento || "-", severity: item.severityArrefecimento || getSeverityFromText(item.statusArrefecimento) }
    ];
}

function collectGlobalAlerts(statusRows) {
    const alerts = [];
    statusRows.forEach(item => {
        [
            { tipo: "Oleo", severity: item.severityOleo, tempo: item.statusOleo },
            { tipo: "Geral", severity: item.severityGeral, tempo: item.statusGeralHibrido || item.statusGeral },
            { tipo: "Arrefecimento", severity: item.severityArrefecimento, tempo: item.statusArrefecimento }
        ].forEach(entry => {
            if (entry.severity === "warning" || entry.severity === "critical") {
                alerts.push({
                    gerador: item.gerador,
                    tipo: entry.tipo,
                    severity: entry.severity,
                    tempo: entry.tempo || "-"
                });
            }
        });
    });
    return alerts.sort((a, b) => getSeverityRank(b.severity) - getSeverityRank(a.severity) || a.gerador.localeCompare(b.gerador, "pt-BR"));
}

function openGeradorAlertsModal() {
    const modal = document.getElementById("gerador-alerts-modal");
    if (modal) {
        modal.hidden = false;
    }
}

function closeGeradorAlertsModal() {
    const modal = document.getElementById("gerador-alerts-modal");
    if (modal) {
        modal.hidden = true;
    }
}

function renderGlobalAlertsModal(alerts) {
    const summary = document.getElementById("gerador-alerts-summary");
    const list = document.getElementById("gerador-alerts-list");
    if (!summary || !list) {
        return;
    }
    summary.textContent = alerts.length ? `${alerts.length} alerta(s) encontrado(s) entre todos os geradores.` : "Nenhum alerta em aberto.";
    list.innerHTML = alerts.length ? alerts.map(item => `
        <article class="history-item">
            <div class="history-item-top">
                <div>
                    <h3>${item.gerador}</h3>
                    <p class="meta-line">${item.tipo}</p>
                </div>
                <span class="badge ${getSeverityClass(item.severity)}">${getSeverityLabel(item.severity)}</span>
            </div>
            <div class="history-item-meta">
                <span>Tipo: ${item.tipo}</span>
                <span>Tempo: ${item.tempo}</span>
            </div>
        </article>
    `).join("") : `<div class="empty-state">Nenhum alerta para exibir.</div>`;
}

function createBaseState(data) {
    const status = (data.status || []).filter(item => normalizeText(item.gerador)).map(item => ({
        gerador: normalizeText(item.gerador),
        horimetroAtual: formatNumber(item.horimetroAtual)
    }));

    const lancamentos = (data.lancamentos || []).map((item, index) => ({
        id: `base-launch-${index + 1}`,
        data: normalizeDateDisplay(item.data),
        gerador: normalizeText(item.gerador),
        horaInicio: normalizeTimeDisplay(item.horaInicio),
        horaFim: normalizeTimeDisplay(item.horaFim),
        horasTrabalhadas: formatNumber(item.horasTrabalhadas),
        horimetroInicio: formatNumber(item.horimetroInicio),
        horimetroFim: formatNumber(item.horimetroFim),
        responsavel: normalizeText(item.responsavel),
        observacoes: normalizeText(item.observacoes)
    })).filter(item => item.gerador && (item.data || item.horaInicio || item.horimetroFim));

    const manutencoes = (data.manutencoes || []).filter(item => normalizeText(item.gerador)).map((item, index) => ({
        id: `base-maint-${index + 1}`,
        gerador: normalizeText(item.gerador),
        oleo: normalizeDateDisplay(item.oleo),
        preventiva: formatNumber(item.preventiva),
        intervaloOleoDias: formatNumber(item.intervaloOleoDias),
        intervaloPreventivaHoras: formatNumber(item.intervaloPreventivaHoras),
        arrefecimento: normalizeDateDisplay(item.arrefecimento),
        intervaloArrefecimentoDias: formatNumber(item.intervaloArrefecimentoDias),
        geral: normalizeDateDisplay(item.geral),
        manutencaoPreventivaDias: formatNumber(item.manutencaoPreventivaDias),
        realizado: normalizeText(item.realizado)
    }));

    const auditoria = (data.auditoria || []).map((item, index) => ({
        id: `base-audit-${index + 1}`,
        dataHora: normalizeDateTimeDisplay(item.dataHora),
        tipo: normalizeText(item.tipo),
        gerador: normalizeText(item.gerador),
        acao: normalizeText(item.acao),
        detalhe: normalizeText(item.detalhe)
    })).filter(item => item.gerador || item.acao || item.detalhe);

    return {
        origem: data.origem || "Planilha Gerador.xlsx",
        atualizadoEm: data.atualizadoEm || "",
        dashboard: data.dashboard || {},
        status,
        lancamentos,
        manutencoes,
        auditoria
    };
}

function isDisplayDate(value) {
    return /^\d{2}\/\d{2}\/\d{4}$/.test(normalizeText(value));
}

function normalizeMaintenanceDates(entries) {
    return (entries || []).map(item => {
        const normalized = { ...item };
        if (!isDisplayDate(normalized.oleo) && isDisplayDate(normalized.geral)) {
            normalized.oleo = normalized.geral;
        }
        if (!isDisplayDate(normalized.arrefecimento)) {
            if (isDisplayDate(normalized.geral)) {
                normalized.arrefecimento = normalized.geral;
            } else if (isDisplayDate(normalized.oleo)) {
                normalized.arrefecimento = normalized.oleo;
            }
        }
        return normalized;
    });
}

function loadGeradorState(baseData) {
    const baseState = createBaseState(baseData);
    try {
        const raw = window.localStorage.getItem(GERADOR_STORAGE_KEY);
        if (!raw) { return baseState; }
        const parsed = JSON.parse(raw);
        return {
            origem: parsed.origem || baseState.origem,
            atualizadoEm: parsed.atualizadoEm || baseState.atualizadoEm,
            dashboard: baseState.dashboard,
            status: Array.isArray(parsed.status) ? parsed.status : baseState.status,
            lancamentos: Array.isArray(parsed.lancamentos) ? parsed.lancamentos : baseState.lancamentos,
            manutencoes: normalizeMaintenanceDates(Array.isArray(parsed.manutencoes) ? parsed.manutencoes : baseState.manutencoes),
            auditoria: Array.isArray(parsed.auditoria) ? parsed.auditoria : baseState.auditoria
        };
    } catch (error) {
        console.error("Falha ao carregar estado do gerador:", error);
        return {
            ...baseState,
            manutencoes: normalizeMaintenanceDates(baseState.manutencoes)
        };
    }
}

function saveGeradorState() {
    if (geradorState) {
        window.localStorage.setItem(GERADOR_STORAGE_KEY, JSON.stringify(geradorState));
    }
}

function getStateSummary(state) {
    const rows = getStatusRows(state);
    const criticalCount = rows.filter(item => item.severity === "critical").length;
    const current = rows[geradorDashboardIndex] || rows[0];
    return {
        geradores: rows.length,
        horasAtuais: current?.horimetroAtual ? formatHourReading(current.horimetroAtual, "long") : "-",
        manutencoesCriticas: criticalCount
    };
}

function getSortedLancamentos(state) {
    return [...state.lancamentos].sort((a, b) => (parseDisplayDateTime(b.data, b.horaFim || b.horaInicio) || new Date(0)) - (parseDisplayDateTime(a.data, a.horaFim || a.horaInicio) || new Date(0)));
}

function getSortedAuditoria(state) {
    return [...state.auditoria].sort((a, b) => (parseDateTimeValue(b.dataHora) || new Date(0)) - (parseDateTimeValue(a.dataHora) || new Date(0)));
}
function showGeradorFeedback(message) {
    const element = document.getElementById("gerador-feedback");
    if (!element) { return; }
    element.textContent = message;
    element.classList.add("is-visible");
    window.clearTimeout(geradorFeedbackTimeout);
    geradorFeedbackTimeout = window.setTimeout(() => element.classList.remove("is-visible"), 2800);
}

function renderGeradorDashboard(state) {
    const statusRows = getStatusRows(state);
    if (!statusRows.length) { return; }
    geradorDashboardIndex = Math.max(0, Math.min(geradorDashboardIndex, statusRows.length - 1));
    const current = statusRows[geradorDashboardIndex];
    const severity = getStatusSeverity(current);
    const globalAlerts = collectGlobalAlerts(statusRows);
    const dashboardMeta = state.dashboard || {};

    document.getElementById("gerador-dashboard-title").textContent = dashboardMeta.titulo || "Painel de manutencao dos geradores";
    document.getElementById("gerador-dashboard-subtitle").textContent = dashboardMeta.subtitulo || "Status automatico por horas e tempo";
    document.getElementById("gerador-dashboard-generator").textContent = current.gerador || dashboardMeta.geradorReferencia || "-";
    document.getElementById("gerador-dashboard-alert").textContent = current.manutencaoCritica || "FUNCIONAMENTO NORMAL";
    const footerElement = document.getElementById("gerador-dashboard-footer");
    footerElement.textContent = globalAlerts.length ? `${globalAlerts.length} alerta(s) em aberto nos geradores` : "TODOS OS GERADORES DENTRO DO PRAZO";

    const iconElement = document.getElementById("gerador-dashboard-icon");
    iconElement.textContent = getDashboardIcon(severity);
    iconElement.className = `gerador-sheet-focus-icon is-${severity}`;

    const alertElement = document.getElementById("gerador-dashboard-alert");
    alertElement.className = `gerador-sheet-focus-alert is-${severity}`;
    footerElement.className = `gerador-sheet-footer-alert is-${globalAlerts.length ? maxSeverity(...globalAlerts.map(item => item.severity)) : "ok"}`;
    footerElement.disabled = !globalAlerts.length;
    renderGlobalAlertsModal(globalAlerts);

    document.getElementById("gerador-dashboard-switcher").innerHTML = statusRows.map((item, index) => `
        <button class="gerador-switch-chip ${index === geradorDashboardIndex ? "is-active" : ""}" type="button" data-gerador-index="${index}">${item.gerador}</button>
    `).join("");

    document.getElementById("gerador-dashboard-lines").innerHTML = getDashboardLines(current).map(line => `
        <div class="gerador-sheet-line">
            <span class="gerador-sheet-line-bullet is-${line.severity}"></span>
            <strong>${line.label}</strong>
            <span>${line.value}</span>
        </div>
    `).join("");

    document.querySelectorAll("[data-gerador-index]").forEach(button => {
        button.addEventListener("click", () => {
            geradorDashboardIndex = Number(button.getAttribute("data-gerador-index")) || 0;
            renderAllGerador();
        });
    });
    footerElement.onclick = globalAlerts.length ? () => openGeradorAlertsModal() : null;
}

function renderGeradorStats(state) {
    const summary = getStateSummary(state);
    const stats = [
        { label: "Geradores", value: summary.geradores },
        { label: "Horas atuais", value: summary.horasAtuais || "-" },
        { label: "Criticos", value: summary.manutencoesCriticas }
    ];
    document.getElementById("gerador-stats").innerHTML = stats.map(stat => `
        <article class="stat-card">
            <span>${stat.label}</span>
            <strong>${stat.value}</strong>
        </article>
    `).join("");
}

function renderGeradorStatus(state) {
    document.getElementById("gerador-status").innerHTML = getStatusRows(state).map(item => {
        const severity = getStatusSeverity(item);
        return `
            <article class="gerador-status-card">
                <div class="gerador-status-head">
                    <p class="module-label">${item.gerador}</p>
                    <div class="gerador-status-actions">
                        <span class="badge ${getSeverityClass(severity)}">${getSeverityLabel(severity)}</span>
                        <button class="ghost-button gerador-edit-button" type="button" data-edit-gerador="${item.gerador}">Editar</button>
                        <button class="gerador-delete-button" type="button" data-delete-gerador="${item.gerador}" aria-label="Excluir ${item.gerador}">×</button>
                    </div>
                </div>
                <h3>${item.manutencaoCritica || "Funcionamento normal"}</h3>
                <div class="gerador-status-metrics">
                    <div class="gerador-metric"><span class="gerador-metric-label">Horimetro atual</span><strong>${item.horimetroAtual ? formatHourReading(item.horimetroAtual, "short") : "-"}</strong></div>
                    <div class="gerador-metric"><span class="gerador-metric-label">Oleo</span><strong>${item.statusOleo || "-"}</strong></div>
                    <div class="gerador-metric"><span class="gerador-metric-label">Geral</span><strong>${item.statusGeralHibrido || item.statusGeral || "-"}</strong></div>
                    <div class="gerador-metric"><span class="gerador-metric-label">Arrefecimento</span><strong>${item.statusArrefecimento || "-"}</strong></div>
                </div>
            </article>
        `;
    }).join("");

    document.querySelectorAll("[data-delete-gerador]").forEach(button => {
        button.addEventListener("click", () => {
            deleteGerador(button.getAttribute("data-delete-gerador"));
        });
    });
    document.querySelectorAll("[data-edit-gerador]").forEach(button => {
        button.addEventListener("click", () => {
            startEditGerador(button.getAttribute("data-edit-gerador"));
        });
    });
}

function renderGeradorLancamentos(state) {
    const rows = getSortedLancamentos(state).slice(0, 12);
    document.getElementById("gerador-lancamentos").innerHTML = rows.length ? rows.map(item => `
        <article class="history-item">
            <div class="history-item-top">
                <div>
                    <h3>${item.gerador || "Sem gerador"}</h3>
                    <p class="meta-line">${item.data || "-"} | ${item.horaInicio || "-"} ate ${item.horaFim || "-"}</p>
                </div>
                <div class="history-item-actions">
                    <span class="badge ${String(item.responsavel || "").toUpperCase().includes("AUTOM") ? "status-ok" : "status-warning"}">${item.responsavel || "Manual"}</span>
                    <button class="gerador-delete-button gerador-launch-delete-button" type="button" data-delete-lancamento="${item.id}" aria-label="Excluir lancamento de ${item.gerador || "gerador"}">×</button>
                </div>
            </div>
            <div class="history-item-meta">
                <span>Horas: ${item.horasTrabalhadas ? formatHourReading(item.horasTrabalhadas, "short") : "-"}</span>
                <span>Horimetro: ${item.horimetroInicio ? formatHourReading(item.horimetroInicio, "short") : "-"} -> ${item.horimetroFim ? formatHourReading(item.horimetroFim, "short") : "-"}</span>
                <span>${item.observacoes || "Sem observacoes"}</span>
            </div>
        </article>
    `).join("") : `<div class="empty-state">Nenhum lancamento encontrado.</div>`;
    document.querySelectorAll("[data-delete-lancamento]").forEach(button => {
        button.addEventListener("click", () => {
            deleteLancamento(button.getAttribute("data-delete-lancamento"));
        });
    });
}

function deleteLancamento(lancamentoId) {
    const launch = geradorState.lancamentos.find(item => item.id === lancamentoId);
    if (!launch) {
        showGeradorFeedback("Lancamento nao encontrado.");
        return;
    }
    geradorState.lancamentos = geradorState.lancamentos.filter(item => item.id !== lancamentoId);
    recalculateGeneratorHorimeter(launch.gerador);
    addAuditEntry({
        tipo: "EXCLUSAO",
        gerador: launch.gerador,
        acao: "Lancamento excluido",
        detalhe: `${launch.data || "-"} | ${launch.horaInicio || "-"} ate ${launch.horaFim || "-"}`
    });
    saveGeradorState();
    renderAllGerador();
    syncLaunchHorimeterStart();
    syncAdjustmentHorimeter();
    syncMaintenanceHorimeter();
    showGeradorFeedback("Lancamento excluido e efeito desfeito.");
}

function renderGeradorManutencoes(state) {
    const rows = getStatusRows(state).map(statusRow => ({ ...ensureMaintenanceRow(state, statusRow.gerador), computed: statusRow }));
    document.getElementById("gerador-manutencoes").innerHTML = rows.length ? rows.map(item => `
        <article class="history-item">
            <div class="history-item-top">
                <div>
                    <h3>${item.gerador}</h3>
                    <p class="meta-line">Oleo: ${item.oleo || "-"} | Geral: ${item.geral || "-"} | Arrefecimento: ${item.arrefecimento || "-"}</p>
                </div>
                <span class="badge ${getSeverityClass(item.computed.severity)}">${getSeverityLabel(item.computed.severity)}</span>
            </div>
            <div class="history-item-meta">
                <span>Horimetro preventiva: ${item.preventiva ? formatHourReading(item.preventiva, "short") : "-"}</span>
                <span>Intervalo oleo: ${item.intervaloOleoDias || "-"} dias</span>
                <span>Intervalo preventiva: ${item.intervaloPreventivaHoras || "-"} h</span>
                <span>Intervalo arrefecimento: ${item.intervaloArrefecimentoDias || "-"} dias</span>
                <span>${item.realizado || "Sem ultima execucao registrada"}</span>
            </div>
        </article>
    `).join("") : `<div class="empty-state">Nenhuma manutencao encontrada.</div>`;
}

function renderGeradorAuditoria(state) {
    const rows = getSortedAuditoria(state).slice(0, 16);
    document.getElementById("gerador-auditoria").innerHTML = rows.length ? rows.map(item => `
        <article class="history-item">
            <div class="history-item-top">
                <div>
                    <h3>${item.acao || "Acao registrada"}</h3>
                    <p class="meta-line">${item.gerador || "-"}</p>
                </div>
                <div class="history-item-actions">
                    <span class="badge ${item.tipo === "SISTEMA" || item.tipo === "AUTOMATICO" || item.tipo === "AUTOMÁTICO" ? "status-ok" : item.tipo === "BLOQUEIO" ? "status-critical" : "status-warning"}">${item.tipo || "-"}</span>
                    <button class="gerador-delete-button gerador-launch-delete-button" type="button" data-delete-auditoria="${item.id}" aria-label="Excluir auditoria ${item.acao || "registro"}">×</button>
                </div>
            </div>
            <div class="history-item-meta"><span>${item.dataHora || "-"}</span><span>${item.detalhe || "-"}</span></div>
        </article>
    `).join("") : `<div class="empty-state">Nenhuma auditoria encontrada.</div>`;
    document.querySelectorAll("[data-delete-auditoria]").forEach(button => {
        button.addEventListener("click", () => {
            deleteAuditoria(button.getAttribute("data-delete-auditoria"));
        });
    });
}

function deleteAuditoria(auditoriaId) {
    const audit = geradorState.auditoria.find(item => item.id === auditoriaId);
    if (!audit) {
        showGeradorFeedback("Registro de auditoria nao encontrado.");
        return;
    }
    geradorState.auditoria = geradorState.auditoria.filter(item => item.id !== auditoriaId);
    saveGeradorState();
    renderAllGerador();
    showGeradorFeedback("Registro de auditoria excluido.");
}
function fillGeneratorSelect(selectId, includePlaceholder = true) {
    const select = document.getElementById(selectId);
    if (!select) { return; }
    const currentValue = select.value;
    const names = getGeneratorNames(geradorState);
    select.innerHTML = [includePlaceholder ? `<option value="">Selecionar</option>` : "", ...names.map(name => `<option value="${name}">${name}</option>`)].join("");
    if (names.includes(currentValue)) {
        select.value = currentValue;
    } else if (!includePlaceholder && names[0]) {
        select.value = names[0];
    }
}

function refreshGeradorForms() {
    fillGeneratorSelect("gerador-horimetro-gerador", false);
    fillGeneratorSelect("gerador-lancamento-gerador");
    fillGeneratorSelect("gerador-manutencao-gerador");
    ["gerador-horimetro-data", "gerador-lancamento-data", "gerador-manutencao-data"].forEach(id => {
        const input = document.getElementById(id);
        if (input && !input.value) {
            input.value = getTodayInputValue();
        }
    });
}

function syncLaunchHorimeterStart() {
    const gerador = document.getElementById("gerador-lancamento-gerador")?.value;
    const current = getCurrentHorimeter(geradorState, gerador);
    setHorimeterFieldDisplay("gerador-lancamento-hori-inicio", current);
    syncLaunchHorimeterEnd();
}

function syncLaunchHorimeterEnd() {
    const startValue = getHorimeterFieldNumeric("gerador-lancamento-hori-inicio");
    const dataInput = document.getElementById("gerador-lancamento-data")?.value;
    const horaInicio = normalizeTimeDisplay(document.getElementById("gerador-lancamento-inicio")?.value);
    const horaFim = normalizeTimeDisplay(document.getElementById("gerador-lancamento-fim")?.value);
    if (startValue === null || !dataInput || !horaInicio || !horaFim) {
        setHorimeterFieldDisplay("gerador-lancamento-hori-fim", startValue);
        return;
    }
    const startDate = parseDisplayDateTime(toDisplayDateFromInput(dataInput), horaInicio);
    const endDate = parseDisplayDateTime(toDisplayDateFromInput(dataInput), horaFim);
    if (!startDate || !endDate || endDate <= startDate) {
        setHorimeterFieldDisplay("gerador-lancamento-hori-fim", startValue);
        return;
    }
    const workedHours = roundNumber((endDate - startDate) / 3600000, 2);
    setHorimeterFieldDisplay("gerador-lancamento-hori-fim", startValue + workedHours);
}

function syncAdjustmentHorimeter() {
    const gerador = document.getElementById("gerador-horimetro-gerador")?.value;
    const valueInput = document.getElementById("gerador-horimetro-valor");
    const current = getCurrentHorimeter(geradorState, gerador);
    if (valueInput && current !== null && !valueInput.value) {
        valueInput.value = formatNumber(current);
    }
}

function syncMaintenanceHorimeter() {
    const gerador = document.getElementById("gerador-manutencao-gerador")?.value;
    const current = getCurrentHorimeter(geradorState, gerador);
    setHorimeterFieldDisplay("gerador-manutencao-horimetro", current);
}

function renderAllGerador() {
    renderGeradorDashboard(geradorState);
    renderGeradorStats(geradorState);
    renderGeradorStatus(geradorState);
    renderGeradorLancamentos(geradorState);
    renderGeradorManutencoes(geradorState);
    renderGeradorAuditoria(geradorState);
    refreshGeradorForms();
}

function addAuditEntry(entry) {
    geradorState.auditoria.unshift({
        id: `audit-${Date.now()}`,
        dataHora: formatDateTime(entry.dateTime || new Date()),
        tipo: entry.tipo,
        gerador: entry.gerador,
        acao: entry.acao,
        detalhe: entry.detalhe
    });
}

function deleteGerador(gerador) {
    if (!gerador) {
        return;
    }
    const confirmed = window.confirm(`Excluir ${gerador} do painel? Isso remove lancamentos, manutencoes e historico desse gerador.`);
    if (!confirmed) {
        return;
    }
    geradorState.status = geradorState.status.filter(item => item.gerador !== gerador);
    geradorState.lancamentos = geradorState.lancamentos.filter(item => item.gerador !== gerador);
    geradorState.manutencoes = geradorState.manutencoes.filter(item => item.gerador !== gerador);
    geradorState.auditoria = geradorState.auditoria.filter(item => item.gerador !== gerador);
    addAuditEntry({
        tipo: "EXCLUSAO",
        gerador,
        acao: "Gerador excluido",
        detalhe: "Cadastro removido do modulo"
    });
    geradorDashboardIndex = 0;
    saveGeradorState();
    renderAllGerador();
    showGeradorFeedback("Gerador excluido com sucesso.");
}

function openGeradorRegisterModal() {
    const modal = document.getElementById("gerador-register-modal");
    if (!modal) {
        return;
    }
    modal.hidden = false;
    document.getElementById("gerador-register-nome")?.focus();
}

function closeGeradorRegisterModal() {
    const modal = document.getElementById("gerador-register-modal");
    if (!modal) {
        return;
    }
    modal.hidden = true;
}

function openGeradorHorimetroModal() {
    const modal = document.getElementById("gerador-horimetro-modal");
    if (!modal) {
        return;
    }
    modal.hidden = false;
    document.getElementById("gerador-horimetro-valor")?.focus();
}

function closeGeradorHorimetroModal() {
    const modal = document.getElementById("gerador-horimetro-modal");
    if (!modal) {
        return;
    }
    modal.hidden = true;
}

function resetGeradorRegisterForm() {
    const form = document.getElementById("gerador-register-form");
    if (form) {
        form.reset();
    }
    document.getElementById("gerador-register-original").value = "";
    document.getElementById("gerador-register-oleo-dias").value = "180";
    document.getElementById("gerador-register-geral-dias").value = "180";
    document.getElementById("gerador-register-preventiva-horas").value = "250";
    document.getElementById("gerador-register-arrefecimento-dias").value = "730";
    document.getElementById("gerador-register-summary").textContent = "Cria o gerador no painel e prepara os intervalos de manutencao.";
    document.getElementById("gerador-register-submit").textContent = "Registrar gerador";
    document.getElementById("gerador-register-title").textContent = "Registrar gerador";
    document.getElementById("gerador-open-horimetro").hidden = true;
    geradorEditingName = "";
    closeGeradorRegisterModal();
}

function startEditGerador(gerador) {
    if (!gerador) {
        return;
    }
    const statusRow = geradorState.status.find(item => item.gerador === gerador);
    const maintenance = ensureMaintenanceRow(geradorState, gerador);
    geradorEditingName = gerador;
    document.getElementById("gerador-register-original").value = gerador;
    document.getElementById("gerador-register-nome").value = gerador;
    document.getElementById("gerador-register-horimetro").value = statusRow?.horimetroAtual || "";
    document.getElementById("gerador-register-oleo-dias").value = maintenance.intervaloOleoDias || "180";
    document.getElementById("gerador-register-geral-dias").value = maintenance.manutencaoPreventivaDias || "180";
    document.getElementById("gerador-register-preventiva-horas").value = maintenance.intervaloPreventivaHoras || "250";
    document.getElementById("gerador-register-arrefecimento-dias").value = maintenance.intervaloArrefecimentoDias || "730";
    document.getElementById("gerador-register-summary").textContent = "Edite o nome, horimetro e intervalos para atualizar esse gerador.";
    document.getElementById("gerador-register-title").textContent = "Editar gerador";
    document.getElementById("gerador-register-submit").textContent = "Salvar edicao";
    document.getElementById("gerador-open-horimetro").hidden = false;
    document.getElementById("gerador-horimetro-gerador").value = gerador;
    document.getElementById("gerador-horimetro-data").value = getTodayInputValue();
    document.getElementById("gerador-horimetro-valor").value = statusRow?.horimetroAtual || "";
    setGeradorTab("geradores");
    openGeradorRegisterModal();
}

function handleRegisterGeradorSubmit(event) {
    event.preventDefault();
    const originalName = normalizeText(document.getElementById("gerador-register-original").value);
    const gerador = normalizeText(document.getElementById("gerador-register-nome").value);
    const horimetroInicial = getNumericValue(document.getElementById("gerador-register-horimetro").value);
    const intervaloOleoDias = getNumericValue(document.getElementById("gerador-register-oleo-dias").value);
    const intervaloGeralDias = getNumericValue(document.getElementById("gerador-register-geral-dias").value);
    const intervaloPreventivaHoras = getNumericValue(document.getElementById("gerador-register-preventiva-horas").value);
    const intervaloArrefecimentoDias = getNumericValue(document.getElementById("gerador-register-arrefecimento-dias").value);

    if (!gerador || horimetroInicial === null || intervaloOleoDias === null || intervaloGeralDias === null || intervaloPreventivaHoras === null || intervaloArrefecimentoDias === null) {
        showGeradorFeedback("Preencha o nome do gerador e todos os intervalos.");
        return;
    }
    if (getGeneratorNames(geradorState).some(name => name.toUpperCase() === gerador.toUpperCase() && name !== originalName)) {
        showGeradorFeedback("Ja existe um gerador com esse nome.");
        return;
    }

    if (originalName) {
        geradorState.status.forEach(item => {
            if (item.gerador === originalName) {
                item.gerador = gerador;
                item.horimetroAtual = formatNumber(horimetroInicial);
            }
        });
        geradorState.lancamentos.forEach(item => {
            if (item.gerador === originalName) {
                item.gerador = gerador;
            }
        });
        geradorState.auditoria.forEach(item => {
            if (item.gerador === originalName) {
                item.gerador = gerador;
            }
        });
        const maintenance = ensureMaintenanceRow(geradorState, originalName);
        maintenance.gerador = gerador;
        maintenance.intervaloOleoDias = formatNumber(intervaloOleoDias);
        maintenance.intervaloPreventivaHoras = formatNumber(intervaloPreventivaHoras);
        maintenance.intervaloArrefecimentoDias = formatNumber(intervaloArrefecimentoDias);
        maintenance.manutencaoPreventivaDias = formatNumber(intervaloGeralDias);
    } else {
        geradorState.status.push({
            gerador,
            horimetroAtual: formatNumber(horimetroInicial)
        });
        geradorState.manutencoes.unshift({
            id: `manual-maint-${Date.now()}`,
            gerador,
            oleo: "",
            preventiva: "",
            intervaloOleoDias: formatNumber(intervaloOleoDias),
            intervaloPreventivaHoras: formatNumber(intervaloPreventivaHoras),
            arrefecimento: "",
            intervaloArrefecimentoDias: formatNumber(intervaloArrefecimentoDias),
            geral: "",
            manutencaoPreventivaDias: formatNumber(intervaloGeralDias),
            realizado: ""
        });
    }

    addAuditEntry({
        tipo: originalName ? "EDICAO" : "CADASTRO",
        gerador,
        acao: originalName ? "Gerador editado" : "Gerador cadastrado",
        detalhe: `Horimetro ${formatHourReading(horimetroInicial, "short")}`
    });

    saveGeradorState();
    renderAllGerador();
    resetGeradorRegisterForm();
    showGeradorFeedback(originalName ? "Gerador atualizado com sucesso." : "Gerador cadastrado com sucesso.");
}

function handleHorimeterSubmit(event) {
    event.preventDefault();
    const gerador = document.getElementById("gerador-horimetro-gerador").value;
    const data = document.getElementById("gerador-horimetro-data").value;
    const valor = getNumericValue(document.getElementById("gerador-horimetro-valor").value);
    const responsavel = normalizeText(document.getElementById("gerador-horimetro-responsavel").value) || "Operacao";
    const observacao = normalizeText(document.getElementById("gerador-horimetro-observacao").value) || "Ajuste manual de horimetro";
    if (!gerador || valor === null) {
        showGeradorFeedback("Preencha gerador e novo horimetro.");
        return;
    }
    ensureStatusRow(geradorState, gerador).horimetroAtual = formatNumber(valor);
    addAuditEntry({ tipo: "AJUSTE", gerador, acao: "Ajuste de horimetro", detalhe: `${responsavel}: ${observacao}`, dateTime: parseDisplayDateTime(toDisplayDateFromInput(data), "12:00") || new Date() });
    saveGeradorState();
    renderAllGerador();
    event.target.reset();
    document.getElementById("gerador-horimetro-data").value = getTodayInputValue();
    syncAdjustmentHorimeter();
    closeGeradorHorimetroModal();
    showGeradorFeedback("Horimetro atualizado com sucesso.");
}

function handleLancamentoSubmit(event) {
    event.preventDefault();
    const gerador = document.getElementById("gerador-lancamento-gerador").value;
    const dataInput = document.getElementById("gerador-lancamento-data").value;
    const horaInicio = normalizeTimeDisplay(document.getElementById("gerador-lancamento-inicio").value);
    const horaFim = normalizeTimeDisplay(document.getElementById("gerador-lancamento-fim").value);
    const horimetroInicio = getHorimeterFieldNumeric("gerador-lancamento-hori-inicio");
    const horimetroFim = getHorimeterFieldNumeric("gerador-lancamento-hori-fim");
    const responsavel = normalizeText(document.getElementById("gerador-lancamento-responsavel").value) || "MANUAL";
    const observacoes = normalizeText(document.getElementById("gerador-lancamento-observacoes").value) || "Lancamento manual";
    if (!gerador || !dataInput || !horaInicio || !horaFim || horimetroInicio === null || horimetroFim === null) {
        showGeradorFeedback("Preencha todos os campos do lancamento.");
        return;
    }
    const startDate = parseDisplayDateTime(toDisplayDateFromInput(dataInput), horaInicio);
    const endDate = parseDisplayDateTime(toDisplayDateFromInput(dataInput), horaFim);
    if (!startDate || !endDate || endDate <= startDate) {
        showGeradorFeedback("A hora final precisa ser maior que a hora inicial.");
        return;
    }
    if (horimetroFim < horimetroInicio) {
        showGeradorFeedback("O horimetro final nao pode ser menor que o inicial.");
        return;
    }
    geradorState.lancamentos.unshift({
        id: `manual-launch-${Date.now()}`,
        data: toDisplayDateFromInput(dataInput), gerador, horaInicio, horaFim,
        horasTrabalhadas: formatNumber(roundNumber((endDate - startDate) / 3600000, 2)),
        horimetroInicio: formatNumber(horimetroInicio), horimetroFim: formatNumber(horimetroFim),
        responsavel, observacoes
    });
    ensureStatusRow(geradorState, gerador).horimetroAtual = formatNumber(horimetroFim);
    addAuditEntry({ tipo: "MANUAL", gerador, acao: "Lancamento manual", detalhe: observacoes, dateTime: endDate });
    saveGeradorState();
    renderAllGerador();
    event.target.reset();
    document.getElementById("gerador-lancamento-data").value = getTodayInputValue();
    syncLaunchHorimeterStart();
    showGeradorFeedback("Lancamento registrado no diario.");
}
function handleManutencaoSubmit(event) {
    event.preventDefault();
    const gerador = document.getElementById("gerador-manutencao-gerador").value;
    const tipo = document.getElementById("gerador-manutencao-tipo").value;
    const dataInput = document.getElementById("gerador-manutencao-data").value;
    const horimetro = getHorimeterFieldNumeric("gerador-manutencao-horimetro");
    const responsavel = normalizeText(document.getElementById("gerador-manutencao-responsavel").value) || "Tecnico";
    const observacao = normalizeText(document.getElementById("gerador-manutencao-observacao").value) || "Servico executado";
    if (!gerador || !tipo || !dataInput || horimetro === null) {
        showGeradorFeedback("Preencha gerador, tipo, data e horimetro.");
        return;
    }
    const maintenance = ensureMaintenanceRow(geradorState, gerador);
    const displayDate = toDisplayDateFromInput(dataInput);
    if (tipo === "oleo") {
        maintenance.oleo = displayDate;
    } else if (tipo === "geral") {
        maintenance.geral = displayDate;
        maintenance.preventiva = formatNumber(horimetro);
    } else if (tipo === "arrefecimento") {
        maintenance.arrefecimento = displayDate;
    }
    maintenance.realizado = `${displayDate} - ${responsavel}`;
    ensureStatusRow(geradorState, gerador).horimetroAtual = formatNumber(horimetro);
    addAuditEntry({ tipo: "MANUTENCAO", gerador, acao: `Manutencao ${tipo}`, detalhe: observacao, dateTime: parseDisplayDateTime(displayDate, "12:00") || new Date() });
    saveGeradorState();
    renderAllGerador();
    event.target.reset();
    document.getElementById("gerador-manutencao-data").value = getTodayInputValue();
    syncMaintenanceHorimeter();
    showGeradorFeedback("Manutencao registrada e painel recalculado.");
}

function wireGeradorForms() {
    document.getElementById("gerador-register-open")?.addEventListener("click", () => {
        resetGeradorRegisterForm();
        openGeradorRegisterModal();
    });
    document.getElementById("gerador-open-horimetro")?.addEventListener("click", () => {
        closeGeradorRegisterModal();
        openGeradorHorimetroModal();
    });
    document.getElementById("gerador-register-form")?.addEventListener("submit", handleRegisterGeradorSubmit);
    document.getElementById("gerador-register-cancel")?.addEventListener("click", resetGeradorRegisterForm);
    document.querySelectorAll("[data-gerador-register-close]").forEach(element => {
        element.addEventListener("click", resetGeradorRegisterForm);
    });
    document.getElementById("gerador-horimetro-form")?.addEventListener("submit", handleHorimeterSubmit);
    document.getElementById("gerador-horimetro-cancel")?.addEventListener("click", closeGeradorHorimetroModal);
    document.querySelectorAll("[data-gerador-horimetro-close]").forEach(element => {
        element.addEventListener("click", closeGeradorHorimetroModal);
    });
    document.querySelectorAll("[data-gerador-alerts-close]").forEach(element => {
        element.addEventListener("click", closeGeradorAlertsModal);
    });
    document.getElementById("gerador-lancamento-form")?.addEventListener("submit", handleLancamentoSubmit);
    document.getElementById("gerador-manutencao-form")?.addEventListener("submit", handleManutencaoSubmit);
    document.getElementById("gerador-lancamento-gerador")?.addEventListener("change", syncLaunchHorimeterStart);
    document.getElementById("gerador-lancamento-data")?.addEventListener("change", syncLaunchHorimeterEnd);
    document.getElementById("gerador-lancamento-inicio")?.addEventListener("change", syncLaunchHorimeterEnd);
    document.getElementById("gerador-lancamento-fim")?.addEventListener("change", syncLaunchHorimeterEnd);
    document.getElementById("gerador-horimetro-gerador")?.addEventListener("change", () => {
        document.getElementById("gerador-horimetro-valor").value = "";
        syncAdjustmentHorimeter();
    });
    document.getElementById("gerador-manutencao-gerador")?.addEventListener("change", () => {
        document.getElementById("gerador-manutencao-horimetro").value = "";
        syncMaintenanceHorimeter();
    });
}

function wireGeradorTabs() {
    document.querySelectorAll("[data-gerador-tab-target]").forEach(button => {
        button.addEventListener("click", () => setGeradorTab(button.getAttribute("data-gerador-tab-target")));
    });
    document.querySelectorAll("[data-go-gerador-tab]").forEach(button => {
        button.addEventListener("click", () => setGeradorTab(button.getAttribute("data-go-gerador-tab")));
    });
}

function setGeradorTab(tabId) {
    geradorActiveTab = tabId;
    try {
        window.sessionStorage.setItem(GERADOR_ACTIVE_TAB_KEY, tabId);
    } catch (error) {
        console.warn("Nao foi possivel salvar a aba ativa do gerador.", error);
    }
    document.querySelectorAll(".module-tab-button").forEach(button => {
        button.classList.toggle("is-active", button.getAttribute("data-gerador-tab-target") === tabId);
    });
    document.querySelectorAll(".gerador-tab-panel").forEach(panel => {
        panel.classList.toggle("is-active", panel.id === `gerador-tab-${tabId}`);
    });
    const registerButton = document.getElementById("gerador-register-open");
    if (registerButton) {
        registerButton.hidden = tabId !== "geradores";
    }
}

function initGerador() {
    if (!window.GERADOR_DATA) {
        document.body.innerHTML = `<main class="app-shell"><div class="panel"><h1>Erro ao carregar gerador</h1><p>Os dados do gerador nao foram encontrados.</p></div></main>`;
        return;
    }
    try {
        const savedTab = window.sessionStorage.getItem(GERADOR_ACTIVE_TAB_KEY);
        if (savedTab) {
            geradorActiveTab = savedTab;
        }
    } catch (error) {
        console.warn("Nao foi possivel restaurar a aba ativa do gerador.", error);
    }
    geradorState = loadGeradorState(window.GERADOR_DATA);
    wireGeradorTabs();
    wireGeradorForms();
    renderAllGerador();
    setGeradorTab(geradorActiveTab);
    syncLaunchHorimeterStart();
    syncAdjustmentHorimeter();
    syncMaintenanceHorimeter();
}

initGerador();
