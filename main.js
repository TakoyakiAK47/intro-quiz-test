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

const SUB_SCREEN_VIDEO_ID = 'I7A-xuDS-rA';
const TARGET_COMPOSERS = ['Mitsukiyo', 'Nor', 'KARUT', 'EmoCosine'];

let player = null; 
let correctAnswer = '';
let currentVideoId = '';
let currentSongTitle = ''; 
let gameTimer = null;
let gameData = {};
let currentPlaylist = [];
let answeredVideos = [];

let gameState = {
    mode: GAME_MODES.MENU,
    score: 0,
    totalQuestions: 0,
    endlessStreak: 0,
    timeLeftMs: 0,
    answerChecked: false,
};

const domElements = {};

function saveGameData() {
    try {
        localStorage.setItem('blueArchiveQuizDataV2', JSON.stringify(gameData));
    } catch (e) {
        console.error("Failed to save game data:", e);
    }
}

function loadGameData() {
    try {
        const savedData = localStorage.getItem('blueArchiveQuizDataV2');
        gameData = savedData ? JSON.parse(savedData) : JSON.parse(JSON.stringify(defaultGameData));
        gameData.settings = { ...defaultGameData.settings, ...(gameData.settings || {}) };
        gameData.stats = { ...defaultGameData.stats, ...(gameData.stats || {}) };
        gameData.achievements = { ...defaultGameData.achievements, ...(gameData.achievements || {}) };
        
        if (gameData.stats.highScores.composer_quiz === undefined) {
            gameData.stats.highScores.composer_quiz = 0;
        }
    } catch (e) {
        console.error("Failed to load game data:", e);
        gameData = JSON.parse(JSON.stringify(defaultGameData));
    }
}

function onYouTubeIframeAPIReady() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) loadingOverlay.style.display = 'none';
    
    player = new YT.Player('player', {
        height: '0', width: '0', videoId: '',
        playerVars: { 'playsinline': 1, 'origin': location.protocol + '//' + location.hostname },
        events: { 
            'onReady': onPlayerReady, 
            'onStateChange': onPlayerStateChange,
            'onError': (e) => console.warn("YouTube Player Error:", e.data)
        }
    });
}

function onPlayerReady(event) {
    if (!player || typeof player.mute !== 'function') return;
    
    player.mute(); 
    if (domElements.volumeSlider) {
        player.setVolume(parseInt(domElements.volumeSlider.value, 10));
    }
    
    try {
        player.loadVideoById({ 
            videoId: TITLE_SCREEN_VIDEO_ID, 
            startSeconds: 0
        });
        player.pauseVideo();
    } catch (e) {
        console.warn("Initial video load failed.");
    }
    
    initGame();
}

function onPlayerStateChange(event) {
    if (!player || typeof player.seekTo !== 'function') return;

    if (gameState.mode === GAME_MODES.MENU && event.data === YT.PlayerState.ENDED) {
         player.seekTo(0); 
         player.playVideo();
    }
    
    if (gameState.mode !== GAME_MODES.MENU && gameState.mode !== GAME_MODES.ARCHIVE && !gameState.answerChecked && event.data === YT.PlayerState.ENDED) {
        console.log("Song ended. Auto-looping for current quiz...");
        player.seekTo(0);
        player.playVideo();
    }
}

function showScreen(screenId) {
    document.querySelectorAll('.screen, #main-menu, #game-view').forEach(el => el.style.display = 'none');
    const target = document.getElementById(screenId);
    if (target) {
        target.style.display = (screenId === 'game-view' || screenId === 'main-menu') ? 'flex' : 'block';
    }
}

