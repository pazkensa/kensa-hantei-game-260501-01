const QUESTION_SETS = {
  all: { label: "全体", folder: null },
  karyukyu: { label: "顆粒球系", folder: "karyukyu_cells_png" },
  sekigakyu: { label: "赤芽球系", folder: "sekigakyu_cells_png" },
};
const SETTINGS_VERSION = 7;
const DEFAULT_QUESTION_COUNT = 10;
const DEFAULT_TIME_LIMIT_SECONDS = 10;
const DEFAULT_TIME_TRIAL_ENABLED = true;
const SCORE_HISTORY_KEY = "bloodCellScoreHistory";
const SCORE_HISTORY_LIMIT = 20;

const state = {
  cases: [],
  labels: [],
  order: [],
  index: 0,
  answered: false,
  selected: null,
  showHighlights: false,
  mode: "normal",
  phase: "idle",
  correctCount: 0,
  answeredCount: 0,
  totalDisplayMs: 0,
  questionStartedAt: 0,
  timerId: null,
  remainingSeconds: DEFAULT_TIME_LIMIT_SECONDS,
  timedOut: false,
  scoreHistory: loadScoreHistory(),
  scoreSaved: false,
  mistakes: loadMistakes(),
  settings: loadSettings(),
  questionSet: "all",
};

const els = {
  normalModeButton: document.querySelector("#normalModeButton"),
  weakModeButton: document.querySelector("#weakModeButton"),
  questionSetButtons: document.querySelectorAll("[data-question-set]"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsPanel: document.querySelector("#settingsPanel"),
  settingsForm: document.querySelector("#settingsForm"),
  timeTrialInput: document.querySelector("#timeTrialInput"),
  questionCountInput: document.querySelector("#questionCountInput"),
  questionCountHelp: document.querySelector("#questionCountHelp"),
  timeLimitInput: document.querySelector("#timeLimitInput"),
  startButton: document.querySelector("#startButton"),
  resetGameButton: document.querySelector("#resetGameButton"),
  modeLabel: document.querySelector("#modeLabel"),
  progressLabel: document.querySelector("#progressLabel"),
  timerLabel: document.querySelector("#timerLabel"),
  cellImage: document.querySelector("#cellImage"),
  photoFrame: document.querySelector("#cellImage").closest(".photo-frame"),
  highlightLayer: document.querySelector("#highlightLayer"),
  resetMistakesButton: document.querySelector("#resetMistakesButton"),
  categoryTitle: document.querySelector("#categoryTitle"),
  scoreLabel: document.querySelector("#scoreLabel"),
  answerButtons: document.querySelector("#answerButtons"),
  resultBox: document.querySelector("#resultBox"),
  resultTitle: document.querySelector("#resultTitle"),
  resultDetail: document.querySelector("#resultDetail"),
  caseTitle: document.querySelector("#caseTitle"),
  explanationText: document.querySelector("#explanationText"),
  pointList: document.querySelector("#pointList"),
  nextButton: document.querySelector("#nextButton"),
  mistakeCountLabel: document.querySelector("#mistakeCountLabel"),
  mistakeList: document.querySelector("#mistakeList"),
  scoreHistoryList: document.querySelector("#scoreHistoryList"),
  clearScoreHistoryButton: document.querySelector("#clearScoreHistoryButton"),
};

async function init() {
  bindEvents();

  try {
    const response = await fetch("./data/cases.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.cases = data.cases.map(normalizeCase);
    state.labels = data.labels;
    migrateSettings();
    state.questionSet = normalizeQuestionSet(state.settings.questionSet);
  } catch (error) {
    showLoadError(error);
    return;
  }

  prepareSettings();
  selectMode("normal");
}

function bindEvents() {
  els.normalModeButton.addEventListener("click", () => selectMode("normal"));
  els.weakModeButton.addEventListener("click", () => selectMode("weak"));
  els.questionSetButtons.forEach((button) => {
    button.addEventListener("click", () => selectQuestionSet(button.dataset.questionSet));
  });
  els.settingsButton.addEventListener("click", () => {
    els.settingsPanel.hidden = !els.settingsPanel.hidden;
  });
  els.settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    applySettings();
  });
  els.timeTrialInput.addEventListener("change", () => {
    els.timeLimitInput.disabled = !els.timeTrialInput.checked;
  });
  els.resetMistakesButton.addEventListener("click", () => {
    state.mistakes = {};
    saveMistakes();
    if (state.mode === "weak") {
      resetGame();
    } else {
      renderMistakes();
    }
  });
  els.clearScoreHistoryButton.addEventListener("click", () => {
    state.scoreHistory = [];
    saveScoreHistory();
    renderScoreHistory();
  });
  els.startButton.addEventListener("click", startGame);
  els.resetGameButton.addEventListener("click", resetGame);
  els.nextButton.addEventListener("click", nextCase);
  document.addEventListener("keydown", handleKeyboard);
}

