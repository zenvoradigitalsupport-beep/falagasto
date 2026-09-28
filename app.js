// Configuration & State
const STORAGE_KEY = 'voice_expenses_data';
const API_KEY_STORAGE = 'gemini_api_key';

let expenses = [];
let geminiApiKey = localStorage.getItem(API_KEY_STORAGE) || '';
let currentReportDate = new Date();

// DOM Elements
const micBtn = document.getElementById('micBtn');
const micStatus = document.getElementById('micStatus');
const expensesUl = document.getElementById('expensesUl');
const totalAmountEl = document.getElementById('totalAmount');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettings = document.getElementById('closeSettings');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const apiKeyInput = document.getElementById('geminiApiKey');
const expenseInput = document.getElementById('expenseInput');
const sendTextBtn = document.getElementById('sendTextBtn');

// Nav Elements
const navHome = document.getElementById('navHome');
const navReport = document.getElementById('navReport');
const viewHome = document.getElementById('viewHome');
const viewReport = document.getElementById('viewReport');

// Report Elements
const prevMonthBtn = document.getElementById('prevMonthBtn');
const nextMonthBtn = document.getElementById('nextMonthBtn');
const currentMonthLabel = document.getElementById('currentMonthLabel');
const reportTotalAmount = document.getElementById('reportTotalAmount');
const categoryList = document.getElementById('categoryList');
const historyList = document.getElementById('historyList');

// Initialize Web Speech API
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'pt-BR';
    recognition.interimResults = false;

    recognition.onstart = function() {
        micBtn.classList.add('listening');
        micBtn.innerHTML = '<i class="fas fa-stop"></i>';
        micStatus.textContent = 'Ouvindo... Pode falar!';
    };

    recognition.onresult = function(event) {
        const transcript = event.results[0][0].transcript;
        micStatus.textContent = `Processando: "${transcript}"`;
        processExpenseText(transcript);
    };

    recognition.onerror = function(event) {
        micStatus.textContent = 'Erro ao ouvir: ' + event.error;
        resetMicButton();
    };

    recognition.onend = function() {
        if (!micBtn.classList.contains('processing')) {
            resetMicButton();
        }
    };
} else {
    micStatus.textContent = 'Reconhecimento de voz não suportado neste navegador.';
    micBtn.disabled = true;
}

// Navigation Events
navHome.addEventListener('click', () => switchView('viewHome'));
navReport.addEventListener('click', () => switchView('viewReport'));

function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(viewId).classList.add('active');
    
    if (viewId === 'viewHome') {
        navHome.classList.add('active');
        renderHome();
    } else {
        navReport.classList.add('active');
        renderReport();
    }
}

// Report Navigation Events
prevMonthBtn.addEventListener('click', () => {
    currentReportDate.setMonth(currentReportDate.getMonth() - 1);
    renderReport();
});

nextMonthBtn.addEventListener('click', () => {
    currentReportDate.setMonth(currentReportDate.getMonth() + 1);
    renderReport();
});

// Settings & Input Events
micBtn.addEventListener('click', () => {
    if (!geminiApiKey) {
        alert('Por favor, configure sua Chave da API do Gemini primeiro nas configurações.');
        openSettings();
        return;
    }

    if (micBtn.classList.contains('listening')) {
        recognition.stop();
    } else if (!micBtn.classList.contains('processing')) {
        try {
            recognition.start();
        } catch(e) {
            console.error(e);
        }
    }
});

settingsBtn.addEventListener('click', openSettings);
closeSettings.addEventListener('click', closeSettingsModal);
saveSettingsBtn.addEventListener('click', saveSettings);

sendTextBtn.addEventListener('click', handleTextInput);
expenseInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleTextInput();
});

function handleTextInput() {
    const text = expenseInput.value.trim();
    if (!text) return;
    
    if (!geminiApiKey) {
        alert('Por favor, configure sua Chave da API do Gemini primeiro nas configurações.');
        openSettings();
        return;
    }

    expenseInput.value = '';
    micStatus.textContent = `Processando: "${text}"`;
    processExpenseText(text);
}

function openSettings() {
    apiKeyInput.value = geminiApiKey;
    settingsModal.classList.add('active');
}

function closeSettingsModal() {
    settingsModal.classList.remove('active');
}

function saveSettings() {
    geminiApiKey = apiKeyInput.value.trim();
    localStorage.setItem(API_KEY_STORAGE, geminiApiKey);
    closeSettingsModal();
}

function resetMicButton() {
    micBtn.classList.remove('listening', 'processing');
    micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
    if(micStatus.textContent.startsWith('Ouvindo') || micStatus.textContent.startsWith('Processando')) {
        micStatus.textContent = 'Toque para falar (ex: "Gastei 20 no Uber")';
    }
}