function initGame() {
    gameState.mode = GAME_MODES.MENU;
    if (gameTimer) clearInterval(gameTimer);
    
    if (domElements.currentSongName) {
        domElements.currentSongName.style.display = 'none';
        domElements.currentSongName.innerText = '';
    }

    if (player && typeof player.loadVideoById === 'function') {
        try {
            player.loadVideoById({ 
                videoId: TITLE_SCREEN_VIDEO_ID, 
                startSeconds: 0
            });
            player.mute(); 
            player.playVideo();
            player.pauseVideo();
        } catch (e) { console.error("Menu video load failed", e); }
    }
    
    showScreen('main-menu');
    if (domElements.footer) domElements.footer.style.display = 'none'; 
    
    const container = domElements.mainMenu;
    if (!container) return;
    container.innerHTML = '';

    const modes = [
        { id: GAME_MODES.NORMAL, label: 'ノーマルモード', action: () => selectMode(GAME_MODES.NORMAL) },
        { id: GAME_MODES.TIMED, label: 'タイムアタックモード', action: () => selectMode(GAME_MODES.TIMED) },
        { id: GAME_MODES.ENDLESS, label: 'エンドレスモード', action: () => selectMode(GAME_MODES.ENDLESS) },
        { id: GAME_MODES.COMPOSER_QUIZ, label: '作曲者当てクイズ', action: () => selectMode(GAME_MODES.COMPOSER_QUIZ) },
        { id: 'stats', label: '実績・統計', action: showStatsScreen },
        { id: GAME_MODES.ARCHIVE, label: 'サウンドアーカイブ', action: showSoundArchive }
    ];

    modes.forEach(({ id, label, action }) => {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.onclick = action;
        btn.className = `mode-${id}`;
        container.appendChild(btn);
    });
}

function showStartPrompt() {
    if (!domElements.startPrompt) return;
    domElements.startPrompt.style.display = 'flex';
    domElements.startPromptBtn.onclick = () => {
        domElements.startPrompt.style.display = 'none';
        if (player && typeof player.unMute === 'function') {
             player.unMute();
        }
        launchQuiz();
    };
}

function selectMode(selectedMode) {
    gameState.mode = selectedMode;
    if (gameState.mode === GAME_MODES.NORMAL || gameState.mode === GAME_MODES.TIMED) {
        showScreen('settings-screen');
        setupModeSettings();
    } else { 
        showStartPrompt();
    }
}

function setupModeSettings() {
    const container = domElements.settingsScreen;
    if (!container) return;
    if (domElements.footer) domElements.footer.style.display = 'none';
    let settingsContent = '';
    
    if (gameState.mode === GAME_MODES.NORMAL) {
        const composers = ['All', ...new Set(playlist.map(s => s.composer).filter(c => c && c !== 'Unknown').sort())];
        const options = composers.map(c => `<option value="${c}" ${gameData.settings.composerFilter === c ? 'selected' : ''}>${c}</option>`).join('');
        settingsContent = `<h2>ノーマルモード設定</h2>
            <div class="setting-item"><label for="normal-questions">問題数:</label><input type="number" id="normal-questions" min="1" max="50" value="${gameData.settings.normalQuestions}"></div>
            <div class="setting-item"><label for="composer-filter">作曲者で絞り込む:</label><select id="composer-filter">${options}</select></div>`;
    } else if (gameState.mode === GAME_MODES.TIMED) {
        settingsContent = `<h2>タイムアタックモード設定</h2>
            <div class="setting-item"><label for="timed-duration">制限時間(秒):</label><input type="number" id="timed-duration" min="10" max="180" step="10" value="${gameData.settings.timedDuration / 1000}"></div>`;
    }

    container.innerHTML = `${settingsContent}
        <div style="margin-top: 2em;">
            <button id="settings-back-btn">戻る</button>
            <button id="start-game-btn">クイズ開始</button>
        </div>`;
    
    const startBtn = document.getElementById('start-game-btn');
    const backBtn = document.getElementById('settings-back-btn');
    
    if(startBtn) {
        startBtn.onclick = () => {
            if (gameState.mode === GAME_MODES.NORMAL) {
                gameData.settings.normalQuestions = parseInt(document.getElementById('normal-questions').value, 10);
                gameData.settings.composerFilter = document.getElementById('composer-filter').value;
            } else if (gameState.mode === GAME_MODES.TIMED) {
                gameData.settings.timedDuration = parseInt(document.getElementById('timed-duration').value, 10) * 1000;
            }
            saveGameData();
            showStartPrompt();
        };
    }
    if(backBtn) backBtn.onclick = initGame;
}

