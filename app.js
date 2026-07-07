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
    n.toLocaleString(undefined, { style: "currency", currency: "USD" });

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        paycheck: { amount: 0, frequency: "weekly" },
        bills: [],
        leftover: 0,
        log: [],
      };
    }
    try {
      const parsed = JSON.parse(raw);
      return {
        paycheck: parsed.paycheck || { amount: 0, frequency: "weekly" },
        bills: parsed.bills || [],
        leftover: parsed.leftover || 0,
        log: parsed.log || [],
      };
    } catch (e) {
      console.error("Failed to parse stored data, resetting.", e);
      return {
        paycheck: { amount: 0, frequency: "weekly" },
        bills: [],
        leftover: 0,
        log: [],
      };
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  let state = loadState();

  function addLog(message, kind) {
    state.log.unshift({ message, kind: kind || "info", at: new Date().toISOString() });
    state.log = state.log.slice(0, 30);
  }

  // Weekly-equivalent cost of a bill divided by weekly-equivalent paycheck,
  // as a percentage. This is independent of the paycheck's own frequency.
  function billPercentOfPaycheck(bill) {
    const weeklyPaycheck = state.paycheck.amount / FREQ_WEEKS[state.paycheck.frequency];
    if (!weeklyPaycheck) return 0;
    const weeklyBill = bill.amount / FREQ_WEEKS[bill.frequency];
    return (weeklyBill / weeklyPaycheck) * 100;
  }

  function dollarsPerPaycheck(bill) {
    return (billPercentOfPaycheck(bill) / 100) * state.paycheck.amount;
  }

  function totalPercent() {
    return state.bills.reduce((sum, b) => sum + billPercentOfPaycheck(b), 0);
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

  function recordPaycheck() {
    if (!state.paycheck.amount) {
      alert("Set your paycheck amount first.");
      return;
    }
    if (state.bills.length === 0) {
      alert("Add at least one bill first.");
      return;
    }

    let spent = 0;
    state.bills.forEach((bill) => {
      const amt = dollarsPerPaycheck(bill);
      bill.saved = (bill.saved || 0) + amt;
      spent += amt;
    });
    state.leftover += state.paycheck.amount - spent;
    addLog(`Recorded paycheck of ${currency(state.paycheck.amount)} — allocated ${currency(spent)} across ${state.bills.length} bill(s).`);

    // Auto-pay any bills whose due date has arrived.
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

  function addBill(name, amount, frequency, dueDate) {
    state.bills.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      amount,
      frequency,
      nextDueDate: dueDate,
      saved: 0,
    });
    addLog(`Added bill: ${name} (${currency(amount)}, ${FREQ_LABEL[frequency].toLowerCase()})`);
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

  function render() {
    document.getElementById("paycheck-amount").value = state.paycheck.amount || "";
    document.getElementById("paycheck-frequency").value = state.paycheck.frequency;
    document.getElementById("leftover-amount").textContent = currency(state.leftover || 0);

    const tbody = document.getElementById("allocation-body");
    tbody.innerHTML = "";
    document.getElementById("empty-state").classList.toggle("hidden", state.bills.length > 0);

    state.bills.forEach((bill) => {
      const pct = billPercentOfPaycheck(bill);
      const dollars = dollarsPerPaycheck(bill);
      const progressPct = Math.min(100, (bill.saved / bill.amount) * 100 || 0);
      const days = daysUntil(bill.nextDueDate);
      const dueLabel = days < 0 ? "overdue" : days === 0 ? "today" : `in ${days}d`;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(bill.name)}</td>
        <td>${currency(bill.amount)}</td>
        <td>${FREQ_LABEL[bill.frequency]}</td>
        <td>${bill.nextDueDate} <span class="hint">(${dueLabel})</span></td>
        <td class="${pct > 100 ? "pct-over-100" : ""}">${pct.toFixed(1)}%</td>
        <td>${currency(dollars)}</td>
        <td class="progress-cell">
          <div class="progress-track">
            <div class="progress-fill ${progressPct >= 100 ? "over" : ""}" style="width:${progressPct}%"></div>
          </div>
          <div class="progress-label">${currency(bill.saved || 0)} / ${currency(bill.amount)}</div>
        </td>
        <td>
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
      state.bills.reduce((sum, b) => sum + dollarsPerPaycheck(b), 0)
    );

    const banner = document.getElementById("warning-banner");
    if (total > 100) {
      banner.textContent = `⚠️ Your bills need ${total.toFixed(1)}% of each paycheck — that's more than 100%. You're short by about ${currency(((total - 100) / 100) * state.paycheck.amount)} per paycheck.`;
      banner.classList.remove("hidden");
    } else {
      banner.classList.add("hidden");
    }

    const logEl = document.getElementById("activity-log");
    logEl.innerHTML = "";
    if (state.log.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No activity yet.";
      logEl.appendChild(li);
    } else {
      state.log.forEach((entry) => {
        const li = document.createElement("li");
        li.className = entry.kind;
        const time = new Date(entry.at).toLocaleString();
        li.textContent = `${time} — ${entry.message}`;
        logEl.appendChild(li);
      });
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Event wiring ---

  document.getElementById("paycheck-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const amount = parseFloat(document.getElementById("paycheck-amount").value);
    const frequency = document.getElementById("paycheck-frequency").value;
    if (isNaN(amount) || amount <= 0) return;
    state.paycheck = { amount, frequency };
    addLog(`Updated paycheck: ${currency(amount)} ${FREQ_LABEL[frequency].toLowerCase()}`);
    saveState();
    render();
  });

  document.getElementById("bill-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("bill-name").value.trim();
    const amount = parseFloat(document.getElementById("bill-amount").value);
    const frequency = document.getElementById("bill-frequency").value;
    const dueDate = document.getElementById("bill-due-date").value;
    if (!name || isNaN(amount) || amount <= 0 || !dueDate) return;
    addBill(name, amount, frequency, dueDate);
    e.target.reset();
    document.getElementById("bill-frequency").value = "monthly";
  });

  document.getElementById("record-paycheck-btn").addEventListener("click", recordPaycheck);

  document.getElementById("allocation-body").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === "remove") {
      if (confirm("Remove this bill?")) removeBill(id);
    } else if (btn.dataset.action === "pay") {
      markPaidNow(id);
    }
  });

  // Default the "next due date" field to today for convenience.
  document.getElementById("bill-due-date").value = new Date().toISOString().slice(0, 10);

  render();
})();
