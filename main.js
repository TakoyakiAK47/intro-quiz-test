/* ============================================================
   Blue Archive イントロクイズ - main.js (Robust Edition)
   ============================================================ */

const NEXT_QUESTION_DELAY = 1000;
const GAME_OVER_DELAY = 1000;
const EXTENDED_RESULT_DELAY = 2000;

const GAME_MODES = {\n    MENU: 'menu',\n    NORMAL: 'normal',\n    TIMED: 'timed',\n    ENDLESS: 'endless',\n    COMPOSER_QUIZ: 'composer_quiz',\n    ARCHIVE: 'archive'\n};

const defaultGameData = {\n    settings: {\n        normalQuestions: 10,\n        timedDuration: 60000,\n        composerFilter: 'All',\n    },\n    stats: {\n        highScores: { normal: 0, timed: 0, endless: 0, composer_quiz: 0 },\n        songStats: {},\n    },\n    achievements: {\n        normal: false, hard: false, veryhard: false, hardcore: false,\n        extreme: false, insane: false, torment: false, lunatic: false\n    },\n};

const TITLE_SCREEN_VIDEO_ID = 'ISZ8lKOVapA';
const SUB_SCREEN_VIDEO_ID = 'I7A-xuDS-rA';
const TARGET_COMPOSERS = ['Mitsukiyo', 'Nor', 'KARUT', 'EmoCosine'];

// 変更開始: API準備完了フラグ
let player = null; 
let isPlayerReady = false; 
let isDataLoaded = false;
// 変更終了

let correctAnswer = '';
let currentVideoId = '';
let currentSongTitle = ''; 
let gameTimer = null;
let gameData = {};
let currentPlaylist = [];
let gameState = {
    mode: GAME_MODES.MENU,
    score: 0,
    currentIndex: 0,
    startTime: 0,
    timeLeft: 0,
    answered: false,
    answerChecked: false,
    history: []
};

const domElements = {
    loadingScreen: document.getElementById('loading-screen'),
    menuScreen: document.getElementById('menu-screen'),
    gameScreen: document.getElementById('game-screen'),
    statsScreen: document.getElementById('stats-screen'),
    settingsScreen: document.getElementById('settings-screen'),
    archiveScreen: document.getElementById('sound-archive-screen'),
    scoreDisplay: document.getElementById('score-display'),
    timerDisplay: document.getElementById('timer-display'),
    questionCount: document.getElementById('question-count'),
    feedback: document.getElementById('feedback'),
    choices: document.getElementById('choices'),
    resultOverlay: document.getElementById('result-overlay'),
    resultScore: document.getElementById('result-score'),
    resultStats: document.getElementById('result-stats'),
    archiveSearch: document.getElementById('archive-search'),
    archiveGrid: document.getElementById('archive-grid'),
    volumeSlider: document.getElementById('volumeSlider'),
    startPrompt: document.getElementById('start-prompt')
};

/* ============================================================
   Initialization & API Handling
   ============================================================ */

// 変更開始: 堅牢な初期化フロー
function initApp() {
    loadGameData();
    isDataLoaded = true;
    checkReadyStatus();

    // セーフティ・タイムアウト（5秒経っても消えない場合は強制表示）
    setTimeout(() => {
        if (domElements.loadingScreen && !domElements.loadingScreen.classList.contains('hidden')) {
            console.warn("Loading timeout: Forcing screen display.");
            showScreen('menu-screen');
        }
    }, 5000);
}

function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '360',
        width: '640',
        videoId: TITLE_SCREEN_VIDEO_ID,
        playerVars: {
            'autoplay': 0,
            'controls': 0,
            'showinfo': 0,
            'rel': 0,
            'modestbranding': 1,
            'iv_load_policy': 3,
            'disablekb': 1,
            'origin': window.location.origin
        },
        events: {
            'onReady': onPlayerReady,
            'onError': (e) => console.error("YT Player Error:", e.data)
        }
    });
}

function onPlayerReady(event) {
    isPlayerReady = true;
    if (gameData.settings) {
        player.setVolume(gameData.settings.volume || 25);
    }
    checkReadyStatus();
}

function checkReadyStatus() {
    if (isPlayerReady && isDataLoaded) {
        showScreen('menu-screen');
    }
}