function selectMode(mode) {
  state.mode = mode;
  resetGame();
}

function selectQuestionSet(questionSet) {
  state.questionSet = normalizeQuestionSet(questionSet);
  state.settings.questionSet = state.questionSet;
  saveSettings();
  resetGame();
}

function resetGame() {
  clearQuestionTimer();
  state.phase = "idle";
  state.index = 0;
  state.answered = false;
  state.selected = null;
  state.showHighlights = false;
  state.correctCount = 0;
  state.answeredCount = 0;
  state.totalDisplayMs = 0;
  state.questionStartedAt = 0;
  state.remainingSeconds = state.settings.timeLimitSeconds || DEFAULT_TIME_LIMIT_SECONDS;
  state.timedOut = false;
  state.scoreSaved = false;
  state.order = [];

  els.normalModeButton.classList.toggle("active", state.mode === "normal");
  els.weakModeButton.classList.toggle("active", state.mode === "weak");
  renderQuestionSetButtons();
  updateQuestionCountSetting();
  render();
}

function startGame() {
  const sourceCases =
    state.mode === "weak"
      ? getCurrentSourceCases().filter((item) => state.mistakes[item.id])
      : getCurrentSourceCases();

  state.order = shuffle(sourceCases.map((item) => item.id)).slice(
    0,
    getEffectiveQuestionCount(sourceCases.length),
  );

  state.phase = state.order.length === 0 ? "idle" : "playing";
  state.index = 0;
  state.answered = false;
  state.selected = null;
  state.showHighlights = false;
  state.correctCount = 0;
  state.answeredCount = 0;
  state.totalDisplayMs = 0;
  state.questionStartedAt = 0;
  state.timedOut = false;
  state.scoreSaved = false;
  state.remainingSeconds = state.settings.timeLimitSeconds;
  if (state.phase === "playing") startQuestionTimer();
  render();
}

function prepareSettings() {
  updateQuestionCountSetting();
  saveSettings();
}

function migrateSettings() {
  if (state.settings.version === SETTINGS_VERSION) return;
  state.settings = {
    ...state.settings,
    questionCount: state.settings.questionCount || DEFAULT_QUESTION_COUNT,
    timeTrialEnabled: typeof state.settings.timeTrialEnabled === "boolean"
      ? state.settings.timeTrialEnabled
      : DEFAULT_TIME_TRIAL_ENABLED,
    timeLimitSeconds: state.settings.timeLimitSeconds || DEFAULT_TIME_LIMIT_SECONDS,
    version: SETTINGS_VERSION,
  };
}

function updateQuestionCountSetting() {
  const max = getCurrentSourceCases().length;
  state.settings.questionCount = clampQuestionCount(state.settings.questionCount, max);
  state.settings.timeTrialEnabled = Boolean(state.settings.timeTrialEnabled);
  state.settings.timeLimitSeconds = clampTimeLimit(state.settings.timeLimitSeconds);
  els.timeTrialInput.checked = state.settings.timeTrialEnabled;
  els.questionCountInput.max = String(max);
  els.questionCountInput.value = String(state.settings.questionCount);
  els.questionCountHelp.textContent = `最大 ${max} 問`;
  els.timeLimitInput.value = String(state.settings.timeLimitSeconds);
  els.timeLimitInput.disabled = !state.settings.timeTrialEnabled;
}

