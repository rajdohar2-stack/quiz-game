import FirestoreService from './FirestoreService.js';

export default class HostManager {
  constructor() {
    this.db = new FirestoreService();
    this.questions = [];
    
    // UI Elements
    this.views = {
      landing: document.getElementById('landing-view'),
      host: document.getElementById('host-view'),
      dashboard: document.getElementById('host-dashboard-view')
    };

    this.form = document.getElementById('create-quiz-form');
    this.questionsList = document.getElementById('questions-list');
    this.addBtn = document.getElementById('add-question-btn');
    
    // Bind Methods
    this.handleAddQuestion = this.handleAddQuestion.bind(this);
    this.handleCreate = this.handleCreate.bind(this);
  }

  init() {
    if (!this.addBtn || !this.form) return;

    this.addBtn.addEventListener('click', this.handleAddQuestion);
    this.form.addEventListener('submit', this.handleCreate);
    
    // Add one empty question to start
    this.handleAddQuestion();
  }

  handleAddQuestion() {
    const qIndex = this.questionsList.children.length;
    const qId = Date.now(); // Temporary unique ID for DOM element

    const div = document.createElement('div');
    div.className = 'question-builder-item slide-in';
    div.dataset.id = qId;

    div.innerHTML = `
      <div class="input-group">
        <label>Question ${qIndex + 1}</label>
        <input type="text" name="q_text_${qId}" placeholder="Enter question text..." required>
      </div>
      
      <div class="options-inputs">
        <input type="text" name="q_opt0_${qId}" placeholder="Option A" required>
        <input type="text" name="q_opt1_${qId}" placeholder="Option B" required>
        <input type="text" name="q_opt2_${qId}" placeholder="Option C" required>
        <input type="text" name="q_opt3_${qId}" placeholder="Option D" required>
      </div>

      <div class="input-group correct-select">
        <label>Correct Answer</label>
        <select name="q_correct_${qId}" required>
          <option value="0">Option A</option>
          <option value="1">Option B</option>
          <option value="2">Option C</option>
          <option value="3">Option D</option>
        </select>
      </div>

      <button type="button" class="remove-q-btn" onclick="this.parentElement.remove()">
        ✕
      </button>
    `;

    this.questionsList.appendChild(div);
  }

  async handleCreate(e) {
    e.preventDefault();
    
    const title = document.getElementById('new-quiz-title').value;
    const password = document.getElementById('new-quiz-pass').value;
    const timerMinutes = document.getElementById('new-quiz-timer').value || "10";
    
    // Parse Questions from DOM
    const questionItems = this.questionsList.querySelectorAll('.question-builder-item');
    const questionsData = [];

    questionItems.forEach((item, index) => {
      const qId = item.dataset.id;
      const text = item.querySelector(`[name="q_text_${qId}"]`).value;
      
      // Fix: Structure options as objects to match Question.js expected format
      const options = [
        { id: "0", text: item.querySelector(`[name="q_opt0_${qId}"]`).value },
        { id: "1", text: item.querySelector(`[name="q_opt1_${qId}"]`).value },
        { id: "2", text: item.querySelector(`[name="q_opt2_${qId}"]`).value },
        { id: "3", text: item.querySelector(`[name="q_opt3_${qId}"]`).value }
      ];
      
      const correctVal = item.querySelector(`[name="q_correct_${qId}"]`).value;

      questionsData.push({
        id: index + 1,
        questionText: text,
        options: options,
        correctAnswerHash: correctVal, // Matches option.id
        topic: "General", 
        difficulty: "Medium"
      });
    });

    if (questionsData.length === 0) {
      alert("Please add at least one question.");
      return;
    }

    const quizId = this.generateQuizId();
    
    // Convert minutes to seconds
    const timeLimitSeconds = parseInt(timerMinutes) * 60;

    const quizPayload = {
      quizId: quizId,
      password: password,
      title: title,
      questions: questionsData,
      timeLimit: timeLimitSeconds,
      status: 'OPEN'
    };

    const success = await this.db.createQuiz(quizPayload);

    if (success) {
      this.showLobby(quizId, password);
    } else {
      alert("Error creating quiz. Please try again.");
    }
  }

  generateQuizId() {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  showLobby(id, pass) {
    // Hide Host Form
    this.views.host.classList.add('hidden');
    
    // Show Lobby
    document.getElementById('lobby-view').classList.remove('hidden');
    
    // Update Lobby Info
    document.getElementById('lobby-quiz-id').textContent = id;
    document.getElementById('lobby-quiz-pass').textContent = pass;

    // Listen for players
    const listEl = document.getElementById('lobby-player-list');
    const countEl = document.getElementById('lobby-player-count');
    const startBtn = document.getElementById('start-quiz-btn');

    // Subscribe
    this.playerUnsubscribe = this.db.listenToPlayers(id, (players) => {
        if (players.length === 0) {
            listEl.innerHTML = '<li class="waiting-text">Waiting for players...</li>';
            countEl.textContent = '0';
            startBtn.disabled = true;
        } else {
            listEl.innerHTML = players.map(p => `<li class="player-chip">${p.username}</li>`).join('');
            countEl.textContent = players.length;
            startBtn.disabled = false;
        }
    });

    // Handle Start
    startBtn.onclick = async () => {
        startBtn.textContent = "Starting...";
        startBtn.disabled = true;
        await this.db.updateQuizStatus(id, 'STARTED');
        console.log("Game Started by Host!");
        // Host also joins as an observer or just sees leaderboard?
        // For now, Host goes to Dashboard/Leaderboard view or similar.
        // Let's send Host to Dashboard for now to watch results.
        if (this.playerUnsubscribe) this.playerUnsubscribe(); // Stop listening
        document.getElementById('lobby-view').classList.add('hidden');
        this.views.dashboard.classList.remove('hidden');
        document.getElementById('display-quiz-id').textContent = id;
        document.getElementById('display-quiz-pass').textContent = pass;
    };
    
    // Handle Cancel
    document.getElementById('lobby-home-btn').onclick = () => {
        if (this.playerUnsubscribe) this.playerUnsubscribe();
        location.reload();
    };
  }

  showSuccess(id, pass) {
     // Deprecated in favor of Lobby
     this.showLobby(id, pass);
  }
}