function showSoundArchive() {
    gameState.mode = GAME_MODES.ARCHIVE;
    showScreen('sound-archive-screen');
    if (domElements.footer) domElements.footer.style.display = 'none';

    if (player && typeof player.stopVideo === 'function') {
        player.stopVideo();
    }

    const grid = document.getElementById('archive-grid');
    const searchInput = document.getElementById('archive-search');
    const backBtn = document.getElementById('archive-back-btn');

    if (!grid || !searchInput || !backBtn) return;

    backBtn.onclick = initGame;
    searchInput.value = '';
    
    const allSongs = [...playlist, ...characterSongPlaylist];

    const renderArchiveItems = (filterText = '') => {
        grid.innerHTML = '';
        const lowerFilter = filterText.toLowerCase();

        const filteredSongs = allSongs.filter(song => {
            const title = (song.title || '').toLowerCase();
            const composer = (song.composer || '').toLowerCase();
            const context = (song.context || '').toLowerCase();
            return title.includes(lowerFilter) || composer.includes(lowerFilter) || context.includes(lowerFilter);
        });

        if (filteredSongs.length === 0) {
            grid.innerHTML = '<p style="grid-column: 1 / -1; color: var(--grey-mid);">該当する楽曲が見つかりませんでした。</p>';
            return;
        }

        filteredSongs.forEach(song => {
            const card = document.createElement('div');
            card.className = 'archive-card';
            
            const contextDisplay = song.context ? song.context.replace(/\n/g, '<br>') : '';

            card.innerHTML = `
                <img class="archive-card-thumb" src="${song.imageUrl}" alt="${song.title}" loading="lazy">
                <div class="archive-card-content">
                    <div class="archive-card-title">${song.title}</div>
                    <div class="archive-card-composer">${song.composer || 'Unknown'}</div>
                    ${contextDisplay ? `<div class="archive-card-meta">${contextDisplay}</div>` : ''}
                </div>
            `;
            
            card.onclick = () => {
                window.open(`https://www.youtube.com/watch?v=${song.videoId}`, '_blank');
            };

            grid.appendChild(card);
        });
    };

    renderArchiveItems();

    searchInput.oninput = (e) => {
        renderArchiveItems(e.target.value);
    };
}

function launchQuiz() {
    gameState.score = 0;
    gameState.totalQuestions = 0;
    gameState.endlessStreak = 0;
    gameState.answerChecked = false;
    answeredVideos = [];
    
    if (player && typeof player.stopVideo === 'function') {
        player.stopVideo(); 
    }
    
    const quizPlaylist = playlist.filter(song => song.quiz !== false);
    
    if (gameState.mode === GAME_MODES.COMPOSER_QUIZ) {
        currentPlaylist = quizPlaylist.filter(song => TARGET_COMPOSERS.includes(song.composer));
    } else {
        const filter = gameData.settings.composerFilter;
        currentPlaylist = (gameState.mode === GAME_MODES.NORMAL && filter !== 'All') 
            ? quizPlaylist.filter(song => song.composer === filter) 
            : [...quizPlaylist];
    }
    
    if (currentPlaylist.length < 4 && gameState.mode !== GAME_MODES.COMPOSER_QUIZ) {
        alert('選択した条件に該当する楽曲が少なすぎるため、クイズを開始できません。');
        initGame();
        return;
    }
    
    showScreen('game-view');
    if (domElements.gameControlsContainer) domElements.gameControlsContainer.style.display = 'block';

    if (gameState.mode === GAME_MODES.TIMED) {
        gameState.timeLeftMs = gameData.settings.timedDuration;
        if (gameTimer) clearInterval(gameTimer);
        gameTimer = setInterval(() => {
            gameState.timeLeftMs -= 10;
            if (gameState.timeLeftMs <= 0) {
                gameState.timeLeftMs = 0;
                endGame();
            }
            updateTimeDisplay(gameState.timeLeftMs);
        }, 10);
    }
    
    loadNextQuiz();
}