function applySettings() {
  const max = getCurrentSourceCases().length;
  state.settings.timeTrialEnabled = els.timeTrialInput.checked;
  state.settings.questionCount = clampQuestionCount(els.questionCountInput.value, max);
  state.settings.timeLimitSeconds = clampTimeLimit(els.timeLimitInput.value);
  state.settings.questionSet = state.questionSet;
  els.questionCountInput.value = String(state.settings.questionCount);
  els.timeLimitInput.value = String(state.settings.timeLimitSeconds);
  els.timeLimitInput.disabled = !state.settings.timeTrialEnabled;
  saveSettings();
  resetGame();
}

function getEffectiveQuestionCount(sourceCount) {
  return Math.min(sourceCount, state.settings.questionCount);
}

function clampQuestionCount(value, max) {
  if (max <= 0) return 0;
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return Math.min(DEFAULT_QUESTION_COUNT, max);
  return Math.min(Math.max(number, 1), max);
}

function clampTimeLimit(value) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return DEFAULT_TIME_LIMIT_SECONDS;
  return Math.min(Math.max(number, 1), 600);
}

function handleKeyboard(event) {
  if (event.code !== "Space") return;
  const tagName = event.target && event.target.tagName
    ? event.target.tagName.toLowerCase()
    : "";
  if (["input", "textarea", "select"].includes(tagName)) return;
  event.preventDefault();
  if (state.phase === "idle") {
    startGame();
    return;
  }
  nextCase();
}

function render() {
  renderMistakes();
  renderScoreHistory();
  renderScore();
  renderControls();
  renderTimer();

  if (state.phase === "finished") {
    renderFinishedMode();
    return;
  }

  if (state.phase === "idle") {
    renderIdleMode();
    return;
  }

  if (state.order.length === 0) {
    renderEmptyMode();
    return;
  }

  const item = currentCase();
  els.modeLabel.textContent = getModeLabel();
  els.progressLabel.textContent = `${state.index + 1} / ${state.order.length}`;
  els.cellImage.src = item.image;
  els.cellImage.alt = `${item.answer}の細胞写真`;
  els.categoryTitle.textContent = item.group;
  els.caseTitle.textContent = item.title;
  els.explanationText.textContent = state.answered
    ? item.explanation
    : "回答後に、この細胞で注目すべき形態所見を表示します。";

  renderAnswerButtons(item);
  renderPointList(item);
  renderResult(item);
  renderHighlights();
}

function renderAnswerButtons(item) {
  els.answerButtons.innerHTML = "";
  getCurrentAnswerLabels().forEach((label) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.disabled = state.answered;
    if (state.answered && label === item.answer) {
      button.classList.add("correct", "answer-flash-correct");
    }
    if (state.answered && label === state.selected && label !== item.answer) {
      button.classList.add("wrong", "answer-flash-wrong");
    }
    button.addEventListener("click", () => answer(label));
    els.answerButtons.append(button);
  });
}

function renderPointList(item) {
  els.pointList.innerHTML = "";
  const points = state.answered ? item.points : item.points.map(() => "回答後に表示");
  points.forEach((point) => {
    const li = document.createElement("li");
    li.textContent = point;
    els.pointList.append(li);
  });
}

function renderResult(item) {
  els.resultBox.className = "result-box neutral";
  els.photoFrame.classList.remove("feedback-correct", "feedback-wrong");
  if (!state.answered) {
    els.resultTitle.textContent = "回答を選んでください";
    els.resultDetail.textContent = "分類ボタンを押すと正誤判定と観察ポイントが表示されます。";
    return;
  }

  const isCorrect = state.selected === item.answer;
  els.resultBox.classList.add(isCorrect ? "correct" : "wrong");
  els.resultBox.classList.add(isCorrect ? "result-pop-correct" : "result-pop-wrong");
  els.photoFrame.classList.add(isCorrect ? "feedback-correct" : "feedback-wrong");
  els.resultTitle.textContent = isCorrect ? "正解" : state.timedOut ? "時間切れ" : "不正解";
  els.resultDetail.textContent = isCorrect
    ? `この細胞は「${item.answer}」です。`
    : state.timedOut
      ? `制限時間内に回答できませんでした。正答: ${item.answer}`
      : `選択: ${state.selected} / 正答: ${item.answer}`;
}

