// ==================== CONFIGURATION ====================
const CONFIG = {
    endpoints: {
        learn: '/learn',
        suggest: '/suggest',
        run: '/run',
        live: '/live',
        clearHistory: '/clear_history'
    },
    colors: {
        valid: 'rgb(74, 237, 74)',
        warning: 'rgb(244, 85, 0)',
        danger: 'red'
    },
    dangerousCommands: ["del", "rmdir", "format", "taskkill", "sfc", "shutdown"]
};

// ==================== GLOBAL STATE ====================
const state = {
    liveRequest: null,
    commandHistory: window.commandHistory || [],
    historyIndex: -1,
    currentSuggestions: [],
    selectedSuggestionIndex: -1,
    isScrolling: false,
    lastScrollTime: 0
};

// ==================== DOM ELEMENTS ====================
const elements = {
    get input() { return document.getElementById('command-input'); },
    get terminalOutput() { return document.getElementById('terminal-output'); },
    get suggestionsBox() { return document.getElementById('suggestions-box'); },
    get foldersContainer() { return document.querySelector('.folders'); }
    
};

// ==================== UTILITY FUNCTIONS ====================
const utils = {
    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },

    scrollToBottom() {
        if (elements.terminalOutput) {
            elements.terminalOutput.scrollTop = elements.terminalOutput.scrollHeight;
        }
    },

    addToHistory(cmd) {
        if (!cmd || !cmd.trim()) return;
        
        window.commandHistory = window.commandHistory || [];
        if (window.commandHistory.length === 0 || 
            window.commandHistory[window.commandHistory.length - 1] !== cmd) {
            window.commandHistory.push(cmd);
            
            try {
                localStorage.setItem('commandHistory', JSON.stringify(window.commandHistory));
            } catch (e) {
                console.warn('Failed to save command history', e);
            }
        }
    },

    updateInputColor(commandText) {
        const element = elements.input;
        if (!element) return;

        const firstWord = commandText.split(" ")[0];
        
        if (CONFIG.dangerousCommands.includes(firstWord)) {
            element.style.color = CONFIG.colors.danger;
        } else if (state.currentSuggestions.length > 0 && 
                   state.currentSuggestions[0].command === firstWord) {
            element.style.color = CONFIG.colors.valid;
        } else {
            element.style.color = CONFIG.colors.warning;
        }
    }
};

// ==================== AI FUNCTION ====================
function ai(cmd) {
    $.ajax({
        url: CONFIG.endpoints.learn,
        type: "POST",
        dataType: 'json',
        data: { command: cmd },
        success: function(data) {
            if (data && data.output !== undefined) {
                const outputText = String(data.output);
                const outputId = 'output-' + Date.now();
                const $outputDiv = $(`<div class="command-output" id="${outputId}"></div>`);
                $outputDiv.text(outputText);
                $outputDiv.append(`<button class="copy-btn" data-output="${outputId}">کپی</button>`);
                $('#terminal-output').append($outputDiv);

                convert();
            } else {
                $('#terminal-output').append('<div class="command-output command-error">پاسخ نامعتبر از سرور</div>');
            }
            utils.scrollToBottom();
        },
        error: function() {
            $('#terminal-output').append('<div class="command-output command-error">هوش مصنوعی پاسخ نداد. اینترنت خود را چک کنید.</div>');
            utils.scrollToBottom();
        }
    });
}