// Gemini API Integration
async function processExpenseText(text) {
    micBtn.classList.remove('listening');
    micBtn.classList.add('processing');
    micBtn.innerHTML = '<i class="fas fa-spinner"></i>';
    
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;
        
        const prompt = `
        Analise a seguinte frase sobre um gasto e extraia as informações em formato JSON estrito.
        Frase: "${text}"
        Retorne um objeto JSON exatamente com a seguinte estrutura:
        {
          "descricao": "breve descrição ou categoria do gasto (ex: Almoço, Uber, Supermercado)",
          "valor": número do valor gasto (ex: 20.50). Se não achar valor, use 0.
        }
        Não inclua markdown, não inclua \`\`\`json, retorne apenas o JSON.
        `;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{text: prompt}]
                }],
                generationConfig: {
                    responseMimeType: "application/json"
                }
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            console.error("API Error:", errData);
            throw new Error('Falha na API do Gemini. Verifique sua chave ou limite de uso.');
        }

        const data = await response.json();
        let responseText = data.candidates[0].content.parts[0].text;
        
        // Limpar possíveis marcações de markdown que a IA possa enviar por engano
        responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        
        const expenseData = JSON.parse(responseText);
        
        addExpense(expenseData.descricao || 'Desconhecido', parseFloat(expenseData.valor) || 0);
        micStatus.textContent = 'Gasto adicionado com sucesso!';
        
    } catch (error) {
        console.error(error);
        micStatus.textContent = 'Erro ao processar o gasto. Tente novamente.';
    } finally {
        setTimeout(resetMicButton, 3000);
    }
}

// Data Management
function loadExpenses() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        expenses = JSON.parse(saved);
    }
    
    // Always start on Home view
    switchView('viewHome');
}

function saveExpenses() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
    
    // Re-render current view
    if (viewHome.classList.contains('active')) {
        renderHome();
    } else {
        renderReport();
    }
}

function addExpense(description, amount) {
    if (amount <= 0) return;
    
    const newExpense = {
        id: Date.now().toString(),
        description: description,
        amount: amount,
        date: new Date().toISOString()
    };
    
    expenses.unshift(newExpense); // Add to top
    saveExpenses();
}

window.deleteExpense = function(id) {
    expenses = expenses.filter(e => e.id !== id);
    saveExpenses();
}

// Rendering Logic
function renderHome() {
    expensesUl.innerHTML = '';
    let totalThisMonth = 0;
    
    const now = new Date();
    
    // Calculate total for current month
    const thisMonthExpenses = expenses.filter(e => {
        const d = new Date(e.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });

    thisMonthExpenses.forEach(expense => {
        totalThisMonth += expense.amount;
    });
    
    totalAmountEl.textContent = `R$ ${totalThisMonth.toFixed(2).replace('.', ',')}`;

    // Show only the 15 most recent globally on the home page
    const recent = expenses.slice(0, 15);
    
    recent.forEach(expense => {
        const dateObj = new Date(expense.date);
        const dateStr = `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth()+1).toString().padStart(2, '0')} ${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;
        
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="expense-info">
                <span class="expense-title">${expense.description}</span>
                <span class="expense-date">${dateStr}</span>
            </div>
            <div class="expense-right">
                <span class="expense-amount">R$ ${expense.amount.toFixed(2).replace('.', ',')}</span>
                <button class="delete-btn" onclick="deleteExpense('${expense.id}')"><i class="fas fa-trash"></i></button>
            </div>
        `;
        expensesUl.appendChild(li);
    });
}

function renderReport() {
    const year = currentReportDate.getFullYear();
    const month = currentReportDate.getMonth();
    
    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    currentMonthLabel.textContent = `${monthNames[month]} ${year}`;
    
    // Filter expenses for selected month
    const monthExpenses = expenses.filter(e => {
        const d = new Date(e.date);
        return d.getMonth() === month && d.getFullYear() === year;
    });

    let total = 0;
    const categories = {};
    const byDay = {};

    monthExpenses.forEach(e => {
        total += e.amount;
        
        // Group by category
        const cat = e.description.toLowerCase();
        categories[cat] = (categories[cat] || 0) + e.amount;
        
        // Group by day
        const d = new Date(e.date);
        const dayStr = `${d.getDate().toString().padStart(2, '0')} de ${monthNames[month]}`;
        if (!byDay[dayStr]) byDay[dayStr] = [];
        byDay[dayStr].push(e);
    });

    reportTotalAmount.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;

    // Render Categories
    categoryList.innerHTML = '';
    if (Object.keys(categories).length === 0) {
        categoryList.innerHTML = '<li class="category-item"><span class="category-name" style="color: #888">Nenhum gasto neste mês.</span></li>';
    } else {
        Object.keys(categories).sort((a,b) => categories[b] - categories[a]).forEach(cat => {
            categoryList.innerHTML += `
                <li class="category-item">
                    <span class="category-name">${cat}</span>
                    <span class="category-amount">R$ ${categories[cat].toFixed(2).replace('.', ',')}</span>
                </li>
            `;
        });
    }

    // Render History by Day
    historyList.innerHTML = '';
    
    // Sort days descending (using the fact that original list is already reverse chronological, 
    // we can just sort by day number extracted from the string)
    const sortedDays = Object.keys(byDay).sort((a,b) => {
        const dayA = parseInt(a.split(' ')[0]);
        const dayB = parseInt(b.split(' ')[0]);
        return dayB - dayA;
    });

    sortedDays.forEach(day => {
        let dayHtml = `<div class="day-group"><h4 class="day-header">${day}</h4><ul>`;
        byDay[day].forEach(expense => {
            dayHtml += `
                <li>
                    <div class="expense-info">
                        <span class="expense-title">${expense.description}</span>
                    </div>
                    <div class="expense-right">
                        <span class="expense-amount">R$ ${expense.amount.toFixed(2).replace('.', ',')}</span>
                        <button class="delete-btn" onclick="deleteExpense('${expense.id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </li>
            `;
        });
        dayHtml += `</ul></div>`;
        historyList.innerHTML += dayHtml;
    });
}

// Start
loadExpenses();