function loadNextQuiz() {
    const isTimeUp = gameState.mode === GAME_MODES.TIMED && gameState.timeLeftMs <= 0;
    const isNormalFinished = gameState.mode === GAME_MODES.NORMAL && gameState.totalQuestions >= gameData.settings.normalQuestions;

    if (isTimeUp || isNormalFinished) {
        endGame();
        return;
    }
    
    gameState.answerChecked = false;

    if (domElements.result) domElements.result.innerText = '';
    if (domElements.answerDetails) {
        domElements.answerDetails.innerText = '';
        domElements.answerDetails.style.display = 'none';
    }
    if (domElements.footer) domElements.footer.style.display = 'none'; 
    

    const isSpecialRound = (gameState.totalQuestions + 1) % 5 === 0 &&
                           [GAME_MODES.NORMAL, GAME_MODES.TIMED, GAME_MODES.ENDLESS].includes(gameState.mode);


    let targetPlaylist = isSpecialRound ? characterSongPlaylist : currentPlaylist;


    if (isSpecialRound && targetPlaylist.length === 0) {
        targetPlaylist = currentPlaylist;
    }
    
    let available = targetPlaylist.filter(p => !answeredVideos.includes(p.videoId));
    if (available.length < 1) {

        answeredVideos = [];
        available = targetPlaylist;
    }

    const random = available[Math.floor(Math.random() * available.length)];
    if (!random) {
        endGame();
        return;
    }

    currentVideoId = random.videoId;
    currentSongTitle = random.title;
    answeredVideos.push(currentVideoId);

    if (domElements.currentSongName) {
        if (gameState.mode === GAME_MODES.COMPOSER_QUIZ) {
            domElements.currentSongName.innerText = `🎵 ${currentSongTitle}`;
            domElements.currentSongName.style.display = 'block';
        } else {
            domElements.currentSongName.style.display = 'none';
            domElements.currentSongName.innerText = '';
        }
    }

    if (gameState.mode === GAME_MODES.COMPOSER_QUIZ) {
        correctAnswer = random.composer;
    } else {
        correctAnswer = random.title;
    }

    if (player && typeof player.stopVideo === 'function') {
        player.stopVideo();
    }
    
    updateUIState();
    playIntroClip();
    displayChoices(generateChoices(random));
}

function generateChoices(correctSongObject) {
    if (gameState.mode === GAME_MODES.COMPOSER_QUIZ) {
        return [...TARGET_COMPOSERS].sort(() => 0.5 - Math.random());
    }

    const correctTitle = correctSongObject.title;
    const choices = new Set([correctTitle]);

    const isCharacterSong = characterSongPlaylist.some(s => s.videoId === correctSongObject.videoId);
    const sourcePlaylist = isCharacterSong ? characterSongPlaylist : currentPlaylist;

    if (correctSongObject && correctSongObject.similarGroup) {
        const similarSongs = sourcePlaylist.filter(song => 
            song.similarGroup === correctSongObject.similarGroup && song.title !== correctTitle
        );
        if (similarSongs.length > 0) {
            choices.add(similarSongs[Math.floor(Math.random() * similarSongs.length)].title);
        }
    }
    
    const distractors = sourcePlaylist.filter(p => !choices.has(p.title)).map(p => p.title);
    while (choices.size < 4 && distractors.length > 0) {
        const randomIndex = Math.floor(Math.random() * distractors.length);
        choices.add(distractors.splice(randomIndex, 1)[0]);
    }
    
    return Array.from(choices).sort(() => 0.5 - Math.random());
}

function displayChoices(choices) {
    const container = domElements.choices;
    if (!container) return;
    container.innerHTML = '';
    choices.forEach(choice => {
        const btn = document.createElement('button');
        btn.innerHTML = `<span>${choice}</span>`;
        btn.onclick = () => checkAnswer(choice);
        container.appendChild(btn);
    });
}

function playIntroClip() {
    if (!player || typeof player.loadVideoById !== 'function') return;
    try {
        player.loadVideoById({ 
            videoId: currentVideoId, 
            startSeconds: 0,
            playerVars: { 'playsinline': 1 } 
        });
        player.playVideo();
    } catch (e) { console.warn("Video playback failed", e); }
}