function renderHighlights() {
  const item = currentCase();
  els.highlightLayer.innerHTML = "";
  els.highlightLayer.classList.remove("visible");

  if (!item || !state.answered) return;

  item.highlights.forEach((mark) => {
    const node = document.createElement("div");
    node.className = "highlight";
    node.style.left = `${mark.x}%`;
    node.style.top = `${mark.y}%`;
    node.style.width = `${mark.w}%`;
    node.style.height = `${mark.h}%`;

    const label = document.createElement("span");
    label.textContent = mark.label;
    node.append(label);
    els.highlightLayer.append(node);
  });
}

function renderMistakes() {
  const mistakeIds = Object.keys(state.mistakes);
  els.mistakeCountLabel.textContent = `${mistakeIds.length}件`;
  els.mistakeList.innerHTML = "";

  if (mistakeIds.length === 0) {
    const empty = document.createElement("span");
    empty.className = "empty-note";
    empty.textContent = "まだ記録はありません";
    els.mistakeList.append(empty);
    return;
  }

  mistakeIds
    .map((id) => state.cases.find((item) => item.id === id))
    .filter(Boolean)
    .forEach((item) => {
      const chip = document.createElement("span");
      chip.className = "mistake-chip";
      chip.textContent = `${item.answer} ${state.mistakes[item.id].count}回`;
      els.mistakeList.append(chip);
    });
}

function renderScoreHistory() {
  els.scoreHistoryList.innerHTML = "";

  if (state.scoreHistory.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = "まだスコア履歴はありません";
    els.scoreHistoryList.append(empty);
    return;
  }

  state.scoreHistory.forEach((record) => {
    const item = document.createElement("div");
    item.className = "history-item";

    const main = document.createElement("div");
    main.className = "history-main";
    const score = document.createElement("strong");
    score.textContent = `${record.correct} / ${record.total}`;
    const percent = document.createElement("span");
    percent.textContent = `${record.percent}%`;
    main.append(score, percent);

    const meta = document.createElement("p");
    meta.textContent = [
      formatHistoryDate(record.finishedAt),
      record.questionSetLabel,
      record.modeLabel,
      record.timeTrialEnabled ? `制限 ${record.timeLimitSeconds} 秒` : "時間制限なし",
      `平均 ${formatDuration(record.averageMs || 0)}`,
    ].join(" / ");

    item.append(main, meta);
    els.scoreHistoryList.append(item);
  });
}

function renderScore() {
  els.scoreLabel.textContent = `${state.correctCount} / ${state.answeredCount}`;
}

function renderControls() {
  document.body.classList.toggle(
    "is-answer-revealed",
    state.phase === "playing" && state.answered,
  );
  els.startButton.disabled = state.phase === "playing" || getCurrentSourceCount() === 0;
  els.resetGameButton.disabled = state.phase === "idle";
  els.nextButton.disabled = state.phase !== "playing" || !state.answered;
  els.nextButton.textContent =
    state.phase === "playing" && state.index === state.order.length - 1
      ? "結果を見る"
      : "次の問題";
}

function getCurrentSourceCount() {
  return state.mode === "weak"
    ? getCurrentSourceCases().filter((item) => state.mistakes[item.id]).length
    : getCurrentSourceCases().length;
}

function renderIdleMode() {
  const modeName = getModeLabel();
  const sourceCount = getCurrentSourceCount();
  const plannedCount = getEffectiveQuestionCount(sourceCount);

  els.modeLabel.textContent = `${modeName} / 開始前`;
  els.progressLabel.textContent = plannedCount > 0 ? `0 / ${plannedCount}` : "0 / 0";
  els.cellImage.removeAttribute("src");
  els.cellImage.alt = "スタート前の待機画面";
  els.highlightLayer.innerHTML = "";
  els.answerButtons.innerHTML = "";
  els.categoryTitle.textContent = "開始前";
  els.caseTitle.textContent = "スタートしてください";
  els.explanationText.textContent =
    plannedCount > 0
      ? buildStartMessage(plannedCount)
      : "このモードで出題できる問題がありません。";
  els.pointList.innerHTML = "";
  els.resultBox.className = "result-box neutral";
  els.resultTitle.textContent = "ゲーム開始待ち";
  els.resultDetail.textContent =
    "設定で問題数を確認してから、スタートボタンを押してください。";
}