// 変更開始: データマージ（自動修復）機能付きロード
function loadGameData() {
    try {
        const saved = localStorage.getItem('blueArchiveQuizDataV2');
        if (saved) {
            const parsed = JSON.parse(saved);
            // デフォルト値と保存値をマージして、欠損しているキーを補完する
            gameData = {
                settings: { ...defaultGameData.settings, ...parsed.settings },
                stats: { ...defaultGameData.stats, ...parsed.stats },
                achievements: { ...defaultGameData.achievements, ...parsed.achievements }
            };
        } else {
            gameData = JSON.parse(JSON.stringify(defaultGameData));
        }
    } catch (e) {
        console.error("Data Load Error:", e);
        gameData = JSON.parse(JSON.stringify(defaultGameData));
    }
    
    if (domElements.volumeSlider) {
        domElements.volumeSlider.value = gameData.settings.volume || 25;
    }
}
// 変更終了

function saveGameData() {
    localStorage.setItem('blueArchiveQuizDataV2', JSON.stringify(gameData));
}

/* ============================================================
   Screen Management
   ============================================================ */

function showScreen(screenId) {
    // 全画面を隠す
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    domElements.resultOverlay.style.display = 'none';
    
    // ロード画面を隠す（初回のみ）
    if (domElements.loadingScreen) {
        domElements.loadingScreen.classList.add('hidden');
        setTimeout(() => domElements.loadingScreen.style.display = 'none', 500);
    }

    const target = document.getElementById(screenId);
    if (target) target.style.display = 'block';
    
    gameState.mode = screenId === 'menu-screen' ? GAME_MODES.MENU : gameState.mode;
    
    // メニューに戻った時はBGM（タイトル動画）を流す等の処理をここに追加可能
}

/* ============================================================
   Game Logic
   ============================================================ */

function startGame(mode) {
    gameState.mode = mode;
    gameState.score = 0;
    gameState.currentIndex = 0;
    gameState.history = [];
    gameState.answerChecked = false;

    // プレイリストの構築
    if (mode === GAME_MODES.COMPOSER_QUIZ) {
        currentPlaylist = playlist.filter(s => TARGET_COMPOSERS.includes(s.composer));
    } else {
        const filter = gameData.settings.composerFilter;
        currentPlaylist = (filter === 'All') ? playlist : playlist.filter(s => s.composer === filter);
    }

    // クイズ対象外の曲を除外
    currentPlaylist = currentPlaylist.filter(s => s.quiz !== false);

    if (currentPlaylist.length < 4) {
        alert("対象の曲数が少なすぎます。設定を確認してください。");
        return;
    }

    shuffleArray(currentPlaylist);
    showScreen('game-screen');
    nextQuestion();
}

function nextQuestion() {
    if (gameState.mode === GAME_MODES.NORMAL && gameState.currentIndex >= gameData.settings.normalQuestions) {
        endGame();
        return;
    }

    gameState.answerChecked = false;
    domElements.feedback.textContent = '';
    domElements.feedback.className = '';
    
    const currentSong = currentPlaylist[gameState.currentIndex % currentPlaylist.length];
    correctAnswer = currentSong.title;
    currentVideoId = currentSong.videoId;
    currentSongTitle = currentSong.title;

    domElements.questionCount.textContent = `Question: ${gameState.currentIndex + 1}${gameState.mode === GAME_MODES.NORMAL ? '/' + gameData.settings.normalQuestions : ''}`;
    domElements.scoreDisplay.textContent = `Score: ${gameState.score}`;

    generateChoices(currentSong);
    
    // 変更開始: API準備ができているか確認してからロード
    if (isPlayerReady && player && typeof player.loadVideoById === 'function') {
        player.loadVideoById({
            videoId: currentVideoId,
            startSeconds: 0
        });
    } else {
        console.warn("Player not ready yet. Retrying...");
        setTimeout(() => nextQuestion(), 500);
        return;
    }
    // 変更終了

    if (gameState.mode === GAME_MODES.TIMED && gameState.currentIndex === 0) {
        startTimer();
    }
}

// 変更開始: 無限ループ防止策を追加
function generateChoices(correctSong) {
    let choices = [correctSong.title];
    let attempts = 0; // 無限ループ防止カウンタ

    while (choices.length < 4 && attempts < 100) {
        attempts++;
        const randomSong = playlist[Math.floor(Math.random() * playlist.length)];
        if (!choices.includes(randomSong.title)) {
            choices.push(randomSong.title);
        }
    }
    
    shuffleArray(choices);
    domElements.choices.innerHTML = '';
    choices.forEach(title => {
        const btn = document.createElement('button');
        btn.textContent = title;
        btn.onclick = () => checkAnswer(title);
        domElements.choices.appendChild(btn);
    });
}
// 変更終了

