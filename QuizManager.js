import Question from './Question.js';
import Player from './Player.js';
import Analytics from './Analytics.js';
import FirestoreService from './FirestoreService.js';

export default class QuizManager {
  constructor() {
    this.currentPlayer = null;
    this.quizQuestions = [];
    this.currentQuestionIndex = 0;
    this.analytics = new Analytics();
    this.db = new FirestoreService(); // Data Service
    this.currentQuizId = null; // Track active quiz ID

    // Timer
    this.timerInterval = null;
    this.timeLeft = 600; // 10 minutes (600s) default

    // DOM Elements
    // DOM Elements
    this.views = {
      landing: document.getElementById('landing-view'),
      join: document.getElementById('join-view'),
      host: document.getElementById('host-view'),
      hostDashboard: document.getElementById('host-dashboard-view'),
      quiz: document.getElementById('quiz-view'),
      result: document.getElementById('result-view'),
      leaderboard: document.getElementById('leaderboard-view')
    };

    this.ui = {
      questionContainer: document.getElementById('question-container'),
      timeDisplay: document.getElementById('time-display'),
      currentQNum: document.getElementById('q-current'),
      totalQNum: document.getElementById('q-total'),
      finalScore: document.getElementById('final-score'),
      totalScore: document.getElementById('total-score'),
      restartBtn: document.getElementById('restart-btn'),
      viewLeaderboardBtn: document.getElementById('view-leaderboard-btn'),
      backHomeBtn: document.getElementById('back-home-btn'),
      leaderboardList: document.getElementById('leaderboard-list'),
      navLeaderboard: document.getElementById('nav-leaderboard')
    };
  }

  init() {
    this.setupEventListeners();
    // Expose seeder for user convenience
    window.seedDatabase = () => this.db.seedDatabase();
  }

  setupEventListeners() {
    // Navigation
    if (this.ui.restartBtn) this.ui.restartBtn.addEventListener('click', () => location.reload());
    if (this.ui.backHomeBtn) this.ui.backHomeBtn.addEventListener('click', () => location.reload());
    if (this.ui.viewLeaderboardBtn) this.ui.viewLeaderboardBtn.addEventListener('click', () => this.showLeaderboard());
    if (this.ui.navLeaderboard) this.ui.navLeaderboard.addEventListener('click', () => this.showLeaderboard());
  }

  async joinQuiz(quizId, password, player) {
    this.currentPlayer = player;
    this.currentQuizId = quizId;

    // 1. Add player to "Lobby" in DB
    await this.db.addPlayerToLobby(quizId, player);

    // 2. Show Waiting Room
    this.switchView('join'); // Temporarily show join or direct to waiting?
    // Actually, let's go to waiting view
    document.getElementById('join-view').classList.add('hidden');
    document.getElementById('waiting-view').classList.remove('hidden');
    document.getElementById('waiting-quiz-title').textContent = `Quiz ${quizId}`;

    // 3. Listen for Game Start
    this.quizUnsubscribe = this.db.listenToQuiz(quizId, (quizData) => {
        if (quizData && quizData.status === 'STARTED') {
             // Game Started!
             if (this.quizUnsubscribe) this.quizUnsubscribe(); // Stop listening
             this.startQuiz(quizId, quizData.questions, quizData.timeLimit || 600);
        }
    });
  }

  async showLeaderboard() {
    this.switchView('leaderboard');
    this.ui.leaderboardList.innerHTML = '<p class="loading-text">Loading...</p>';

    // Use currentQuizId for fetch
    if (!this.currentQuizId) {
       this.ui.leaderboardList.innerHTML = '<p>Please join a quiz first to see leaderboards.</p>';
       return;
    }

    const data = await this.db.getLeaderboard(this.currentQuizId);

    if (data.length === 0) {
      this.ui.leaderboardList.innerHTML = '<p>No scores yet. Be the first!</p>';
      return;
    }

    this.ui.leaderboardList.innerHTML = data.map((entry, index) => `
      <div class="leaderboard-row">
        <span class="rank">#${index + 1}</span>
        <div class="player-info">
          <strong>${entry.username}</strong>
          <br><small>${entry.subject || "General"} • ${entry.grade || "Any"}</small>
        </div>
        <div class="player-score">
          ${entry.score} pts
          <br><small style="font-size:0.7em; color:hsl(220, 10%, 70%)">${(entry.time || 0).toFixed(1)}s</small>
        </div>
      </div>
    `).join('');
  }