function checkAnswer(selectedChoice) {
    if (gameState.answerChecked) return;
    gameState.answerChecked = true;
    
    if (player && typeof player.stopVideo === 'function') {
        player.stopVideo();
    }

    const isCorrect = (selectedChoice === correctAnswer);
    
    if (domElements.currentSongName) {
        domElements.currentSongName.innerText = `🎵 ${currentSongTitle}`;
        domElements.currentSongName.style.display = 'block';
    }

    if (isCorrect) {
        processCorrectAnswer();
    } else {
        processIncorrectAnswer();
    }

    let correctSongObject = playlist.find(song => song.videoId === currentVideoId);
    if (!correctSongObject) {
        correctSongObject = characterSongPlaylist.find(song => song.videoId === currentVideoId);
    }

    if (correctSongObject && domElements.answerDetails) {
        const contextParts = correctSongObject.context ? correctSongObject.context.split('\n') : ["", ""];
        const ostInfo = contextParts[0] ? contextParts[0].trim() : "OST不明";
        const memoInfo = contextParts[1] ? contextParts[1].replace(/メモロビ:\s*/g, '').replace(/「準備中」/g, '').trim() : "";
        
        const composerInfo = correctSongObject.composer || "Unknown";
        
        let displayHint = `💡 ${ostInfo} 「${correctSongObject.title}」作者: ${composerInfo}`;
        if (memoInfo) {
            displayHint += ` メモロビ: ${memoInfo}`;
        }
        
        domElements.answerDetails.innerHTML = displayHint.replace(/\n/g, '<br>');
        domElements.answerDetails.style.display = 'block';
    }
    
    if (domElements.footer) domElements.footer.style.display = 'block'; 
    
    gameState.totalQuestions++;
    updateSongStats(currentVideoId, isCorrect);
    updateChoiceButtonsUI(selectedChoice); 
    updateUIState();
    saveGameData();
    scheduleNextStep(isCorrect);
}

function updateChoiceButtonsUI(selectedChoice) {
    document.querySelectorAll('#choices button').forEach(btn => {
        btn.disabled = true; 
        const choiceText = btn.textContent.trim();
        if (choiceText === correctAnswer) {
            btn.classList.add('correct'); 
        } else if (choiceText === selectedChoice) {
            btn.classList.add('incorrect'); 
        }
        btn.style.pointerEvents = 'none'; 
    });
}

function processCorrectAnswer() {
    gameState.score++;
    if (!domElements.result) return;
    
    if (gameState.mode === GAME_MODES.COMPOSER_QUIZ) {
        domElements.result.innerText = `✅ 正解！ (曲: ${currentSongTitle})`;
    } else {
        domElements.result.innerText = '✅ 正解！';
    }

    if (gameState.mode === GAME_MODES.ENDLESS || gameState.mode === GAME_MODES.COMPOSER_QUIZ) {
        gameState.endlessStreak++;
        if (gameState.mode === GAME_MODES.ENDLESS) {
            updateEndlessAchievements();
        } else {
            if (gameState.endlessStreak > (gameData.stats.highScores.composer_quiz || 0)) {
                gameData.stats.highScores.composer_quiz = gameState.endlessStreak;
            }
        }
    }
}

function processIncorrectAnswer() {
    if (!domElements.result) return;
    if (gameState.mode === GAME_MODES.COMPOSER_QUIZ) {
        domElements.result.innerText = `❌ 不正解... (正解: ${correctAnswer} / 曲: ${currentSongTitle})`;
    } else {
        domElements.result.innerText = `❌ 不正解... (正解は「${correctAnswer}」)`;
    }
}

function scheduleNextStep(isCorrect) {
    const isNormalGameOver = gameState.mode === GAME_MODES.NORMAL && gameState.totalQuestions >= gameData.settings.normalQuestions;
    const isTimedGameOver = gameState.mode === GAME_MODES.TIMED && gameState.timeLeftMs <= 0;
    const isEndlessGameOver = (gameState.mode === GAME_MODES.ENDLESS || gameState.mode === GAME_MODES.COMPOSER_QUIZ) && !isCorrect;

    const isGameOver = isNormalGameOver || isTimedGameOver || isEndlessGameOver;
    
    if (isNormalGameOver && domElements.progressBarFill) {
        domElements.progressBarFill.style.width = '100%';
    }
    
    const delay = isGameOver ? GAME_OVER_DELAY : (gameState.mode === GAME_MODES.TIMED ? NEXT_QUESTION_DELAY : EXTENDED_RESULT_DELAY);

    setTimeout(() => {
        if (isGameOver) {
            endGame();
        } else {
            loadNextQuiz();
        }
    }, delay);
}