// ==================== SUGGESTIONS SYSTEM ====================
const suggestionsManager = {
    fetchSuggestions(inputText, fullCommand) {
        console.log('Fetching suggestions for', inputText);
        utils.updateInputColor(fullCommand);

        $.get(CONFIG.endpoints.suggest, { command: inputText })
            .done(function(data) {
                if (data.suggestions && data.suggestions.length > 0) {
                    suggestionsManager.showSuggestions(data.suggestions, fullCommand);
                } else {
                    suggestionsManager.hideSuggestions();
                }
            })
            .fail(function() {
                console.error('Error fetching suggestions');
                suggestionsManager.hideSuggestions();
            });
    },

    showSuggestions(suggestions, fullCommand) {
        utils.updateInputColor(fullCommand);
        
        state.currentSuggestions = suggestions;
        elements.suggestionsBox.innerHTML = '';
        state.selectedSuggestionIndex = -1;

        suggestions.forEach((suggestion, index) => {
            const paramsHtml = suggestion.parameters && suggestion.parameters.length > 0 
                ? `<div class="params">${suggestion.parameters.map(p => 
                    `<span>${p.name}: ${p.description}</span>`).join('<br>')}</div>`
                : '';

            const examplesHtml = suggestion.examples && suggestion.examples.length > 0 
                ? `<div class="examples">${suggestion.examples.map(e => 
                    `<span>${e}</span>`).join('<br>')}</div>`
                : '';

            const itemHtml = `
                <div class="suggestion-item" data-command="${suggestion.command}" data-index="${index}">
                    <span class="cmd">${suggestion.command}</span>
                    <span class="desc">${suggestion.description}</span>
                    ${paramsHtml}
                    ${examplesHtml}
                </div>
            `;
            elements.suggestionsBox.innerHTML += itemHtml;
        });

        suggestionsManager.positionSuggestionsBox();
        elements.suggestionsBox.style.display = 'block';
    },

    positionSuggestionsBox() {
        if (elements.input && elements.suggestionsBox) {
            elements.suggestionsBox.style.width = elements.input.offsetWidth + 'px';
        }
    },

    navigateSuggestions(direction) {
        const items = elements.suggestionsBox.querySelectorAll('.suggestion-item');
        if (items.length === 0) return;

        items.forEach(item => item.classList.remove('highlighted'));

        state.selectedSuggestionIndex += direction;
        if (state.selectedSuggestionIndex < 0) state.selectedSuggestionIndex = items.length - 1;
        if (state.selectedSuggestionIndex >= items.length) state.selectedSuggestionIndex = 0;

        const selectedItem = items[state.selectedSuggestionIndex];
        selectedItem.classList.add('highlighted');

        elements.suggestionsBox.scrollTop = 
            selectedItem.offsetTop + elements.suggestionsBox.scrollTop();
    },

    selectSuggestion(suggestion) {
        if (!suggestion) return;
        elements.input.value = suggestion.command;
        elements.input.focus();
        suggestionsManager.hideSuggestions();
    },

    hideSuggestions() {
        if (elements.suggestionsBox) {
            elements.suggestionsBox.style.display = 'none';
        }
        state.selectedSuggestionIndex = -1;
        state.currentSuggestions = [];
    }
};

// ==================== COMMAND EXECUTION ====================
const commandExecutor = {
    runLiveCommand(cmd) {
        utils.addToHistory(cmd);
        $('#terminal-output').append(
            `<div class="command-line">
                <span class="prompt">&gt;</span> 
                <span class="command">${utils.escapeHtml(cmd)}</span>
            </div>`
        );
        
        if (state.liveRequest) {
            state.liveRequest.abort();
        }
        
        state.liveRequest = $.ajax({
            url: CONFIG.endpoints.live,
            type: 'POST',
            data: { command: cmd },
            xhrFields: {
                onprogress: function(e) {
                    $('#terminal-output').append(e.currentTarget.response);
                    utils.scrollToBottom();
                }
            },
            success: function() {},
            error: function() {
                $('#terminal-output').append('<div class="command-output">خطا در اجرا یا کنسل شد</div>');
            }
        });
    },

    runCommand(cmd) {
        utils.addToHistory(cmd);
        $('#terminal-output').append(
            `<div class="command-line">
                <span class="prompt">&gt;</span> 
                <span class="command">${utils.escapeHtml(cmd)}</span>
            </div>`
        );

        $.ajax({
            url: CONFIG.endpoints.run,
            type: 'POST',
            dataType: 'json',
            data: { command: cmd },
            success: function(data) {
                if (data && data.output !== undefined) {
                    const safeOutput = utils.escapeHtml(String(data.output)).replace(/\n/g, '<br>');
                    $('#terminal-output').append('<div class="command-output">' + safeOutput + '</div>');
                } else {
                    $('#terminal-output').append('<div class="command-output command-error">پاسخ نامعتبر از سرور</div>');
                }
                utils.scrollToBottom();
            },
            error: function() {
                $('#terminal-output').append('<div class="command-output command-error">خطا در اجرای معمولی</div>');
                utils.scrollToBottom();
            }
        });
    },

    executeCommand(cmd) {
        if (cmd.includes("Learn\\")) {
            ai(cmd);
        } else {
            commandExecutor.runCommand(cmd);
        }
    },

    executeLiveCommand(cmd) {
        if (cmd.includes("Learn\\")) {
            ai(cmd);
        } else {
            commandExecutor.runLiveCommand(cmd);
        }
    }
};