function renderEmptyMode() {
  els.modeLabel.textContent = getModeLabel();
  els.progressLabel.textContent = "0 / 0";
  els.cellImage.removeAttribute("src");
  els.highlightLayer.innerHTML = "";
  els.answerButtons.innerHTML = "";
  els.categoryTitle.textContent = "復習対象なし";
  els.caseTitle.textContent = "間違えた問題がありません";
  els.explanationText.textContent =
    "通常モードで間違えた問題が、弱点復習モードの対象として保存されます。";
  els.pointList.innerHTML = "";
  els.resultBox.className = "result-box neutral";
  els.resultTitle.textContent = "通常モードで演習してください";
  els.resultDetail.textContent = "間違い記録はブラウザのローカルストレージに保存されます。";
}

function renderFinishedMode() {
  recordScoreIfNeeded();
  const total = state.answeredCount;
  const percent = total === 0 ? 0 : Math.round((state.correctCount / total) * 100);
  const modeName = getModeLabel();

  els.modeLabel.textContent = `${modeName} / 終了`;
  els.progressLabel.textContent = `${total} / ${state.order.length}`;
  els.cellImage.removeAttribute("src");
  els.cellImage.alt = "ゲーム終了画面";
  els.highlightLayer.innerHTML = "";
  els.answerButtons.innerHTML = "";
  els.categoryTitle.textContent = "結果";
  els.caseTitle.textContent = `得点 ${state.correctCount} / ${total}`;
  els.explanationText.textContent = buildReviewComment(percent);
  els.pointList.innerHTML = "";
  buildResultPoints(total, percent).forEach((point) => {
    const li = document.createElement("li");
    li.textContent = point;
    els.pointList.append(li);
  });
  els.resultBox.className = "result-box correct";
  els.resultTitle.textContent = "ゲーム終了";
  els.resultDetail.textContent = `正答率 ${percent}%。リセットで最初に戻り、スタートで再挑戦できます。`;
}

function answer(label) {
  if (state.phase !== "playing" || state.answered) return;
  finishQuestionTiming();
  const item = currentCase();
  state.answered = true;
  state.selected = label;
  state.showHighlights = false;
  state.timedOut = false;
  state.answeredCount += 1;

  if (label === item.answer) {
    state.correctCount += 1;
    if (state.mode === "weak") delete state.mistakes[item.id];
  } else {
    const old = state.mistakes[item.id] || { count: 0, lastAnswer: "" };
    state.mistakes[item.id] = {
      count: old.count + 1,
      lastAnswer: label,
      updatedAt: new Date().toISOString(),
    };
  }

  saveMistakes();
  render();
}

function nextCase() {
  if (state.phase !== "playing" || state.order.length === 0 || !state.answered) return;
  if (state.index >= state.order.length - 1) {
    finishGame();
    render();
    return;
  }
  state.index = (state.index + 1) % state.order.length;
  state.answered = false;
  state.selected = null;
  state.showHighlights = false;
  state.timedOut = false;
  if (state.mode === "weak") {
    state.order = state.order.filter((id) => state.mistakes[id]);
    if (state.index >= state.order.length) state.index = 0;
  }
  startQuestionTimer();
  render();
}

function buildReviewComment(percent) {
  if (percent >= 90) {
    return "形態所見をかなり安定して捉えられています。次は似た成熟段階同士の区別を意識して復習しましょう。";
  }
  if (percent >= 70) {
    return "基本的な分類はできています。誤答した細胞では、核形、顆粒、細胞質の色調を順番に確認しましょう。";
  }
  if (percent >= 50) {
    return "判定の手がかりはつかみ始めています。まずは系統ごとの成熟順序を整理してから再挑戦しましょう。";
  }
  return "まだ分類基準が不安定です。解説を見ながら、核の成熟度と細胞質の特徴を一つずつ確認しましょう。";
}