  async startQuiz(quizId, questionList, timeLimit = 600) {
    console.log(`Starting quiz ${quizId} with ${questionList.length} questions. Time Limit: ${timeLimit}s`);

    this.currentQuizId = quizId;
    this.quizQuestions = questionList;
    this.quizTimeLimit = timeLimit; // Store it
    this.currentQuestionIndex = 0;

    // Update UI
    this.ui.totalQNum.textContent = this.quizQuestions.length;
    
    // Hide Waiting Room explicitly in case we came from there
    document.getElementById('waiting-view').classList.add('hidden');
    
    this.switchView('quiz');

    // Start Timer
    this.startTimer();

    // Show First Question
    this.showQuestion();
  }

  startTimer() {
    this.timeLeft = this.quizTimeLimit; // Use dynamic limit
    this.updateTimeDisplay();

    this.timerInterval = setInterval(() => {
      this.timeLeft--;
      this.updateTimeDisplay();

      if (this.timeLeft <= 0) {
        this.endQuiz();
      }
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  updateTimeDisplay() {
    const minutes = Math.floor(this.timeLeft / 60);
    const seconds = this.timeLeft % 60;
    this.ui.timeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    // Warning color
    if (this.timeLeft < 60) {
      this.ui.timeDisplay.style.color = 'hsl(0, 70%, 60%)';
    }
  }

  switchView(viewName) {
    Object.values(this.views).forEach(el => el.classList.add('hidden'));
    this.views[viewName].classList.remove('hidden');
  }

  showQuestion() {
    if (this.currentQuestionIndex >= this.quizQuestions.length) {
      this.endQuiz();
      return;
    }

    const qData = this.quizQuestions[this.currentQuestionIndex];
    if (!this.questionStartTime) this.questionStartTime = Date.now(); 
    this.questionStartTime = Date.now(); // Track when question appears
    const questionObj = new Question(qData);

    this.ui.currentQNum.textContent = this.currentQuestionIndex + 1;
    this.ui.questionContainer.innerHTML = questionObj.render();

    this.ui.questionContainer.querySelectorAll('.option-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.handleAnswer(e, questionObj));
    });
  }

  handleAnswer(e, questionObj) {
    const selectedBtn = e.target;
    const selectedId = selectedBtn.dataset.id;

    const allBtns = this.ui.questionContainer.querySelectorAll('.option-btn');
    allBtns.forEach(btn => btn.disabled = true);

    selectedBtn.classList.add('selected');
    const isCorrect = questionObj.verifyAnswer(selectedId);

    if (isCorrect) {
      this.currentPlayer.incrementScore();
      selectedBtn.style.borderColor = 'hsl(140, 70%, 50%)';
      selectedBtn.style.backgroundColor = 'hsla(140, 70%, 50%, 0.1)';
    } else {
      selectedBtn.style.borderColor = 'hsl(0, 70%, 50%)';
      selectedBtn.style.backgroundColor = 'hsla(0, 70%, 50%, 0.1)';
    }

    // Record Answer
    const maxTime = this.quizTimeLimit || 600;
    // Simple logic: time spent since last question? 
    // Easier: Question loaded at X, calculate Date.now() - X.
    // OPTION: We prefer simpler "Total Time" approach:
    // Total Time = (TimeLimit - TimeLeft) at end? 
    // But user wants per question?
    // Let's go with "Time Spent on this specific question" => needs a timestamp when question loaded.
    
    const timeSpent = (Date.now() - this.questionStartTime) / 1000;
    
    this.currentPlayer.recordAnswer(questionObj.id, isCorrect, timeSpent, questionObj.topic);

    setTimeout(() => {
      this.currentQuestionIndex++;
      this.showQuestion();
    }, 1000);
  }

  endQuiz() {
    this.stopTimer();
    this.switchView('result');
    this.ui.finalScore.textContent = this.currentPlayer.score;
    this.ui.totalScore.textContent = this.quizQuestions.length;

    // Submit Score
    if (this.currentQuizId) {
      this.db.submitScore(this.currentQuizId, this.currentPlayer);
    }

    const report = this.analytics.generateReport(this.currentPlayer.answers);
    const container = document.getElementById('analytics-preview');

    if (container) {
      if (report.length > 0) {
        container.innerHTML = `
                    <h3>Areas for Improvement</h3>
                    <div class="weak-areas-list">
                        ${report.map(area => `
                            <div class="weak-card">
                                <strong>${area.topic}</strong>
                                <span>${area.reason} (${area.reason === 'Concept Weakness' ? area.accuracy : area.avgTime})</span>
                            </div>
                        `).join('')}
                    </div>
                `;
      } else {
        container.innerHTML = `<p style="margin-top:1rem; color:hsl(140,70%,60%)">Excellent performance across all topics!</p>`;
      }
    }
  }
}