// ==================== EVENT HANDLERS ====================
const eventHandlers = {
    handleInput() {
        const inputText = elements.input.value;
        const lastWord = inputText.split(' ').pop();
        
        if (lastWord.length > 0) {
            suggestionsManager.fetchSuggestions(lastWord, inputText);
        } else {
            suggestionsManager.hideSuggestions();
        }
        state.historyIndex = -1;
    },

    handleKeyDown(e) {
        const cmd = elements.input.value;
        const suggestionsVisible = elements.suggestionsBox.style.display === 'block';

        if (suggestionsVisible) {
            eventHandlers.handleSuggestionsKeyDown(e, cmd);
        } else {
            eventHandlers.handleNormalKeyDown(e, cmd);
        }
    },

    handleSuggestionsKeyDown(e, cmd) {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                suggestionsManager.navigateSuggestions(1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                suggestionsManager.navigateSuggestions(-1);
                break;
            case 'Enter':
                e.preventDefault();
                if (state.selectedSuggestionIndex >= 0) {
                    suggestionsManager.selectSuggestion(state.currentSuggestions[state.selectedSuggestionIndex]);
                } else if (cmd.trim()) {
                    utils.addToHistory(cmd);
                    commandExecutor.executeCommand(cmd);
                    elements.input.value = '';
                    suggestionsManager.hideSuggestions();
                } else {
                    suggestionsManager.hideSuggestions();
                }
                break;
            case 'Tab':
                if (state.currentSuggestions.length > 0) {
                    e.preventDefault();
                    suggestionsManager.selectSuggestion(state.currentSuggestions[0]);
                }
                break;
            case 'Escape':
                suggestionsManager.hideSuggestions();
                break;
        }
    },

    handleNormalKeyDown(e, cmd) {
        switch (e.key) {
            case 'ArrowUp':
                e.preventDefault();
                if (state.commandHistory.length > 0 && state.historyIndex < state.commandHistory.length - 1) {
                    state.historyIndex++;
                    elements.input.value = state.commandHistory[state.commandHistory.length - 1 - state.historyIndex];
                }
                break;
            case 'ArrowDown':
                e.preventDefault();
                if (state.historyIndex > 0) {
                    state.historyIndex--;
                    elements.input.value = state.commandHistory[state.commandHistory.length - 1 - state.historyIndex];
                } else if (state.historyIndex === 0) {
                    state.historyIndex = -1;
                    elements.input.value = '';
                }
                break;
            case 'Enter':
                e.preventDefault();
                if (cmd.trim()) {
                    utils.addToHistory(cmd);
                    if (e.shiftKey) {
                        commandExecutor.executeLiveCommand(cmd);
                    } else {
                        commandExecutor.executeCommand(cmd);
                    }
                    elements.input.value = '';
                }
                break;
        }
    },

    handleSuggestionClick(e) {
        if (e.target.classList.contains('suggestion-item')) {
            const cmd = e.target.dataset.command;
            suggestionsManager.selectSuggestion(state.currentSuggestions.find(s => s.command === cmd));
        }
    },

    handleCopyClick(e) {
        if (e.target.classList.contains('copy-btn')) {
            const outputId = e.target.dataset.output;
            const text = document.getElementById(outputId).cloneNode(true);
            text.querySelector('button')?.remove();
            const textContent = text.textContent.trim();
            
            navigator.clipboard.writeText(textContent);
            e.target.textContent = 'کپی شد!';
            e.target.style.background = '#FFD700';
            
            setTimeout(() => {
                e.target.textContent = 'کپی';
                e.target.style.background = '#4AF626';
            }, 1200);
        }
    },

    handleGlobalKeyDown(e) {
        if (e.key === 'Escape') {
            if (state.liveRequest) {
                state.liveRequest.abort();
                state.liveRequest = null;
                $('#terminal-output').append('<div class="command-output command-warning">دستور کنسل شد</div>');
                utils.scrollToBottom();
            }
        }
    },

    handleWheelScroll(e) {
        const now = Date.now();
        if (now - state.lastScrollTime < 16) {
            e.preventDefault();
            return;
        }
        state.lastScrollTime = now;

        const scrollAmount = e.deltaY * 1.5;

        if (!state.isScrolling) {
            state.isScrolling = true;

            window.requestAnimationFrame(() => {
                elements.foldersContainer.scrollBy({
                    top: scrollAmount,
                    behavior: 'smooth'
                });
                state.isScrolling = false;
            });

            e.preventDefault();
        }
    }
};