function shareResult() {
    const title = "ブルアカイントロクイズ";
    const hashtag = "ブルアカイントロクイズ";
    let modeText = '', resultText = '';

    switch (gameState.mode) {
        case GAME_MODES.NORMAL:
            const accuracy = gameState.totalQuestions > 0 ? ((gameState.score / gameState.totalQuestions) * 100).toFixed(1) : 0;
            modeText = "ノーマルモード";
            resultText = `結果: ${gameState.score}/${gameState.totalQuestions}問正解 (正答率: ${accuracy}%)`;
            break;
        case GAME_MODES.TIMED:
            const duration = gameData.settings.timedDuration / 1000;
            modeText = `タイムアタックモード(${duration}秒)`;
            resultText = `スコア: ${gameState.score}問`;
            break;
        case GAME_MODES.ENDLESS:
            modeText = "エンドレスモード";
            resultText = `連続正解記録: ${gameData.stats.highScores.endless}問`;
            break;
        case GAME_MODES.COMPOSER_QUIZ:
            modeText = "作曲者当てクイズ";
            resultText = `連続正解記録: ${gameData.stats.highScores.composer_quiz}問`;
            break;
    }
    const fullText = `${title} ${modeText}でプレイしました！ ${resultText}https://takoyakiak47.github.io/intro-quiz/`;
    const url = `https://x.com/intent/tweet?text=${encodeURIComponent(fullText)}&hashtags=${encodeURIComponent(hashtag)}`;
    window.open(url, '_blank');
}

function endGame() {
    if (gameTimer) clearInterval(gameTimer);
    gameTimer = null;
    gameState.answerChecked = true;
    
    if (domElements.currentSongName) {
        domElements.currentSongName.style.display = 'none';
    }

    if (domElements.progressContainer) domElements.progressContainer.style.display = 'none';
    if (domElements.timeDisplay) domElements.timeDisplay.style.display = 'none';
    if (domElements.gameControlsContainer) domElements.gameControlsContainer.style.display = 'none';

    if (player && typeof player.loadVideoById === 'function') {
        try {
            player.loadVideoById({ 
                videoId: SUB_SCREEN_VIDEO_ID, 
                startSeconds: 0
            });
            player.unMute(); 
            player.playVideo();
        } catch (e) { console.warn("Result video load failed", e); }
    }

    let resultMessage = '';
    if (gameState.mode === GAME_MODES.TIMED) {
        if (gameState.score > (gameData.stats.highScores.timed || 0)) gameData.stats.highScores.timed = gameState.score;
        resultMessage = `🎉 タイムアップ！ スコア: ${gameState.score}問`;
    } else if (gameState.mode === GAME_MODES.NORMAL) {
        if (gameState.score > (gameData.stats.highScores.normal || 0)) gameData.stats.highScores.normal = gameState.score;
        const accuracy = gameState.totalQuestions > 0 ? ((gameState.score / gameState.totalQuestions) * 100).toFixed(1) : 0;
        resultMessage = `🎉 終了！ スコア: ${gameState.score}/${gameState.totalQuestions} (正答率: ${accuracy}%)`;
    } else if (gameState.mode === GAME_MODES.ENDLESS) {
        resultMessage = `🎉 ゲームオーバー！ 今回の記録: ${gameState.endlessStreak}問`;
    } else if (gameState.mode === GAME_MODES.COMPOSER_QUIZ) {
        resultMessage = `🎉 作曲者クイズ終了！ 連続正解: ${gameState.endlessStreak}問`;
    }
    saveGameData();

    if (domElements.result) domElements.result.innerText = resultMessage;

    const container = domElements.choices;
    if (container) {
        container.innerHTML = `
          <div>
            <button id="share-btn">結果をXでシェア</button>
            <button id="again-btn">もう一度あそぶ</button>
            <button id="home-btn">ホームに戻る</button>
          </div>
        `; 
        
        const shareBtn = document.getElementById('share-btn');
        const againBtn = document.getElementById('again-btn');
        const homeBtn = document.getElementById('home-btn');

        if(shareBtn) shareBtn.onclick = shareResult;
        if(againBtn) againBtn.onclick = () => selectMode(gameState.mode);
        if(homeBtn) homeBtn.onclick = initGame;
    }
}

