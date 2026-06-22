const bank = window.QUESTION_BANK;
const questions = bank.questions;
const storageKey = "trainer-question-bank-progress-v1";
const autoAdvanceDelay = 1400;

const typeNames = {
  single: "单选题",
  multiple: "多选题",
  judgement: "判断题",
  subjective: "简答题",
};

let state = loadState();
let currentList = [];
let currentPosition = 0;
let selected = [];
let advanceTimer = null;

const els = {
  sourceLine: document.querySelector("#sourceLine"),
  summary: document.querySelector("#summary"),
  mode: document.querySelector("#mode"),
  typeFilter: document.querySelector("#typeFilter"),
  search: document.querySelector("#search"),
  prevBtn: document.querySelector("#prevBtn"),
  nextBtn: document.querySelector("#nextBtn"),
  resetCurrentBtn: document.querySelector("#resetCurrentBtn"),
  resetAllBtn: document.querySelector("#resetAllBtn"),
  progressText: document.querySelector("#progressText"),
  progressBar: document.querySelector("#progressBar"),
  questionNav: document.querySelector("#questionNav"),
  questionCard: document.querySelector("#questionCard"),
};

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || {};
  } catch {
    return {};
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function getRecord(id) {
  return state[id] || {
    attempts: 0,
    wrongAttempts: 0,
    correct: false,
    firstCorrect: false,
    lastAnswer: "",
  };
}

function setRecord(id, patch) {
  state[id] = { ...getRecord(id), ...patch };
  saveState();
}

function normalizeAnswer(values) {
  return [...values].sort().join("");
}

function classifyRecord(question) {
  const record = getRecord(question.id);
  if (!record.attempts) return "fresh";
  if (record.firstCorrect) return "first";
  return "again";
}

function filteredQuestions() {
  const mode = els.mode.value;
  const type = els.typeFilter.value;
  const keyword = els.search.value.trim();

  return questions.filter((question) => {
    if (type !== "all" && question.type !== type) return false;
    if (keyword && !question.prompt.includes(keyword) && !question.answer.includes(keyword)) return false;

    const recordClass = classifyRecord(question);
    if (mode === "first") return recordClass === "first";
    if (mode === "again") return recordClass === "again";
    return true;
  });
}

function renderSummary() {
  const answered = questions.filter((question) => getRecord(question.id).attempts > 0).length;
  const first = questions.filter((question) => classifyRecord(question) === "first").length;
  const again = questions.filter((question) => classifyRecord(question) === "again").length;
  const completeRate = Math.round((answered / questions.length) * 100);

  els.sourceLine.textContent = `${bank.sourceFile} · 共 ${bank.counts.total} 题`;
  els.summary.innerHTML = [
    `单选 ${bank.counts.single}`,
    `多选 ${bank.counts.multiple}`,
    `判断 ${bank.counts.judgement}`,
    `简答 ${bank.counts.subjective}`,
    `已练 ${answered}`,
    `首次答对 ${first}`,
    `非首次答对 ${again}`,
  ]
    .map((text) => `<span class="pill">${text}</span>`)
    .join("");

  els.progressText.textContent = `${answered}/${questions.length} · ${completeRate}%`;
  els.progressBar.style.width = `${completeRate}%`;
}

function renderNav() {
  els.questionNav.innerHTML = currentList
    .map((question, index) => {
      const cls = ["navItem", classifyRecord(question)];
      if (index === currentPosition) cls.push("active");
      return `<button class="${cls.join(" ")}" data-index="${index}" type="button">${question.index}</button>`;
    })
    .join("");
}

function statusPill(question) {
  const record = getRecord(question.id);
  if (!record.attempts) return '<span class="pill statusTag">未作答</span>';
  if (record.firstCorrect) return '<span class="pill statusTag ok">首次答对</span>';
  if (record.correct) return '<span class="pill statusTag warn">非首次答对</span>';
  return '<span class="pill statusTag bad">需继续学习</span>';
}

function renderQuestion() {
  renderSummary();
  currentList = filteredQuestions();
  if (currentPosition >= currentList.length) currentPosition = Math.max(0, currentList.length - 1);
  renderNav();

  if (!currentList.length) {
    els.questionCard.innerHTML = '<div class="empty">当前筛选条件下没有题目。</div>';
    return;
  }

  const question = currentList[currentPosition];
  const record = getRecord(question.id);
  selected = record.lastAnswer ? answerToSelection(record.lastAnswer, question) : [];

  els.questionCard.innerHTML = `
    <div class="questionMeta">
      <span class="pill typeTag">${typeNames[question.type]}</span>
      <span class="pill">第 ${question.index} 题</span>
      <span class="pill">原题号 ${question.sourceNumber}</span>
      ${statusPill(question)}
      <span class="pill">作答 ${record.attempts} 次</span>
    </div>
    <div class="prompt">${escapeHtml(question.prompt)}</div>
    ${renderAnswerArea(question, record)}
    <div id="feedback" class="feedback"></div>
    ${renderReference(question, record)}
  `;
}

function answerToSelection(answer, question) {
  if (question.type === "judgement") return answer ? [answer] : [];
  return answer ? answer.split("") : [];
}

function renderAnswerArea(question, record) {
  if (question.type === "single" || question.type === "multiple") {
    const options = question.options.length ? question.options : ["A", "B", "C", "D", "E"];
    return `
      <div class="answerArea">
        <div class="choiceGrid">
          ${options.map((option) => `<button class="choiceBtn${selected.includes(option) ? " selected" : ""}" data-choice="${option}" type="button">${option}</button>`).join("")}
        </div>
      </div>
    `;
  }

  if (question.type === "judgement") {
    return `
      <div class="answerArea">
        <div class="choiceGrid">
          ${["正确", "错误"].map((option) => `<button class="choiceBtn${selected.join("") === option ? " selected" : ""}" data-choice="${option}" type="button">${option}</button>`).join("")}
        </div>
      </div>
    `;
  }

  return `
    <div class="answerArea">
      <textarea id="subjectiveAnswer" placeholder="在这里作答">${escapeHtml(record.lastAnswer || "")}</textarea>
      <button class="primaryBtn" id="showReferenceBtn" type="button">查看参考答案</button>
      <div class="actions">
        <button id="markMasteredBtn" type="button">标记掌握并下一题</button>
        <button id="markAgainBtn" type="button">标记继续学习并下一题</button>
      </div>
    </div>
  `;
}

function renderReference(question, record) {
  if (!record.attempts) return "";
  const label = question.type === "subjective" ? "参考答案" : "答案";
  const analysis = question.analysis
    ? `<h2>解析</h2><div class="analysisText">${escapeHtml(question.analysis)}</div>`
    : "";
  return `
    <section class="reference">
      <h2>${label}</h2>
      <div class="answerText">${escapeHtml(question.answer)}</div>
      ${analysis}
    </section>
  `;
}

function maybeAutoSubmit(question) {
  if (question.type === "single" || question.type === "judgement") {
    submitObjective(question);
    return;
  }

  if (question.type === "multiple" && selected.length >= question.answer.length) {
    submitObjective(question);
  }
}

function submitObjective(question) {
  if (!selected.length) return;
  const answer = question.type === "judgement" ? selected.join("") : normalizeAnswer(selected);
  const correct = answer === question.answer;
  const record = getRecord(question.id);
  const attempts = record.attempts + 1;
  setRecord(question.id, {
    attempts,
    wrongAttempts: record.wrongAttempts + (correct ? 0 : 1),
    correct: record.correct || correct,
    firstCorrect: record.firstCorrect || (correct && attempts === 1),
    lastAnswer: answer,
  });
  renderQuestion();
  showFeedback(correct ? "回答正确，正在进入下一题。" : `回答错误，正确答案：${question.answer}。正在进入下一题。`, correct);
  scheduleAdvance();
}

function submitSubjective(question, mastered) {
  const text = document.querySelector("#subjectiveAnswer")?.value || "";
  const record = getRecord(question.id);
  const attempts = record.attempts + 1;
  setRecord(question.id, {
    attempts,
    wrongAttempts: record.wrongAttempts + (mastered ? 0 : 1),
    correct: record.correct || mastered,
    firstCorrect: record.firstCorrect || (mastered && attempts === 1),
    lastAnswer: text,
  });
  renderQuestion();
  showFeedback(mastered ? "已标记掌握，正在进入下一题。" : "已标记继续学习，正在进入下一题。", mastered);
  scheduleAdvance();
}

function scheduleAdvance() {
  clearTimeout(advanceTimer);
  advanceTimer = setTimeout(() => {
    if (!currentList.length) return;
    if (currentPosition < currentList.length - 1) {
      currentPosition += 1;
    }
    renderQuestion();
  }, autoAdvanceDelay);
}

function showFeedback(message, correct) {
  const feedback = document.querySelector("#feedback");
  if (!feedback) return;
  feedback.textContent = message;
  feedback.className = `feedback show ${correct ? "correct" : "wrong"}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function move(delta) {
  clearTimeout(advanceTimer);
  if (!currentList.length) return;
  currentPosition = Math.min(Math.max(currentPosition + delta, 0), currentList.length - 1);
  renderQuestion();
}

els.questionNav.addEventListener("click", (event) => {
  const button = event.target.closest("[data-index]");
  if (!button) return;
  clearTimeout(advanceTimer);
  currentPosition = Number(button.dataset.index);
  renderQuestion();
});

els.questionCard.addEventListener("click", (event) => {
  const question = currentList[currentPosition];
  if (!question) return;

  const choiceButton = event.target.closest("[data-choice]");
  if (choiceButton) {
    const choice = choiceButton.dataset.choice;
    if (question.type === "multiple") {
      selected = selected.includes(choice) ? selected.filter((item) => item !== choice) : [...selected, choice];
    } else {
      selected = [choice];
    }
    setRecord(question.id, { lastAnswer: question.type === "judgement" ? selected.join("") : normalizeAnswer(selected) });
    renderQuestion();
    maybeAutoSubmit(question);
    return;
  }

  if (event.target.id === "showReferenceBtn") submitSubjective(question, false);
  if (event.target.id === "markMasteredBtn") submitSubjective(question, true);
  if (event.target.id === "markAgainBtn") submitSubjective(question, false);
});

els.prevBtn.addEventListener("click", () => move(-1));
els.nextBtn.addEventListener("click", () => move(1));

els.resetCurrentBtn.addEventListener("click", () => {
  const question = currentList[currentPosition];
  if (!question) return;
  clearTimeout(advanceTimer);
  delete state[question.id];
  saveState();
  renderQuestion();
});

els.resetAllBtn.addEventListener("click", () => {
  if (!confirm("确定清空全部作答记录？")) return;
  clearTimeout(advanceTimer);
  state = {};
  saveState();
  renderQuestion();
});

[els.mode, els.typeFilter, els.search].forEach((element) => {
  element.addEventListener("input", () => {
    clearTimeout(advanceTimer);
    currentPosition = 0;
    renderQuestion();
  });
});

document.addEventListener("keydown", (event) => {
  if (event.target.matches("input, textarea, select")) return;
  if (event.key === "ArrowLeft") move(-1);
  if (event.key === "ArrowRight") move(1);
});

renderQuestion();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