function buildResultPoints(total, percent) {
  const averageMs = total === 0 ? 0 : state.totalDisplayMs / total;
  const points = [
    `回答数: ${total}問`,
    `正答数: ${state.correctCount}問`,
    `正答率: ${percent}%`,
    `現在の弱点記録: ${Object.keys(state.mistakes).length}件`,
  ];
  if (state.settings.timeTrialEnabled) {
    points.splice(3, 0, `表示時間合計: ${formatDuration(state.totalDisplayMs)}`);
    points.splice(4, 0, `1枚あたり平均: ${formatDuration(averageMs)}`);
  }
  return points;
}

function startQuestionTimer() {
  if (!state.settings.timeTrialEnabled) {
    clearQuestionTimer();
    state.questionStartedAt = 0;
    state.remainingSeconds = state.settings.timeLimitSeconds;
    renderTimer();
    return;
  }
  clearQuestionTimer();
  state.questionStartedAt = performance.now();
  state.remainingSeconds = state.settings.timeLimitSeconds;
  renderTimer();
  state.timerId = window.setInterval(tickQuestionTimer, 100);
}

function tickQuestionTimer() {
  if (state.phase !== "playing" || state.answered) {
    clearQuestionTimer();
    return;
  }

  const elapsedMs = performance.now() - state.questionStartedAt;
  const limitMs = state.settings.timeLimitSeconds * 1000;
  state.remainingSeconds = Math.max(0, Math.ceil((limitMs - elapsedMs) / 1000));
  renderTimer();

  if (elapsedMs >= limitMs) {
    handleTimeOut();
  }
}

function handleTimeOut() {
  if (state.phase !== "playing" || state.answered) return;
  finishQuestionTiming(state.settings.timeLimitSeconds * 1000);
  const item = currentCase();
  state.answered = true;
  state.selected = null;
  state.timedOut = true;
  state.answeredCount += 1;

  const old = state.mistakes[item.id] || { count: 0, lastAnswer: "" };
  state.mistakes[item.id] = {
    count: old.count + 1,
    lastAnswer: "時間切れ",
    updatedAt: new Date().toISOString(),
  };

  saveMistakes();
  render();
}

function finishGame() {
  clearQuestionTimer();
  state.phase = "finished";
  recordScoreIfNeeded();
}

function recordScoreIfNeeded() {
  if (state.scoreSaved || state.phase !== "finished" || state.answeredCount === 0) return;

  const total = state.answeredCount;
  const percent = Math.round((state.correctCount / total) * 100);
  const selectedSet = QUESTION_SETS[state.questionSet] || QUESTION_SETS.all;
  const averageMs = state.settings.timeTrialEnabled ? state.totalDisplayMs / total : 0;
  const modeLabel = state.mode === "weak" ? "弱点復習" : "通常";

  state.scoreHistory = [
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      finishedAt: new Date().toISOString(),
      correct: state.correctCount,
      total,
      percent,
      mode: state.mode,
      modeLabel,
      questionSet: state.questionSet,
      questionSetLabel: selectedSet.label,
      timeTrialEnabled: state.settings.timeTrialEnabled,
      timeLimitSeconds: state.settings.timeLimitSeconds,
      totalDisplayMs: Math.round(state.totalDisplayMs),
      averageMs: Math.round(averageMs),
    },
    ...state.scoreHistory,
  ].slice(0, SCORE_HISTORY_LIMIT);
  state.scoreSaved = true;
  saveScoreHistory();
}

function finishQuestionTiming(forcedElapsedMs) {
  if (!state.settings.timeTrialEnabled || !state.questionStartedAt) return;
  const elapsedMs = typeof forcedElapsedMs === "number"
    ? forcedElapsedMs
    : performance.now() - state.questionStartedAt;
  state.totalDisplayMs += Math.max(0, elapsedMs);
  state.questionStartedAt = 0;
  clearQuestionTimer();
}