function showStatsScreen() {
    showScreen('stats-screen');
    if (domElements.footer) domElements.footer.style.display = 'none';

    if (player && typeof player.loadVideoById === 'function') {
        player.loadVideoById({ 
            videoId: SUB_SCREEN_VIDEO_ID, 
            startSeconds: 0
        });
        player.unMute(); 
        player.playVideo();
    }

    const container = document.getElementById('stats-screen');
    if (!container) return;
    const unlockedCount = Object.values(gameData.achievements).filter(Boolean).length;
    
    const achievementTiers = [
        { key: 'normal',   label: 'NORMAL',   desc: '10問連続正解' },
        { key: 'hard',      label: 'HARD',      desc: '20問連続正解' },
        { key: 'veryhard', label: 'VERYHARD', desc: '50問連続正解' },
        { key: 'hardcore', label: 'HARDCORE', desc: '100問連続正解' },
        { key: 'extreme',  label: 'EXTREME',  desc: '150問連続正解' },
        { key: 'insane',   label: 'INSANE',   desc: '250問連続正解' },
        { key: 'torment',  label: 'TORMENT',  desc: '500問連続正解' },
        { key: 'lunatic',  label: 'LUNATIC',  desc: '1000問連続正解' }
    ];
    
    const achievementsHTML = achievementTiers.map(tier => `
        <div class="achievement ${gameData.achievements[tier.key] ? 'unlocked' : ''}" style="padding: 1em; border: 1px solid var(--border-color); border-radius: 8px; background: ${gameData.achievements[tier.key] ? 'var(--blue-secondary)' : '#f9f9f9'}; color: ${gameData.achievements[tier.key] ? 'white' : 'inherit'};">
            <div style="font-weight: bold;">${tier.label}</div>
            <div style="font-size: 0.9em; margin-top: 0.5em;">${tier.desc}</div>
        </div>`).join('');

    container.innerHTML = `
        <h2>実績 & 統計</h2>
        <h3>ハイスコア</h3>
        <p>ノーマル: <strong>${gameData.stats.highScores.normal || 0}</strong></p>
        <p>タイムアタック: <strong>${gameData.stats.highScores.timed || 0}</strong></p>
        <p>エンドレス: <strong>${gameData.stats.highScores.endless || 0}</strong></p>
        <p>作曲者クイズ: <strong>${gameData.stats.highScores.composer_quiz || 0}</strong></p>
        <h3 style="margin-top: 2em;">実績 (${unlockedCount}/${achievementTiers.length})</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1em; margin-bottom: 2em;">
            ${achievementsHTML}
        </div>
        <button id="stats-back-btn">ホームに戻る</button>
        <button id="reset-data-btn">データリセット</button>
    `;

    document.getElementById('stats-back-btn').onclick = initGame;
    document.getElementById('reset-data-btn').onclick = () => {
        if (confirm('すべての実績とハイスコアをリセットします。よろしいですか？')) {
            gameData = JSON.parse(JSON.stringify(defaultGameData));
            saveGameData();
            showStatsScreen();
        }
    };
}

function updateUIState() {
    updateScore();
    updateProgressIndicator();
    updateTimeDisplay(gameState.mode === GAME_MODES.TIMED ? gameState.timeLeftMs : null);
}

