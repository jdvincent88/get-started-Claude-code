(function () {
  "use strict";

  const STORAGE_KEY = "paycheckPlannerData";

  // Average weeks per period for each frequency.
  const FREQ_WEEKS = {
    weekly: 1,
    biweekly: 2,
    semimonthly: 52 / 24, // 2.1667
    monthly: 52 / 12, // 4.3333
    quarterly: 13,
    semiannually: 26,
    annually: 52,
  };

  const FREQ_LABEL = {
    weekly: "Weekly",
    biweekly: "Every 2 weeks",
    semimonthly: "Twice a month",
    monthly: "Monthly",
    quarterly: "Quarterly",
    semiannually: "Every 6 months",
    annually: "Yearly",
  };

  const currency = (n) =>
    (n || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });

  function migrate(parsed) {
    const incomeSources = parsed.incomeSources
      ? parsed.incomeSources
      : parsed.paycheck && parsed.paycheck.amount
      ? [
          {
            id: "legacy-income",
            name: "My paycheck",
            amount: parsed.paycheck.amount,
            frequency: parsed.paycheck.frequency || "weekly",
          },
        ]
      : [];

    const bills = (parsed.bills || []).map((b) => ({
      pastDueAmount: 0,
      catchUpTargetWeeks: 8,
      ...b,
      originalPastDueAmount:
        b.originalPastDueAmount || b.pastDueAmount || 0,
    }));

    return {
      incomeSources,
      bills,
      leftover: parsed.leftover || 0,
      log: parsed.log || [],
    };
  }

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { incomeSources: [], bills: [], leftover: 0, log: [] };
    }
    try {
      return migrate(JSON.parse(raw));
    } catch (e) {
      console.error("Failed to parse stored data, resetting.", e);
      return { incomeSources: [], bills: [], leftover: 0, log: [] };
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  let state = loadState();

  function addLog(message, kind) {
    state.log.unshift({ message, kind: kind || "info", at: new Date().toISOString() });
    state.log = state.log.slice(0, 40);
  }

  function weeklyEq(amount, freq) {
    return amount / FREQ_WEEKS[freq];
  }

  function totalWeeklyIncome() {
    return state.incomeSources.reduce((sum, s) => sum + weeklyEq(s.amount, s.frequency), 0);
  }

  function regularWeekly(bill) {
    return weeklyEq(bill.amount, bill.frequency);
  }

  function totalRegularWeekly() {
    return state.bills.reduce((sum, b) => sum + regularWeekly(b), 0);
  }

  function surplusWeekly() {
    return totalWeeklyIncome() - totalRegularWeekly();
  }

  function desiredCatchup(bill) {
    if (!bill.pastDueAmount || bill.pastDueAmount <= 0) return 0;
    return bill.pastDueAmount / Math.max(1, bill.catchUpTargetWeeks || 8);
  }

  function totalDesiredCatchup() {
    return state.bills.reduce((sum, b) => sum + desiredCatchup(b), 0);
  }

  function catchupScale() {
    const desired = totalDesiredCatchup();
    if (desired <= 0) return 0;
    const available = Math.max(0, surplusWeekly());
    return Math.min(1, available / desired);
  }

  function actualCatchup(bill) {
    return desiredCatchup(bill) * catchupScale();
  }

  function totalWeeklyForBill(bill) {
    return regularWeekly(bill) + actualCatchup(bill);
  }

  function pctOfPaycheck(bill) {
    const income = totalWeeklyIncome();
    if (!income) return 0;
    return (totalWeeklyForBill(bill) / income) * 100;
  }

  function totalPercent() {
    return state.bills.reduce((sum, b) => sum + pctOfPaycheck(b), 0);
  }

  function payoffWeeks(bill) {
    if (!bill.pastDueAmount || bill.pastDueAmount <= 0) return 0;
    const rate = actualCatchup(bill);
    return rate > 0 ? bill.pastDueAmount / rate : Infinity;
  }

  function payoffDateLabel(bill) {
    const weeks = payoffWeeks(bill);
    if (weeks === 0) return "paid off";
    if (!isFinite(weeks)) return "no surplus available";
    const d = new Date();
    d.setDate(d.getDate() + Math.round(weeks * 7));
    return `${d.toLocaleDateString()} (~${weeks.toFixed(1)}w)`;
  }

  function addWeeks(dateStr, weeks) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + Math.round(weeks * 7));
    return d.toISOString().slice(0, 10);
  }

  function daysUntil(dateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dateStr + "T00:00:00");
    return Math.round((due - today) / (1000 * 60 * 60 * 24));
  }

  // --- Income sources ---

  function addIncomeSource(name, amount, frequency) {
    state.incomeSources.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      amount,
      frequency,
    });
    addLog(`Added income source: ${name} (${currency(amount)}, ${FREQ_LABEL[frequency].toLowerCase()})`);
    saveState();
    render();
  }

  function removeIncomeSource(id) {
    const src = state.incomeSources.find((s) => s.id === id);
    state.incomeSources = state.incomeSources.filter((s) => s.id !== id);
    if (src) addLog(`Removed income source: ${src.name}`);
    saveState();
    render();
  }

  // --- Bills ---

  function addBill(name, amount, frequency, dueDate, pastDueAmount, catchUpTargetWeeks) {
    state.bills.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      amount,
      frequency,
      nextDueDate: dueDate,
      saved: 0,
      pastDueAmount: pastDueAmount || 0,
      originalPastDueAmount: pastDueAmount || 0,
      catchUpTargetWeeks: catchUpTargetWeeks || 8,
    });
    addLog(
      `Added bill: ${name} (${currency(amount)}, ${FREQ_LABEL[frequency].toLowerCase()})` +
        (pastDueAmount > 0 ? ` — ${currency(pastDueAmount)} past due` : "")
    );
    saveState();
    render();
  }

  function removeBill(id) {
    const bill = state.bills.find((b) => b.id === id);
    state.bills = state.bills.filter((b) => b.id !== id);
    if (bill) addLog(`Removed bill: ${bill.name}`);
    saveState();
    render();
  }

  function markPaidNow(id) {
    const bill = state.bills.find((b) => b.id === id);
    if (!bill) return;
    if (bill.saved >= bill.amount) {
      bill.saved -= bill.amount;
    } else {
      bill.saved = 0;
    }
    bill.nextDueDate = addWeeks(new Date().toISOString().slice(0, 10), FREQ_WEEKS[bill.frequency]);
    addLog(`Marked ${bill.name} as paid manually.`, "paid");
    saveState();
    render();
  }

  function markPastDue(id) {
    const bill = state.bills.find((b) => b.id === id);
    if (!bill) return;
    const amtStr = prompt(`How much is past due on "${bill.name}"?`);
    if (amtStr === null) return;
    const amt = parseFloat(amtStr);
    if (isNaN(amt) || amt <= 0) return;
    const weeksStr = prompt("Target payoff time, in weeks?", "8");
    const weeks = parseFloat(weeksStr);
    bill.pastDueAmount = amt;
    bill.originalPastDueAmount = amt;
    bill.catchUpTargetWeeks = isNaN(weeks) || weeks <= 0 ? 8 : weeks;
    addLog(`Marked ${bill.name} as past due: ${currency(amt)}, targeting payoff in ${bill.catchUpTargetWeeks} weeks.`, "shortfall");
    saveState();
    render();
  }

  function clearPastDue(id) {
    const bill = state.bills.find((b) => b.id === id);
    if (!bill) return;
    if (!confirm(`Clear the past-due flag on "${bill.name}"? Only do this if it's actually been paid off.`)) return;
    bill.pastDueAmount = 0;
    bill.originalPastDueAmount = 0;
    addLog(`Cleared past-due balance for ${bill.name}.`, "paid");
    saveState();
    render();
  }

  function updateCatchupField(id, field, value) {
    const bill = state.bills.find((b) => b.id === id);
    if (!bill) return;
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return;
    bill[field] = num;
    if (field === "pastDueAmount" && num > (bill.originalPastDueAmount || 0)) {
      bill.originalPastDueAmount = num;
    }
    saveState();
    render();
  }

  // --- Record a paycheck ---

  function recordPaycheck(sourceId, amount) {
    if (!amount || amount <= 0) {
      alert("Enter a valid paycheck amount.");
      return;
    }
    if (state.bills.length === 0) {
      alert("Add at least one bill first.");
      return;
    }
    const income = totalWeeklyIncome();
    if (!income) {
      alert("Add at least one income source first.");
      return;
    }

    const source = state.incomeSources.find((s) => s.id === sourceId);
    let spentTotal = 0;
    let catchupTotal = 0;

    state.bills.forEach((bill) => {
      const totalWeekly = totalWeeklyForBill(bill);
      const pct = totalWeekly / income;
      const dollarsTotal = pct * amount;
      const reg = regularWeekly(bill);
      const cu = actualCatchup(bill);
      const regShare = totalWeekly > 0 ? reg / totalWeekly : 0;
      const cuShare = totalWeekly > 0 ? cu / totalWeekly : 0;

      bill.saved = (bill.saved || 0) + dollarsTotal * regShare;

      const catchupDollars = dollarsTotal * cuShare;
      if (catchupDollars > 0 && bill.pastDueAmount > 0) {
        const wasPastDue = bill.pastDueAmount;
        bill.pastDueAmount = Math.max(0, bill.pastDueAmount - catchupDollars);
        catchupTotal += Math.min(catchupDollars, wasPastDue);
        if (bill.pastDueAmount === 0) {
          addLog(`🎉 Past-due balance for ${bill.name} is fully caught up!`, "paid");
        }
      }

      spentTotal += dollarsTotal;
    });

    state.leftover += amount - spentTotal;
    addLog(
      `Recorded ${source ? source.name : "a"} paycheck of ${currency(amount)} — allocated ${currency(spentTotal)}` +
        (catchupTotal > 0 ? ` (incl. ${currency(catchupTotal)} toward past-due catch-up).` : ".")
    );

    const todayStr = new Date().toISOString().slice(0, 10);
    state.bills.forEach((bill) => {
      while (bill.nextDueDate <= todayStr) {
        if (bill.saved >= bill.amount) {
          bill.saved -= bill.amount;
          addLog(`Paid ${bill.name}: ${currency(bill.amount)}`, "paid");
        } else {
          const shortBy = bill.amount - bill.saved;
          bill.saved = 0;
          addLog(`Paid ${bill.name} but was short by ${currency(shortBy)} — increase its allocation or income.`, "shortfall");
        }
        bill.nextDueDate = addWeeks(bill.nextDueDate, FREQ_WEEKS[bill.frequency]);
      }
    });

    saveState();
    render();
  }

  // --- Rendering ---

  function renderIncome() {
    const tbody = document.getElementById("income-body");
    tbody.innerHTML = "";
    document.getElementById("income-empty").classList.toggle("hidden", state.incomeSources.length > 0);

    state.incomeSources.forEach((src) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(src.name)}</td>
        <td>${currency(src.amount)}</td>
        <td>${FREQ_LABEL[src.frequency]}</td>
        <td>${currency(weeklyEq(src.amount, src.frequency))}</td>
        <td><button class="btn-small btn-danger" data-action="remove-income" data-id="${src.id}">Remove</button></td>
      `;
      tbody.appendChild(tr);
    });

    const select = document.getElementById("record-source");
    const prevValue = select.value;
    select.innerHTML = "";
    state.incomeSources.forEach((src) => {
      const opt = document.createElement("option");
      opt.value = src.id;
      opt.textContent = `${src.name} (${currency(src.amount)} ${FREQ_LABEL[src.frequency].toLowerCase()})`;
      select.appendChild(opt);
    });
    if (prevValue && state.incomeSources.some((s) => s.id === prevValue)) {
      select.value = prevValue;
    }
    updateRecordAmountDefault();
  }

  function updateRecordAmountDefault() {
    const select = document.getElementById("record-source");
    const amountInput = document.getElementById("record-amount");
    const src = state.incomeSources.find((s) => s.id === select.value);
    if (src && !amountInput.dataset.userEdited) {
      amountInput.value = src.amount;
    }
  }

  function renderStats() {
    const income = totalWeeklyIncome();
    const committed = totalRegularWeekly() + state.bills.reduce((s, b) => s + actualCatchup(b), 0);
    const surplus = income - committed;
    const pastDueTotal = state.bills.reduce((s, b) => s + (b.pastDueAmount || 0), 0);

    document.getElementById("stat-income-value").textContent = currency(income);
    document.getElementById("stat-committed-value").textContent = currency(committed);

    const surplusEl = document.getElementById("stat-surplus-value");
    surplusEl.textContent = currency(surplus);
    surplusEl.className = "stat-value " + (surplus < 0 ? "stat-critical" : surplus < income * 0.05 ? "stat-warning" : "stat-good");

    const committedEl = document.getElementById("stat-committed-value");
    committedEl.className = "stat-value " + (committed > income ? "stat-critical" : "");

    const pastDueEl = document.getElementById("stat-pastdue-value");
    pastDueEl.textContent = currency(pastDueTotal);
    pastDueEl.className = "stat-value " + (pastDueTotal > 0 ? "stat-warning" : "stat-good");
    document.getElementById("stat-pastdue-sub").textContent =
      pastDueTotal > 0 ? `across ${state.bills.filter((b) => b.pastDueAmount > 0).length} bill(s)` : "you're all caught up";
  }

  function renderInsight() {
    const banner = document.getElementById("insight-banner");
    const income = totalWeeklyIncome();
    const regular = totalRegularWeekly();
    const surplus = income - regular;
    const pastDueBills = state.bills.filter((b) => b.pastDueAmount > 0);
    const desired = totalDesiredCatchup();
    const available = Math.max(0, surplus);

    if (state.incomeSources.length === 0 || state.bills.length === 0) {
      banner.classList.add("hidden");
      return;
    }

    banner.classList.remove("hidden");

    if (regular > income) {
      const gap = regular - income;
      banner.className = "banner banner-critical";
      banner.innerHTML = `⛔ <strong>Your regular bills alone need ${currency(gap)}/week more than your income covers.</strong> Close this gap first (more income, lower bills, or renegotiate due dates) — catch-up on past-due balances isn't possible until regular bills are fully funded.`;
      return;
    }

    if (pastDueBills.length === 0) {
      banner.className = "banner banner-good";
      banner.innerHTML = `✅ All bills are current. You have ${currency(surplus)}/week of surplus after your regular bills.`;
      return;
    }

    if (desired > available) {
      banner.className = "banner banner-warning";
      banner.innerHTML = `⚠️ You have ${currency(available)}/week free after regular bills, but catching up on your target schedule would take ${currency(desired)}/week. Catch-up is scaled down to fit — payoff will take longer than targeted for past-due bills, but <strong>your regular bills stay fully funded and won't become newly late</strong> because of this plan.`;
    } else {
      banner.className = "banner banner-good";
      banner.innerHTML = `✅ Your ${currency(available)}/week surplus fully covers your target catch-up pace. All past-due balances are on track to clear on schedule, with ${currency(available - desired)}/week left over afterward.`;
    }
  }

  function renderAllocation() {
    const tbody = document.getElementById("allocation-body");
    tbody.innerHTML = "";
    document.getElementById("empty-state").classList.toggle("hidden", state.bills.length > 0);

    state.bills.forEach((bill) => {
      const pct = pctOfPaycheck(bill);
      const progressPct = Math.min(100, (bill.saved / bill.amount) * 100 || 0);
      const days = daysUntil(bill.nextDueDate);
      const dueLabel = days < 0 ? "overdue" : days === 0 ? "today" : `in ${days}d`;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(bill.name)}${bill.pastDueAmount > 0 ? ' <span class="badge badge-warning">past due</span>' : ""}</td>
        <td>${currency(bill.amount)}</td>
        <td>${FREQ_LABEL[bill.frequency]}</td>
        <td>${bill.nextDueDate} <span class="hint">(${dueLabel})</span></td>
        <td class="${totalPercent() > 100 ? "pct-over-100" : ""}">${pct.toFixed(1)}%</td>
        <td>${currency(totalWeeklyForBill(bill))}</td>
        <td class="progress-cell">
          <div class="progress-track">
            <div class="progress-fill ${progressPct >= 100 ? "over" : ""}" style="width:${progressPct}%"></div>
          </div>
          <div class="progress-label">${currency(bill.saved || 0)} / ${currency(bill.amount)}</div>
        </td>
        <td class="actions-cell">
          ${bill.pastDueAmount > 0 ? "" : `<button class="btn-small" data-action="mark-pastdue" data-id="${bill.id}">Mark past due</button>`}
          <button class="btn-small" data-action="pay" data-id="${bill.id}">Mark paid</button>
          <button class="btn-small btn-danger" data-action="remove" data-id="${bill.id}">Remove</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    const total = totalPercent();
    const totalPctEl = document.getElementById("total-pct");
    totalPctEl.textContent = `${total.toFixed(1)}%`;
    totalPctEl.className = total > 100 ? "pct-over-100" : "";
    document.getElementById("total-amt").textContent = currency(
      state.bills.reduce((sum, b) => sum + (pctOfPaycheck(b) / 100) * totalWeeklyIncome(), 0)
    );
  }

  function renderCatchup() {
    const card = document.getElementById("catchup-card");
    const pastDueBills = state.bills.filter((b) => b.pastDueAmount > 0);
    card.classList.toggle("hidden", pastDueBills.length === 0);
    if (pastDueBills.length === 0) return;

    const totalOwed = pastDueBills.reduce((s, b) => s + b.pastDueAmount, 0);
    const totalCatchup = pastDueBills.reduce((s, b) => s + actualCatchup(b), 0);
    document.getElementById("catchup-summary").textContent =
      `${currency(totalOwed)} owed across ${pastDueBills.length} bill(s); currently catching up at ${currency(totalCatchup)}/week combined.`;

    const tbody = document.getElementById("catchup-body");
    tbody.innerHTML = "";
    pastDueBills.forEach((bill) => {
      const rate = actualCatchup(bill);
      const original = bill.originalPastDueAmount || bill.pastDueAmount;
      const progressPct = original > 0 ? Math.max(0, Math.min(100, 100 * (1 - bill.pastDueAmount / original))) : 0;
      const pct = totalWeeklyIncome() ? (rate / totalWeeklyIncome()) * 100 : 0;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(bill.name)}</td>
        <td><input type="number" min="0" step="0.01" class="inline-input" value="${bill.pastDueAmount.toFixed(2)}" data-action="edit-catchup" data-field="pastDueAmount" data-id="${bill.id}" /></td>
        <td><input type="number" min="1" step="1" class="inline-input" value="${bill.catchUpTargetWeeks}" data-action="edit-catchup" data-field="catchUpTargetWeeks" data-id="${bill.id}" /> wk</td>
        <td>${currency(rate)}/wk</td>
        <td>${pct.toFixed(1)}%</td>
        <td>${payoffDateLabel(bill)}</td>
        <td class="progress-cell">
          <div class="progress-track">
            <div class="progress-fill" style="width:${progressPct}%"></div>
          </div>
        </td>
        <td><button class="btn-small" data-action="clear-pastdue" data-id="${bill.id}">Paid off</button></td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderLog() {
    const logEl = document.getElementById("activity-log");
    logEl.innerHTML = "";
    if (state.log.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No activity yet.";
      logEl.appendChild(li);
      return;
    }
    state.log.forEach((entry) => {
      const li = document.createElement("li");
      li.className = entry.kind;
      const time = new Date(entry.at).toLocaleString();
      li.textContent = `${time} — ${entry.message}`;
      logEl.appendChild(li);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function render() {
    document.getElementById("leftover-amount").textContent = currency(state.leftover || 0);
    renderIncome();
    renderStats();
    renderInsight();
    renderAllocation();
    renderCatchup();
    renderLog();
  }

  // --- Event wiring ---

  document.getElementById("income-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("income-name").value.trim();
    const amount = parseFloat(document.getElementById("income-amount").value);
    const frequency = document.getElementById("income-frequency").value;
    if (!name || isNaN(amount) || amount <= 0) return;
    addIncomeSource(name, amount, frequency);
    e.target.reset();
  });

  document.getElementById("income-body").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action='remove-income']");
    if (!btn) return;
    if (confirm("Remove this income source?")) removeIncomeSource(btn.dataset.id);
  });

  document.getElementById("record-source").addEventListener("change", () => {
    document.getElementById("record-amount").dataset.userEdited = "";
    updateRecordAmountDefault();
  });

  document.getElementById("record-amount").addEventListener("input", (e) => {
    e.target.dataset.userEdited = "1";
  });

  document.getElementById("record-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const sourceId = document.getElementById("record-source").value;
    const amount = parseFloat(document.getElementById("record-amount").value);
    recordPaycheck(sourceId, amount);
    document.getElementById("record-amount").dataset.userEdited = "";
  });

  document.getElementById("bill-is-past-due").addEventListener("change", (e) => {
    document.getElementById("bill-pastdue-amount-wrap").classList.toggle("hidden", !e.target.checked);
    document.getElementById("bill-pastdue-weeks-wrap").classList.toggle("hidden", !e.target.checked);
  });

  document.getElementById("bill-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("bill-name").value.trim();
    const amount = parseFloat(document.getElementById("bill-amount").value);
    const frequency = document.getElementById("bill-frequency").value;
    const dueDate = document.getElementById("bill-due-date").value;
    const isPastDue = document.getElementById("bill-is-past-due").checked;
    const pastDueAmount = isPastDue ? parseFloat(document.getElementById("bill-pastdue-amount").value) : 0;
    const catchUpTargetWeeks = isPastDue ? parseFloat(document.getElementById("bill-pastdue-weeks").value) : 8;
    if (!name || isNaN(amount) || amount <= 0 || !dueDate) return;
    addBill(name, amount, frequency, dueDate, isNaN(pastDueAmount) ? 0 : pastDueAmount, catchUpTargetWeeks);
    e.target.reset();
    document.getElementById("bill-frequency").value = "monthly";
    document.getElementById("bill-pastdue-amount-wrap").classList.add("hidden");
    document.getElementById("bill-pastdue-weeks-wrap").classList.add("hidden");
    document.getElementById("bill-due-date").value = new Date().toISOString().slice(0, 10);
  });

  document.getElementById("allocation-body").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === "remove") {
      if (confirm("Remove this bill?")) removeBill(id);
    } else if (btn.dataset.action === "pay") {
      markPaidNow(id);
    } else if (btn.dataset.action === "mark-pastdue") {
      markPastDue(id);
    }
  });

  document.getElementById("catchup-body").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action='clear-pastdue']");
    if (!btn) return;
    clearPastDue(btn.dataset.id);
  });

  document.getElementById("catchup-body").addEventListener("change", (e) => {
    const input = e.target.closest("input[data-action='edit-catchup']");
    if (!input) return;
    updateCatchupField(input.dataset.id, input.dataset.field, input.value);
  });

  document.getElementById("bill-due-date").value = new Date().toISOString().slice(0, 10);

  render();
})();