// ==================== INITIALIZATION ====================
function initializeTerminal() {
    // Load command history from localStorage
    try {
        const stored = localStorage.getItem('commandHistory');
        if (stored) {
            state.commandHistory = JSON.parse(stored);
            window.commandHistory = state.commandHistory;
        }
    } catch (e) {
        console.warn('Error loading command history from localStorage', e);
    }

    // Set up event listeners
    if (elements.input) {
        elements.input.addEventListener('input', eventHandlers.handleInput);
        elements.input.addEventListener('keydown', eventHandlers.handleKeyDown);
        elements.input.focus();
    }

    if (elements.suggestionsBox) {
        elements.suggestionsBox.addEventListener('click', eventHandlers.handleSuggestionClick);
    }

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.command-input, .suggestions-box')) {
            suggestionsManager.hideSuggestions();
        }
    });

    document.addEventListener('keydown', eventHandlers.handleGlobalKeyDown);
    document.addEventListener('click', eventHandlers.handleCopyClick);

    // Initialize folders container scrolling
    if (elements.foldersContainer) {
        elements.foldersContainer.addEventListener('wheel', eventHandlers.handleWheelScroll, { passive: false });
    }

    // Initialize tooltips
    initializeTooltips();

    // Scroll to bottom on initialization
    utils.scrollToBottom();
}

function initializeTooltips() {
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.style.cssText = `
        position: absolute;
        pointer-events: none;
        padding: 4px 8px;
        background: rgba(0,0,0,0.75);
        color: #fff;
        border-radius: 4px;
        font-size: 12px;
        display: none;
    `;
    document.body.appendChild(tooltip);

    const buttons = document.querySelectorAll('.drive, .folders button');
    buttons.forEach(button => {
        button.addEventListener('mousemove', function(e) {
            tooltip.textContent = this.textContent.trim();
            tooltip.style.display = 'block';
            tooltip.style.left = (e.pageX + 15) + 'px';
            tooltip.style.top = (e.pageY + 15) + 'px';
        });

        button.addEventListener('mouseout', function() {
            tooltip.style.display = 'none';
        });
    });
}

// ==================== CLEAR CONSOLE ====================
function clearConsole() {
    const $terminalOutput = $('#terminal-output');
    $terminalOutput.empty();
    console.log("Terminal cleared (client)");

    $.ajax({
        url: CONFIG.endpoints.clearHistory,
        type: 'POST',
        success: function(response) {
            console.log("Server history cleared:", response);
        },
        error: function(xhr, status, error) {
            console.error("Error clearing server history:", status, error);
            $terminalOutput.append('<div class="command-output command-error">خطا در پاک کردن تاریخچه سرور</div>');
            utils.scrollToBottom();
        }
    });
}

// ==================== MARKDOWN CONVERSION ====================
function convert() {
    const outputs = document.querySelectorAll('.command-output');
    if (outputs.length === 0) return;

    const lastOutput = outputs[outputs.length - 1];
    const textContent = lastOutput.textContent || lastOutput.innerText;

    if (!textContent.trim()) return;

    try {
        const htmlOutput = marked.parse(textContent);

        // Save copy button
        const copyBtn = lastOutput.querySelector('.copy-btn');
        const copyData = copyBtn ? copyBtn.dataset.output : '';

        // Replace content
        lastOutput.innerHTML = htmlOutput;

        // Re-add copy button
        if (copyData) {
            const newBtn = document.createElement('button');
            newBtn.className = 'copy-btn';
            newBtn.dataset.output = copyData;
            newBtn.textContent = 'کپی';
            lastOutput.appendChild(newBtn);
        }
    } catch (e) {
        console.error("Markdown conversion error:", e);
    }
}

// ==================== DOCUMENT READY ====================
document.addEventListener('DOMContentLoaded', function() {
    initializeTerminal();
});

// jQuery ready for legacy code
$(document).ready(function() {
    // Clear console button
    $('#clear-console').on('click', clearConsole);
});