function checkAnswer(selected) {
    if (gameState.answerChecked) return;
    gameState.answerChecked = true;

    const isCorrect = (selected === correctAnswer);
    if (isCorrect) {
        gameState.score++;
        domElements.feedback.textContent = '正解！';
        domElements.feedback.className = 'feedback-correct';
    } else {
        domElements.feedback.textContent = `不正解... 正解は: ${correctAnswer}`;
        domElements.feedback.className = 'feedback-incorrect';
    }

    // ボタンの色変え
    Array.from(domElements.choices.children).forEach(btn => {
        if (btn.textContent === correctAnswer) btn.classList.add('correct');
        else if (btn.textContent === selected && !isCorrect) btn.classList.add('incorrect');
    });

    gameState.currentIndex++;
    setTimeout(nextQuestion, NEXT_QUESTION_DELAY);
}

/* ============================================================
   UI & Helpers
   ============================================================ */

function initGame() {
    if (gameTimer) clearInterval(gameTimer);
    showScreen('menu-screen');
    if (isPlayerReady) player.stopVideo();
}

function startTimer() {
    let timeLeft = gameData.settings.timedDuration / 1000;
    domElements.timerDisplay.textContent = `Time: ${timeLeft}s`;
    
    gameTimer = setInterval(() => {
        timeLeft--;
        domElements.timerDisplay.textContent = `Time: ${timeLeft}s`;
        if (timeLeft <= 0) {
            clearInterval(gameTimer);
            endGame();
        }
    }, 1000);
}

function endGame() {
    if (gameTimer) clearInterval(gameTimer);
    if (isPlayerReady) player.stopVideo();

    domElements.resultOverlay.style.display = 'flex';
    domElements.resultScore.textContent = `${gameState.score} 点`;
    
    // ハイスコア更新チェック
    const mode = gameState.mode;
    if (gameState.score > gameData.stats.highScores[mode]) {
        gameData.stats.highScores[mode] = gameState.score;
        saveGameData();
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// 変更開始: 入力干渉防止ガード付きのキーリスナー
document.addEventListener('keydown', (event) => {
    // フォーム入力中（検索など）はショートカットを無効化
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        return;
    }

    if (gameState.mode !== GAME_MODES.MENU && !gameState.answerChecked && domElements.gameScreen.style.display !== 'none') {
        const choices = domElements.choices.querySelectorAll('button');
        let keyIndex = -1;
        switch(event.key) {
            case '1': keyIndex = 0; break;
            case '2': keyIndex = 1; break;
            case '3': keyIndex = 2; break;
            case '4': keyIndex = 3; break;
        }
        if (keyIndex !== -1 && choices.length > keyIndex) {
            event.preventDefault(); 
            checkAnswer(choices[keyIndex].textContent.trim());
        }
    }
});
// 変更終了

/* ============================================================
   Archive & Settings (簡略化)
   ============================================================ */
function showArchive() {
    showScreen('sound-archive-screen');
    renderArchive('');
}

function renderArchive(query) {
    domElements.archiveGrid.innerHTML = '';
    const filtered = playlist.filter(s => 
        s.title.toLowerCase().includes(query.toLowerCase()) || 
        s.composer.toLowerCase().includes(query.toLowerCase())
    );

    filtered.forEach(song => {
        const div = document.createElement('div');
        div.className = 'archive-item';
        div.innerHTML = `
            <img src="https://img.youtube.com/vi/${song.videoId}/mqdefault.jpg" alt="${song.title}">
            <div class="archive-item-info">
                <div class="archive-item-title">${song.title}</div>
                <div style="font-size: 0.75rem; color: var(--grey-mid);">${song.composer}</div>
            </div>
        `;
        div.onclick = () => {
            if (isPlayerReady) player.loadVideoById(song.videoId);
        };
        domElements.archiveGrid.appendChild(div);
    });
}

domElements.archiveSearch.addEventListener('input', (e) => renderArchive(e.target.value));
document.getElementById('archive-back-btn').onclick = () => initGame();

// ボリューム操作
if (domElements.volumeSlider) {
    domElements.volumeSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (isPlayerReady) player.setVolume(val);
        gameData.settings.volume = val;
        saveGameData();
    });
}

// 初期化実行
// 変更開始: DOM読み込み完了時にアプリ初期化を開始
document.addEventListener('DOMContentLoaded', initApp);
// 変更終了
