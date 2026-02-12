/* ============================================================
   Blue Archive イントロクイズ - main.js (HTML変更なし対応版)
   ============================================================ */

const NEXT_QUESTION_DELAY = 1000;
const GAME_OVER_DELAY = 1000;
const EXTENDED_RESULT_DELAY = 2000;

const GAME_MODES = {
    MENU: 'menu',
    NORMAL: 'normal',
    TIMED: 'timed',
    ENDLESS: 'endless',
    COMPOSER_QUIZ: 'composer_quiz',
    ARCHIVE: 'archive'
};

const defaultGameData = {
    settings: {
        normalQuestions: 10,
        timedDuration: 60000,
        composerFilter: 'All',
        volume: 25
    },
    stats: {
        highScores: { normal: 0, timed: 0, endless: 0, composer_quiz: 0 },
        songStats: {},
    },
    achievements: {
        normal: false, hard: false, veryhard: false, hardcore: false,
        extreme: false, insane: false, torment: false, lunatic: false
    },
};

const TITLE_SCREEN_VIDEO_ID = 'ISZ8lKOVapA';
const SUB_SCREEN_VIDEO_ID = 'I7A-xuDS-rA';
const TARGET_COMPOSERS = ['Mitsukiyo', 'Nor', 'KARUT', 'EmoCosine'];

// 状態管理フラグ
let player = null; 
let isPlayerReady = false; 
let isDataLoaded = false;
let isScreenTransitioned = false;

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

// DOM要素の参照
const domElements = {
    loadingScreen: document.getElementById('loading-screen'),
    menuScreen: document.getElementById('menu-screen'),
    gameScreen: document.getElementById('game-screen'),
    scoreDisplay: document.getElementById('score-display'),
    timerDisplay: document.getElementById('timer-display'),
    questionCount: document.getElementById('question-count'),
    feedback: document.getElementById('feedback'),
    choices: document.getElementById('choices'),
    resultOverlay: document.getElementById('result-overlay'),
    resultScore: document.getElementById('result-score'),
    archiveSearch: document.getElementById('archive-search'),
    archiveGrid: document.getElementById('archive-grid'),
    volumeSlider: document.getElementById('volumeSlider'),
    startPrompt: document.getElementById('start-prompt')
};

/* ============================================================
   Initialization & API Handling
   ============================================================ */