function clearQuestionTimer() {
  if (!state.timerId) return;
  window.clearInterval(state.timerId);
  state.timerId = null;
}

function renderTimer() {
  if (!state.settings.timeTrialEnabled) {
    els.timerLabel.textContent = "時間制限なし";
    els.timerLabel.classList.remove("warning");
    return;
  }
  if (state.phase === "playing" && !state.answered) {
    els.timerLabel.textContent = `残り ${state.remainingSeconds} 秒`;
    els.timerLabel.classList.toggle("warning", state.remainingSeconds <= 2);
    return;
  }
  els.timerLabel.textContent = `制限 ${state.settings.timeLimitSeconds || DEFAULT_TIME_LIMIT_SECONDS} 秒`;
  els.timerLabel.classList.remove("warning");
}

function formatDuration(ms) {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}分${rest.toFixed(1)}秒`;
}

function buildStartMessage(plannedCount) {
  const base = `スタートを押すと、${plannedCount}問の分類ゲームを開始します。`;
  if (!state.settings.timeTrialEnabled) return `${base}時間制限なしです。`;
  return `${base}1枚あたり${state.settings.timeLimitSeconds}秒です。`;
}

function currentCase() {
  const id = state.order[state.index];
  return state.cases.find((item) => item.id === id);
}

function getCurrentSourceCases() {
  const selectedSet = QUESTION_SETS[state.questionSet] || QUESTION_SETS.all;
  const folder = selectedSet.folder;
  if (!folder) return state.cases;
  return state.cases.filter((item) => item.questionFolder === folder);
}

function getCurrentAnswerLabels() {
  const answers = new Set(getCurrentSourceCases().map((item) => item.answer));
  return state.labels.filter((label) => answers.has(label));
}

function getModeLabel() {
  const learningMode = state.mode === "weak" ? "弱点復習モード" : "通常モード";
  const selectedSet = QUESTION_SETS[state.questionSet] || QUESTION_SETS.all;
  return `${selectedSet.label} / ${learningMode}`;
}

function renderQuestionSetButtons() {
  els.questionSetButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.questionSet === state.questionSet);
  });
}

function normalizeCase(item) {
  const questionFolder = getQuestionFolder(item.image);
  return {
    ...item,
    image: normalizeImagePath(item.image),
    questionFolder,
  };
}

function getQuestionFolder(imagePath) {
  return imagePath.split("/").find((part) => part.endsWith("_cells_png")) || "";
}

function normalizeImagePath(imagePath) {
  if (imagePath.includes("question_images/")) return imagePath;
  const normalized = imagePath.replace(/^\.\//, "");
  return `./question_images/${normalized}`;
}

function normalizeQuestionSet(questionSet) {
  return Object.prototype.hasOwnProperty.call(QUESTION_SETS, questionSet) ? questionSet : "all";
}

function loadMistakes() {
  try {
    return JSON.parse(localStorage.getItem("bloodCellMistakes") || "{}");
  } catch {
    return {};
  }
}

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem("bloodCellSettings") || "{}");
  } catch {
    return {};
  }
}

function loadScoreHistory() {
  try {
    const records = JSON.parse(localStorage.getItem(SCORE_HISTORY_KEY) || "[]");
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

function saveMistakes() {
  localStorage.setItem("bloodCellMistakes", JSON.stringify(state.mistakes));
}

function saveScoreHistory() {
  localStorage.setItem(SCORE_HISTORY_KEY, JSON.stringify(state.scoreHistory));
}

function saveSettings() {
  state.settings.version = SETTINGS_VERSION;
  localStorage.setItem("bloodCellSettings", JSON.stringify(state.settings));
}

function formatHistoryDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "日時不明";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function shuffle(items) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function showLoadError(error) {
  els.resultBox.className = "result-box wrong";
  els.resultTitle.textContent = "データを読み込めません";
  els.resultDetail.textContent =
    "ローカルサーバー経由で開いてください。例: python -m http.server 5173";
  console.error(error);
}

init();