function updateScore() {
    if (!domElements.score) return;
    let scoreText = '';
    if (gameState.mode === GAME_MODES.NORMAL || gameState.mode === GAME_MODES.TIMED) {
        scoreText = `Score: ${gameState.score}`;
    } else {
        const highScore = (gameState.mode === GAME_MODES.COMPOSER_QUIZ) ? (gameData.stats.highScores.composer_quiz || 0) : (gameData.stats.highScores.endless || 0);
        scoreText = `最高記録 : ${highScore} \n スコア : ${gameState.endlessStreak}`;
    }
    domElements.score.innerText = scoreText;
}

function updateProgressIndicator() {
    const container = domElements.progressContainer;
    if (!container) return;
    container.style.display = 'none'; 
    
    if (gameState.mode === GAME_MODES.NORMAL) {
        const maxQ = gameData.settings.normalQuestions;
        if (domElements.progressText) domElements.progressText.textContent = `Question ${gameState.totalQuestions + 1} / ${maxQ}`;
        if (domElements.progressBarFill) domElements.progressBarFill.style.width = `${(gameState.totalQuestions / maxQ) * 100}%`;
        container.style.display = 'block';
        if (domElements.progressBarWrapper) domElements.progressBarWrapper.style.display = 'block';
    } 
}

function updateTimeDisplay(ms) {
    if (!domElements.timeDisplay) return;
    if (ms != null && gameState.mode === GAME_MODES.TIMED) {
        domElements.timeDisplay.style.display = 'block';
        domElements.timeDisplay.innerText = `残り時間: ${(ms / 1000).toFixed(2)} 秒`;
    } else {
        domElements.timeDisplay.style.display = 'none';
    }
}

function updateSongStats(videoId, isCorrect) {
    if (!gameData.stats.songStats[videoId]) {
        gameData.stats.songStats[videoId] = { correct: 0, incorrect: 0 };
    }
    isCorrect ? gameData.stats.songStats[videoId].correct++ : gameData.stats.songStats[videoId].incorrect++;
}

function updateEndlessAchievements() {
    if (gameState.endlessStreak > (gameData.stats.highScores.endless || 0)) {
        gameData.stats.highScores.endless = gameState.endlessStreak;
    }
    const achievements = {10: 'normal', 20: 'hard', 50: 'veryhard', 100: 'hardcore', 150: 'extreme', 250: 'insane', 500: 'torment', 1000: 'lunatic'};
    for (const [streak, achievement] of Object.entries(achievements)) {
        if (gameState.endlessStreak >= parseInt(streak, 10)) gameData.achievements[achievement] = true;
    }
}


document.addEventListener('DOMContentLoaded', () => {

    const ids = ['loading-overlay', 'main-menu', 'game-view', 'choices', 'result', 'answer-details', 'score', 'time-display', 'progress-container', 'progress-text', 'progress-bar-fill', 'game-controls-container', 'volumeSlider', 'settings-screen', 'start-prompt', 'start-prompt-btn', 'encyclopedia', 'current-song-name', 'sound-archive-screen'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            domElements[id.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = el;
        }
    });
    domElements.progressBarWrapper = document.querySelector('.progress-bar-wrapper');
    domElements.footer = document.querySelector('footer'); 

    if (domElements.loadingOverlay) domElements.loadingOverlay.style.display = 'flex';
    loadGameData();

    const replayBtn = document.getElementById('replayBtn');
    if (replayBtn) {
        replayBtn.onclick = () => {
            if (player && typeof player.seekTo === 'function' && !gameState.answerChecked) {
                player.seekTo(0);
                player.playVideo();
            }
        };
    }

    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        pauseBtn.onclick = () => {
            if (!player || typeof player.getPlayerState !== 'function') return;
            const state = player.getPlayerState();
            (state === YT.PlayerState.PLAYING) ? player.pauseVideo() : player.playVideo();
        };
    }

    if (domElements.volumeSlider) {
        domElements.volumeSlider.addEventListener('input', (e) => {
            if (player && typeof player.setVolume === 'function') {
                player.setVolume(parseInt(e.target.value, 10));
            }
        });
    }
    
    document.addEventListener('keydown', (event) => {
        if (gameState.mode !== GAME_MODES.MENU && !gameState.answerChecked && domElements.gameView && domElements.gameView.style.display !== 'none') {
            const choices = document.querySelectorAll('#choices button');
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
});