function initApp() {
    loadGameData();
    isDataLoaded = true;
    checkReadyStatus();

    // 変更開始：セーフティ・タイムアウト（5秒経っても消えない場合は強制表示）
    setTimeout(() => {
        if (!isScreenTransitioned) {
            console.warn("Loading timeout: Forcing screen display.");
            hideLoadingAndShowMenu();
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
    if (gameData.settings && player.setVolume) {
        player.setVolume(gameData.settings.volume || 25);
    }
    checkReadyStatus();
}

function checkReadyStatus() {
    if (isPlayerReady && isDataLoaded && !isScreenTransitioned) {
        hideLoadingAndShowMenu();
    }
}

// 変更開始：HTMLを変えずにロード画面を制御
function hideLoadingAndShowMenu() {
    isScreenTransitioned = true;
    if (domElements.loadingScreen) {
        domElements.loadingScreen.style.transition = 'opacity 0.5s ease';
        domElements.loadingScreen.style.opacity = '0';
        setTimeout(() => {
            domElements.loadingScreen.style.display = 'none';
        }, 500);
    }
    showScreen('menu-screen');
}

function loadGameData() {
    try {
        const saved = localStorage.getItem('blueArchiveQuizDataV2');
        if (saved) {
            const parsed = JSON.parse(saved);
            // 既存データに新しい設定項目をマージ
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

function saveGameData() {
    localStorage.setItem('blueArchiveQuizDataV2', JSON.stringify(gameData));
}

/* ============================================================
   Screen Management
   ============================================================ */

function showScreen(screenId) {
    // 全ての画面を非表示にする
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    if (domElements.resultOverlay) domElements.resultOverlay.style.display = 'none';

    const target = document.getElementById(screenId);
    if (target) target.style.display = 'block';
    
    gameState.mode = (screenId === 'menu-screen') ? GAME_MODES.MENU : gameState.mode;
}

/* ============================================================
   Game Logic
   ============================================================ */

function startGame(mode) {
    gameState.mode = mode;
    gameState.score = 0;
    gameState.currentIndex = 0;
    gameState.answerChecked = false;

    // プレイリスト構築
    if (mode === GAME_MODES.COMPOSER_QUIZ) {
        currentPlaylist = playlist.filter(s => TARGET_COMPOSERS.includes(s.composer));
    } else {
        const filter = gameData.settings.composerFilter;
        currentPlaylist = (filter === 'All') ? playlist : playlist.filter(s => s.composer === filter);
    }

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
    if (domElements.feedback) {
        domElements.feedback.textContent = '';
        domElements.feedback.className = '';
    }
    
    const currentSong = currentPlaylist[gameState.currentIndex % currentPlaylist.length];
    correctAnswer = currentSong.title;
    currentVideoId = currentSong.videoId;

    if (domElements.questionCount) {
        const total = (gameState.mode === GAME_MODES.NORMAL) ? `/${gameData.settings.normalQuestions}` : '';
        domElements.questionCount.textContent = `Question: ${gameState.currentIndex + 1}${total}`;
    }
    if (domElements.scoreDisplay) {
        domElements.scoreDisplay.textContent = `Score: ${gameState.score}`;
    }

    generateChoices(currentSong);
    
    // 変更開始：プレイヤー準備完了を待つガード
    if (isPlayerReady && player && typeof player.loadVideoById === 'function') {
        player.loadVideoById({
            videoId: currentVideoId,
            startSeconds: 0
        });
    } else {
        console.log("Waiting for player API...");
        setTimeout(nextQuestion, 500);
        return;
    }

    if (gameState.mode === GAME_MODES.TIMED && gameState.currentIndex === 0) {
        startTimer();
    }
}

function generateChoices(correctSong) {
    let choices = [correctSong.title];
    let attempts = 0;

    // 変更開始：無限ループ防止
    while (choices.length < 4 && attempts < 100) {
        attempts++;
        const randomSong = playlist[Math.floor(Math.random() * playlist.length)];
        if (!choices.includes(randomSong.title)) {
            choices.push(randomSong.title);
        }
    }
    
    shuffleArray(choices);
    if (domElements.choices) {
        domElements.choices.innerHTML = '';
        choices.forEach(title => {
            const btn = document.createElement('button');
            btn.textContent = title;
            btn.onclick = () => checkAnswer(title);
            domElements.choices.appendChild(btn);
        });
    }
}

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

    // 正解・不正解の色付け
    const btns = domElements.choices.querySelectorAll('button');
    btns.forEach(btn => {
        if (btn.textContent === correctAnswer) {
            btn.style.backgroundColor = '#28a745';
            btn.style.color = 'white';
        } else if (btn.textContent === selected && !isCorrect) {
            btn.style.backgroundColor = '#dc3545';
            btn.style.color = 'white';
        }
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
    if (isPlayerReady && player) player.stopVideo();
}

function startTimer() {
    let timeLeft = gameData.settings.timedDuration / 1000;
    if (domElements.timerDisplay) domElements.timerDisplay.textContent = `Time: ${timeLeft}s`;
    
    gameTimer = setInterval(() => {
        timeLeft--;
        if (domElements.timerDisplay) domElements.timerDisplay.textContent = `Time: ${timeLeft}s`;
        if (timeLeft <= 0) {
            clearInterval(gameTimer);
            endGame();
        }
    }, 1000);
}

function endGame() {
    if (gameTimer) clearInterval(gameTimer);
    if (isPlayerReady && player) player.stopVideo();

    if (domElements.resultOverlay) {
        domElements.resultOverlay.style.display = 'flex';
        domElements.resultScore.textContent = `${gameState.score} 点`;
    }
    
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

// 変更開始：入力干渉防止付きキーリスナー
document.addEventListener('keydown', (event) => {
    // 検索窓など入力中は何もしない
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        return;
    }

    const isGameActive = domElements.gameScreen && domElements.gameScreen.style.display !== 'none';
    if (gameState.mode !== GAME_MODES.MENU && !gameState.answerChecked && isGameActive) {
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

/* ============================================================
   Archive & Settings
   ============================================================ */

function showArchive() {
    showScreen('sound-archive-screen');
    renderArchive('');
}

function renderArchive(query) {
    if (!domElements.archiveGrid) return;
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
                <div style="font-size: 0.75rem; color: #6c757d;">${song.composer}</div>
            </div>
        `;
        div.onclick = () => {
            if (isPlayerReady) player.loadVideoById(song.videoId);
        };
        domElements.archiveGrid.appendChild(div);
    });
}

// 検索入力
if (domElements.archiveSearch) {
    domElements.archiveSearch.addEventListener('input', (e) => renderArchive(e.target.value));
}

// 戻るボタン（ID指定で取得）
const archiveBackBtn = document.getElementById('archive-back-btn');
if (archiveBackBtn) {
    archiveBackBtn.onclick = () => initGame();
}

// 音量スライダー
if (domElements.volumeSlider) {
    domElements.volumeSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (isPlayerReady && player.setVolume) player.setVolume(val);
        gameData.settings.volume = val;
        saveGameData();
    });
}

// 初期化開始
document.addEventListener('DOMContentLoaded', initApp);
